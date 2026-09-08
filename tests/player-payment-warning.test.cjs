const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { execFileSync } = require('node:child_process');
const ts = require('typescript');
const { PrismaClient } = require('@prisma/client');
const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const now = new Date('2026-09-08T12:00:00Z');
const database = new URL(process.env.DATABASE_URL || 'https://invalid');
assert.ok(process.env.SIXFL_ISOLATED_WARNING_TEST === '1' && database.hostname === '127.0.0.1' && database.pathname === '/sixfl_warning_test', 'Disposable localhost test database only');
const prisma = new PrismaClient();
const sql = query => execFileSync('psql', [database.toString(), '-X', '-v', 'ON_ERROR_STOP=1', '-Atc', query], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
const migration = 'prisma/migrations/20260908104000_individual_player_payment_warning/migration.sql';
let providerCalls = [], failProvider = false, authorised = true, actorId = 'test-admin', phoneIndex = 0;
function loader() {
  const cache = new Map();
  const mocks = {
    '@/lib/requireAdmin': { requireAdmin: async () => { if (!authorised) throw new Error('Not authorised'); return { user: { id: actorId } }; } },
    'next/cache': { revalidatePath() {} },
    '@/lib/prisma': { prisma },
    '@/lib/fixtures/publishing': { getUnpublishedFixtureBlockReason: async () => null },
    '@/lib/fixtures/replacement-sms-lifecycle': { cancelClosedReplacementSms: async () => 0, getReplacementSmsCancellationReason: async () => null, cancelOwnedReplacementSms: async () => 0 },
    '@/lib/referees/evening-notifications': { refereeEveningDeliveryBlock: async () => null },
    '@/lib/player-pool/profile-sms-reminders': { getPlayerPoolProfileSmsDeliveryBlock: async () => null },
    './providers/resend': { sendEmailWithResend: async (input) => {
      providerCalls.push({ channel: 'EMAIL', input }); if (failProvider) throw new Error('Simulated provider failure');
      return { provider: 'resend', providerMessageId: randomUUID(), fromEmail: 'test@example.invalid', responsePayload: {} };
    } },
    './providers/twilio': { sendSmsWithTwilio: async (input) => {
      providerCalls.push({ channel: 'SMS', input }); if (failProvider) throw new Error('Simulated provider failure');
      return { provider: 'twilio', providerMessageId: randomUUID(), fromNumber: '+447700900000', responsePayload: {} };
    } },
  };
  function load(file) {
    if (cache.has(file)) return cache.get(file).exports;
    const module = { exports: {} }; cache.set(file, module);
    const js = ts.transpileModule(read(file), { fileName: file, compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText;
    const req = (id) => {
      if (Object.hasOwn(mocks, id)) return mocks[id];
      if (id.startsWith('@/') || id.startsWith('.')) {
        const base = id.startsWith('@/') ? 'src/' + id.slice(2) : path.join(path.dirname(file), id);
        const target = [base, base + '.ts', base + '.tsx', base + '/index.ts'].find((p) => fs.existsSync(path.join(root, p)) && fs.statSync(path.join(root, p)).isFile());
        if (target) return load(target);
      }
      return require(id);
    };
    new Function('require', 'module', 'exports', js)(req, module, module.exports);
    return module.exports;
  }
  return load;
}
const load = loader();
const policy = load('src/lib/payments/player-payment-warning-policy.ts');
const warning = load('src/lib/payments/player-payment-warning.ts');
const processor = load('src/lib/notifications/processor.ts');
const actions = load('src/app/(admin)/admin/payments/player-warning/actions.ts');
const cancellation = load('src/lib/payments/cancel-player-match-fee-notifications.ts');
const SRC = policy.PLAYER_PAYMENT_WARNING_SOURCE;
const get = id => prisma.notificationDispatch.findUniqueOrThrow({ where: { id }, include: { recipient: true } });
const preview = (t, channel = 'EMAIL', deadlineLocal = '2026-09-10T18:00') => warning.previewPlayerPaymentWarning({ feeId: t.fee.id, channel, deadlineLocal, actorId }, now);
const send = p => warning.sendPlayerPaymentWarning({ previewToken: p.previewToken, actorId }, now);
async function target({ member = false, teamMode = 'MANAGED' } = {}) {
  const id = randomUUID();
  const league = await prisma.league.create({ data: { name: 'Test league', slug: id } });
  const team = await prisma.team.create({ data: { name: 'Test Squad', claimCode: id, teamMode, leagueId: league.id } });
  const other = await prisma.team.create({ data: { name: 'Other Squad', claimCode: randomUUID(), leagueId: league.id } });
  const fixture = await prisma.fixture.create({ data: { leagueId: league.id, homeTeamId: team.id, awayTeamId: other.id, kickoffAt: new Date('2026-09-07T18:00:00Z'), publishedAt: new Date('2026-09-01T12:00:00Z') } });
  const contact = { firstName: 'Test', lastName: 'Player', email: `${id}@example.invalid`, phone: `07700900${String(++phoneIndex).padStart(3,'0')}` };
  let teamMember = null, prospect = null;
  if (member) {
    const user = await prisma.user.create({ data: { name: 'Test Player', email: contact.email } });
    teamMember = await prisma.teamMember.create({ data: { teamId: team.id, userId: user.id, role: 'PLAYER' } });
    sql(`INSERT INTO "TeamMemberProfile" (id,"teamMemberId",phone) VALUES ('${randomUUID()}','${teamMember.id}','${contact.phone}')`);
  } else prospect = await prisma.teamPlayerProspect.create({ data: { ...contact, teamId: team.id } });
  const paymentToken = randomUUID();
  const fee = await prisma.playerMatchFee.create({ data: { teamId: team.id, fixtureId: fixture.id, teamMemberId: teamMember?.id, prospectId: prospect?.id,
    amountPence: 500, paymentToken, paymentUrl: `http://localhost:3000/pay/player-match-fee/${paymentToken}` } });
  return { fee, fixture, team, prospect, teamMember, contact };
}
test.before(() => {
  globalThis.fetch = async () => { throw new Error('External requests are forbidden in payment warning tests'); };
  sql('CREATE TABLE IF NOT EXISTS "TeamMemberProfile" (id text PRIMARY KEY, "teamMemberId" text, phone text)');
  sql(read(migration));
});
test.beforeEach(async () => {
  test.mock.timers.enable({ apis: ['Date'], now });
  sql('TRUNCATE "NotificationDispatch", "NotificationRecipient", "MessageThread", "PlayerMatchFee", "TeamPlayerProspect", "TeamMember", "TeamMemberProfile", "Team", "League", "User" CASCADE');
  await prisma.user.create({ data: { id: actorId, name: 'Test Admin', email: 'admin@example.invalid', role: 'ADMIN' } });
  providerCalls = []; failProvider = false; authorised = true;
});
test.afterEach(() => test.mock.timers.reset());
test.after(async () => prisma.$disconnect());

test('strict UK deadlines reject invalid, past, non-existent and ambiguous times; tickets bind admin and expire', () => {
  assert.equal(policy.parseWarningDeadline('2026-09-10T18:00', now).toISOString(), '2026-09-10T17:00:00.000Z');
  for (const value of ['', '2026-09-31T18:00', '2026-09-08T12:59', '2026-11-01T18:00']) assert.throws(() => policy.parseWarningDeadline(value, now));
  assert.throws(() => policy.parseWarningDeadline('2026-03-29T01:30', new Date('2026-03-28T12:00:00Z')), /does not exist/);
  assert.throws(() => policy.parseWarningDeadline('2026-10-25T01:30', new Date('2026-10-24T12:00:00Z')), /twice/);
  assert.equal(policy.parseWarningDeadline('2026-10-25T02:30', new Date('2026-10-24T12:00:00Z')).toISOString(), '2026-10-25T02:30:00.000Z');
  const ticket = policy.createWarningTicket({ actorId, feeId: 'fee', channel: 'EMAIL', deadline: '2026-09-10T17:00:00Z', fingerprint: 'hash' }, now);
  assert.equal(policy.readWarningTicket(ticket, actorId, now).feeId, 'fee');
  assert.throws(() => policy.readWarningTicket(ticket, 'other-admin', now), /session/);
  assert.throws(() => policy.readWarningTicket(ticket+'x', actorId, now), /Invalid/);
  assert.throws(() => policy.readWarningTicket(ticket, actorId, new Date(now.getTime()+900000)), /expired/);
  assert.throws(() => policy.warningChannel('BOTH'), /Choose/);
});
test('preview is read-only, uses the saved individual fee/link and the actual shared email renderer', async () => {
  const t=await target(), other=await target(); const before=await prisma.playerMatchFee.findMany();
  const p=await preview(t); assert.equal(p.recipient,t.contact.email); assert.equal(p.paymentUrl,t.fee.paymentUrl);
  assert.match(p.bodyText,/£5.00/); assert.match(p.bodyText,/10 Sept 2026/); assert.match(p.bodyHtml,/Pay this match fee/);
  assert.ok(!p.bodyText.includes(other.contact.email));
  assert.equal(await prisma.notificationDispatch.count(),0); assert.equal(await prisma.notificationRecipient.count(),0);
  assert.deepEqual(await prisma.playerMatchFee.findMany(),before); assert.equal(providerCalls.length,0);
});
test('unauthorised preview and confirmation actions cannot queue anything', async () => {
  const t=await target(), p=await preview(t); authorised=false;
  await assert.rejects(()=>actions.previewPlayerWarningAction({feeId:t.fee.id,channel:'EMAIL',deadlineLocal:'2026-09-10T18:00'}),/Not authorised/);
  await assert.rejects(()=>actions.sendPlayerWarningAction(p.previewToken),/Not authorised/);
  assert.equal(await prisma.notificationDispatch.count(),0);
});
test('one confirmed player only; concurrent identical confirmations create one outbox entry with an admin audit', async () => {
  const t=await target(), other=await target(), p=await preview(t); const before=await prisma.playerMatchFee.findMany();
  const results=await Promise.all(Array.from({length:4},()=>send(p)));
  assert.equal(new Set(results.map(r=>r.dispatchId)).size,1); assert.equal(results.filter(r=>!r.duplicate).length,1);
  const d=await get(results[0].dispatchId); assert.equal(d.sourceId,t.fee.id); assert.equal(d.createdByUserId,actorId); assert.equal(d.recipient.email,t.contact.email);
  assert.equal(d.recipient.marketingEmailOptIn,false); assert.equal(d.recipient.marketingSmsOptIn,false);
  assert.equal(await prisma.notificationDispatch.count({where:{sourceId:other.fee.id}}),0); assert.deepEqual(await prisma.playerMatchFee.findMany(),before);
});
test('separate previews cannot bypass pending/24-hour warning cooldown; old ordinary chases do not exhaust warnings', async () => {
  const t=await target(), a=await preview(t), b=await preview(t); const one=await send(a);
  await assert.rejects(()=>send(b),/already queued/);
  await prisma.notificationDispatch.update({where:{id:one.dispatchId},data:{status:'SENT',sentAt:now}});
  await assert.rejects(()=>send(b),/24 hours/);
  const t2=await target(), r=await prisma.notificationRecipient.create({data:{sourceType:'GENERAL',sourceId:`player-match-fee:${t2.fee.id}`,audience:'PLAYER',email:t2.contact.email,preferences:{create:{}}}});
  for (const sourceType of ['PLAYER_MATCH_FEE_REQUEST','PLAYER_MATCH_FEE_CHASE_24H','PLAYER_MATCH_FEE_CHASE_72H']) await prisma.notificationDispatch.create({data:{recipientId:r.id,channel:'EMAIL',audience:'PLAYER',sourceId:t2.fee.id,sourceType,status:'SENT',sentAt:now,bodyText:'Old request'}});
  assert.equal((await send(await preview(t2))).status,'QUEUED');
});
test('saved membership contact is used and selected-channel opt-outs on other recipient records are respected', async () => {
  const t=await target({member:true}); const p=await preview(t,'SMS'); assert.equal(p.recipient,'+44'+t.contact.phone.slice(1));
  const r=await prisma.notificationRecipient.create({data:{sourceType:'USER',sourceId:randomUUID(),audience:'PLAYER',emailNormalized:t.contact.email,transactionalSmsOptIn:false}});
  await assert.rejects(()=>preview(t,'SMS'),/opted out/); assert.ok(await preview(t,'EMAIL'));
  await prisma.notificationRecipient.update({where:{id:r.id},data:{isSuppressed:true}});
  await assert.rejects(()=>preview(t,'EMAIL'),/suppressed/); assert.equal((await prisma.notificationRecipient.findUnique({where:{id:r.id}})).transactionalSmsOptIn,false);
});
test('nonpayable fees, missing links and uncertain identities are blocked without repairing or creating links', async () => {
  for (const data of [{status:'PAID'},{status:'WAIVED'},{status:'CANCELLED'},{amountPence:0},{paidAt:now},{paymentToken:null},{paymentUrl:null},{paymentUrl:'https://evil.invalid/pay'}, {prospectId:null}, {note:'Paid captain directly: captain collected £5'}]) {
    const t=await target(); await prisma.playerMatchFee.update({where:{id:t.fee.id},data});
    await assert.rejects(()=>preview(t),policy.PaymentWarningError);
  }
  assert.equal(await prisma.notificationDispatch.count(),0);
});
test('changed fee, recipient, template, or stale deadline invalidates the preview before any queue write', async () => {
  for (const change of ['amount','email','phone','token','template']) {
    const t=await target(), p=await preview(t);
    const key=policy.WARNING_TEMPLATE_KEYS.EMAIL; const template=await prisma.notificationTemplate.findUniqueOrThrow({where:{key}});
    if(change==='amount') await prisma.playerMatchFee.update({where:{id:t.fee.id},data:{amountPence:600}});
    if(change==='email'||change==='phone') await prisma.teamPlayerProspect.update({where:{id:t.prospect.id},data:change==='email'?{email:'new@example.invalid'}:{phone:'07700900999'}});
    if(change==='token') await prisma.playerMatchFee.update({where:{id:t.fee.id},data:{paymentToken:'changed',paymentUrl:'http://localhost:3000/pay/player-match-fee/changed'}});
    if(change==='template') await prisma.notificationTemplate.update({where:{key},data:{body:template.body+'\nUpdated wording.'}});
    try { await assert.rejects(()=>send(p),/changed/); } finally { await prisma.notificationTemplate.update({where:{key},data:{body:template.body}}); }
  }
  assert.equal(await prisma.notificationDispatch.count(),0);
});
test('both real provider gates cancel stale warnings after payment, opt-out, changes and edited queue content', async () => {
  for(const channel of ['EMAIL','SMS']) for(const change of ['paid','waived','cancelled','email','phone','optout','body','deadline','fixture']) {
    const t=await target(), p=await preview(t,channel), q=await send(p), d=await get(q.dispatchId);
    if(['paid','waived','cancelled'].includes(change)) await prisma.playerMatchFee.update({where:{id:t.fee.id},data:{status:change.toUpperCase()}});
    if(change==='email'||change==='phone') await prisma.teamPlayerProspect.update({where:{id:t.prospect.id},data:change==='email'?{email:'changed@example.invalid'}:{phone:'07700900888'}});
    if(change==='optout') await prisma.notificationRecipient.update({where:{id:d.recipientId},data:{isSuppressed:true}});
    if(change==='body') await prisma.notificationDispatch.update({where:{id:d.id},data:{bodyText:'Changed unapproved content'}});
    if(change==='deadline') await prisma.notificationDispatch.update({where:{id:d.id},data:{metadata:{...d.metadata,warningDeadline:'2026-09-07T12:00:00Z'}}});
    if(change==='fixture') await prisma.fixture.update({where:{id:t.fixture.id},data:{status:'CANCELLED'}});
    await processor.processNotificationQueue(100); assert.equal(providerCalls.length,0,channel+': '+change); assert.equal((await get(d.id)).status,'CANCELLED');
  }
});
test('real queue processor delivers each selected channel once, with the exact approved content and link', async () => {
  for(const channel of ['EMAIL','SMS']) {
    const t=await target(), p=await preview(t,channel), q=await send(p), before=await get(q.dispatchId);
    await processor.processNotificationQueue(100); await processor.processNotificationQueue(100);
    const call=providerCalls.find(c=>c.channel===channel); assert.ok(call); assert.equal(call.input.to,p.recipient);
    const d=await get(q.dispatchId); assert.equal(d.status,'SENT'); assert.ok(d.sentAt); assert.ok(d.providerMessageId);
    if(channel==='EMAIL') { assert.equal(call.input.text,p.bodyText); assert.equal(call.input.html,p.bodyHtml); }
    else { assert.equal(call.input.body,before.bodyText); assert.ok(d.metadata.smsShortLinks.some(link=>link.url===p.paymentUrl)); }
  }
  assert.equal(providerCalls.length,2);
});
test('SMS quiet hours are shown at preview, expire unusable deadlines, and are rechecked on delayed processing', async () => {
  const t=await target(); const night=new Date('2026-09-08T20:00:00Z');
  await assert.rejects(()=>warning.previewPlayerPaymentWarning({feeId:t.fee.id,channel:'SMS',deadlineLocal:'2026-09-09T09:30',actorId},night),/one hour after/);
  const p=await warning.previewPlayerPaymentWarning({feeId:t.fee.id,channel:'SMS',deadlineLocal:'2026-09-10T18:00',actorId},night);
  assert.match(p.scheduledFor,/9 Sept 2026/);
  const q=await send(await preview(t,'SMS')); test.mock.timers.setTime(night.getTime());
  await processor.processNotificationQueue(100); assert.equal(providerCalls.length,0);
  const d=await get(q.dispatchId); assert.equal(d.status,'QUEUED'); assert.equal(d.scheduledFor.toISOString(),'2026-09-09T08:00:00.000Z');
});
test('provider failure remains visible, same confirmation does not resend, and warnings join ordinary cancellation cleanup', async () => {
  const t=await target(), p=await preview(t), q=await send(p); failProvider=true;
  await processor.processNotificationQueue(100); assert.equal((await get(q.dispatchId)).status,'FAILED'); assert.equal((await send(p)).duplicate,true);
  const t2=await target(), q2=await send(await preview(t2)); const t3=await target(), q3=await send(await preview(t3));
  await cancellation.cancelQueuedPlayerMatchFeeNotificationDispatches([t2.fee.id]);
  assert.equal((await get(q2.dispatchId)).status,'CANCELLED'); assert.equal((await get(q3.dispatchId)).status,'QUEUED');
});
test('migration is idempotent and preserves edited/disabled templates, while unresolved variables cannot be sent', async () => {
  const key=policy.WARNING_TEMPLATE_KEYS.EMAIL, template=await prisma.notificationTemplate.findUniqueOrThrow({where:{key}});
  try {
    await prisma.notificationTemplate.update({where:{key},data:{isActive:false,body:template.body+' {{notConfigured}}'}}); sql(read(migration));
    assert.equal((await prisma.notificationTemplate.findUnique({where:{key}})).isActive,false);
    const t=await target(); await assert.rejects(()=>preview(t),/disabled/);
    await prisma.notificationTemplate.update({where:{key},data:{isActive:true}}); await assert.rejects(()=>preview(t),/unresolved/);
  } finally { await prisma.notificationTemplate.update({where:{key},data:{body:template.body,isActive:true}}); }
});
test('native per-fee link, admin actions and both provider guards survive full production preparation', () => {
  const page=read('src/app/(admin)/admin/payments/page.tsx'); assert.match(page,/player-warning\?feeId=\$\{encodeURIComponent\(fee.id\)\}/); assert.match(page,/Chase player/);
  const code=read('src/lib/notifications/processor.ts'); assert.equal((code.match(/await applyPlayerPaymentWarningDeliveryGate\(dispatch\)/g)||[]).length,2);
  assert.ok(code.indexOf('await applyPlayerPaymentWarningDeliveryGate(dispatch)')<code.indexOf('await sendEmailWithResend'));
  assert.ok(code.lastIndexOf('await applyPlayerPaymentWarningDeliveryGate(dispatch)')<code.indexOf('await sendSmsWithTwilio'));
  assert.match(read('src/app/(admin)/admin/payments/player-warning/page.tsx'),/await requireAdmin\(\)/);
  assert.match(read('src/lib/payments/player-payment-warning.ts'),/queueNotificationFromTemplate/);
  assert.doesNotMatch(read('src/lib/payments/player-payment-warning.ts'),/queueDirectNotification|playerMatchFee\.update|checkout.sessions.create/);
});

test('warning status reads existing outbox records for the exact fee, including queued, sent and later failure', async () => {
  const history = load('src/lib/payments/player-payment-warning-history.ts');
  const first = await target(), second = await target();
  const originalFees = await prisma.playerMatchFee.findMany({ orderBy: { id: 'asc' } });
  const queued = await send(await preview(first));
  let latest = await history.getLatestPlayerPaymentWarnings([first.fee.id, second.fee.id]);
  assert.equal(latest.get(first.fee.id).label, 'Warning queued');
  assert.equal(latest.has(second.fee.id), false);
  assert.equal(providerCalls.length, 0);
  const initialDispatchCount = await prisma.notificationDispatch.count();
  await history.getPlayerPaymentWarningHistory(first.fee.id);
  assert.equal(await prisma.notificationDispatch.count(), initialDispatchCount);
  await processor.processNotificationQueue(100);
  latest = await history.getLatestPlayerPaymentWarnings([first.fee.id]);
  assert.equal(latest.get(first.fee.id).label, 'Warning sent');
  assert.match(latest.get(first.fee.id).deadline, /10 Sept 2026/);
  await prisma.notificationDispatch.update({ where: { id: queued.dispatchId }, data: { status: 'FAILED', failedAt: now, failureReason: 'Simulated later delivery failure' } });
  const records = await history.getPlayerPaymentWarningHistory(first.fee.id);
  assert.equal(records[0].label, 'Warning failed');
  assert.equal(records[0].failureReason, 'Simulated later delivery failure');
  assert.deepEqual(await prisma.playerMatchFee.findMany({ orderBy: { id: 'asc' } }), originalFees);
  assert.equal(providerCalls.length, 1);
});
