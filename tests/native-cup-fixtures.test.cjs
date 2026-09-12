const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const root = path.resolve(__dirname, '..');
const enums = Object.fromEntries(['SCHEDULED','COMPLETED','POSTPONED','CANCELLED'].map(x=>[x,x]));
const sql = (parts,...values) => ({text:parts.join('?'),values});

// Exercise the actual owning modules. Private pure helpers are exposed only in
// the test VM; production server actions are not given test-only exports.
function load(file, mocks, expose=[]) {
  const code = ts.transpileModule(fs.readFileSync(path.join(root,file),'utf8'), {
    fileName:file, compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS},
  }).outputText;
  const module={exports:{}};
  new Function('require','module','exports',code + `\nObject.assign(module.exports, {${expose.join(',')}});`)(id=>{
    if (Object.hasOwn(mocks,id)) return mocks[id];
    if (id.startsWith('node:') || id==='crypto') return require(id);
    throw new Error(`Unmocked dependency: ${id}`);
  },module,module.exports);
  return module.exports;
}
const baseMocks = {
  '@prisma/client':{FixtureStatus:enums,Prisma:{sql},NotificationDispatchStatus:{}},
  'next/cache':{revalidatePath:()=>{}},
  'next/navigation':{redirect:()=>{throw new Error('Unexpected redirect');}},
  'next/server':{NextResponse:Response},
  '@/lib/requireAdmin':{requireAdmin:async()=>({user:{id:'test-admin'}})},
  '@/lib/prisma':{prisma:{}},
  '@/lib/league-season-teams':{ensureSeasonTeamRowsForLeague:async()=>{}},
  '@/lib/payments/fixture-match-fees':{},
  '@/lib/payments/fixture-fee-policy':{},
  '@/lib/teams/fixture-placeholders':{},
  '@/lib/datetime/london':{getLondonMinutesSinceMidnight:date=>date.getUTCHours()*60+date.getUTCMinutes()},
};
const division = load('src/app/(admin)/admin/fixtures/generate/division-actions.ts',baseMocks,['generateRounds','repeatRounds','isKickoffAllowed']);
const nextWeek = load('src/app/api/admin/fixtures/generate-next-week/route.ts',baseMocks,['chooseFixtures']);
const teams=['a','b','c','d'].map(id=>({id,name:id,standardMatchFeePence:4000}));

for(const count of [2,3,4,5,6,12]) test(`Native round-robin covers every pair for ${count} teams without duplicate appearances`,()=>{
  const ids=Array.from({length:count},(_,i)=>`team-${i}`);
  const rounds=division.generateRounds(ids);
  const meetings=rounds.flat().map(p=>[p.homeId,p.awayId].sort().join(':'));
  assert.equal(meetings.length,count*(count-1)/2);
  assert.equal(new Set(meetings).size,meetings.length);
  for(const round of rounds){
    const players=round.flatMap(p=>[p.homeId,p.awayId]);
    assert.equal(new Set(players).size,players.length);
  }
  const repeated=division.repeatRounds(rounds);
  assert.deepEqual(repeated,rounds);
  assert.notEqual(repeated,rounds);
  assert.notEqual(repeated[0][0],rounds[0][0]);
});

test('Next-week pair selection is independent of historical storage direction',()=>{
  const history=[{homeTeamId:'a',awayTeamId:'b',round:1},{homeTeamId:'c',awayTeamId:'d',round:1}];
  const direct=nextWeek.chooseFixtures({teams,existingFixtures:history});
  const reversed=nextWeek.chooseFixtures({teams,existingFixtures:history.map(f=>({...f,homeTeamId:f.awayTeamId,awayTeamId:f.homeTeamId}))});
  assert.deepEqual(direct,reversed);
  assert.equal(new Set(direct.flatMap(p=>[p.team1Id,p.team2Id])).size,4);
  assert.ok(direct.every(p=>![['a','b'],['c','d']].some(pair=>pair.every(id=>id===p.team1Id||id===p.team2Id))));
});

