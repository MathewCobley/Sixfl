const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { before, beforeEach, after, test } = require('node:test');
const { randomUUID } = require('node:crypto');
const ts = require('typescript');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
const { PrismaClient, Prisma } = require('@prisma/client');

const url = new URL(process.env.DATABASE_URL || 'http://invalid');
assert.ok(['127.0.0.1', 'localhost'].includes(url.hostname) && url.pathname === '/sixfl_abandonment_test', 'Only the disposable sixfl_abandonment_test database is allowed.');
const db = new PrismaClient();
const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const migration = 'prisma/migrations/20260915223000_abandonment_fee_override/migration.sql';
const apply = file => execFileSync('psql', [process.env.DATABASE_URL, '-v', 'ON_ERROR_STOP=1', '-f', path.join(root, file)], { stdio: 'pipe' });
const empty = () => {};
let notices = [], normalNotices = [], cancelCalls = 0, processingFails = false, queueFails = false;
const cache = new Map();
const rendererPath = 'src/lib/notifications/renderer.ts';

function load(file) {
  if (cache.has(file)) return cache.get(file).exports;
  const module = { exports: {} }; cache.set(file, module);
  const mocks = {
    '@/lib/prisma': { prisma: db },
    '@/lib/communications/send-team-broadcast': { sendTeamBroadcastMessage: async args => { normalNotices.push(args); return { dispatchId: randomUUID() }; } },
    '@/lib/communications/log-dispatch': { logNotificationDispatchToThread: async () => {} },
    '@/lib/notifications/team-contacts': { upsertTeamNotificationRecipient: async id => ({ recipient: { id }, snapshot: { primaryContact: { name: 'Test Captain' }, leagueName: 'Test league' } }) },
    '@/lib/notifications/processor': { processNotificationQueue: async () => { if (processingFails) throw new Error('Test processor failure'); } },
    '@/lib/notifications/service': { queueNotificationFromTemplate: async args => {
      if (queueFails) throw new Error('Test queue failure');
      const template = await db.notificationTemplate.findUnique({ where: { key: args.templateKey } });
      if (!template?.isActive) throw new Error('Template disabled');
      const render = load(rendererPath).renderNotificationText;
      notices.push({ ...args, subject: render(template.subject, args.variables), body: render(template.body, args.variables) });
      return { id: randomUUID(), status: 'QUEUED' };
    } },
    '@/lib/payments/fixture-match-fees': {
      buildChargePaymentUrl: token => `https://sixfl.example.invalid/pay/charge/${token}`,
      cancelQueuedMatchFeeNotificationDispatches: async ids => { cancelCalls++; await db.notificationDispatch.updateMany({ where: { sourceId: { in: ids } }, data: { status: 'CANCELLED' } }); },
    },
  };
  const compiled = ts.transpileModule(read(file), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText;
  function req(id) {
    if (Object.hasOwn(mocks, id)) return mocks[id];
    if (id.startsWith('@/') || id.startsWith('.')) {
      const base = id.startsWith('@/') ? path.join('src', id.slice(2)) : path.join(path.dirname(file), id);
      const target = ['.ts', '.tsx', '.js', '/index.ts'].map(ext => base+ext).find(f => fs.existsSync(path.join(root, f)));
      if (target) return load(target);
    }
    return require(id);
  }
  new Function('require', 'module', 'exports', compiled)(req, module, module.exports);
  return module.exports;
}
const service = () => load('src/lib/fixtures/abandonment.ts');
const policy = () => load('src/lib/fixtures/abandonment-fee-policy.ts');
const record = (fixture, extra={}) => service().recordFixtureAbandonment({ fixtureId: fixture.id, reason: 'VIOLENT_OR_THREATENING_CONDUCT', responsibleTeamId: fixture.homeTeamId, recordedByUserId: 'admin', feeDecision: 'UNCHANGED', feeOverrideReason: 'Only two minutes remained.', ...extra });
const tables = ['PaymentCharge','PaymentTransaction','PlayerMatchFee','TeamCreditLedgerEntry','PlayerFeeLedgerState','PlayerLedgerEntry','PlayerRepaymentPlan','PlayerRepaymentRequest','NotificationDispatch'];
async function moneySnapshot() {
  const result = {};
  for (const table of tables) result[table] = await db.$queryRawUnsafe(`SELECT row_to_json(t) AS row FROM "${table}" t ORDER BY id`);
  result.fixtureFees = await db.fixture.findMany({ orderBy: { id: 'asc' }, select: { id:true, matchFeePence:true, homeMatchFeePence:true, awayMatchFeePence:true } });
  return JSON.parse(JSON.stringify(result));
}
async function seed({ homePaid=0, awayPaid=0, playerPaid=false, managed=false, score=false }={}) {
  const id=randomUUID();
  await db.league.create({ data:{ id:`league-${id}`, name:'Test League',slug:id } });
  await db.team.createMany({ data:[{id:`a-${id}`,name:'Team A',claimCode:`a-${id}`,leagueId:`league-${id}`},{id:`b-${id}`,name:'Team B',claimCode:`b-${id}`,leagueId:`league-${id}`,teamMode:managed?'MANAGED':'STANDARD'}] });
  const fixture=await db.fixture.create({data:{id,leagueId:`league-${id}`,homeTeamId:`a-${id}`,awayTeamId:`b-${id}`,kickoffAt:new Date('2026-09-15T18:00:00Z'),publishedAt:new Date('2026-09-10T12:00:00Z'),matchFeePence:4000,homeMatchFeePence:5000,awayMatchFeePence:3500}});
  for(const [teamId,amountPence,paid] of [[fixture.homeTeamId,5000,homePaid],[fixture.awayTeamId,3500,awayPaid]]) {
    const charge=await db.paymentCharge.create({data:{id:`charge-${teamId}`,teamId,fixtureId:id,leagueId:fixture.leagueId,title:'Original fee',amountPence,paymentToken:`token-${teamId}`,status:paid>=amountPence?'PAID':paid?'PART_PAID':'OPEN'}});
    if(paid)await db.paymentTransaction.create({data:{teamId,chargeId:charge.id,amountPence:paid,paidAt:new Date(),method:'BANK_TRANSFER'}});
    await db.playerMatchFee.create({data:{id:`player-${teamId}`,fixtureId:id,teamId,amountPence:700,status:playerPaid?'PAID':'OPEN',paidAt:playerPaid?new Date():null,paymentToken:`player-token-${teamId}`,paymentUrl:`https://sixfl.example.invalid/pay/player-match-fee/player-token-${teamId}`}});
    await db.notificationDispatch.create({data:{recipientId:'recipient',channel:'EMAIL',audience:'TEAM',bodyText:'Original fee reminder',sourceType:'FIXTURE_MATCH_FEE_REMINDER',sourceId:charge.id,status:'QUEUED'}});
  }
  await db.$executeRaw(Prisma.sql`INSERT INTO "TeamCreditLedgerEntry" (id,"teamId","entryType","amountPence") VALUES (${`credit-${id}`},${fixture.awayTeamId},'CREDIT_ADDED',1000)`);
  if(score)await db.matchResult.create({data:{fixtureId:id,homeScore:5,awayScore:4,enteredByUserId:'admin'}});
  return fixture;
}
before(async()=>{
  global.fetch=async()=>{throw new Error('Provider HTTP is forbidden in abandonment tests');};
  apply('prisma/migrations/20260709210000_team_credit_ledger/migration.sql');
  apply('prisma/migrations/20260819232000_fixture_abandonment_workflow/migration.sql');
  apply(migration);
  await db.user.createMany({data:[{id:'admin',role:'ADMIN'},{id:'ref',role:'REFEREE'},{id:'captain',role:'USER'}]});
  await db.notificationRecipient.create({data:{id:'recipient',sourceType:'GENERAL',sourceId:'test',audience:'TEAM',displayName:'Test captain',email:'test@example.invalid'}});
});
beforeEach(()=>{notices=[];normalNotices=[];cancelCalls=0;processingFails=false;queueFails=false;});
after(()=>db.$disconnect());

for(const example of [ {},{homePaid:5000,awayPaid:3500,playerPaid:true},{homePaid:1000,awayPaid:1500},{managed:true,awayPaid:3500} ]) {
  test(`unchanged override preserves every financial record ${JSON.stringify(example)}`,async()=>{
    const fixture=await seed(example), before=await moneySnapshot();
    await record(fixture);
    assert.deepEqual(await moneySnapshot(),before);
    const saved=(await service().getFixtureAbandonments([fixture.id])).get(fixture.id);
    assert.equal(saved.feeDecision,'UNCHANGED');assert.equal(saved.feeOverrideReason,'Only two minutes remained.');
    assert.equal(saved.responsibleTeamId,fixture.homeTeamId);assert.equal(saved.innocentCreditPence,0);
    assert.equal(normalNotices.length,0);assert.equal(cancelCalls,0);assert.equal(notices.length,2);
    for(const notice of notices){assert.match(notice.body,/existing match fees will remain unchanged/);assert.doesNotMatch(notice.body,/your fee has been waived|responsible for both its own/);assert.equal(notice.templateKey,'fixture-abandonment-fees-unchanged-email');}
  });
}
test('default conduct rule still combines unequal fees and credits the paid opponent',async()=>{
  const f=await seed({awayPaid:3500});
  await record(f,{feeDecision:'STANDARD',feeOverrideReason:undefined});
  assert.equal((await db.paymentCharge.findUnique({where:{id:`charge-${f.homeTeamId}`}})).amountPence,8500);
  assert.equal((await db.playerMatchFee.findUnique({where:{id:`player-${f.awayTeamId}`}})).status,'CANCELLED');
  const credit=await db.$queryRaw(Prisma.sql`SELECT "amountPence" FROM "TeamCreditLedgerEntry" WHERE id=${`tcred_abandonment_${f.id}_${f.awayTeamId}`}`);
  assert.equal(credit[0].amountPence,3500);assert.equal(notices.length,0);assert.equal(normalNotices.length,2);assert.equal(cancelCalls,1);
});
test('omitting the new decision retains the default unpaid-opponent waiver',async()=>{
  const f=await seed();await record(f,{feeDecision:undefined});
  assert.equal((await db.paymentCharge.findUnique({where:{id:`charge-${f.awayTeamId}`}})).status,'VOID');
  assert.equal((await service().getFixtureAbandonments([f.id])).get(f.id).feeDecision,'STANDARD');
});
test('non-admin, invalid decision, blank reason and foreign team requests fail before any change',async()=>{
  const f=await seed();
  for(const change of [{recordedByUserId:'ref'},{recordedByUserId:'captain'},{recordedByUserId:'missing'},{feeDecision:'arbitrary'},{feeOverrideReason:'  '},{feeOverrideReason:'x'.repeat(501)},{responsibleTeamId:'not-in-match'}]){
    const before=await moneySnapshot();await assert.rejects(record(f,change));assert.deepEqual(await moneySnapshot(),before);
    assert.equal((await service().getFixtureAbandonments([f.id])).size,0);
  }
});
test('a fee override does not bypass confirmed-no-show validation',async()=>{
  const f=await seed();await assert.rejects(record(f,{reason:'NO_SHOW'}),/confirmed/);
});
test('pending and explicitly awarded results remain independent of fees',async()=>{
  const f=await seed({score:true}),before=await moneySnapshot();
  await record(f,{awardedHomeScore:0,awardedAwayScore:3});
  assert.deepEqual(await moneySnapshot(),before);const result=await db.matchResult.findUnique({where:{fixtureId:f.id}});
  assert.equal(result.homeScore,0);assert.equal(result.awayScore,3);
  assert.equal((await db.fixture.findUnique({where:{id:f.id}})).status,'COMPLETED');
  assert.match(notices[0].body,/0–3/);
});
test('recovery reads the persisted decision and never replays fees or ordinary fee notices',async()=>{
  const f=await seed();await record(f);notices=[];const before=await moneySnapshot();
  const result=await load('src/lib/fixtures/abandonment-email-recovery.ts').resendFixtureAbandonmentEmails({fixtureId:f.id,createdByUserId:'admin'});
  assert.equal(result.queued,2);assert.equal(result.failed,0);assert.equal(normalNotices.length,0);
  assert.equal(notices.every(n=>n.metadata.recoveryResend),true);assert.deepEqual(await moneySnapshot(),before);
});
test('two competing submissions save one decision and emit only one pair of notices',async()=>{
  const f=await seed(),before=await moneySnapshot();const attempts=await Promise.allSettled([record(f),record(f)]);
  assert.equal(attempts.filter(a=>a.status==='fulfilled').length,1);assert.deepEqual(await moneySnapshot(),before);assert.equal(notices.length,2);
});
test('audit failure rolls the fixture/result change back',async()=>{
  const f=await seed({score:true}),before=await moneySnapshot();
  await db.$executeRawUnsafe(`CREATE FUNCTION test_abandonment_failure() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'test audit unavailable'; END; $$`);
  await db.$executeRawUnsafe('CREATE TRIGGER test_abandonment_failure BEFORE INSERT ON "FixtureAbandonment" FOR EACH ROW EXECUTE FUNCTION test_abandonment_failure()');
  try{await assert.rejects(record(f));assert.deepEqual(await moneySnapshot(),before);assert.equal((await db.fixture.findUnique({where:{id:f.id}})).status,'SCHEDULED');assert.equal((await db.matchResult.findUnique({where:{fixtureId:f.id}})).homeScore,5);assert.equal(notices.length,0);}
  finally{await db.$executeRawUnsafe('DROP TRIGGER test_abandonment_failure ON "FixtureAbandonment"');await db.$executeRawUnsafe('DROP FUNCTION test_abandonment_failure()');}
});
test('notification failure cannot undo or double-apply an already saved outcome',async()=>{
  const f=await seed(),before=await moneySnapshot();queueFails=true;
  await record(f);assert.equal((await service().getFixtureAbandonments([f.id])).get(f.id).feeDecision,'UNCHANGED');
  assert.deepEqual(await moneySnapshot(),before);assert.equal(normalNotices.length,0);
  await assert.rejects(record(f),/already marked/);
});
test('later fee sync cannot void or reprice a preserved fee even with a pending result',async()=>{
  const f=await seed(),before=await moneySnapshot();await record(f);
  const sync=load('src/lib/payments/fixture-match-fees.ts').syncFixtureMatchFeeCharges;
  const result=await sync({db,fixtureId:f.id,leagueId:f.leagueId,leagueName:'Test League',kickoffAt:f.kickoffAt,homeTeam:{id:f.homeTeamId,name:'Team A'},awayTeam:{id:f.awayTeamId,name:'Team B'},homeMatchFeePence:1,awayMatchFeePence:2});
  assert.deepEqual(result.activeCharges.map(c=>c.amountPence).sort(),[3500,5000]);assert.deepEqual(await moneySnapshot(),before);
});
test('ordinary cancellations remain blocked while preserved open player fees stay collectible',async()=>{
  const ledger=load('src/lib/payments/player-ledger.ts');
  const fee={status:'OPEN',amountPence:700,note:null,fixture:{publishedAt:new Date(),status:'CANCELLED'}};
  assert.equal(ledger.collectiblePlayerLedgerFee(fee),false);
  const kept={...fee,fixture:{...fee.fixture,feesPreservedAfterAbandonment:true}};
  assert.equal(ledger.collectiblePlayerLedgerFee(kept),true);
  for(const status of ['PAID','CANCELLED','WAIVED'])assert.equal(ledger.collectiblePlayerLedgerFee({...kept,status}),false);
  assert.equal(ledger.collectiblePlayerLedgerFee({...kept,fixture:{...kept.fixture,status:'POSTPONED'}}),false);
});
test('migration preserves saved decisions and administrator template edits when repeated',async()=>{
  const f=await seed();await record(f);const before=await moneySnapshot();
  const key='fixture-abandonment-fees-unchanged-email';const template=await db.notificationTemplate.findUnique({where:{key}});
  await db.notificationTemplate.update({where:{key},data:{subject:'Custom admin subject'}});apply(migration);
  assert.equal((await db.notificationTemplate.findUnique({where:{key}})).subject,'Custom admin subject');assert.deepEqual(await moneySnapshot(),before);
  assert.equal((await service().getFixtureAbandonments([f.id])).get(f.id).feeDecision,'UNCHANGED');
  await db.notificationTemplate.update({where:{key},data:{subject:template.subject}});
});
test('native admin radio exists, is absent for referees and prepared source preserves all original controls',()=>{
  const Fields=load('src/components/referee/AbandonmentFeeDecisionFields.tsx').default;
  const standard=React.createElement('p',null,'Original confirmation');
  const admin=renderToStaticMarkup(React.createElement(Fields,{canOverride:true},standard));
  const ref=renderToStaticMarkup(React.createElement(Fields,{canOverride:false},standard));
  assert.match(admin,/value="STANDARD"/);assert.match(admin,/value="UNCHANGED"/);assert.match(admin,/Leave both teams/);assert.doesNotMatch(ref,/feeDecision|UNCHANGED/);
  const form=read('src/components/referee/AbandonedMatchForm.tsx');
  for(const text of ['AbandonmentFeeDecisionFields','canOverride={canDecideResult}','Send abandonment emails again','SIXFL result decision','Record fixture outcome','officialResult','feeDecision === "UNCHANGED"'])assert.ok(form.includes(text),text);
  const action=read('src/app/(public)/referee/abandonment-actions.ts');
  assert.match(action,/user.role !== UserRole.ADMIN/);assert.match(action,/feeOverrideReason/);assert.match(action,/assertNightAccess/);
});
