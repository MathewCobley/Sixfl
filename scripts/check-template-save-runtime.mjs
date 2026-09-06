import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { createRequire } from 'node:module';
import { unlinkSync } from 'node:fs';
import path from 'node:path';
const require = createRequire(import.meta.url);
const outfile = path.resolve('.template-save-route-test.cjs');
let writes = 0, failRead = false, failRevalidation = false, allowed = true;
const stores = { emailTemplate: new Map(), notificationTemplate: new Map() };
const delegate = (store) => ({
  async findUnique({ where }) { if (failRead) throw new Error('DB unavailable'); return [...store.values()].find(row => where.id ? row.id === where.id : row.key === where.key) ?? null; },
  async create({ data }) {
    if ([...store.values()].some(row => row.key === data.key)) throw Object.assign(new Error('Unique key'), { code: 'P2002' });
    const row = { ...data, id: `saved-${++writes}` }; store.set(row.id, row); return row;
  },
  async update({ where, data }) { const row = { ...store.get(where.id), ...data }; store.set(where.id, row); writes++; return row; },
});
globalThis.__templateSaveTestDb = Object.fromEntries(Object.entries(stores).map(([name, rows]) => [name, delegate(rows)]));
globalThis.__templateSaveTestAuth = async () => {
  if (!allowed) { const { redirect } = require('next/navigation'); redirect('/login'); }
};
globalThis.__templateSaveTestRevalidate = () => { if (failRevalidation) throw new Error('Post-save revalidation failed'); };
try {
  await build({ entryPoints: ['src/app/api/admin/templates/save/route.ts'], outfile, bundle: true, platform: 'node', format: 'cjs', packages: 'external', plugins: [{ name: 'isolated-boundaries', setup(b) {
    const mocks = {
      '@/lib/prisma': 'export const prisma = globalThis.__templateSaveTestDb;',
      '@/lib/requireAdmin': 'export const requireAdmin = globalThis.__templateSaveTestAuth;',
      'next/cache': 'export const revalidatePath = globalThis.__templateSaveTestRevalidate;',
    };
    b.onResolve({ filter: /^(?:@\/lib\/(?:prisma|requireAdmin)|next\/cache)$/ }, args => ({ path: args.path, namespace: 'test-boundary' }));
    b.onLoad({ filter: /.*/, namespace: 'test-boundary' }, args => ({ contents: mocks[args.path], loader: 'js' }));
  } }] });
  const { POST } = require(outfile);
  const { NextRequest } = require('next/server');
  async function request(overrides = {}, origin = 'http://localhost:3000') {
    const data = { channel: 'EMAIL', templateType: 'campaign', mode: 'create', operation: 'save', key: 'winter', name: 'Winter league', subject: 'Autumn 2026', body: 'The saved email text.', audience: 'TEAM', description: '', ctaLabel: '', ctaUrlKey: '', isActive: 'true', ...overrides };
    const form = new FormData(); Object.entries(data).forEach(([k,v]) => form.set(k,v));
    const response = await POST(new NextRequest('http://localhost:3000/api/admin/templates/save', { method:'POST', headers: { origin, 'x-sixfl-template-request': '1' }, body: form }));
    return { status: response.status, body: await response.json() };
  }
  for (const channel of ['EMAIL','SMS']) for (const templateType of ['campaign','system']) {
    const input = { channel, templateType, key: `${channel}-${templateType}`.toLowerCase() };
    let result = await request(input); assert.equal(result.status,200); assert.equal(result.body.ok,true); assert.match(result.body.redirectTo,/\?created=1$/);
    const before = writes;
    result = await request(input); assert.equal(result.body.ok,true); assert.equal(writes,before,'retry must not create a duplicate');
    result = await request({ ...input, body:'Different body' }); assert.equal(result.status,409); assert.equal(writes,before);
    const id = new URL(result.body.existingUrl,'http://test').pathname.split('/').pop();
    result = await request({ ...input, id, mode:'edit', body:'Changed safely' }); assert.equal(result.body.ok,true); assert.equal(writes,before+1);
    result = await request({ ...input, id, mode:'edit', body:'Changed safely', operation:'check' }); assert.equal(result.body.ok,true); assert.equal(writes,before+1);
  }
  let result = await request({ name:'', key:'invalid' }); assert.equal(result.status,422); assert.ok(result.body.errors.name);
  const before = writes;
  result = await request({ key:'not-saved-yet', operation:'check' }); assert.equal(result.body.ok,false); assert.equal(result.body.needsCheck,false); assert.equal(writes,before);
  const concurrent = await Promise.all([request({key:'race'}),request({key:'race'})]); assert.ok(concurrent.every(r => r.body.ok)); assert.equal(writes,before+1);
  failRevalidation = true;
  result = await request({key:'committed-before-refresh-failed'}); assert.equal(result.body.ok,true,'committed record must not be reported as failed'); failRevalidation=false;
  result = await request({key:'cross-site'},'https://attacker.invalid'); assert.equal(result.status,403);
  allowed=false; result=await request({key:'unauthorised'}); assert.equal(result.status,401); assert.equal(result.body.signInRequired,true); allowed=true;
  failRead=true; result=await request({key:'offline'}); assert.equal(result.status,500); assert.equal(result.body.needsCheck,true);
  console.log('Template-save runtime tests passed: all four types, create/edit/check, duplicates/races, validation, post-commit failure, authentication, CSRF and database failure.');
} finally { try { unlinkSync(outfile); } catch {} }
