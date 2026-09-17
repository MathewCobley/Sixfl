const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const { PrismaClient } = require('@prisma/client');
const { createHash, randomUUID } = require('node:crypto');
function loader(mocks) {
  const cache = new Map();
  function load(file) {
    if (cache.has(file)) return cache.get(file).exports;
    const mod = { exports: {} }; cache.set(file, mod);
    const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), { fileName: file, compilerOptions: {
      target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true,
    } }).outputText;
    new Function('require', 'module', 'exports', code)(id => {
      if (Object.hasOwn(mocks, id)) return mocks[id];
      const base = id.startsWith('@/') ? 'src/' + id.slice(2) : id.startsWith('.') ? path.join(path.dirname(file), id) : null;
      if (base) for (const ext of ['', '.ts', '.tsx']) if (fs.existsSync(base + ext)) return load(base + ext);
      return require(id);
    }, mod, mod.exports);
    return mod.exports;
  }
  return load;
}
const policy = loader({})('src/lib/sixfl-tv/footage-policy.ts');
const spec = (kind = 'CLIP', sizeBytes = 24, filename = 'goal.mp4') => ({ kind, sizeBytes, filename, lastModified: 123 });

test('strict file kinds, sizes, identities and MP4 signature, including large-file part maths', () => {
  for (const kind of policy.FOOTAGE_KINDS) assert.equal(policy.footageSpec(spec(kind)).kind, kind);
  for (const change of [{kind:'OTHER'}, {sizeBytes:'24'}, {sizeBytes:0}, {sizeBytes:-1}, {sizeBytes:Infinity}, {filename:'../goal.mp4'}, {filename:'evil.html'}, {filename:'bad\n.mp4'}, {lastModified:-1}]) assert.throws(() => policy.footageSpec({...spec(), ...change}));
  assert.throws(() => policy.footageSpec(spec('CLIP', 1024 ** 3 + 1)));
  assert.equal(policy.footageSpec(spec('FULL_MATCH', 8 * 1024 ** 3)).partCount, 1024);
  assert.equal(policy.expectedFootagePartBytes(8 * 1024 ** 3, 1023), policy.FOOTAGE_PART_BYTES);
  assert.throws(() => policy.expectedFootagePartBytes(24, 1));
  assert.throws(() => policy.footageId('../fixture'));
  const b = Buffer.alloc(24); b.write('ftyp',4);
  assert.equal(policy.looksLikeMp4(b),true); assert.equal(policy.looksLikeMp4(Buffer.from('<html>not a video</html>')),false);
});

