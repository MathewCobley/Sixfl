const assert = require('node:assert/strict');
const { test, before, after, beforeEach } = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');
const { PrismaClient } = require('@prisma/client');
const { NextRequest } = require('next/server');
const url = new URL(process.env.SMS_REPLY_TEST_DATABASE_URL || 'http://missing');
if (!['127.0.0.1', 'localhost'].includes(url.hostname) || url.pathname !== '/sixfl_sms_reply_test') throw Error('Isolated local SMS test database required');
const raw = new PrismaClient({ datasources: { db: { url: url.toString() } } });
let authorised = true, failEntry = false, failThread = false, member = null, memberPhone = null;
const actor = 'sms-test-admin';
const forbidden = () => { throw Error('Provider/network traffic prohibited in SMS reply tests'); };
const db = new Proxy(raw, { get(target, key) {
  if (key === '$transaction') return (fn, options) => target.$transaction(tx => fn(new Proxy(tx, { get(value, field) {
    if (field === 'messageEntry' && failEntry) return new Proxy(value.messageEntry, { get(delegate, op) { if (op === 'create') return async () => { throw Error('ENTRY_FAILURE'); }; return delegate[op]; } });
    if (field === 'messageThread' && failThread) return new Proxy(value.messageThread, { get(delegate, op) { if (op === 'update') return async () => { throw Error('THREAD_FAILURE'); }; return delegate[op]; } });
    return value[field];
  } })), options);
  if (key === 'teamMember') return { findUnique: async () => member };
  return target[key];
} });
const replacements = {
  '@/lib/prisma': { prisma: db },
  '@/lib/requireAdmin': { requireAdmin: async () => { if (!authorised) throw Error('NOTADMIN'); return { user: { id: actor, role: 'ADMIN' } }; } },
  '@/lib/teamMemberProfiles': { getTeamMemberProfilesByTeamMemberIds: async ids => new Map(ids.map(id => [id, { phone: memberPhone }])) },
  '@/lib/stripe/client': { getPublicSiteUrl: () => 'https://app.example.test' },
  'next/dist/client/components/redirect-error': { isRedirectError: e => e?.message === 'NOTADMIN' },
  '@/lib/fixtures/publishing': { getUnpublishedFixtureBlockReason: async () => null },
  '@/lib/fixtures/replacement-sms-lifecycle': { cancelClosedReplacementSms: async () => 0, getReplacementSmsCancellationReason: async () => null },
  '@/lib/notifications/processor': new Proxy({}, { get: forbidden }),
  'server-only': {},
};
const root = path.resolve(__dirname, '..'), cache = new Map();
function load(file) {
  const filename = path.resolve(root, file);
  if (cache.has(filename)) return cache.get(filename).exports;
  const instance = new Module(filename, module); instance.filename = filename; instance.paths = Module._nodeModulePaths(path.dirname(filename)); cache.set(filename, instance);
  const native = instance.require.bind(instance);
  instance.require = name => {
    if (Object.hasOwn(replacements, name)) return replacements[name];
    const local = name.startsWith('@/') ? path.join(root, 'src', name.slice(2)) : name.startsWith('.') ? path.resolve(path.dirname(filename), name) : null;
    if (local) for (const p of [local, local + '.ts', local + '.tsx']) if (fs.existsSync(p) && fs.statSync(p).isFile() && /\.tsx?$/.test(p)) return load(p);
    return native(name);
  };
  instance._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), { fileName: filename, compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText, filename);
  return instance.exports;
}
const oldFetch = global.fetch; global.fetch = forbidden;
const service = load('src/lib/messaging/admin-sms-reply.ts');
const route = load('src/app/api/admin/messages/sms-reply/route.ts');
const { smsReplyStatusLabel } = load('src/lib/messaging/sms-reply-display.ts');
let thread, recipient, input;
before(async () => raw.$connect());
after(async () => { global.fetch = oldFetch; await raw.$disconnect(); });
beforeEach(async () => {
  authorised = true; failEntry = false; failThread = false; member = null; memberPhone = null;
  await raw.messageEntry.deleteMany(); await raw.messageThread.deleteMany(); await raw.notificationDispatch.deleteMany(); await raw.notificationRecipient.deleteMany(); await raw.user.deleteMany();
  await raw.user.create({ data: { id: actor, email: 'admin@example.test', role: 'ADMIN' } });
  recipient = await raw.notificationRecipient.create({ data: { sourceType: 'GENERAL', sourceId: 'test-person', audience: 'GENERAL', phone: '+447700900111', phoneNormalized: '+447700900111', preferences: { create: {} } } });
  thread = await raw.messageThread.create({ data: { contactName: 'Synthetic contact', contactPhone: recipient.phone, phoneNormalized: recipient.phone, recipientId: recipient.id, channel: 'EMAIL' } });
  input = { threadId: thread.id, requestId: 'synthetic-request-0001', body: 'One individually typed synthetic reply', expectedPhone: recipient.phone };
});
const queue = () => service.queueAdminSmsReply(input);
async function counts() { return [await raw.notificationDispatch.count(), await raw.messageEntry.count()]; }
function request(method, data = input, extra = {}) {
  return new NextRequest('https://app.example.test/api/admin/messages/sms-reply?' + new URLSearchParams({ threadId: input.threadId, requestId: input.requestId }), { method, ...(method === 'POST' ? { headers: { origin: 'https://app.example.test', 'content-type': 'application/json', 'x-sixfl-sms-reply': '1', ...extra }, body: typeof data === 'string' ? data : JSON.stringify(data) } : {}) });
}
test('queue saves one linked message and dispatch atomically, without a provider send', async () => {
  const result = await queue(); assert.equal(result.status, 'QUEUED'); assert.equal(result.sentAt, null); assert.deepEqual(await counts(), [1, 1]);
  const entry = await raw.messageEntry.findUnique({ where: { id: result.messageId }, include: { dispatch: true } });
  assert.equal(entry.dispatch.id, result.dispatchId); assert.equal(entry.createdByUserId, actor); assert.equal(entry.dispatch.createdByUserId, actor); assert.equal(entry.dispatch.providerMessageId, null);
  assert.match(entry.body, /SIXFL$/); assert.equal(entry.toNumber, input.expectedPhone);
  assert.equal((await raw.messageThread.findUnique({ where: { id: thread.id } })).channel, 'EMAIL');
});
test('concurrent same-request retries create only one durable reply', async () => {
  const results = await Promise.all(Array.from({ length: 6 }, queue)); assert.equal(new Set(results.map(x => x.messageId)).size, 1); assert.deepEqual(await counts(), [1, 1]);
});
test('lost-response retry after sent or failed returns original record without resending', async () => {
  const result = await queue();
  for (const status of ['PROCESSING', 'SENT', 'FAILED', 'CANCELLED']) {
    await raw.notificationDispatch.update({ where: { id: result.dispatchId }, data: { status } });
    assert.equal((await queue()).status, status); assert.deepEqual(await counts(), [1, 1]);
  }
});
test('same request with changed body or destination is rejected', async () => {
  await queue(); await assert.rejects(service.queueAdminSmsReply({ ...input, body: 'Changed' }), /already used/);
  await assert.rejects(service.queueAdminSmsReply({ ...input, expectedPhone: '+447700900222' }), /already used/); assert.deepEqual(await counts(), [1, 1]);
});
test('a failed message insert rolls back the notification as well', async () => {
  failEntry = true; await assert.rejects(queue(), /ENTRY_FAILURE/); assert.deepEqual(await counts(), [0, 0]);
  failEntry = false; await queue(); assert.deepEqual(await counts(), [1, 1]);
});
test('a failed thread update rolls back both message and notification', async () => {
  failThread = true; await assert.rejects(queue(), /THREAD_FAILURE/); assert.deepEqual(await counts(), [0, 0]);
});
test('SMS opt-out is preserved and produces a visible skipped record', async () => {
  await raw.notificationPreference.update({ where: { recipientId: recipient.id }, data: { smsEnabled: false } });
  const result = await queue(); assert.equal(result.status, 'SKIPPED'); assert.match(result.failureReason, /disabled/);
  assert.equal((await raw.notificationPreference.findUnique({ where: { recipientId: recipient.id } })).smsEnabled, false);
  await queue(); assert.deepEqual(await counts(), [1, 1]);
});
test('suppression and transactional opt-outs are not reset', async () => {
  await raw.notificationRecipient.update({ where: { id: recipient.id }, data: { isSuppressed: true } }); await assert.rejects(queue(), /suppressed/); assert.deepEqual(await counts(), [0, 0]);
  await raw.notificationRecipient.update({ where: { id: recipient.id }, data: { isSuppressed: false, transactionalSmsOptIn: false } }); assert.equal((await queue()).status, 'SKIPPED');
  assert.equal((await raw.notificationRecipient.findUnique({ where: { id: recipient.id } })).transactionalSmsOptIn, false);
});
test('legacy missing preference row gets defaults but no existing preferences are changed', async () => {
  await raw.notificationPreference.delete({ where: { recipientId: recipient.id } }); assert.equal((await queue()).status, 'QUEUED');
});
test('closed, missing and stale recipient threads are rejected before queue writes', async () => {
  await raw.messageThread.update({ where: { id: thread.id }, data: { status: 'ARCHIVED' } }); await assert.rejects(queue(), /Reopen/);
  await raw.messageThread.update({ where: { id: thread.id }, data: { status: 'OPEN', phoneNormalized: '+447700900222' } }); await assert.rejects(queue(), /changed/);
  await assert.rejects(service.queueAdminSmsReply({ ...input, threadId: 'missing-thread' }), /not be found/); assert.deepEqual(await counts(), [0, 0]);
});
test('missing phone never silently falls back to email', async () => {
  await raw.messageThread.update({ where: { id: thread.id }, data: { phoneNormalized: null, contactPhone: null, contactEmail: 'contact@example.test' } });
  await raw.notificationRecipient.update({ where: { id: recipient.id }, data: { phone: null, phoneNormalized: null, email: 'contact@example.test' } });
  await assert.rejects(queue(), /valid SMS number/); assert.deepEqual(await counts(), [0, 0]);
});
test('member-specific target never uses a captain number when member is missing, moved, or has no phone', async () => {
  const context = { ...thread, sourceType: 'TEAM_MEMBER', sourceId: 'member-one', teamId: 'team-one', recipient, team: { name: 'Synthetic team' } };
  assert.equal((await service.getAdminSmsReplyTarget(context)).phone, null);
  member = { id: 'member-one', teamId: 'other-team', user: { name: 'Player', email: 'player@example.test' } }; memberPhone = '+447700900222';
  assert.equal((await service.getAdminSmsReplyTarget(context)).phone, null);
  member.teamId = 'team-one'; memberPhone = null; assert.equal((await service.getAdminSmsReplyTarget(context)).phone, null);
  memberPhone = '+447700900222'; assert.equal((await service.getAdminSmsReplyTarget(context)).phone, memberPhone);
});
test('status GET is read-only and exposes genuine provider/dispatch state', async () => {
  assert.equal((await (await route.GET(request('GET'))).json()).record, null); assert.deepEqual(await counts(), [0, 0]);
  const result = await queue(); await raw.notificationDispatch.update({ where: { id: result.dispatchId }, data: { status: 'FAILED', failureReason: 'Synthetic provider rejection' } });
  const before = JSON.stringify(await raw.notificationDispatch.findMany()); const response = await route.GET(request('GET')); assert.equal(response.status, 200); assert.match(response.headers.get('cache-control'), /no-store/);
  assert.equal((await response.json()).record.status, 'FAILED'); assert.equal(JSON.stringify(await raw.notificationDispatch.findMany()), before);
});
test('API sends explicit JSON POST and pins actor to authenticated session', async () => {
  const response = await route.POST(request('POST', { ...input, actorId: 'spoofed' })); assert.equal(response.status, 200); assert.equal((await response.json()).record.status, 'QUEUED');
  await route.POST(request('POST')); assert.deepEqual(await counts(), [1, 1]); assert.equal((await raw.messageEntry.findFirst()).createdByUserId, actor);
});
test('anonymous, cross-origin, malformed and stale-form submissions cannot write', async () => {
  authorised = false; assert.equal((await route.POST(request('POST'))).status, 401); assert.equal((await route.GET(request('GET'))).status, 401); authorised = true;
  assert.equal((await route.POST(request('POST', input, { origin: 'https://evil.example.test' }))).status, 403);
  assert.equal((await route.POST(request('POST', input, { 'x-sixfl-sms-reply': '0' }))).status, 403);
  assert.equal((await route.POST(request('POST', '{bad'))).status, 400);
  assert.equal((await route.POST(request('POST', { ...input, requestId: '' }))).status, 400); assert.deepEqual(await counts(), [0, 0]);
});
test('unexpected write failure returns uncertain JSON, never false success', async () => {
  failEntry = true; const response = await route.POST(request('POST')); assert.equal(response.status, 500); const data = await response.json(); assert.equal(data.ok, false); assert.equal(data.uncertain, true); assert.deepEqual(await counts(), [0, 0]);
});
test('quiet-hours scheduling remains owned by the existing queue and queued is not sent', async () => {
  const result = await queue(); const hour = Number(new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/London', hour: 'numeric', hourCycle: 'h23' }).format(new Date(result.scheduledFor)));
  assert.ok(hour >= 9 && hour < 21); assert.match(smsReplyStatusLabel('QUEUED'), /not sent/); assert.equal(smsReplyStatusLabel('FAILED'), 'Failed'); assert.equal(smsReplyStatusLabel('SENT'), 'Sent to SMS provider'); assert.equal(smsReplyStatusLabel('SENT', 'delivered'), 'Delivered');
});
test('post-prebuild native contracts retain the exact reply owner, status and attribution', () => {
  const source = fs.readFileSync(path.join(root, 'src/components/admin/messages/AdminMessageThread.tsx'), 'utf8');
  assert.match(source, /<AdminSmsReplyForm/); assert.doesNotMatch(source, /<form action=\{sendAdminMessageReplyAction\}/); assert.doesNotMatch(source, /useMemo/); assert.match(source, /smsReplyStatusLabel/); assert.match(source, /createdByUser/);
  const page = fs.readFileSync(path.join(root, 'src/app/(admin)/admin/messaging/page.tsx'), 'utf8'); assert.match(page, /providerStatus: message\.providerStatus/); assert.match(page, /status: message\.dispatch\.status/); assert.match(page, /smsReplyPhone: smsReplyTarget/);
  const actions = fs.readFileSync(path.join(root, 'src/app/(admin)/admin/messages/actions.ts'), 'utf8'); assert.match(actions, /queueAdminSmsReply/); assert.doesNotMatch(actions, /sendEmailWithResend|queueDirectNotification/);
});


test('lost-reference history is authenticated, bounded, thread-specific and read-only', async () => {
  const saved=await queue();
  const historyRequest=()=>new NextRequest('https://app.example.test/api/admin/messages/sms-reply?'+new URLSearchParams({threadId:thread.id,recent:'1'}));
  const other=await raw.messageThread.create({data:{contactName:'Other thread',channel:'SMS'}});
  const copy={threadId:thread.id,channel:'SMS',direction:'OUTBOUND',participantRole:'ADMIN',body:'Synthetic history record',createdByUserId:actor};
  await raw.messageEntry.createMany({data:[
    {...copy,id:'history-other',threadId:other.id},
    {...copy,id:'history-old',createdAt:new Date(Date.now()-8*86400000)},
    {...copy,id:'history-inbound',direction:'INBOUND'},
    {...copy,id:'history-system',participantRole:'SYSTEM'},
    {...copy,id:'history-email',channel:'EMAIL'},
  ]});
  const before=JSON.stringify([await raw.messageEntry.findMany(),await raw.notificationDispatch.findMany()]);
  const response=await route.GET(historyRequest());assert.equal(response.status,200);assert.match(response.headers.get('cache-control'),/no-store/);
  const data=await response.json();assert.deepEqual(data.records.map(r=>r.messageId),[saved.messageId]);assert.ok(data.records[0].createdAt);
  assert.equal(JSON.stringify([await raw.messageEntry.findMany(),await raw.notificationDispatch.findMany()]),before);
  await raw.messageEntry.createMany({data:Array.from({length:12},(_,i)=>({...copy,id:'history-recent-'+i}))});
  assert.equal((await (await route.GET(historyRequest())).json()).records.length,10);
  authorised=false;assert.equal((await route.GET(historyRequest())).status,401);
});

test('both inbox routes retain reply identity and recent-history diagnostics after preparation',()=>{
  for(const name of ['messaging','messages']){
    const source=fs.readFileSync(path.join(root,`src/app/(admin)/admin/${name}/page.tsx`),'utf8');
    assert.match(source,/smsReplyActorId: replyActor/);assert.match(source,/smsReplyPhone: smsReplyTarget/);
    assert.match(source,/status: message\.dispatch\.status/);
  }
  const source=fs.readFileSync(path.join(root,'src/components/admin/messages/AdminSmsReplyForm.tsx'),'utf8');
  assert.match(source,/:receipt/);assert.match(source,/Find recent SMS replies/);
  assert.match(source,/Reply reference:/);assert.match(source,/Last checked/);
});
