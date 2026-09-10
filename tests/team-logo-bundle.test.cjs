const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { PassThrough } = require('node:stream');
const { EventEmitter } = require('node:events');
const ts = require('typescript');
const root = path.resolve(__dirname, '..');
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aS9sAAAAASUVORK5CYII=', 'base64');
function loader(mocks = {}, denied = []) {
  const cache = new Map();
  function load(file) {
    let filename = path.resolve(root, file);
    if (!fs.existsSync(filename)) filename += '.ts';
    if (cache.has(filename)) return cache.get(filename).exports;
    const module = { exports: {} }; cache.set(filename, module);
    const compiled = ts.transpileModule(fs.readFileSync(filename, 'utf8'), { fileName: filename,
      compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, esModuleInterop: true, jsx: ts.JsxEmit.ReactJSX } });
    new Function('require', 'module', 'exports', compiled.outputText)(id => {
      assert.ok(!denied.includes(id), `Forbidden heavy dependency: ${id}`);
      if (Object.hasOwn(mocks, id)) return mocks[id];
      if (id.startsWith('@/')) return load('src/' + id.slice(2));
      if (id.startsWith('.')) return load(path.resolve(path.dirname(filename), id));
      return require(id);
    }, module, module.exports);
    return module.exports;
  }
  return load;
}
function harness({ data = png, status = 200, type = 'image/png', location, addresses = ['93.184.216.34'], declaredSize } = {}) {
  const requests = [], lookups = [], badgeCalls = [];
  const get = (options, callback) => {
    requests.push(options);
    const request = new EventEmitter();
    request.destroy = error => { if (error) queueMicrotask(() => request.emit('error', error)); return request; };
    queueMicrotask(() => {
      const response = new PassThrough();
      response.statusCode = status;
      response.headers = { 'content-type': type, ...(location ? { location } : {}), ...(declaredSize ? { 'content-length': declaredSize } : {}) };
      callback(response);
      if (!response.destroyed) response.end(data);
    });
    return request;
  };
  const assets = loader({
    'node:dns/promises': { resolve4: async host => { lookups.push(host); return addresses; } },
    'node:https': { get },
    '@/lib/team-badges': { getTeamBadgeImage: async (id, thumbnail) => { badgeCalls.push({ id, thumbnail }); return png; } },
  }, ['node:fs', 'node:fs/promises', 'fs', 'fs/promises', 'node:path'])('src/lib/exports/team-logo-assets.ts');
  return { ...assets, requests, lookups, badgeCalls };
}

test('catalogue and selector page never load the exporter, image processor or file loader', async () => {
  let queries = 0, authorised = false;
  const load = loader({
    '@/lib/prisma': { prisma: { $queryRaw: async () => { assert.equal(authorised, true); queries++; return []; } } },
    '@/lib/requireAdmin': { requireAdmin: async () => { authorised = true; } },
    '@/components/admin/teams/TeamLogoExportSelector': { __esModule: true, default: () => null },
    'next/link': { __esModule: true, default: () => null },
  }, ['@/lib/exports/team-logos', './team-logo-assets', '@/lib/exports/team-logo-assets', 'sharp', 'node:fs/promises']);
  await load('src/app/(admin)/admin/teams/logos/page.tsx').default();
  assert.equal(queries, 1);
});
test('relative and own-host public artwork retain original bytes and do not need packaged public files', async () => {
  for (const url of ['/team-logos/Feet%20United.png?variant=thumbnail', 'https://www.sixfl.co.uk/logos/old.png', '/Kits/unusual-assigned-logo.png']) {
    const h = harness();
    const result = await h.readTeamLogo(url, new AbortController().signal);
    assert.deepEqual(result.data, png); assert.equal(result.extension, 'png');
    assert.equal(h.requests.length, 1); assert.equal(h.badgeCalls.length, 0);
    assert.ok(!h.requests[0].path.includes('?')); // No thumbnail/image transformations.
    assert.equal(h.requests[0].hostname, '93.184.216.34');
    assert.equal(h.requests[0].servername, h.requests[0].headers.Host);
    assert.equal(h.requests[0].port, 443); assert.equal(h.requests[0].agent, false);
    assert.ok(!h.requests[0].headers.Cookie && !h.requests[0].headers.Authorization);
  }
});
test('actual repository public PNG artwork remains byte-exact through the export reader', async () => {
  const data = fs.readFileSync(path.join(root, 'public/logo.png'));
  const h = harness({ data }); const result = await h.readTeamLogo('/logo.png', new AbortController().signal);
  assert.deepEqual(result.data, data); assert.equal(result.extension, 'png');
});
test('uploaded badges still use full-size database bytes with no public HTTP request', async () => {
  const h = harness();
  const result = await h.readTeamLogo('/api/team-badges/11111111-1111-4111-8111-111111111111?variant=thumbnail', new AbortController().signal);
  assert.deepEqual(result.data, png); assert.equal(h.badgeCalls[0].thumbnail, false); assert.equal(h.requests.length, 0);
});
test('unsupported local paths and encoded traversal fail before any request', async () => {
  for (const url of ['/private.env', '/x%2f..%2fsecret.png', '/bad%00.png', '/bad%5csecret.png']) {
    const h = harness(); await assert.rejects(h.readTeamLogo(url, new AbortController().signal), /Unsupported stored logo/); assert.equal(h.requests.length, 0);
  }
});
test('own-host static reads retain public-IP checks and abort checks', async () => {
  const h = harness({ addresses: ['127.0.0.1'] });
  await assert.rejects(h.readTeamLogo('/team-logos/a.png', new AbortController().signal), /not public/); assert.equal(h.requests.length, 0);
  const other = harness(); const controller = new AbortController(); controller.abort();
  await assert.rejects(other.readTeamLogo('/team-logos/a.png', controller.signal)); assert.equal(other.requests.length, 0);
});
test('redirects to private hosts are blocked and never contacted', async () => {
  const h = harness({ status: 302, location: 'https://127.0.0.1/private.png' });
  await assert.rejects(h.readTeamLogo('/team-logos/a.png', new AbortController().signal), /not public/); assert.equal(h.requests.length, 1);
});
test('non-images, unavailable assets and oversized responses fail explicitly', async () => {
  for (const options of [{ status: 404 }, { type: 'text/html' }, { declaredSize: 8 * 1024 * 1024 + 1 }]) {
    const h = harness(options); await assert.rejects(h.readTeamLogo('/team-logos/a.png', new AbortController().signal), /Logo/);
  }
});
test('one metadata query source and no filesystem-wide loader remain after prebuild', () => {
  const catalogue = fs.readFileSync(path.join(root, 'src/lib/exports/team-logo-catalogue.ts'), 'utf8');
  const service = fs.readFileSync(path.join(root, 'src/lib/exports/team-logos.ts'), 'utf8');
  const assets = fs.readFileSync(path.join(root, 'src/lib/exports/team-logo-assets.ts'), 'utf8');
  assert.match(catalogue, /export async function getTeamLogoExportChoices/);
  assert.doesNotMatch(service, /export async function getTeamLogoExportChoices|\$queryRaw/);
  assert.match(service, /from "@\/lib\/exports\/team-logo-catalogue"/);
  assert.doesNotMatch(assets, /node:fs|process\.cwd|readFile|realpath/);
  for (const source of [catalogue, service, assets]) assert.doesNotMatch(source, /queueNotification|sendEmail|sendSms|\$executeRaw/);
});
