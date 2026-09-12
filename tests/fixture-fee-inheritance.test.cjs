const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const root = path.resolve(__dirname, '..');
const generationPath = 'src/app/api/admin/fixtures/generate-next-week/route.ts';
const singlePath = 'src/app/api/admin/fixtures/publish-one/route.ts';
const batchPath = 'src/app/(admin)/admin/fixtures/publish-actions.ts';
const policyPath = 'src/lib/payments/fixture-fee-policy.ts';

// Compile the real raw/prepared server modules. All I/O is replaced explicitly;
// an unexpected app dependency fails closed rather than reaching any provider.
function loader(mocks = {}) {
  const cache = new Map();
  function load(file) {
    let filename = path.resolve(root, file);
    if (!fs.existsSync(filename)) filename += '.ts';
    if (cache.has(filename)) return cache.get(filename).exports;
    const module = { exports: {} }; cache.set(filename, module);
    const compiled = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
      fileName: filename, compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
    });
    new Function('require', 'module', 'exports', compiled.outputText)(id => {
      if (Object.hasOwn(mocks, id)) return mocks[id];
      if (id === '@/lib/payments/fixture-fee-policy') return load(policyPath);
      if (id === '@/lib/payments/charge-status') return load('src/lib/payments/charge-status.ts');
      if (id === '@/lib/veo/service') return load('src/lib/veo/service.ts');
      if (id === './allocator' && filename === path.resolve(root, 'src/lib/veo/service.ts')) return load('src/lib/veo/allocator.ts');
      if (id.startsWith('node:')) return require(id);
      if (id === 'crypto') return require('node:crypto');
      throw new Error(`Unmocked dependency: ${id}`);
    }, module, module.exports);
    return module.exports;
  }
  return load;
}
const policy = loader()(policyPath);
function project(row, select) {
  if (!row || !select) return row;
  return Object.fromEntries(Object.entries(select).filter(([,v])=>v).map(([k,v])=>
    [k, typeof v === 'object' ? project(row[k],v.select) : row[k]]));
}
function matches(row, where = {}) {
  return Object.entries(where).every(([key,value]) => {
    if (value && typeof value === 'object' && !(value instanceof Date)) {
      if ('in' in value) return value.in.includes(row[key]);
      if ('not' in value) return row[key] !== value.not;
    }
    return row[key] === value;
  });
}
function harness({ homeFee = 4000, awayFee = 3600, placeholderIds = [] } = {}) {
  const teams = [
    { id:'ripon', name:'Ripon Cider Boys', standardMatchFeePence:homeFee, logoUrl:null },
    { id:'swaz', name:'Swaz DSC', standardMatchFeePence:awayFee, logoUrl:null },
  ];
  const league = { id:'league', name:'Test league', slug:'test-league', season:'Test' };
  const fixtures = [], charges = [], writes = [], queued = [], contacts = [];
  const selections = [];
  function view(fixture) {
    return { ...fixture, league, venue:null, homeTeam:teams.find(t=>t.id===fixture.homeTeamId), awayTeam:teams.find(t=>t.id===fixture.awayTeamId) };
  }
  function insert(data) {
    const row = { id:`fixture-${fixtures.length+1}`, publishedAt:null, matchFeePence:null,
      homeMatchFeePence:null, awayMatchFeePence:null, status:'SCHEDULED', ...data };
    fixtures.push(row); return row;
  }
  function chargeView(row) { return { ...row, team:teams.find(t=>t.id===row.teamId) }; }
  const prisma = {
    // Run the real opt-in hook, returning no Veo settings (the production default).
    // Only its two read/lock queries are allowed; unexpected SQL still fails closed.
    $queryRaw: async (strings, ...values) => {
      const sql = strings.join('?');
      assert.equal(values[0], league.id);
      if (/SELECT id FROM "League" WHERE id = \? FOR UPDATE/.test(sql)) return [{ id: league.id }];
      if (/FROM "VeoLeagueSettings" WHERE "leagueId" = \?/.test(sql)) return [];
      throw new Error(`Unmocked fixture-fee SQL: ${sql}`);
    },
    league: { findUnique:async()=>league },
    leagueDivision: { findFirst:async()=>({id:'division'}) },
    team: { findMany:async({select})=>{ selections.push(select); return teams.map(row=>project(row,select)); } },
    fixture: {
      createMany:async({data})=>{ data.forEach(row=>insert(row));writes.push({kind:'createFixtures',count:data.length});return {count:data.length}; },
      findMany:async({where,select})=>fixtures.filter(f=>matches(f,where)).map(f=>project(view(f),select)),
      findUnique:async({where,select})=>project(fixtures.find(f=>matches(f,where)) ? view(fixtures.find(f=>matches(f,where))) : null,select),
      updateMany:async({where,data})=>{const rows=fixtures.filter(f=>matches(f,where));rows.forEach(f=>Object.assign(f,data));writes.push({kind:'publish',data});return {count:rows.length};},
    },
    paymentCharge: {
      findMany:async({where})=>charges.filter(c=>matches(c,where)).map(chargeView),
      create:async({data})=>{ const row={id:`charge-${charges.length+1}`,transactions:[],latePaymentFeeStatus:'NONE',latePaymentFeeAmountPence:0,...data};charges.push(row);return row; },
      update:async({where,data})=>{const row=charges.find(c=>matches(c,where));assert.ok(row);Object.assign(row,data);return row;},
    },
    notificationDispatch: { findFirst:async()=>null, updateMany:async()=>({count:0}) },
  };
  prisma.$transaction = async fn => fn(prisma);
  class KnownRequestError extends Error {}
  const enums = values => Object.fromEntries(values.map(v=>[v,v]));
  const mocks = {
    '@prisma/client': {
      FixtureStatus:enums(['SCHEDULED','COMPLETED','CANCELLED','POSTPONED']),
      PaymentChargeStatus:enums(['OPEN','PAID','PARTIALLY_PAID','VOID']),
      NotificationDispatchStatus:enums(['QUEUED','SENT','PROCESSING','SKIPPED','CANCELLED']),
      Prisma:{PrismaClientKnownRequestError:KnownRequestError,TransactionIsolationLevel:{Serializable:'Serializable'}},
    },
    'next/server': {NextResponse:Response}, 'next/cache':{revalidatePath:()=>{}},
    'next/navigation': {redirect:url=>{const e=new Error('TEST_REDIRECT');e.url=url;throw e;}},
    '@/lib/prisma':{prisma}, '@/lib/requireAdmin':{requireAdmin:async()=>({user:{id:'admin'}})},
    '@/lib/datetime/london':{formatDateTimeInLondon:()=> 'Test date'},
    '@/lib/resend/client':{getEmailReplyDomain:()=> 'replies.example.invalid'},
    '@/lib/stripe/client':{getPublicSiteUrl:()=> 'https://example.invalid'},
    '@/lib/payments/match-day-billing':{getMatchFeePaymentRequestScheduledFor:()=>new Date()},
    '@/lib/fixtures/storedAiPredictions':{refreshStoredAiPreviewForFixture:async()=>{},refreshStoredAiPreviewsForLeague:async()=>{}},
    '@/lib/fixtures/kickoff-window':{assertFixtureKickoffWindow:()=>{},getFixtureKickoffWindowViolations:()=>[]},
    '@/lib/teams/fixture-placeholders':{getFixturePlaceholderTeamIds:async()=>new Set(placeholderIds)},
    '@/lib/notifications/team-contacts':{upsertTeamNotificationRecipient:async id=>{contacts.push(id);return {recipient:{id,displayName:id}};}},
    '@/lib/notifications/service':{queueNotificationFromTemplate:async input=>{queued.push(input);return {status:'QUEUED'};}},
  };
  const load=loader(mocks);
  const actualFees=load('src/lib/payments/fixture-match-fees.ts');
  const paymentMessages=[];
  mocks['@/lib/payments/fixture-match-fees']={...actualFees,
    queueFixtureMatchFeeEmails:async input=>{paymentMessages.push(input);return {queued:0,skipped:0};},
  };
  return {load,prisma,teams,fixtures,charges,writes,selections,queued,contacts,paymentMessages,insert};
}
async function generate(h) {
  const response=await h.load(generationPath).POST(new Request('https://example.invalid/api/admin/fixtures/generate-next-week',{
    method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({leagueId:'league'}),
  }));
  assert.equal(response.status,200,JSON.stringify(await response.clone().json()));
  assert.equal(h.fixtures.length,1); return h.fixtures[0];
}
async function publish(h, mode, row) {
  if (mode==='single') {
    const res=await h.load(singlePath).POST(new Request('https://example.invalid/api/admin/fixtures/publish-one',{
      method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({fixtureId:row.id}),
    }));assert.equal(res.status,200);return;
  }
  const form=new FormData();form.set('leagueId','league');form.set('round',String(row.round ?? 1));
  const fn= mode==='week' ? 'publishAndEmailLeagueFixtureWeekAction' : mode==='repair' ? 'repairPublishedLeagueFixtureFeesAction' : 'publishAndEmailLeagueFixturesAction';
  await assert.rejects(h.load(batchPath)[fn](form),e=>e.message==='TEST_REDIRECT' && /success/.test(e.url));
}
function amounts(h) {return Object.fromEntries(h.charges.filter(c=>c.status!=='VOID').map(c=>[c.teamId,c.amountPence]));}
function draft(h,extra={}) {return h.insert({leagueId:'league',homeTeamId:'ripon',awayTeamId:'swaz',kickoffAt:new Date('2099-01-01T20:40:00Z'),round:1,pitch:'Pitch 1',matchFeePence:4000,...extra});}

