const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const { createHash, randomUUID } = require('node:crypto');
const ts = require('typescript');
const sharp = require('sharp');
const PART = 8 * 1024 * 1024;
const sha = bytes => createHash('sha256').update(bytes).digest('hex');

async function loadWorker(db, objects, uploadHook) {
  const file = path.resolve('scripts/sixfl-tv-worker.ts');
  const code = ts.transpileModule(await fs.readFile(file, 'utf8'), {
    fileName: file, compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, esModuleInterop: true },
  }).outputText;
  const card = await sharp({ create: { width: 320, height: 180, channels: 3, background: '#14251b' } }).png().toBuffer();
  const mocks = {
    '@prisma/client': { PrismaClient: class { constructor() { return db; } } },
    '../src/lib/sixfl-tv/graphics': { createSixflTvVideoCard: async () => card },
    '../src/lib/sixfl-tv/videos': {},
    '../src/lib/storage/railway-s3': {
      fetchRailwayObject: async ({ key }) => objects.has(key) ? new Response(new Uint8Array(objects.get(key))) : new Response(null, { status: 404 }),
      uploadRailwayObject: async ({ key, body }) => { if (uploadHook) await uploadHook(key, body); objects.set(key, Buffer.from(body)); },
    },
  };
  const mod = { exports: {} };
  new Function('require', 'module', 'exports', code)(id => Object.hasOwn(mocks, id) ? mocks[id] : require(id), mod, mod.exports);
  return mod.exports;
}

function memoryDb() {
  const jobs = new Map(), parts = new Map(), sources = new Map(), inputs = new Map();
  const db = {
    jobs, parts, sources, inputs,
    $transaction: async fn => fn(db),
    $queryRaw: async (strings, ...v) => {
      const sql = strings.join('?');
      if (sql.includes('FROM "SixflTvRenderJob"') && sql.includes('FOR UPDATE')) {
        const job = jobs.get(v[0]); return job?.leaseToken === v[1] && job.state === 'PROCESSING' && job.active ? [{ id: job.id }] : [];
      }
      if (sql.includes('FROM "SixflTvRenderPart"')) {
        const rows = [...parts.values()].filter(p => p.jobId === v[0] && (v.length < 2 || p.partNumber === v[1]));
        return rows.sort((a, b) => a.partNumber - b.partNumber).map(p => ({ ...p }));
      }
      if (sql.includes('FROM "SixflTvFootagePart"')) return sources.get(v[0]) || [];
      if (sql.includes('FROM "SixflTvRenderInput"')) return inputs.get(v[0]) || [];
      throw new Error('Unexpected test query: ' + sql);
    },
    $executeRaw: async (strings, ...v) => {
      const sql = strings.join('?');
      if (sql.startsWith('INSERT INTO "SixflTvRenderPart"')) {
        const key = `${v[0]}:${v[1]}`;
        if (!parts.has(key)) parts.set(key, { jobId: v[0], partNumber: v[1], objectKey: v[2], sha256: v[3], sizeBytes: v[4], stored: false });
        return 1;
      }
      if (sql.startsWith('UPDATE "SixflTvRenderPart"')) {
        const part = parts.get(`${v[0]}:${v[1]}`);
        if (!part || part.sha256 !== v[2] || part.objectKey !== v[3]) return 0;
        part.stored = true; return 1;
      }
      if (sql.includes('SET "state"=\'READY\'')) {
        const job = jobs.get(v[3]);
        if (!job || job.leaseToken !== v[4] || job.state !== 'PROCESSING' || !job.active) return 0;
        Object.assign(job, { state: 'READY', outputSizeBytes: v[0], partCount: v[1], durationMs: v[2], leaseToken: null }); return 1;
      }
      if (sql.includes('SET "state"=\'FAILED\'')) {
        const job = jobs.get(v[1]); if (!job || job.leaseToken !== v[2] || job.state !== 'PROCESSING') return 0;
        Object.assign(job, { state: 'FAILED', error: v[0], leaseToken: null }); return 1;
      }
      if (sql.includes('SET "busyUntil"')) {
        const job = jobs.get(v[0]); return job?.leaseToken === v[1] && job.state === 'PROCESSING' && job.active ? 1 : 0;
      }
      throw new Error('Unexpected test update: ' + sql);
    },
  };
  return db;
}
function addJob(db, id = randomUUID(), leaseToken = randomUUID()) {
  const job = { id, fixtureId: 'test-fixture', kind: 'HIGHLIGHTS', leaseToken, metadataJson: { fixture: { firstTeam: { name: 'Test A' }, secondTeam: { name: 'Test B' } }, label: 'TEST' } };
  db.jobs.set(id, { ...job, state: 'PROCESSING', active: true }); return job;
}
async function temp(t) { const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'sixfl-worker-test-')); t.after(() => fs.rm(dir, { recursive: true, force: true })); return dir; }

