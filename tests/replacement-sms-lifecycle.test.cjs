const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const ts = require('typescript');
const { PrismaClient } = require('@prisma/client');
const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const policyPath = 'src/lib/fixtures/replacement-sms-lifecycle.ts';
const migrationPath = 'prisma/migrations/20260906225000_cancel_resolved_replacement_sms/migration.sql';
globalThis.fetch = async () => { throw new Error('No external requests allowed in replacement SMS tests'); };
let prisma, sql, policy;
const quote = value => "'" + String(value).replaceAll("'", "''") + "'";
function loader(mocks) {
  const cache = new Map();
  function load(file) {
    if (cache.has(file)) return cache.get(file).exports;
    const module = {exports:{}};cache.set(file,module);
    const output = ts.transpileModule(read(file), {fileName:file,compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText;
    const req = id => {
      if (Object.hasOwn(mocks,id)) return mocks[id];
      if (id.startsWith('@/') || id.startsWith('.')) {
        const base = id.startsWith('@/') ? 'src/'+id.slice(2) : path.join(path.dirname(file),id);
        const resolved=[base,base+'.ts',base+'.tsx'].find(p=>fs.existsSync(path.join(root,p))&&fs.statSync(path.join(root,p)).isFile());
        if (resolved) return load(resolved);
      }
      return require(id);
    };
    new Function('require','module','exports',output)(req,module,module.exports);
    return module.exports;
  }
  return load;
}
const initial = (fixtureId='open',droppedTeamId='drop') => ({origin:'night-board-last-minute-replacement',fixtureId,droppedTeamId,opponentTeamId:'opp'});
const resolved = role => ({...initial('closed'),origin:'night-board-last-minute-replacement-resolved',role});
function seed(id, metadata, {channel='SMS',status='QUEUED',provider=false,success=false,entrySent=false}={}) {
  sql(`INSERT INTO "NotificationDispatch" (id,channel,status,metadata,"bodyText","providerMessageId","sentAt") VALUES (${quote(id)},${quote(channel)},${quote(status)},${quote(JSON.stringify(metadata))}::jsonb,'Original content',${provider?"'provider-id'":'NULL'},${status==='SENT'?'NOW()':'NULL'});
    INSERT INTO "MessageEntry" (id,"notificationDispatchId",channel,"providerStatus","sentAt") VALUES (${quote('entry-'+id)},${quote(id)},${quote(channel)},${quote(status)},${entrySent||status==='SENT'?'NOW()':'NULL'});`);
  if(success)sql(`INSERT INTO "NotificationAttempt" VALUES (${quote('attempt-'+id)},${quote(id)},'SUCCESS')`);
}
function status(id) { return sql(`SELECT status FROM "NotificationDispatch" WHERE id=${quote(id)}`); }
function state() { return JSON.parse(sql('SELECT COALESCE(json_agg(d ORDER BY id),\'[]\') FROM "NotificationDispatch" d')); }
function seedMatrix() {
  seed('offer',initial('closed')); seed('closed-taken',resolved('not_selected'));
  seed('closed-selected',resolved('replacement'));seed('closed-opponent',resolved('opponent'));
  seed('retry',initial('closed'),{status:'FAILED'});seed('open',initial());
  seed('other-drop',initial('another','new-drop'));
  seed('email',initial('closed'),{channel:'EMAIL'});
  seed('payment',{...initial('closed'),origin:'ordinary-payment'});
  seed('sent',initial('closed'),{status:'SENT'});
  seed('processing',initial('closed'),{status:'PROCESSING'});
  seed('accepted',initial('closed'),{provider:true});
  seed('success-attempt',initial('closed'),{success:true});
  seed('sent-entry',initial('closed'),{entrySent:true});
}
const cancelledIds=['offer','closed-taken','closed-selected','closed-opponent','retry'].sort();
test.before(()=>{
  const url=process.env.REPLACEMENT_SMS_TEST_DATABASE_URL;assert.ok(url);
  const parsed=new URL(url);assert.ok(['localhost','127.0.0.1'].includes(parsed.hostname));assert.equal(parsed.pathname,'/sixfl_replacement_sms_test');
  sql=query=>execFileSync('psql',[url,'-X','-v','ON_ERROR_STOP=1','-Atc',query],{encoding:'utf8',stdio:['ignore','pipe','pipe']}).trim();
  sql(`CREATE TABLE "Fixture" (id TEXT PRIMARY KEY,"homeTeamId" TEXT,"awayTeamId" TEXT,status TEXT,"publishedAt" TIMESTAMP,"kickoffAt" TIMESTAMP);
    CREATE TABLE "NotificationDispatch" (id TEXT PRIMARY KEY,channel TEXT,status TEXT,metadata JSONB,"bodyText" TEXT,"scheduledFor" TIMESTAMP DEFAULT NOW()+INTERVAL '12 hours',"sentAt" TIMESTAMP,"providerMessageId" TEXT,"failureReason" TEXT,"cancelledAt" TIMESTAMP,"updatedAt" TIMESTAMP DEFAULT NOW());
    CREATE TABLE "NotificationAttempt" (id TEXT PRIMARY KEY,"dispatchId" TEXT,status TEXT);
    CREATE TABLE "MessageEntry" (id TEXT PRIMARY KEY,"notificationDispatchId" TEXT,channel TEXT,"providerStatus" TEXT,"sentAt" TIMESTAMP,"providerMessageId" TEXT,"twilioMessageSid" TEXT,"updatedAt" TIMESTAMP DEFAULT NOW());`);
  sql(read('prisma/migrations/20260818170000_last_minute_replacement_resolution/migration.sql'));
  prisma=new PrismaClient({datasources:{db:{url}}});policy=loader({'@/lib/prisma':{prisma}})(policyPath);
});
test.beforeEach(()=>{
  sql(`TRUNCATE "Fixture","NotificationDispatch","NotificationAttempt","MessageEntry","LastMinuteReplacementResolution";
    INSERT INTO "Fixture" VALUES ('open','drop','opp','SCHEDULED',NOW(),NOW()+INTERVAL '2 days'),('closed','replacement','opp','SCHEDULED',NOW(),NOW()+INTERVAL '2 days'),('another','new-drop','opp','SCHEDULED',NOW(),NOW()+INTERVAL '2 days');
    INSERT INTO "LastMinuteReplacementResolution" (id,"fixtureId","droppedTeamId","replacementTeamId","opponentTeamId") VALUES ('r','closed','drop','replacement','opp'),('old-cycle','another','previous-drop','new-drop','opp');`);
});
test.after(async()=>{await prisma?.$disconnect();});

test('only exact replacement SMS origins are gated; emails and unrelated SMS do not query',async()=>{
  const noRead={$queryRaw:()=>{throw new Error('Unrelated message queried');}};
  for(const input of [{channel:'EMAIL',metadata:resolved('replacement')},{channel:'SMS',metadata:{origin:'other'}},{channel:'SMS',metadata:null}])assert.equal(await policy.getReplacementSmsCancellationReason(input,noRead),null);
  for(const role of ['not_selected','replacement','opponent'])assert.match(await policy.getReplacementSmsCancellationReason({channel:'SMS',metadata:resolved(role)},noRead),/closed/);
});
test('open request still works; exact resolved cycle or changed allocation blocks before reconciliation',async()=>{
  assert.equal(await policy.getReplacementSmsCancellationReason({channel:'SMS',metadata:initial()}),null);
  assert.equal(await policy.getReplacementSmsCancellationReason({channel:'SMS',metadata:initial('another','new-drop')}),null);
  assert.match(await policy.getReplacementSmsCancellationReason({channel:'SMS',metadata:initial('closed')}),/closed/);
  sql('UPDATE "Fixture" SET "homeTeamId"=\'replacement\' WHERE id=\'open\'');
  assert.match(await policy.getReplacementSmsCancellationReason({channel:'SMS',metadata:initial()}),/closed/);
  assert.match(await policy.getReplacementSmsCancellationReason({channel:'SMS',metadata:{origin:initial().origin}}),/references/);
});
test('cancelled, deleted, unpublished and started fixtures cannot advertise an extra slot',async()=>{
  for(const change of ["status='CANCELLED'",'"publishedAt"=NULL','"kickoffAt"=NOW()-INTERVAL \'1 minute\'']){
    sql(`UPDATE "Fixture" SET ${change} WHERE id='open'`);
    assert.match(await policy.getReplacementSmsCancellationReason({channel:'SMS',metadata:initial()}),/closed/);
    sql(`UPDATE "Fixture" SET status='SCHEDULED',"publishedAt"=NOW(),"kickoffAt"=NOW()+INTERVAL '2 days' WHERE id='open'`);
  }
  sql("DELETE FROM \"Fixture\" WHERE id='open'");assert.match(await policy.getReplacementSmsCancellationReason({channel:'SMS',metadata:initial()}),/closed/);
});
test('production cleanup cancels queued offer and all follow-ups, preserving unrelated/sent/accepted/in-flight records',()=>{
  seedMatrix();const before=state();sql(read(migrationPath));
  assert.deepEqual(state().filter(d=>d.status==='CANCELLED').map(d=>d.id).sort(),cancelledIds);
  for(const old of before)if(!cancelledIds.includes(old.id))assert.deepEqual(state().find(d=>d.id===old.id),old);
  for(const id of cancelledIds)assert.equal(state().find(d=>d.id===id).metadata.replacementSmsCancelledFrom,id==='retry'?'FAILED':'QUEUED');
  for(const id of cancelledIds){assert.match(sql(`SELECT "providerStatus" FROM "MessageEntry" WHERE "notificationDispatchId"=${quote(id)}`),/^CANCELLED:/);assert.equal(sql(`SELECT "bodyText" FROM "NotificationDispatch" WHERE id=${quote(id)}`),'Original content');}
  const once=JSON.stringify(state());sql(read(migrationPath));assert.equal(JSON.stringify(state()),once);
});
test('runtime sweep matches migration exactly and cancels future quiet-hours SMS immediately',async()=>{
  seedMatrix();assert.equal(await policy.cancelClosedReplacementSms('open'),0);
  assert.equal(await policy.cancelClosedReplacementSms('closed'),5);
  assert.deepEqual(state().filter(d=>d.status==='CANCELLED').map(d=>d.id).sort(),cancelledIds);
  assert.equal(await policy.cancelClosedReplacementSms(),0);
});
test('only the owning worker can cancel a claimed message; accepted and unrelated records stay intact',async()=>{
  seed('owned',initial('closed'),{status:'PROCESSING'});seed('accepted',initial('closed'),{status:'PROCESSING',provider:true});seed('other',{origin:'payment'},{status:'PROCESSING'});
  for(const id of ['owned','accepted','other'])await policy.cancelOwnedReplacementSms(id,policy.REPLACEMENT_SMS_CANCEL_REASON);
  assert.equal(status('owned'),'CANCELLED');assert.equal(status('accepted'),'PROCESSING');assert.equal(status('other'),'PROCESSING');
  assert.match(sql("SELECT \"providerStatus\" FROM \"MessageEntry\" WHERE id='entry-owned'"),/^CANCELLED:/);
});

function queueHarness() {
  const created=[];
  const recipient={id:'recipient',email:'team@example.invalid',phone:'+447700900123',isSuppressed:false,transactionalEmailOptIn:true,transactionalSmsOptIn:true,preferences:{emailEnabled:true,smsEnabled:true}};
  const db={$queryRaw:prisma.$queryRaw.bind(prisma),notificationRecipient:{findUnique:async()=>recipient},notificationTemplate:{findUnique:async({where})=>({id:where.key,key:where.key,channel:where.key==='email'?'EMAIL':'SMS',audience:'TEAM',kind:'TRANSACTIONAL',isActive:true,subject:'Fixture update',body:'Test fixture notice'})},notificationDispatch:{create:async({data})=>{const row={id:'new-'+created.length,...data};created.push(row);return row;},findMany:async()=>[]}};
  const load=loader({'@/lib/prisma':{prisma:db},'@/lib/fixtures/publishing':{getUnpublishedFixtureBlockReason:async()=>null},'./recipients':{getNotificationRecipientById:async()=>recipient},'@/lib/resend/client':{getEmailReplyDomain:()=> 'replies.example.invalid'},'./sms-short-links':{shortenSmsBodyLinks:({bodyText})=>({bodyText,links:[]})},'@/lib/email/buildEmail':{appendSIXFLTextSignature:body=>body,buildSIXFLEmailHtml:({body})=>`<p>${body}</p>`}});
  return {service:load('src/lib/notifications/service.ts'),created};
}
test('both real queue entry points create CANCELLED audit rows, never sendable closure SMS',async()=>{
  const h=queueHarness();
  for(const metadata of [initial('closed'),resolved('not_selected'),resolved('replacement'),resolved('opponent')]){
    const template=await h.service.queueNotificationFromTemplate({recipientId:'recipient',templateKey:'sms',metadata});
    const direct=await h.service.queueDirectNotification({recipientId:'recipient',channel:'SMS',audience:'TEAM',body:'Test',metadata});
    assert.equal(template.status,'CANCELLED');assert.equal(direct.status,'CANCELLED');assert.ok(template.cancelledAt);assert.equal(template.sentAt,undefined);
  }
  assert.equal((await h.service.queueNotificationFromTemplate({recipientId:'recipient',templateKey:'email',metadata:resolved('replacement')})).status,'QUEUED');
  assert.equal((await h.service.queueDirectNotification({recipientId:'recipient',channel:'SMS',audience:'TEAM',body:'Test',metadata:initial()})).status,'QUEUED');
});
test('queue-read cleanup removes already queued future notices even when none are due',async()=>{
  seed('future',initial('closed'));await queueHarness().service.getDueNotificationDispatches();assert.equal(status('future'),'CANCELLED');
});
function processorHarness(ids,{beforeGate,atProvider}={}) {
  const delivered=[];
  const row=id=>({id,channel:'SMS',metadata:JSON.parse(sql(`SELECT metadata FROM "NotificationDispatch" WHERE id=${quote(id)}`)),status:'QUEUED',sourceType:'TEAM',sourceId:'team',recipientId:'recipient',recipient:{phone:'+447700900123'},bodyText:'Original content',createdAt:new Date()});
  const service={getDueNotificationDispatches:async()=>ids.map(row),markNotificationDispatchProcessing:async id=>sql(`UPDATE "NotificationDispatch" SET status='PROCESSING' WHERE id=${quote(id)} AND status='QUEUED' RETURNING id`)!=='',markNotificationDispatchSent:async({dispatchId})=>sql(`UPDATE "NotificationDispatch" SET status='SENT',"sentAt"=NOW(),"providerMessageId"='test-provider' WHERE id=${quote(dispatchId)}`),markNotificationDispatchFailed:async({dispatchId,errorMessage})=>{throw new Error(`Unexpected failure ${dispatchId}: ${errorMessage}`);},markNotificationDispatchCancelled:async id=>sql(`UPDATE "NotificationDispatch" SET status='CANCELLED' WHERE id=${quote(id)}`)};
  const load=loader({'@/lib/prisma':{prisma},'./service':service,'@/lib/fixtures/publishing':{getUnpublishedFixtureBlockReason:async()=>null},'@/lib/referees/evening-notifications':{refereeEveningDeliveryBlock:async()=>null},'@/lib/player-pool/profile-sms-reminders':{getPlayerPoolProfileSmsDeliveryBlock:async()=>{await beforeGate?.();return null;}},'@/lib/payments/charge-status':{},'@/lib/messaging/service':{linkDispatchToThread:async()=>{}},'./providers/twilio':{sendSmsWithTwilio:async payload=>{await atProvider?.();delivered.push(payload);return{provider:'test',providerMessageId:'test-provider',fromNumber:'test'};}},'./providers/resend':{sendEmailWithResend:async()=>{throw new Error('Unexpected email');}}});
  return {processor:load('src/lib/notifications/processor.ts'),delivered};
}
test('stale batch and allocation after claim are blocked immediately before provider delivery',async()=>{
  seed('stale',initial());const h=processorHarness(['stale'],{beforeGate:()=>sql("UPDATE \"Fixture\" SET \"homeTeamId\"='replacement' WHERE id='open'")});
  const result=await h.processor.processNotificationQueue();assert.equal(result.sent,0);assert.equal(result.skipped,1);assert.equal(h.delivered.length,0);assert.equal(status('stale'),'CANCELLED');
});
test('valid open replacement and unrelated SMS still send; in-flight acceptance is not rewritten by cleanup',async()=>{
  seed('valid',initial());seed('other',{...initial('closed'),origin:'payment'});
  const h=processorHarness(['valid','other']);assert.equal((await h.processor.processNotificationQueue()).sent,2);assert.equal(h.delivered.length,2);
  seed('flight',initial());const flight=processorHarness(['flight'],{atProvider:async()=>{sql("UPDATE \"Fixture\" SET \"homeTeamId\"='replacement' WHERE id='open'");assert.equal(await policy.cancelClosedReplacementSms(),0);}});
  assert.equal((await flight.processor.processNotificationQueue()).sent,1);assert.equal(status('flight'),'SENT');
});
test('prepared source retains all three gates and unchanged shared admin/cron entry points',()=>{
  const service=read('src/lib/notifications/service.ts'),processor=read('src/lib/notifications/processor.ts'),resolution=read('src/lib/fixtures/last-minute-replacement-resolution.ts');
  assert.equal((service.match(/await getReplacementSmsCancellationReason\(/g)||[]).length,2);
  assert.ok(service.includes('await cancelClosedReplacementSms()'));
  assert.ok(processor.indexOf('await getReplacementSmsCancellationReason(dispatch)')<processor.indexOf('await sendSmsWithTwilio'));
  assert.ok(resolution.includes('await cancelClosedReplacementSms(input.fixtureId)'));
  assert.ok(resolution.includes('dispatch."failureReason" = ${REPLACEMENT_SMS_CANCEL_REASON}'));
  assert.ok(resolution.includes("dispatch.\"metadata\"->>'replacementSmsCancelledFrom' IN ('QUEUED', 'PROCESSING')"),'Failed or queue-time-blocked attempts must not expand email recipients');
  assert.ok(read('src/app/api/admin/night-board/last-minute-replacement/reconcile/route.ts').includes('reconcileLastMinuteReplacement'));
  assert.ok(read('src/app/api/cron/notifications/route.ts').includes('processNotificationQueue(100)'));
});