test('fee policy preserves explicit overrides, £0, team standards and legacy/default fallback',()=>{
  for (const [side,standard,legacy,want] of [[0,3600,4000,0],[1800,3600,4000,1800],[4200,3600,4000,4200],
    [null,3600,4000,3600],[undefined,0,4000,0],[null,null,3800,3800],[null,null,0,0],[null,null,null,4000]]) {
    assert.equal(policy.resolveTeamFixtureFeePence(side,standard,legacy),want);
  }
  for (const invalid of [-1,NaN,Infinity,12.5]) assert.throws(()=>policy.resolveTeamFixtureFeePence(invalid,3600,4000));
});
test('new fixture snapshots keep both directions independent and retain explicit free teams',()=>{
  assert.deepEqual(policy.snapshotFixtureMatchFees({standardMatchFeePence:4000},{standardMatchFeePence:3600}),{homeMatchFeePence:4000,awayMatchFeePence:3600,matchFeePence:4000});
  assert.deepEqual(policy.snapshotFixtureMatchFees({standardMatchFeePence:0},{standardMatchFeePence:3600}),{homeMatchFeePence:0,awayMatchFeePence:3600,matchFeePence:3600});
});
for (const mode of ['single','week','batch']) {
  test(`Generate next week -> ${mode} publish -> real charge sync keeps Ripon £40 and Swaz £36`,async()=>{
    const h=harness();const row=await generate(h);
    assert.ok(h.selections.some(s=>s.standardMatchFeePence));
    assert.equal(row.homeMatchFeePence,4000);assert.equal(row.awayMatchFeePence,3600);
    assert.equal(row.publishedAt,null);assert.equal(h.charges.length,0);assert.equal(h.queued.length,0);
    await publish(h,mode,row);assert.deepEqual(amounts(h),{ripon:4000,swaz:3600});
    assert.deepEqual(h.paymentMessages[0].charges.map(c=>c.amountPence),[4000,3600]);
  });
  test(`${mode} publisher recovers team standard from drafts missing side fees`,async()=>{
    const h=harness();await publish(h,mode,draft(h));assert.deepEqual(amounts(h),{ripon:4000,swaz:3600});
  });
  test(`${mode} publisher respects an explicit free side and a non-standard override`,async()=>{
    const h=harness();await publish(h,mode,draft(h,{homeMatchFeePence:0,awayMatchFeePence:2200}));
    assert.deepEqual(amounts(h),{swaz:2200});
  });
  test(`${mode} publisher excludes TBC without losing the real opponent's £36`,async()=>{
    const h=harness({placeholderIds:['ripon']});await publish(h,mode,draft(h));
    assert.deepEqual(amounts(h),{swaz:3600});assert.ok(!h.contacts.includes('ripon'));
  });
}
test('Swaz remains £36 as the home team too',async()=>{
  const h=harness();h.teams[1].name='A Swaz DSC';const row=await generate(h);
  assert.equal(row.homeTeamId,'swaz');assert.equal(row.homeMatchFeePence,3600);
  await publish(h,'single',row);assert.deepEqual(amounts(h),{swaz:3600,ripon:4000});
});
test('a stored fixture agreement is not overwritten by a subsequent standard-fee change',async()=>{
  const h=harness();const row=await generate(h);h.teams[1].standardMatchFeePence=3800;
  await publish(h,'single',row);assert.deepEqual(amounts(h),{ripon:4000,swaz:3600});
});
test('free and unconfigured teams resolve independently through generation and publishing',async()=>{
  const h=harness({homeFee:null,awayFee:0});const row=await generate(h);
  assert.equal(row.homeMatchFeePence,4000);assert.equal(row.awayMatchFeePence,0);
  await publish(h,'week',row);assert.deepEqual(amounts(h),{ripon:4000});
});
test('explicitly requested manual repair uses the same resolver, without changing fixture fees',async()=>{
  const h=harness();const row=draft(h,{publishedAt:new Date()});
  await publish(h,'repair',row);assert.deepEqual(amounts(h),{ripon:4000,swaz:3600});
  assert.equal(row.awayMatchFeePence,null);assert.equal(h.writes.length,0);
});
test('the real charge sync retains its paid-charge mismatch protection',async()=>{
  const h=harness();const row=draft(h,{publishedAt:new Date()});
  h.charges.push({id:'paid',fixtureId:row.id,teamId:'swaz',amountPence:4000,status:'PAID',transactions:[{amountPence:4000}],latePaymentFeeStatus:'NONE',latePaymentFeeAmountPence:0});
  const sync=h.load('src/lib/payments/fixture-match-fees.ts').syncFixtureMatchFeeCharges;
  await assert.rejects(sync({fixtureId:row.id,leagueId:'league',leagueName:'test',kickoffAt:row.kickoffAt,
    homeTeam:h.teams[0],awayTeam:h.teams[1],homeMatchFeePence:4000,awayMatchFeePence:3600}),/payment has already been recorded/);
  assert.equal(h.charges.find(c=>c.id==='paid').amountPence,4000);
});
test('native fee sources cannot be overwritten by retired publishing compatibility steps',()=>{
  const pub=fs.readFileSync(path.join(root,batchPath),'utf8');
  assert.equal((pub.match(/resolveFixtureMatchFees\(fixture, placeholderTeamIds\)/g)||[]).length,2);
  for (const file of [batchPath,singlePath]) {
    const source=fs.readFileSync(path.join(root,file),'utf8');
    assert.doesNotMatch(source,/fixture\.(home|away)MatchFeePence\s*\?\?\s*fixture\.matchFeePence/);
    assert.match(source,/standardMatchFeePence: true/);
  }
  for (const script of ['apply-publish-tbc-fee-safety.cjs','apply-resilient-published-fee-repair.cjs','fix-publish-tbc-fee-safety-compat.cjs']) {
    const text=fs.readFileSync(path.join(root,'scripts',script),'utf8');
    assert.doesNotMatch(text,/fixture\.homeMatchFeePence|replaceFeeDeclarationBlock|source = source\.slice/);
  }
});
