const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const cp = require('node:child_process');
const root = path.resolve(__dirname, '..');
const feePath = 'src/lib/payments/fixture-match-fees.ts';
const batchPath = 'src/app/(admin)/admin/fixtures/publish-actions.ts';
const singlePath = 'src/app/api/admin/fixtures/publish-one/route.ts';
const migrationPath = 'prisma/migrations/20260910001000_match_fee_reminder_introductions/migration.sql';
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

// Real checked-in templates, including the token that production was missing.
function initialTemplates() {
  const seed = read('prisma/seed-notifications.ts');
  const templates = new Map();
  for (const key of ['match-fee-due-email', 'match-fee-due-sms', 'match-fee-reminder-email', 'match-fee-reminder-sms', 'fixture-reminder-email']) {
    const start = seed.indexOf(`key: "${key}"`); assert.ok(start >= 0);
    const block = seed.slice(start, seed.indexOf('\n  });', start));
    const bodyMatch = block.match(/body: `([\s\S]*?)`/) || block.match(/body: "([^"\n]*)"/);
    assert.ok(bodyMatch, key);
    templates.set(key, { id:key, key, name:key, channel:key.endsWith('-sms')?'SMS':'EMAIL', audience:'TEAM', kind:'TRANSACTIONAL', isActive:true,
      subject:block.match(/subject: "([^"\n]*)"/)?.[1] ?? null, body:bodyMatch[1],
      ctaLabel:block.match(/ctaLabel: "([^"\n]*)"/)?.[1] ?? null, ctaUrlKey:block.match(/ctaUrlKey: "([^"\n]*)"/)?.[1] ?? null });
  }
  const sql = read(migrationPath);
  for (const match of sql.matchAll(/\('(match-fee-reminder-intro-[^']+)', '[^']+', '[^']+',\s*'[^']+',\s*'TRANSACTIONAL', '(EMAIL|SMS)', 'TEAM', NULL,\s*'([^']+)'/g)) {
    templates.set(match[1], {id:match[1],key:match[1],channel:match[2],body:match[3],isActive:true});
  }
  assert.equal([...templates.keys()].filter(k=>k.startsWith('match-fee-reminder-intro-')).length,4);
  return templates;
}
function project(row, select) {
  if (!row || !select) return row;
  return Object.fromEntries(Object.entries(select).filter(([,v])=>v).map(([k,v])=>[k, typeof v==='object'?project(row[k],v.select):row[k]]));
}
function matches(row, where={}) {
  return Object.entries(where).every(([k,v])=>{
    if (v && typeof v==='object' && !(v instanceof Date)) {
      if ('in' in v) return v.in.includes(row[k]);
      if ('not' in v) return row[k]!==v.not;
    }
    return row[k]===v;
  });
}
function harness() {
  const templates=initialTemplates(), dispatches=[], charges=[], publishedWrites=[], reads=[];
  const teams=[{id:'home',name:'Home test team',logoUrl:null,standardMatchFeePence:4000},{id:'away',name:'Away test team',logoUrl:null,standardMatchFeePence:3600}];
  const league={id:'league',name:'Test league',slug:'test-league',season:'Test'};
  const fixture={id:'fixture',leagueId:league.id,homeTeamId:'home',awayTeamId:'away',homeTeam:teams[0],awayTeam:teams[1],league,venue:null,pitch:'1',round:1,
    kickoffAt:new Date('2099-06-10T14:00:00Z'),publishedAt:null,status:'SCHEDULED',matchFeePence:4000,homeMatchFeePence:null,awayMatchFeePence:null};
  const recipient=id=>({id,email:`${id}@example.invalid`,phone:'+440000000000',displayName:'Test captain',isSuppressed:false,transactionalEmailOptIn:true,transactionalSmsOptIn:true,
    preferences:{emailEnabled:true,smsEnabled:true,marketingEmailEnabled:false,marketingSmsEnabled:false}});
  const db={
    // The real Veo hook reads no opt-in settings in these existing-league tests.
    // Keep all provider and unrecognised SQL access blocked.
    $queryRaw: async (strings, ...values) => {
      const sql = strings.join('?');
      assert.equal(values[0], league.id);
      if (/SELECT id FROM "League" WHERE id = \? FOR UPDATE/.test(sql)) return [{ id: league.id }];
      if (/FROM "VeoLeagueSettings" WHERE "leagueId" = \?/.test(sql)) return [];
      throw new Error(`Unexpected fixture-reminder SQL: ${sql}`);
    },
    notificationTemplate:{findUnique:async({where,select})=>{reads.push(where.key);return project(templates.get(where.key)||null,select);}},
    notificationRecipient:{findUnique:async({where})=>recipient(where.id)},
    notificationDispatch:{
      findFirst:async({where})=>dispatches.find(d=>matches(d,where))||null,
      create:async({data})=>{const row={id:`dispatch-${dispatches.length+1}`,...data};dispatches.push(row);return row;},
      updateMany:async()=>({count:0}),
      update:async({where,data})=>{const row=dispatches.find(d=>d.id===where.id);Object.assign(row,data);return row;},
    },
    league:{findUnique:async()=>league},leagueDivision:{findFirst:async()=>({id:'division'})},
    team:{findMany:async({select})=>teams.map(row=>project(row,select))},
    fixture:{
      findUnique:async({where,select})=>project(matches(fixture,where)?fixture:null,select),
      findMany:async({where,select})=>matches(fixture,where)?[project(fixture,select)]:[],
      updateMany:async({where,data})=>{if(!matches(fixture,where))return {count:0};Object.assign(fixture,data);publishedWrites.push(data);return {count:1};},
    },
    paymentCharge:{
      findMany:async({where})=>charges.filter(c=>matches(c,where)).map(c=>({...c,team:teams.find(t=>t.id===c.teamId)})),
      create:async({data})=>{const row={id:`charge-${charges.length+1}`,transactions:[],latePaymentFeeStatus:'NONE',latePaymentFeeAmountPence:0,...data};charges.push(row);return row;},
      update:async({where,data})=>{const row=charges.find(c=>c.id===where.id);assert.ok(row);Object.assign(row,data);return row;},
    },
  };
  db.$transaction=async fn=>fn(db);
  const mocks={
    '@/lib/prisma':{prisma:db},
    '@/lib/requireAdmin':{requireAdmin:async()=>({user:{id:'admin'}})},
    'next/server':{NextResponse:Response},'next/cache':{revalidatePath:()=>{}},
    'next/navigation':{redirect:url=>{const e=new Error('TEST_REDIRECT');e.url=url;throw e;}},
    '@/lib/resend/client':{getEmailReplyDomain:()=> 'replies.example.invalid'},
    '@/lib/stripe/client':{getPublicSiteUrl:()=> 'https://example.invalid'},
    '@/lib/datetime/london':{formatDateTimeInLondon:()=> 'Test date',formatTimeInLondon:()=> '15:00',getLondonMinutesSinceMidnight:()=>900},
    '@/lib/payments/match-day-billing':{getMatchFeePaymentRequestScheduledFor:kickoff=>new Date(kickoff.getTime()-3600000)},
    // Existing production preparation adds prediction and kick-off validation.
    // Keep the real kick-off rule below, but isolate unrelated prediction I/O.
    '@/lib/fixtures/storedAiPredictions':{refreshStoredAiPreviewForFixture:async()=>{},refreshStoredAiPreviewsForLeague:async()=>{}},
    '@/lib/teams/fixture-placeholders':{getFixturePlaceholderTeamIds:async()=>new Set()},
    '@/lib/notifications/team-contacts':{upsertTeamNotificationRecipient:async id=>({recipient:recipient(id),snapshot:{primaryContact:{name:'Test captain'}}})},
    '@/lib/fixtures/publishing':{getUnpublishedFixtureBlockReason:async()=>fixture.publishedAt?null:'Unpublished'},
    '@/lib/fixtures/replacement-sms-lifecycle':{cancelClosedReplacementSms:async()=>0,getReplacementSmsCancellationReason:async()=>null},
    '@/lib/referees/evening-policy':{EVENING_SOURCE:'REFEREE_EVENING',LEGACY_REFEREE_REASON:'Legacy',isLegacyRefereeNotice:()=>false},
    '@/lib/notifications/recipients':{getNotificationRecipientById:async id=>recipient(id)},
    '@/lib/notifications/sms-short-links':{shortenSmsBodyLinks:({bodyText})=>({bodyText,links:[]})},
  };
  const allowed=new Set([feePath,batchPath,singlePath,'src/lib/notifications/service.ts','src/lib/notifications/renderer.ts','src/lib/payments/charge-status.ts','src/lib/payments/fixture-fee-policy.ts',
    'src/lib/veo/service.ts','src/lib/veo/allocator.ts',
    'src/lib/fixtures/kickoff-window.ts','src/lib/email/buildEmail.ts','src/lib/email/footer.ts','src/lib/email/inline-formatting.ts','src/lib/email/template-cta.ts']);
  const cache=new Map();
  function load(file) {
    if(!file.endsWith('.ts'))file+='.ts'; assert.ok(allowed.has(file),`Unexpected module ${file}`);
    if(cache.has(file))return cache.get(file).exports;
    const module={exports:{}};cache.set(file,module);
    const source=ts.transpileModule(read(file),{fileName:file,compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText;
    new Function('require','module','exports','fetch',source)(id=>{
      if(Object.hasOwn(mocks,id))return mocks[id];
      if(id==='@prisma/client'||id.startsWith('node:'))return require(id);
      if(id==='crypto')return require('node:crypto');
      if(id.startsWith('@/'))return load('src/'+id.slice(2));
      if(id.startsWith('.')) {
        const resolved=path.posix.normalize(path.posix.join(path.posix.dirname(file),id));
        const alias='@/'+resolved.replace(/^src\//,'').replace(/\.ts$/,'');
        if(Object.hasOwn(mocks,alias))return mocks[alias];
        return load(resolved);
      }
      throw new Error(`Unmocked dependency ${id}`);
    },module,module.exports,()=>{throw new Error('Provider/network access forbidden in regression tests');});
    return module.exports;
  }
  async function publish(mode) {
    if(mode==='single') {
      const res=await load(singlePath).POST(new Request('https://example.invalid/api/admin/fixtures/publish-one',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({fixtureId:'fixture'})}));
      return {status:res.status,...await res.json()};
    }
    const form=new FormData();form.set('leagueId','league');form.set('round','1');
    try { await load(batchPath)[mode==='week'?'publishAndEmailLeagueFixtureWeekAction':'publishAndEmailLeagueFixturesAction'](form);assert.fail('Expected redirect'); }
    catch(e){if(e.message!=='TEST_REDIRECT')throw e;return Object.fromEntries(new URL(e.url,'https://example.invalid').searchParams);}
  }
  function feeInput(extra={}) {return {fixtureId:fixture.id,leagueId:'league',leagueName:'Test league',leagueSeason:'Test',kickoffAt:fixture.kickoffAt,
    homeTeam:teams[0],awayTeam:teams[1],homeMatchFeePence:4000,awayMatchFeePence:3600,
    charges:[{id:'test-charge',teamId:'home',teamName:teams[0].name,teamLogoUrl:null,paymentToken:'nonfunctional-test-token',amountPence:4000}],...extra};}
  return {db,load,publish,feeInput,fixture,teams,templates,dispatches,charges,publishedWrites,reads,mocks};
}
for(const mode of ['single','week','batch']) {
  test(`${mode}: real publisher, charge sync, sender and renderer resolve original reminder templates`,async()=>{
    const h=harness();const result=await h.publish(mode);
    assert.equal(mode==='single'?result.ok:result.publish,mode==='single'?true:'success');
    assert.ok(h.fixture.publishedAt);assert.equal(h.charges.length,2);assert.deepEqual(h.charges.map(c=>c.amountPence),[4000,3600]);
    const reminders=h.dispatches.filter(d=>d.sourceType==='FIXTURE_MATCH_FEE_REMINDER');assert.equal(reminders.length,8);
    for(const d of h.dispatches)assert.doesNotMatch([d.subject,d.bodyText,d.bodyHtml].join(' '),/\{\{\s*[\w.-]+\s*\}\}/);
    for(const d of reminders){assert.ok(d.variables.reminderIntro);assert.equal((d.scheduledFor-h.fixture.kickoffAt)/3600000,d.metadata.hoursAfterKickoff);}
    const originalIds=h.dispatches.map(d=>d.id), publishedAt=h.fixture.publishedAt;
    await h.publish(mode);assert.deepEqual(h.dispatches.map(d=>d.id),originalIds);assert.equal(h.fixture.publishedAt,publishedAt);assert.equal(h.publishedWrites.length,1);
  });
  test(`${mode}: bad future template is blocked but publication is accurately reported and not replayed`,async()=>{
    const h=harness();h.templates.get('match-fee-reminder-email').body+='\n{{notConfigured}}';
    const result=await h.publish(mode);
    assert.ok(h.fixture.publishedAt);
    if(mode==='single'){assert.equal(result.status,500);assert.equal(result.published,true);assert.match(result.error,/Do not republish/);}
    else assert.equal(result.publish,'partial');
    assert.ok(h.dispatches.every(d=>!d.bodyText.includes('{{notConfigured}}')));
    const before=JSON.stringify(h.dispatches);await h.publish(mode);assert.equal(JSON.stringify(h.dispatches),before);
  });
}
test('edited parent templates and edited fragments are used without overwriting them',async()=>{
  const h=harness();h.templates.get('match-fee-reminder-intro-email-first').body='Custom opening: {{fixtureName}}';
  h.templates.get('match-fee-reminder-email').body='Custom parent\n'+h.templates.get('match-fee-reminder-email').body;
  const before=JSON.stringify([...h.templates]);await h.publish('single');assert.equal(JSON.stringify([...h.templates]),before);
  const mail=h.dispatches.find(d=>d.templateId==='match-fee-reminder-email');assert.match(mail.bodyText,/Custom parent/);assert.match(mail.bodyText,/Custom opening: Home test team vs Away test team/);
});
for(const problem of ['missing','disabled','wrong-channel'])test(`intro fragment ${problem} fails closed with a partial publication result`,async()=>{
  const h=harness();const key='match-fee-reminder-intro-email-first';
  if(problem==='missing')h.templates.delete(key);else if(problem==='disabled')h.templates.get(key).isActive=false;else h.templates.get(key).channel='SMS';
  const result=await h.publish('batch');assert.equal(result.publish,'partial');assert.ok(h.fixture.publishedAt);
  assert.equal(h.dispatches.filter(d=>d.sourceType==='FIXTURE_MATCH_FEE_REMINDER').length,0);
});
for(const state of ['DRAFT','CANCELLED','POSTPONED'])test(`${state} fixtures still cannot queue fee messages`,async()=>{
  const h=harness();h.fixture.status=state==='DRAFT'?'SCHEDULED':state;h.fixture.publishedAt=state==='DRAFT'?null:new Date();
  const result=await h.load(feePath).queueFixtureMatchFeeEmails(h.feeInput());assert.equal(result.queued,0);assert.equal(h.dispatches.length,0);assert.equal(h.reads.length,0);
});
test('reminders-only mode remains reminders-only, and recipient opt-outs still apply',async()=>{
  const h=harness();h.fixture.publishedAt=new Date();h.db.notificationRecipient.findUnique=async({where})=>({id:where.id,email:'test@example.invalid',phone:null,isSuppressed:true});
  const result=await h.load(feePath).queueFixtureMatchFeeEmails(h.feeInput({mode:'reminders_only'}));assert.equal(result.queued,0);assert.equal(result.requestQueued,0);
  assert.ok(h.dispatches.length>0);assert.ok(h.dispatches.every(d=>d.status==='SKIPPED'&&d.sourceType==='FIXTURE_MATCH_FEE_REMINDER'));
});
test('status GET remains read-only and unauthorized publish cannot mutate anything',async()=>{
  const h=harness();await h.load(singlePath).GET(new Request('https://example.invalid/api/admin/fixtures/publish-one?ids=fixture'));
  assert.equal(h.dispatches.length,0);assert.equal(h.charges.length,0);assert.equal(h.publishedWrites.length,0);
  h.mocks['@/lib/requireAdmin'].requireAdmin=async()=>{throw new Error('UNAUTHORIZED');};
  await assert.rejects(h.publish('single'),/UNAUTHORIZED/);assert.equal(h.publishedWrites.length,0);
});
test('native source keeps the safety guard and shows a truthful partial-publication notice',()=>{
  const source=read(feePath);assert.equal((source.match(/reminderIntro: await getFixtureMatchFeeReminderIntro/g)||[]).length,2);
  assert.doesNotMatch(source,/Your match fee (is still unpaid|for the fixture below)/);
  assert.match(read('src/lib/notifications/service.ts'),/if \(unresolvedEmailReason\) throw new Error\(unresolvedEmailReason\)/);
  assert.match(read('src/app/(admin)/admin/fixtures/page.tsx'),/publish === "partial"/);
  assert.match(read('src/app/(admin)/admin/fixtures/page.tsx'),/Do not republish or regenerate/);
  const sql=read(migrationPath);assert.match(sql,/ON CONFLICT \("key"\) DO NOTHING/);assert.doesNotMatch(sql,/UPDATE |DELETE |NotificationDispatch|PaymentCharge|publishedAt/i);
});

test('fragment migration is repeatable and preserves saved parent edits and disabled fragments',{skip:process.env.FIXTURE_TEMPLATE_TEST_DB!=='1'},()=>{
  const url=new URL(process.env.DATABASE_URL);assert.ok(['127.0.0.1','localhost'].includes(url.hostname));assert.equal(url.pathname,'/sixfl_fixture_reminder_test');
  const sql=`BEGIN;
    CREATE TEMP TABLE "NotificationTemplate" ("id" text PRIMARY KEY,"key" text UNIQUE,"name" text,"description" text,"kind" text,"channel" text,"audience" text,"subject" text,"body" text,"ctaLabel" text,"ctaUrlKey" text,"ctaUrlKey" text,"isActive" boolean,"createdAt" timestamptz,"updatedAt" timestamptz);
    INSERT INTO "NotificationTemplate" ("id","key","body","isActive") VALUES ('parent','match-fee-reminder-email','Custom parent {{reminderIntro}}',false),('custom','match-fee-reminder-intro-email-first','Edited intro',false);
    ${read(migrationPath)}\n${read(migrationPath)}
    DO $$ BEGIN
      IF (SELECT COUNT(*) FROM "NotificationTemplate") <> 5 THEN RAISE EXCEPTION 'Duplicate or missing fragments'; END IF;
      IF NOT EXISTS (SELECT 1 FROM "NotificationTemplate" WHERE "id"='custom' AND "body"='Edited intro' AND NOT "isActive") THEN RAISE EXCEPTION 'Fragment edits lost'; END IF;
      IF NOT EXISTS (SELECT 1 FROM "NotificationTemplate" WHERE "id"='parent' AND "body"='Custom parent {{reminderIntro}}' AND NOT "isActive") THEN RAISE EXCEPTION 'Parent edits lost'; END IF;
    END $$; ROLLBACK;`;
  cp.execFileSync('psql',[process.env.DATABASE_URL,'-X','-v','ON_ERROR_STOP=1'],{input:sql,stdio:['pipe','pipe','pipe']});
});