const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { randomUUID } = require('node:crypto');
const ts = require('typescript');
const { PrismaClient } = require('@prisma/client');
const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const url = new URL(process.env.DATABASE_URL || 'https://invalid');
assert.ok(process.env.SIXFL_ISOLATED_REPLACEMENT_TEST === '1' && url.hostname === '127.0.0.1' && url.pathname === '/sixfl_replacement_confirmation_test');
const prisma = new PrismaClient();
const sql = value => execFileSync('psql', [url.toString(), '-X', '-v', 'ON_ERROR_STOP=1', '-Atc', value], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
const now = new Date('2026-09-08T18:02:00Z'), kickoff = new Date('2026-09-08T19:00:00Z');
const policyPath = 'src/lib/fixtures/replacement-confirmation-policy.ts';
function loader(mocks = {}) {
  const cache = new Map();
  function load(file) {
    if (cache.has(file)) return cache.get(file).exports;
    const module = { exports: {} }; cache.set(file, module);
    const output = ts.transpileModule(read(file), { fileName: file, compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText;
    const req = id => {
      if (Object.hasOwn(mocks, id)) return mocks[id];
      if (id.startsWith('@/') || id.startsWith('.')) {
        const base = id.startsWith('@/') ? 'src/' + id.slice(2) : path.join(path.dirname(file), id);
        const found = [base, base + '.ts', base + '.tsx'].find(p => fs.existsSync(path.join(root, p)) && fs.statSync(path.join(root, p)).isFile());
        if (found) return load(found);
      }
      return require(id);
    };
    new Function('require', 'module', 'exports', output)(req, module, module.exports);
    return module.exports;
  }
  return load;
}
const policy = loader({'@/lib/prisma': {prisma}})(policyPath);
let recipient, queued;
async function seed({allocated = true, alert = true, snapshot = true} = {}) {
  await prisma.league.create({data:{id:'league',name:'Test league',slug:'isolated-league'}});
  for (const id of ['drop','opp','replacement','other']) await prisma.team.create({data:{id,name:id,claimCode:id,leagueId:'league'}});
  await prisma.fixture.create({data:{id:'fixture',leagueId:'league',homeTeamId:allocated?'replacement':'drop',awayTeamId:'opp',kickoffAt:kickoff,publishedAt:now,createdAt:now,updatedAt:now,pitch:'1',matchFeePence:0}});
  recipient = await prisma.notificationRecipient.create({data:{id:'recipient',sourceType:'GENERAL',sourceId:'test',audience:'TEAM',displayName:'Test captain',email:'captain@example.invalid',phone:'+447700900123'}});
  if (alert) await dispatch('alert', {sourceType:'TEAM', sourceId:'other', status:'SENT', sentAt:now, metadata:{origin:'night-board-last-minute-replacement',fixtureId:'fixture',droppedTeamId:'drop',opponentTeamId:'opp',kickoffAt:kickoff.toISOString(),...(snapshot?{replacementContext:{leagueId:'league',venueId:null,pitch:'1'}}:{})}});
}
async function dispatch(id, data = {}) {
  return prisma.notificationDispatch.create({data:{id,recipientId:'recipient',channel:'EMAIL',audience:'TEAM',subject:'Test request',bodyText:'Test body',sourceType:'FIXTURE_CONFIRMATION_INITIAL_EMAIL',sourceId:'fixture:replacement',metadata:{fixtureId:'fixture',teamId:'replacement'},createdAt:now,...data}});
}
const block = teamId => policy.getAllocatedReplacementConfirmationBlock({fixtureId:'fixture',teamId});
async function resolve(replacement = 'replacement') {
  sql(`INSERT INTO "LastMinuteReplacementResolution" (id,"fixtureId","droppedTeamId","replacementTeamId","opponentTeamId","resolvedAt") VALUES ('resolution','fixture','drop','${replacement}','opp','2026-09-08 18:02:01')`);
}
function queueLoader() {
  return loader({
    '@/lib/prisma': {prisma}, '@/lib/teams/fixture-placeholders':{getFixturePlaceholderTeamIds:async()=>new Set()},
    '@/lib/notifications/team-contacts':{upsertTeamNotificationRecipient:async()=>({recipient,snapshot:{primaryContact:{name:'Test captain'},teamName:'Test'}})},
    '@/lib/notifications/service':{queueDirectNotification:async input=>{queued.push(input);return {id:randomUUID(),status:'QUEUED'};}},
  });
}
function processor(ids, beforeProvider = async()=>{}) {
  const delivered = [];
  const service = {
    getDueNotificationDispatches:async()=>prisma.notificationDispatch.findMany({where:{id:{in:ids}},include:{recipient:true}}),
    markNotificationDispatchProcessing:async id=>(await prisma.notificationDispatch.updateMany({where:{id,status:'QUEUED'},data:{status:'PROCESSING'}})).count===1,
    markNotificationDispatchCancelled:async(id,reason)=>prisma.notificationDispatch.update({where:{id},data:{status:'CANCELLED',failureReason:reason}}),
    markNotificationDispatchSent:async({dispatchId})=>prisma.notificationDispatch.update({where:{id:dispatchId},data:{status:'SENT',sentAt:now,providerMessageId:'isolated-provider'}}),
    markNotificationDispatchFailed:async({dispatchId,errorMessage})=>{throw new Error(`${dispatchId}: ${errorMessage}`);},
  };
  const db = new Proxy(prisma,{get(target,key){
    if(key==='messageEntry')return {findFirst:async()=>null,create:async()=>({id:'entry',createdAt:now,sentAt:now})};
    if(key==='messageThread')return {update:async()=>({})};
    return Reflect.get(target,key);
  }});
  const load = loader({
    '@/lib/prisma':{prisma:db},'./service':service,
    '@/lib/fixtures/replacement-confirmation-policy':policy,
    '@/lib/fixtures/publishing':{getUnpublishedFixtureBlockReason:async()=>null},
    '@/lib/captain/first-match-ready':{getFirstMatchReadyDeliveryBlock:async()=>null},
    '@/lib/squad/activation-emails':{getSquadActivationEmailDeliveryBlock:async()=>null},
    '@/lib/referees/evening-notifications':{refereeEveningDeliveryBlock:async()=>null},
    '@/lib/managed-squad/registration-reminders':{applyRegistrationDeliveryGate:async()=>null},
    '@/lib/payments/player-payment-warning':{applyPlayerPaymentWarningDeliveryGate:async()=>null},
    '@/lib/payments/player-ledger':{playerLedgerNotificationBlock:async()=>null},
    '@/lib/payments/player-repayment-reminders':{playerRepaymentReminderDeliveryBlock:async()=>null},
    '@/lib/player-pool/profile-sms-reminders':{getPlayerPoolProfileSmsDeliveryBlock:async()=>{await beforeProvider();return null;}},
    '@/lib/fixtures/replacement-sms-lifecycle':{getReplacementSmsCancellationReason:async()=>null,cancelOwnedReplacementSms:async()=>{}},
    '@/lib/messaging/service':{findOrCreateEmailThreadForOutbound:async()=>{await beforeProvider();return{id:'thread',replyAddress:'reply@example.invalid'};},linkDispatchToThread:async()=>{}},
    './providers/resend':{sendEmailWithResend:async input=>{delivered.push(input);return{provider:'test',providerMessageId:'isolated-provider',fromEmail:'test@example.invalid'};}},
    './providers/twilio':{sendSmsWithTwilio:async input=>{delivered.push(input);return{provider:'test',providerMessageId:'isolated-provider',fromNumber:'+447700900000'};}},
  });
  return {run:()=>load('src/lib/notifications/processor.ts').processNotificationQueue(),delivered};
}
test.before(()=>{
  globalThis.fetch=async()=>{throw new Error('External sends prohibited in replacement tests');};
  sql(read('prisma/migrations/20260818170000_last_minute_replacement_resolution/migration.sql'));
});
test.beforeEach(async()=>{
  test.mock.timers.enable({apis:['Date'],now});queued=[];
  sql('TRUNCATE "NotificationDispatch", "NotificationRecipient", "FixtureCaptainConfirmation", "Fixture", "Team", "League", "Venue", "LastMinuteReplacementResolution" CASCADE');
});
test.afterEach(()=>test.mock.timers.reset());
test.after(()=>prisma.$disconnect());

test('allocated replacement is recognised before reconciliation without changing captain responses or fees',async()=>{
  await seed();const before=await prisma.fixture.findUnique({where:{id:'fixture'}});
  assert.equal(await block('replacement'),policy.REPLACEMENT_CONFIRMATION_REASON);
  assert.equal(await block('opp'),null);assert.equal(await block('other'),null);assert.equal(await block('drop'),null);
  assert.equal(await prisma.fixtureCaptainConfirmation.count(),0);
  assert.deepEqual(await prisma.fixture.findUnique({where:{id:'fixture'}}),before);
});
test('offering a slot is not allocation; zero-priced ordinary fixtures are not suppressed',async()=>{
  await seed({allocated:false});assert.equal(await block('drop'),null);assert.equal(await block('replacement'),null);
  await prisma.notificationDispatch.deleteMany();await prisma.fixture.update({where:{id:'fixture'},data:{homeTeamId:'replacement',updatedAt:now}});
  assert.equal(await block('replacement'),null);
});
test('new slot snapshots reject later kick-off, venue, pitch and league changes',async()=>{
  await seed();await resolve();
  await prisma.venue.create({data:{id:'venue',name:'Other venue'}});
  for(const [change,restore] of [[{kickoffAt:new Date(kickoff.getTime()+3600000)},{kickoffAt:kickoff}],[{pitch:'2'},{pitch:'1'}],[{venueId:'venue'},{venueId:null}]]){
    await prisma.fixture.update({where:{id:'fixture'},data:{...change,updatedAt:now}});assert.equal(await block('replacement'),null);
    await prisma.fixture.update({where:{id:'fixture'},data:{...restore,updatedAt:now}});assert.ok(await block('replacement'));
  }
  await prisma.notificationDispatch.update({where:{id:'alert'},data:{metadata:{origin:'night-board-last-minute-replacement',fixtureId:'fixture',droppedTeamId:'drop',opponentTeamId:'opp',kickoffAt:kickoff.toISOString(),replacementContext:{leagueId:'wrong',venueId:null,pitch:'1'}}}});
  assert.equal(await block('replacement'),null);
});
test('older resolutions, changed opponent and legacy edits cannot exempt another allocation',async()=>{
  await seed({snapshot:false});await resolve('other');assert.equal(await block('replacement'),null);
  sql('UPDATE "LastMinuteReplacementResolution" SET "replacementTeamId"=\'replacement\'');assert.ok(await block('replacement'));
  await prisma.fixture.update({where:{id:'fixture'},data:{updatedAt:new Date('2026-09-08T18:03:00Z')}});assert.equal(await block('replacement'),null);
  await prisma.fixture.update({where:{id:'fixture'},data:{awayTeamId:'other'}});assert.equal(await block('replacement'),null);
});
test('initial edit email, email cron, all SMS modes and warning creation suppress only selected replacement',async()=>{
  await seed();await prisma.fixtureCaptainConfirmation.create({data:{fixtureId:'fixture',teamId:'opp',status:'CONFIRMED',confirmedAt:now}});
  const load=queueLoader(), email=load('src/lib/fixtures/confirmation-emails.ts'),sms=load('src/lib/fixtures/confirmation-reminders.ts');
  assert.equal(await email.queueInitialFixtureConfirmationEmailForTeam({fixtureId:'fixture',teamId:'replacement'}),'skipped');
  assert.equal((await email.runFixtureConfirmationEmailJob()).queued,0);
  for(const mode of ['manual','auto72h','auto24h'])assert.equal((await sms.queueFixtureConfirmationSmsReminder({fixtureId:'fixture',teamId:'replacement',mode})).status,'not_available');
  assert.equal((await load('src/lib/fixtures/confirmation-warning-emails.ts').queueFixtureConfirmationWarningEmail({fixtureId:'fixture',teamId:'replacement'})).queued,0);
  assert.equal(queued.length,0);assert.equal(await prisma.fixtureCaptainConfirmation.count(),1);
});
test('ordinary initial fixture requests still queue and do not inherit another fixture exemption',async()=>{
  await seed({alert:false});const email=queueLoader()('src/lib/fixtures/confirmation-emails.ts');
  assert.equal(await email.queueInitialFixtureConfirmationEmailForTeam({fixtureId:'fixture',teamId:'replacement'}),'queued');assert.equal(queued.length,1);
});
test('all seven ordinary confirmation source types are blocked; replacement details and payment messages are not queried',async()=>{
  await seed();
  for(const sourceType of policy.FIXTURE_CONFIRMATION_REQUEST_SOURCES)assert.equal(await policy.getFixtureConfirmationDeliveryBlock({sourceType,sourceId:'fixture:replacement',metadata:{fixtureId:'fixture',teamId:'replacement'}}),policy.REPLACEMENT_CONFIRMATION_REASON);
  for(const sourceType of ['TEAM','FIXTURE_MATCH_FEE','PLAYER_MATCH_FEE_WARNING','MANAGED_SQUAD_AVAILABILITY_REQUEST'])assert.equal(await policy.getFixtureConfirmationDeliveryBlock({sourceType,sourceId:'fixture:replacement',metadata:{}},{$queryRaw:()=>{throw new Error('Unrelated message must not query');}}),null);
});
test('final delivery rejects deleted, started and cancelled fixtures and removed teams',async()=>{
  await seed({alert:false});const d={sourceType:'FIXTURE_CONFIRMATION_INITIAL_EMAIL',sourceId:'fixture:replacement',metadata:{}};
  for(const data of [{status:'CANCELLED'},{status:'SCHEDULED',kickoffAt:now},{kickoffAt:kickoff,publishedAt:null}]){
    await prisma.fixture.update({where:{id:'fixture'},data});assert.match(await policy.getFixtureConfirmationDeliveryBlock(d),/no longer/);
  }
  assert.match(await policy.getFixtureConfirmationDeliveryBlock({...d,sourceId:'absent:replacement'}),/no longer/);
});
test('unsent cleanup includes delayed email/SMS and failed retries but preserves in-flight and accepted history',async()=>{
  await seed();await resolve();
  for(const id of ['email','sms','failed','sent','accepted','processing','attempt','opponent','details'])await dispatch(id,{channel:id==='sms'?'SMS':'EMAIL',status:id==='failed'?'FAILED':id==='sent'?'SENT':id==='processing'?'PROCESSING':'QUEUED',scheduledFor:new Date('2026-09-09T08:00:00Z'),...(id==='sent'?{sentAt:now}:{}),...(id==='accepted'?{providerMessageId:'known'}:{}),...(id==='opponent'?{sourceId:'fixture:opp',metadata:{fixtureId:'fixture',teamId:'opp'}}:{}),...(id==='details'?{sourceType:'TEAM',metadata:{origin:'night-board-last-minute-replacement-resolved',fixtureId:'fixture',teamId:'replacement'}}:{})});
  await prisma.notificationAttempt.create({data:{dispatchId:'attempt',provider:'test',status:'SUCCESS'}});
  assert.equal(await policy.cancelAllocatedReplacementConfirmationRequests('fixture'),3);
  for(const id of ['email','sms','failed'])assert.equal((await prisma.notificationDispatch.findUnique({where:{id}})).status,'CANCELLED');
  for(const id of ['accepted','attempt','opponent','details'])assert.equal((await prisma.notificationDispatch.findUnique({where:{id}})).status,'QUEUED');
  assert.equal((await prisma.notificationDispatch.findUnique({where:{id:'processing'}})).status,'PROCESSING');
  assert.equal((await prisma.notificationDispatch.findUnique({where:{id:'sent'}})).status,'SENT');
  assert.equal(await policy.cancelAllocatedReplacementConfirmationRequests('fixture'),0);
});
for(const channel of ['EMAIL','SMS'])test(`real ${channel} processor catches allocation after claiming, before provider submission`,async()=>{
  await seed({allocated:false});await dispatch('request',{channel,sourceType:channel==='EMAIL'?'FIXTURE_CONFIRMATION_INITIAL_EMAIL':'FIXTURE_CONFIRMATION_CHASE_SMS'});
  const h=processor(['request'],()=>prisma.fixture.update({where:{id:'fixture'},data:{homeTeamId:'replacement',updatedAt:now}}));
  const result=await h.run();assert.equal(result.sent,0);assert.equal(result.skipped,1);assert.equal(h.delivered.length,0);
  assert.equal((await prisma.notificationDispatch.findUnique({where:{id:'request'}})).status,'CANCELLED');
});
for(const channel of ['EMAIL','SMS'])test(`ordinary ${channel} requests still reach stub provider`,async()=>{
  await seed({alert:false});await dispatch('request',{channel,sourceType:channel==='EMAIL'?'FIXTURE_CONFIRMATION_INITIAL_EMAIL':'FIXTURE_CONFIRMATION_CHASE_SMS'});
  const h=processor(['request']);assert.equal((await h.run()).sent,1);assert.equal(h.delivered.length,1);
});
test('both final gates and queue checks remain native after prebuild; resolver still sends replacement details',()=>{
  const processor=read('src/lib/notifications/processor.ts');assert.equal((processor.match(/await getFixtureConfirmationDeliveryBlock\(dispatch\)/g)||[]).length,2);
  for(const name of ['confirmation-emails.ts','confirmation-reminders.ts','confirmation-warning-emails.ts'])assert.match(read('src/lib/fixtures/'+name),/await getAllocatedReplacementConfirmationBlock/);
  assert.match(read('src/lib/fixtures/last-minute-replacement-resolution.ts'),/await cancelAllocatedReplacementConfirmationRequests\(input.fixtureId\)/);
  assert.match(read('src/lib/fixtures/last-minute-replacement-resolution.ts'),/await sendResolutionMessage/);
});