test('worker subprocesses complete, cancel and enforce a wall-clock limit', async () => {
  const w = await loadWorker(memoryDb(), new Map());
  assert.equal(await w.run(process.execPath, ['-e', 'process.stdout.write("ok")'], true, 2000), 'ok');
  const start = Date.now();
  await assert.rejects(w.run(process.execPath, ['-e', 'process.on("SIGTERM",()=>{});setInterval(()=>{},10)'], false, 200), /cancelled|time limit/);
  assert.ok(Date.now() - start < 5000, 'stuck subprocess must be killed before returning');
  const c = new AbortController(); c.abort();
  await assert.rejects(w.renderSignals.run(c.signal, () => w.run(process.execPath, ['-e', 'process.exit(0)'])), /abort/i);
});

test('saved source parts enforce length, bounded reads and SHA-256', async t => {
  const db = memoryDb(), objects = new Map(), w = await loadWorker(db, objects), dir = await temp(t);
  const bytes = Buffer.from('original'), part = { partNumber: 0, objectKey: 'source', sizeBytes: bytes.length, sha256: sha(bytes), stored: true };
  objects.set('source', bytes); db.sources.set('asset', [part]);
  const input = { assetId: 'asset', filename: 'test.mp4', partCount: 1, sizeBytes: BigInt(bytes.length), state: 'READY' };
  await w.reconstructAsset(input, path.join(dir, 'source.mp4')); assert.deepEqual(await fs.readFile(path.join(dir, 'source.mp4')), bytes);
  objects.set('source', Buffer.from('tampered')); await assert.rejects(w.verifiedPart(part), /integrity/);
  objects.set('source', Buffer.alloc(bytes.length + 1)); await assert.rejects(w.verifiedPart(part), /exceeds/);
  await assert.rejects(w.verifiedPart({ ...part, sizeBytes: PART + 1 }), /manifest/);
});

test('output retry never mixes old parts and cannot publish extra/missing parts', async t => {
  const db = memoryDb(), objects = new Map(), w = await loadWorker(db, objects), dir = await temp(t), job = addJob(db);
  const file = path.join(dir, 'output.mp4'); await fs.writeFile(file, Buffer.alloc(PART + 17, 7));
  const first = await w.storeOutput(job, file); assert.equal(first.partCount, 2);
  const retry = await w.storeOutput(job, file); assert.deepEqual(retry, first);
  await fs.writeFile(file, Buffer.alloc(PART + 17, 8));
  await assert.rejects(w.storeOutput(job, file), /interrupted render differs/); assert.equal(db.jobs.get(job.id).state, 'PROCESSING');
  const extra = { jobId: job.id, partNumber: 2, objectKey: 'stale', sizeBytes: 1, sha256: sha(Buffer.from('x')), stored: true };
  db.parts.set(`${job.id}:2`, extra); await assert.rejects(w.finishOutput(job, first, 1000), /verification failed/);
  db.parts.delete(`${job.id}:2`); db.parts.get(`${job.id}:1`).stored = false;
  await assert.rejects(w.finishOutput(job, first, 1000), /verification failed/);
  db.parts.get(`${job.id}:1`).stored = true; await w.finishOutput(job, first, 1000); assert.equal(db.jobs.get(job.id).state, 'READY');
});

test('lease replacement during upload cannot acknowledge, finish or fail the new attempt', async t => {
  const db = memoryDb(), job = addJob(db), objects = new Map(), dir = await temp(t);
  const w = await loadWorker(db, objects, async () => { db.jobs.get(job.id).leaseToken = 'new-owner'; });
  const file = path.join(dir, 'output.mp4'); await fs.writeFile(file, Buffer.from('video'));
  await assert.rejects(w.storeOutput(job, file), /ownership expired/);
  assert.equal([...db.parts.values()][0].stored, false);
  await assert.rejects(w.finishOutput(job, { partCount: 1, sizeBytes: 5, parts: [...db.parts.values()] }, 1000), /ownership expired/);
  assert.equal(await w.failJob(job, 'old worker failure'), 0); assert.equal(db.jobs.get(job.id).state, 'PROCESSING');
});