test('Both teams retain earliest/latest kick-off protection whichever storage slot they occupy',()=>{
  const a={id:'a',name:'A',earliestKickoffTime:'19:00',latestKickoffTime:'20:00'};
  const b={id:'b',name:'B',earliestKickoffTime:'19:20',latestKickoffTime:'19:40'};
  for(const [time,expected] of [['19:00',false],['19:20',true],['19:40',true],['20:00',false]]){
    const date=new Date(`2026-09-15T${time}:00Z`);
    assert.equal(division.isKickoffAllowed(date,a,b).allowed,expected);
    assert.equal(division.isKickoffAllowed(date,b,a).allowed,expected);
  }
});

async function grid(fixtureInputs,failAuth=false){
  let reads=0;
  const fixtures=fixtureInputs.map((f,i)=>({id:`f-${i}`,leagueId:'league',homeTeamId:'a',awayTeamId:'b',status:'SCHEDULED',kickoffAt:new Date('2026-09-15T19:00:00Z'),publishedAt:null,round:i+1,position:0,pitch:null,venue:null,homeTeam:{name:'a'},awayTeam:{name:'b'},paymentCharges:[],captainConfirmations:[],matchFeePence:4000,homeMatchFeePence:4000,awayMatchFeePence:3600,...f}));
  const prisma={
    $queryRaw:async query=>{reads++;return query.text.includes('FROM "LeagueDivision"')?[]:teams;},
    fixture:{findMany:async()=>{reads++;return fixtures;}},
  };
  const route=load('src/app/api/admin/fixtures/matchup-grid/route.ts',{
    ...baseMocks,'@/lib/prisma':{prisma},
    '@/lib/requireAdmin':{requireAdmin:async()=>{if(failAuth)throw new Error('Unauthorised');}},
    '@/lib/current-leagues':{getCurrentLeagueOptions:async()=>[{id:'league',name:'Test',season:'2026',isActive:true}]},
  });
  if(failAuth){await assert.rejects(route.GET(new Request('https://example.invalid/?leagueId=league')),/Unauthorised/);assert.equal(reads,0);return;}
  return (await route.GET(new Request('https://example.invalid/?leagueId=league&status=all'))).json();
}

test('Matchup API counts one meeting once, not twice because the matrix is symmetric',async()=>{
  const data=await grid([{}]);
  assert.deepEqual(data.summary,{scheduledPairs:1,singleMeetingPairs:1,twoMeetingPairs:0,missingPairs:5});
  const ab=data.cells[0].opponents[1],ba=data.cells[1].opponents[0];
  assert.equal(ab.meetingCount,1);assert.equal(ba.meetingCount,1);
  assert.equal(ab.label,'1 fixture');
  assert.equal(data.fixtures[0].homeMatchFeePence,4000);assert.equal(data.fixtures[0].awayMatchFeePence,3600);
});

test('Two meetings in the same storage direction have complete pair coverage',async()=>{
  const data=await grid([{},{}]);
  assert.equal(data.summary.twoMeetingPairs,1);assert.equal(data.summary.singleMeetingPairs,0);
  assert.equal(data.cells[0].opponents[1].meetingCount,2);
  assert.deepEqual(data.summary,(await grid([{}, {homeTeamId:'b',awayTeamId:'a'}])).summary);
});

test('Cancelled/postponed and teams outside active season membership do not count',async()=>{
  const data=await grid([{status:'CANCELLED'},{status:'POSTPONED'},{homeTeamId:'placeholder'}]);
  assert.equal(data.summary.scheduledPairs,0);assert.equal(data.summary.missingPairs,6);
});

test('Matchup API requires admin before reading league data',()=>grid([],true));

test('Ordinary current-league fallback excludes cups, while explicit record inclusion is retained',async()=>{
  const calls=[];
  const prisma={$queryRaw:async()=>{throw new Error('Test SQL outage');},league:{findMany:async query=>{calls.push(query);return [];}}};
  const current=load('src/lib/current-leagues.ts',{...baseMocks,'@/lib/prisma':{prisma}});
  await current.getCurrentLeagueOptions();await current.getCurrentLeagueIds();
  for(const call of calls){assert.equal(call.where.isActive,true);assert.equal(call.where.OR[1].competition.is.competitionType,'LEAGUE');}
  calls.length=0;await current.getCurrentLeagueOptions(' cup-season ');await current.getCurrentLeagueIds(' cup-season ');
  for(const call of calls){assert.equal(call.where.OR[1].id,'cup-season');assert.equal(call.where.OR[0].OR[1].competition.is.competitionType,'LEAGUE');}
});