test('real private upload lifecycle, no live database or storage provider', async t => {
  const url = new URL(process.env.TEST_FOOTAGE_DATABASE_URL || 'http://missing.invalid');
  assert.ok(['postgres:', 'postgresql:'].includes(url.protocol) && ['127.0.0.1','localhost'].includes(url.hostname), 'Explicit isolated localhost PostgreSQL is required');
  const schema = 'footage_' + randomUUID().replaceAll('-', '');
  const root = new PrismaClient({datasources:{db:{url:url.toString()}}});
  await root.$executeRawUnsafe(`CREATE SCHEMA "${schema}"`);
  url.searchParams.set('schema',schema);
  const db = new PrismaClient({datasources:{db:{url:url.toString()}}});
  const objects = new Map(), puts = [], reads = [];
  let failPut = false, holdPut = null, authorised = true;
  const fixture = id => ({id, status:'SCHEDULED', kickoffAt:new Date('2026-09-16T19:00:00Z'),
    league:{name:'Test league'}, homeTeam:{id:'left',name:'Left test team',logoUrl:null}, awayTeam:{id:'right',name:'Right test team',logoUrl:null}, result:null});
  const mockDb = {
    $queryRaw:db.$queryRaw.bind(db), $executeRaw:db.$executeRaw.bind(db), $transaction:fn=>db.$transaction(fn),
    fixture:{findUnique:async ({where})=>where.id === 'missing' ? null : fixture(where.id)},
  };
  const load = loader({
    '@/lib/prisma':{prisma:mockDb},
    '@/lib/requireAdmin':{requireAdmin:async()=>{if(!authorised)throw Error('Not authenticated');return {user:{id:'test-admin'},session:null};}},
    '@/lib/storage/railway-s3':{
      uploadRailwayObject:async input=>{puts.push(input.key);objects.set(input.key,Buffer.from(input.body));if(holdPut)await holdPut;if(failPut)throw Error('Synthetic storage interruption');},
      deleteRailwayObject:async key=>{objects.delete(key);},
      fetchRailwayObject:async input=>{
        reads.push(input); const bytes=objects.get(input.key);if(!bytes)return new Response(null,{status:404});
        let start=0,end=bytes.length-1;
        if(input.range){const m=/^bytes=(\d+)-(\d+)$/.exec(input.range);start=Number(m[1]);end=Number(m[2]);}
        return new Response(new Uint8Array(bytes.subarray(start,end+1)),{status:input.range?206:200});
      },
    },
  });
  const core=load('src/lib/sixfl-tv/footage.ts'), stream=load('src/lib/sixfl-tv/footage-stream.ts');
  const api=load('src/app/api/admin/sixfl-tv/footage/[fixtureId]/route.ts');
  const media=load('src/app/api/admin/sixfl-tv/footage/[fixtureId]/[assetId]/route.ts');
  const envNames=['AWS_ENDPOINT_URL','AWS_S3_BUCKET_NAME','AWS_ACCESS_KEY_ID','AWS_SECRET_ACCESS_KEY'];
  const savedEnv=Object.fromEntries(envNames.map(n=>[n,process.env[n]]));
  envNames.forEach(n=>process.env[n]='synthetic-test-only');
  try {
    await db.$executeRawUnsafe('CREATE TABLE "Fixture" ("id" TEXT PRIMARY KEY)');
    for(const id of ['match-a','match-b',...Array.from({length:14},(_,i)=>'quota-'+i)])await db.$executeRaw`INSERT INTO "Fixture" ("id") VALUES (${id})`;
    for(const migration of ['prisma/migrations/20260917170000_sixfl_tv_footage_uploads/migration.sql','prisma/migrations/20260917213000_sixfl_tv_studio/migration.sql']){
      const sql=fs.readFileSync(migration,'utf8');
      for(const statement of sql.split(';').map(x=>x.trim()).filter(Boolean))await db.$executeRawUnsafe(statement);
    }
    let asset;
    const bytes=Buffer.alloc(policy.FOOTAGE_PART_BYTES+73); bytes.write('ftyp',4);bytes[bytes.length-1]=201;
    await t.test('begin requires real fixture and reserves one duplicate-safe manifest, even without result or badges',async()=>{
      await assert.rejects(core.beginFootage('missing','admin',spec()),/Fixture not found/);
      const results=await Promise.all([1,2].map(()=>core.beginFootage('match-a','admin',spec('FULL_MATCH',bytes.length,'full.mp4'))));
      assert.equal(results[0].asset.id,results[1].asset.id);assert.equal(results.filter(x=>x.reused).length,1);asset=results[0].asset;
      await assert.rejects(core.beginFootage('match-a','admin',spec('FULL_MATCH',24,'another.mp4')),/already has/);
    });
    await t.test('wrong fixture, oversized/invalid parts and renamed HTML cannot write storage',async()=>{
      await assert.rejects(core.putFootagePart('match-b',asset.id,0,bytes.subarray(0,policy.FOOTAGE_PART_BYTES)),/not found/);
      await assert.rejects(core.putFootagePart('match-a',asset.id,0,Buffer.alloc(24)),/size/);
      await assert.rejects(core.putFootagePart('match-a',asset.id,0,Buffer.alloc(policy.FOOTAGE_PART_BYTES)),/MP4/);
      assert.equal(puts.length,0);
      await assert.rejects(core.finishFootage('match-a',asset.id),/not finished/);
    });
    await t.test('part retries are immutable and only complete manifests become previewable',async()=>{
      const first=bytes.subarray(0,policy.FOOTAGE_PART_BYTES);
      await core.putFootagePart('match-a',asset.id,0,first);await core.putFootagePart('match-a',asset.id,0,first);assert.equal(puts.length,1);
      const changed=Buffer.from(first);changed[20]=42;await assert.rejects(core.putFootagePart('match-a',asset.id,0,changed),/differs/);
      const resume=await core.resumeFootage('match-a',asset.id);assert.equal(resume.parts[0].sha256,createHash('sha256').update(first).digest('hex'));
      assert.equal(resume.parts[0].objectKey,undefined);
      await assert.rejects(stream.streamFootage(new Request('https://sixfl.co.uk/source?download=1'),'match-a',asset.id),/not finished/);
      await core.putFootagePart('match-a',asset.id,1,bytes.subarray(policy.FOOTAGE_PART_BYTES));await core.finishFootage('match-a',asset.id);await core.finishFootage('match-a',asset.id);
      assert.equal((await core.resumeFootage('match-a',asset.id)).asset.state,'READY');
      await assert.rejects(core.putFootagePart('match-a',asset.id,1,bytes.subarray(policy.FOOTAGE_PART_BYTES)),/no longer writable/);
    });
    await t.test('stream and download reproduce source bytes, including ranges crossing part boundaries',async()=>{
      for(const range of [null,'bytes=10-39',`bytes=${policy.FOOTAGE_PART_BYTES-5}-${policy.FOOTAGE_PART_BYTES+5}`,'bytes=-15']){
        const r=stream.footageRange(range,bytes.length);
        const response=await stream.streamFootage(new Request('https://sixfl.co.uk/source?download=1',{headers:range?{range}:{}}),'match-a',asset.id);
        assert.equal(response.status,range?206:200);assert.match(response.headers.get('cache-control'),/no-store/);
        assert.match(response.headers.get('content-disposition'),/attachment/);
        assert.deepEqual(Buffer.from(await response.arrayBuffer()),bytes.subarray(r.start,r.end+1));
      }
      const before=reads.length;const head=await stream.streamFootage(new Request('https://sixfl.co.uk/source',{method:'HEAD'}),'match-a',asset.id);
      assert.equal(await head.text(),'');assert.equal(reads.length,before);
      const bad=await stream.streamFootage(new Request('https://sixfl.co.uk/source',{headers:{range:'bytes=99999999999-'}}),'match-a',asset.id);assert.equal(bad.status,416);
    });
    await t.test('route auth and origin are enforced before reads and writes',async()=>{
      authorised=false;const context={params:Promise.resolve({fixtureId:'match-a',assetId:asset.id})};
      await assert.rejects(api.GET(new Request('https://sixfl.co.uk/test'),context),/Not authenticated/);
      await assert.rejects(media.GET(new Request('https://sixfl.co.uk/test'),context),/Not authenticated/);
      await assert.rejects(api.POST(new Request('https://sixfl.co.uk/test',{method:'POST',body:'{}'}),context),/Not authenticated/);
      authorised=true;
      const rejected=await api.POST(new Request('https://sixfl.co.uk/test',{method:'POST',headers:{origin:'https://other.invalid'},body:'{}'}),context);assert.equal(rejected.status,403);
      await assert.rejects(core.readFootageBytes(new Request('https://sixfl.co.uk/test',{method:'POST',body:Buffer.alloc(33)}),32),/too large/);
      await assert.rejects(core.readFootageJson(new Request('https://sixfl.co.uk/test',{method:'POST',body:'[]'})),/Invalid/);
    });
    await t.test('clip order uses exact IDs and rejects stale or foreign lists',async()=>{
      const a=(await core.beginFootage('match-a','admin',spec('CLIP',24,'goal-a.mp4'))).asset;
      const b=(await core.beginFootage('match-a','admin',spec('CLIP',24,'goal-b.mp4'))).asset;
      await core.reorderFootage('match-a',[b.id,a.id],[a.id,b.id]);
      assert.deepEqual((await core.footageState('match-a')).assets.filter(x=>x.kind==='CLIP').map(x=>x.id),[b.id,a.id]);
      await assert.rejects(core.reorderFootage('match-a',[a.id,b.id],[a.id,b.id]),/changed/);
      await assert.rejects(core.reorderFootage('match-b',[a.id,b.id],[]),/changed/);
    });
    await t.test('shared intro appears on both fixture pages, without changing their records',async()=>{
      const intro=(await core.beginFootage('match-a','admin',spec('INTRO',24,'intro.mp4'))).asset;
      assert.ok((await core.footageState('match-b')).assets.some(x=>x.id===intro.id&&x.shared));
      const dto=JSON.stringify(await core.footageState('match-a'));assert.doesNotMatch(dto,/leaseToken|objectKey|secretAccessKey/);
    });
    await t.test('in-flight uploads block deletion and failed storage keeps a cleanup manifest',async()=>{
      const a=(await core.beginFootage('match-b','admin',spec('CLIP',24,'pending.mp4'))).asset;
      const content=Buffer.alloc(24);content.write('ftyp',4);
      let release;holdPut=new Promise(resolve=>release=resolve);const write=core.putFootagePart('match-b',a.id,0,content);
      while(!(await core.footageParts(a.id)).length)await new Promise(r=>setTimeout(r,10));
      await assert.rejects(core.removeFootage('match-b',a.id,true),/still saving/);
      release();holdPut=null;await write;
      await assert.rejects(core.removeFootage('match-b',a.id,false),/Confirm/);
      await core.removeFootage('match-b',a.id,true);
      const failed=(await core.beginFootage('match-b','admin',spec('CLIP',24,'failed.mp4'))).asset;
      failPut=true;await assert.rejects(core.putFootagePart('match-b',failed.id,0,content),/Synthetic/);failPut=false;
      const parts=await core.footageParts(failed.id);assert.equal(parts.length,1);assert.equal(parts[0].stored,false);assert.ok(objects.has(parts[0].objectKey));
      await db.$executeRaw`UPDATE "SixflTvFootageAsset" SET "busyUntil"=NOW()-INTERVAL '1 minute' WHERE "id"=${failed.id}`;
      await core.removeFootage('match-b',failed.id,true);assert.equal(objects.has(parts[0].objectKey),false);
    });
    await t.test('active render inputs cannot be deleted',async()=>{
      const guarded=(await core.beginFootage('match-b','admin',spec('CLIP',24,'guarded.mp4'))).asset;
      const content=Buffer.alloc(24);content.write('ftyp',4);await core.putFootagePart('match-b',guarded.id,0,content);await core.finishFootage('match-b',guarded.id);
      const job=randomUUID();
      await db.$executeRaw`INSERT INTO "SixflTvRenderJob" ("id","fixtureId","kind","sourceFingerprint","metadataJson","requestedByActor") VALUES (${job},'match-b','HIGHLIGHTS',${'a'.repeat(64)},'{}'::jsonb,'admin')`;
      await db.$executeRaw`INSERT INTO "SixflTvRenderInput" ("jobId","assetId","role","position") VALUES (${job},${guarded.id},'CONTENT',0)`;
      await assert.rejects(core.removeFootage('match-b',guarded.id,true),/active SIXFL TV render/);
      await db.$executeRaw`UPDATE "SixflTvRenderJob" SET "state"='FAILED' WHERE "id"=${job}`;
      await core.removeFootage('match-b',guarded.id,true);
    });
    await t.test('parallel reservations cannot exceed the 100 GiB pilot quota',async()=>{
      const results=await Promise.allSettled(Array.from({length:14},(_,i)=>core.beginFootage('quota-'+i,'admin',spec('FULL_MATCH',8*1024**3,'quota.mp4'))));
      assert.equal(results.filter(x=>x.status==='fulfilled').length,12);
      assert.ok((await core.footageState('match-a')).reservedBytes<=policy.FOOTAGE_STORAGE_LIMIT_BYTES);
    });
    await t.test('new upload routes never publish, render, email or overwrite existing link fields',()=>{
      const paths=['src/lib/sixfl-tv/footage.ts','src/app/api/admin/sixfl-tv/footage/[fixtureId]/route.ts','src/components/admin/sixfl-tv/FootageUploader.tsx'];
      for(const file of paths)assert.doesNotMatch(fs.readFileSync(file,'utf8'),/queueNotification|queueSixflTvFixtureUploaded|sendEmail\(|spawn\(|exec\(|sixflTvUrl\s*=/);
      const old=fs.readFileSync('src/app/(admin)/admin/sixfl-tv/page.tsx','utf8');assert.match(old,/highlightsUrl/);assert.match(old,/fullMatchUrl/);assert.match(old,/queueSixflTvFixtureUploadedEmailsOnce/);
      const ui=fs.readFileSync(paths[2],'utf8');assert.doesNotMatch(ui,/<select\b|MutationObserver|document\.querySelector/);assert.match(ui,/multiple=\{kind === "CLIP"\}/);
    });
  } finally {
    failPut=false;holdPut=null;await db.$disconnect();
    await root.$executeRawUnsafe(`DROP SCHEMA "${schema}" CASCADE`);await root.$disconnect();
    for(const [name,value] of Object.entries(savedEnv)){if(value===undefined)delete process.env[name];else process.env[name]=value;}
  }
});