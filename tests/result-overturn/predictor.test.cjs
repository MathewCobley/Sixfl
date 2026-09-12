const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { load } = require('./loader.cjs');
const { getPredictorResult } = load('src/lib/fixtures/result-score.ts');
const { calculateFixtureWinChance } = load('src/lib/fixtures/winChance.ts');
const { buildNameAwareWinChanceFixtures } = load('src/lib/fixtures/winChanceHistory.ts');
const { calculatePredictorV3Candidates } = load('src/lib/fixtures/predictorV3Candidate.ts');
const match = (home, away, h, a, n) => ({ status:'COMPLETED',kickoffAt:new Date(2026,8,n),homeTeam:{id:home,name:home},awayTeam:{id:away,name:away},result:{homeScore:h,awayScore:a} });
const history = [match('Will','Nomads',4,1,9), match('Nomads','Other',2,1,2), match('Will','Other',3,1,1),match('Other','Nomads',2,2,3)];
const overturned = structuredClone(history); overturned[0].result = {homeScore:0,awayScore:3,overturn:{originalHomeScore:4,originalAwayScore:1}};
const input = fixtures => ({homeTeamId:'Nomads',awayTeamId:'Will',fixtures});

test('an awarded 3–0 does not replace the original 4–1 in predictor form, Elo, scoring or opponents', () => {
  const before=JSON.stringify(overturned);
  assert.deepEqual(calculateFixtureWinChance(input(overturned)),calculateFixtureWinChance(input(history)));
  const incorrect=structuredClone(overturned);delete incorrect[0].result.overturn;
  assert.notDeepEqual(calculateFixtureWinChance(input(incorrect)),calculateFixtureWinChance(input(history)));
  assert.equal(JSON.stringify(overturned),before,'never mutate the official score source');
});
test('reversed fixture order and original draws/zero goals are preserved exactly', () => {
  for(const [h,a] of [[1,4],[0,0],[3,0],[0,3],[2,2]]) assert.deepEqual(getPredictorResult({homeScore:3,awayScore:0,overturn:{originalHomeScore:h,originalAwayScore:a}}),{homeScore:h,awayScore:a});
});
test('missing or invalid original evidence is excluded, never replaced with an administrative score',()=>{
  for(const original of [{originalHomeScore:null,originalAwayScore:null},{originalHomeScore:1,originalAwayScore:null},{originalHomeScore:-1,originalAwayScore:4},{originalHomeScore:NaN,originalAwayScore:4}]) assert.equal(getPredictorResult({homeScore:3,awayScore:0,overturn:original}),null);
  assert.equal(getPredictorResult(null),null);
  assert.deepEqual(getPredictorResult({homeScore:3,awayScore:0}),{homeScore:3,awayScore:0},'a real played 3–0 is not guessed to be a forfeit');
});
test('name-aware historical identity mapping keeps original-score evidence',()=>{
  const targets=[{homeTeam:{id:'nomads-current',name:'Nomads'},awayTeam:{id:'will-current',name:'Will'}}];
  const mapped=buildNameAwareWinChanceFixtures({historyFixtures:overturned,targetFixtures:targets});
  assert.deepEqual(mapped[0].result.overturn,{originalHomeScore:4,originalAwayScore:1});
  const normal=buildNameAwareWinChanceFixtures({historyFixtures:history,targetFixtures:targets});
  assert.deepEqual(calculateFixtureWinChance({homeTeamId:'nomads-current',awayTeamId:'will-current',fixtures:mapped}),calculateFixtureWinChance({homeTeamId:'nomads-current',awayTeamId:'will-current',fixtures:normal}));
});
test('both V3 candidate models use the same on-pitch history',()=>{
  const common={homeTeamId:'Nomads',awayTeamId:'Will',currentProbabilities:{home:.2,draw:.2,away:.6}};
  assert.deepEqual(calculatePredictorV3Candidates({...common,history:overturned}),calculatePredictorV3Candidates({...common,history}));
});
test('all predictor loaders retain original scores after production preparation',()=>{
  for(const file of ['src/lib/fixtures/storedAiPredictions.ts','src/lib/fixtures/recoverHistoricalAiPredictions.ts','src/app/api/leagues/[slug]/win-chances/route.ts','src/app/api/captain/team/[teamid]/fixture-badges/route.ts','src/app/(public)/leagues/[slug]/fixtures/page.tsx','src/app/api/admin/night-board/night-fixtures/route.ts','src/app/api/admin/night-board/pitch-sheets/route.ts','src/app/api/admin/night-board/pitch-tally-sheets/route.ts']) {
    const source=fs.readFileSync(file,'utf8');assert.match(source,/result:\s*\{\s*select:\s*PREDICTOR_RESULT_SELECT\s*\}/,file);
    assert.doesNotMatch(source,/result:\s*\{\s*select:\s*\{\s*homeScore:\s*true,\s*awayScore:\s*true\s*[,}] /,file);
  }
  for(const file of ['src/app/(admin)/admin/ai-predictor/page.tsx','src/app/(admin)/admin/ai-predictor/backtest/page.tsx']) {
    const source=fs.readFileSync(file,'utf8');assert.match(source,/LEFT JOIN "MatchResultOverturn"/,file);assert.match(source,/originalHomeScore/,file);assert.match(source,/originalAwayScore/,file);
  }
});
test('overturn action does not send messages, take money or regenerate frozen predictions',()=>{
  const source=fs.readFileSync('src/lib/fixtures/result-overturn.ts','utf8');
  assert.doesNotMatch(source,/from ["'][^"']*(?:payments|notifications|stripe|storedAiPredictions|broadcast)/);
  assert.match(source,/await administrator\(db, input.actorUserId\)/);assert.match(source,/FOR UPDATE/);
  const migration=fs.readFileSync('prisma/migrations/20260912120000_result_overturn_audit/migration.sql','utf8');
  assert.match(migration,/BEFORE UPDATE OR DELETE ON "MatchResultOverturn"/);assert.match(migration,/BEFORE UPDATE OR DELETE ON "MatchResult"/);
});

test('captain scorer editing uses the original played goals, never invented awarded goals',()=>{
 const source=fs.readFileSync('src/app/captain/team/[teamid]/results/page.tsx','utf8');
 assert.match(source,/const playedResult = getPredictorResult\(result\)/);
 assert.match(source,/const goalsExpected = isHome \? playedResult.homeScore : playedResult.awayScore/);
 assert.match(source,/include:\s*\{\s*overturn: \{ select: RESULT_OVERTURN_SUMMARY_SELECT \}/);
 assert.match(source,/getPredictorResult\(fixture.result!\)/);
 assert.match(source,/max=\{row.playedGoalsFor\}/);assert.doesNotMatch(source,/max=\{row.goalsFor\}/);
 assert.match(source,/outcome: getOutcome\(goalsFor, goalsAgainst\)/,'competition outcome still uses the official award');
});