test('actual FFmpeg assembly reconstructs saved manifests and produces a decodable private MP4', { timeout: 90000 }, async t => {
  const db = memoryDb(), objects = new Map(), w = await loadWorker(db, objects), dir = await temp(t), job = addJob(db);
  const source = path.join(dir, 'input.mp4');
  await w.run('ffmpeg', ['-y', '-f', 'lavfi', '-i', 'color=c=blue:s=320x180:r=25', '-f', 'lavfi', '-i', 'sine=frequency=440:sample_rate=48000', '-t', '0.4', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac', source]);
  const bytes = await fs.readFile(source), sourcePart = { partNumber: 0, objectKey: 'source', sizeBytes: bytes.length, sha256: sha(bytes), stored: true };
  objects.set('source', bytes); db.sources.set('asset', [sourcePart]); db.inputs.set(job.id, [{ assetId: 'asset', role: 'CONTENT', position: 0, filename: 'input.mp4', partCount: 1, sizeBytes: BigInt(bytes.length), state: 'READY' }]);
  await w.processJob(job); const finished = db.jobs.get(job.id); assert.equal(finished.state, 'READY');
  const result = path.join(dir, 'finished.mp4'), parts = [...db.parts.values()].sort((a,b) => a.partNumber-b.partNumber);
  await fs.writeFile(result, Buffer.concat(parts.map(p => { assert.equal(sha(objects.get(p.objectKey)), p.sha256); return objects.get(p.objectKey); })));
  const meta = JSON.parse(await w.run('ffprobe', ['-v', 'error', '-show_streams', '-show_format', '-of', 'json', result], true));
  assert.equal(meta.streams.find(s => s.codec_type === 'video').width, 1920); assert.equal(meta.streams.find(s => s.codec_type === 'video').height, 1080);
  assert.ok(meta.streams.some(s => s.codec_type === 'audio')); assert.ok(Number(meta.format.duration) >= 7.3);
  await w.run('ffmpeg', ['-v', 'error', '-i', result, '-f', 'null', '-']);
  assert.deepEqual(objects.get('source'), bytes, 'original footage must remain unchanged');
});

test('PostgreSQL transactions enforce current lease and exact output manifests', { skip: !process.env.TEST_FOOTAGE_DATABASE_URL }, async t => {
  const url = new URL(process.env.TEST_FOOTAGE_DATABASE_URL);
  assert.ok(['postgres:', 'postgresql:'].includes(url.protocol) && ['127.0.0.1', 'localhost'].includes(url.hostname), 'only isolated local PostgreSQL is allowed');
  const { PrismaClient } = require('@prisma/client');
  const schema = 'worker_' + randomUUID().replaceAll('-', ''), root = new PrismaClient({ datasources: { db: { url: url.toString() } } });
  await root.$executeRawUnsafe(`CREATE SCHEMA "${schema}"`); url.searchParams.set('schema', schema);
  const db = new PrismaClient({ datasources: { db: { url: url.toString() } } }), objects = new Map(), w = await loadWorker(db, objects), dir = await temp(t);
  try {
    await db.$executeRawUnsafe('CREATE TABLE "Fixture" ("id" TEXT PRIMARY KEY)');
    for (const file of ['prisma/migrations/20260917170000_sixfl_tv_footage_uploads/migration.sql', 'prisma/migrations/20260917213000_sixfl_tv_studio/migration.sql']) {
      for (const statement of (await fs.readFile(file, 'utf8')).split(';').map(s=>s.trim()).filter(Boolean)) await db.$executeRawUnsafe(statement);
    }
    const job = { id: randomUUID(), fixtureId: 'isolated-fixture', kind: 'HIGHLIGHTS', leaseToken: randomUUID() };
    await db.$executeRaw`INSERT INTO "Fixture" ("id") VALUES (${job.fixtureId})`;
    await db.$executeRaw`INSERT INTO "SixflTvRenderJob" ("id","fixtureId","kind","sourceFingerprint","metadataJson","requestedByActor","state","leaseToken","busyUntil") VALUES (${job.id},${job.fixtureId},'HIGHLIGHTS',${'a'.repeat(64)},'{}'::jsonb,'isolated-test','PROCESSING',${job.leaseToken},NOW()+INTERVAL '12 minutes')`;
    const file = path.join(dir, 'output.mp4'); await fs.writeFile(file, Buffer.from('test output'));
    const proof = await w.storeOutput(job, file);
    await fs.writeFile(file, Buffer.from('new content')); await assert.rejects(w.storeOutput(job, file), /interrupted render differs/);
    await db.$executeRaw`UPDATE "SixflTvRenderJob" SET "leaseToken"='replacement' WHERE "id"=${job.id}`;
    assert.equal(await w.failJob(job, 'stale failure'), 0); await assert.rejects(w.finishOutput(job, proof, 1000), /ownership expired/);
    await w.finishOutput({ ...job, leaseToken: 'replacement' }, proof, 1000);
    const rows = await db.$queryRaw`SELECT "state","outputSizeBytes" FROM "SixflTvRenderJob" WHERE "id"=${job.id}`;
    assert.equal(rows[0].state, 'READY'); assert.equal(Number(rows[0].outputSizeBytes), 11);
  } finally { await db.$disconnect(); await root.$executeRawUnsafe(`DROP SCHEMA "${schema}" CASCADE`); await root.$disconnect(); }
});
