const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const { PrismaClient } = require('@prisma/client');
const { execFileSync } = require('node:child_process');
const root = path.resolve(__dirname, '..');
const read = p => fs.readFileSync(path.join(root, p), 'utf8');
function loader(mocks = {}) {
  const cache = new Map();
  function load(file) {
    file = path.normalize(file);
    if (cache.has(file)) return cache.get(file).exports;
    const module = { exports: {} }; cache.set(file, module);
    const code = ts.transpileModule(read(file), { fileName: file, compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText;
    function requireLocal(id) {
      if (Object.hasOwn(mocks, id)) return mocks[id];
      if (id.startsWith('@/') || id.startsWith('.')) {
        const base = id.startsWith('@/') ? 'src/' + id.slice(2) : path.join(path.dirname(file), id);
        const resolved = [base, base + '.ts', base + '.tsx'].find(p => fs.existsSync(path.join(root, p)) && fs.statSync(path.join(root, p)).isFile());
        if (resolved) return load(resolved);
      }
      return require(id);
    }
    new Function('require', 'module', 'exports', code)(requireLocal, module, module.exports);
    return module.exports;
  }
  return load;
}
let db, sql, awards, calendar;
const migration = 'prisma/migrations/20260907153000_goal_of_month/migration.sql';
const clipMigration = 'prisma/migrations/20260918182000_goal_of_month_saved_clips/migration.sql';
const candidateClipMigration = 'prisma/migrations/20260918182500_goal_of_month_clip_candidates/migration.sql';
const now = new Date('2026-09-20T12:00:00Z');
const input = (userId = 'u1', goalNumber = 1, fixtureId = 'fixture') => ({ userId, goalNumber, fixtureId, scoringTeamId: 'home', scorerName: 'Test Scorer' });
const clipInput = (userId = 'u1', clipAssetId = 'clip-1', fixtureId = 'fixture') => ({ userId, clipAssetId, fixtureId, scoringTeamId: 'home', scorerName: 'Test Scorer' });
globalThis.fetch = async () => { throw new Error('Real network requests are forbidden in goal award tests'); };
test.before(() => {
  const url = process.env.GOAL_MONTH_TEST_DATABASE_URL;
  assert.ok(url, 'Dedicated test database required');
  const parsed = new URL(url);
  assert.ok(['localhost', '127.0.0.1'].includes(parsed.hostname));
  assert.equal(parsed.pathname, '/sixfl_goal_month_test');
  sql = query => execFileSync('psql', [url, '-X', '-v', 'ON_ERROR_STOP=1', '-Atc', query], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  sql(`CREATE TABLE "User" (id TEXT PRIMARY KEY);
    CREATE TABLE "Team" (id TEXT PRIMARY KEY,name TEXT,"logoUrl" TEXT);
    CREATE TABLE "League" (id TEXT PRIMARY KEY,name TEXT);
    CREATE TABLE "Fixture" (id TEXT PRIMARY KEY,"homeTeamId" TEXT,"awayTeamId" TEXT,"leagueId" TEXT,"publishedAt" TIMESTAMP,"sixflTvRecorded" BOOLEAN,"sixflTvUrl" TEXT,status TEXT,"kickoffAt" TIMESTAMP);
    CREATE TABLE "MatchResult" ("fixtureId" TEXT PRIMARY KEY,"homeScore" INTEGER,"awayScore" INTEGER);
    CREATE TABLE "SixflTvFootageAsset" (
      "id" TEXT PRIMARY KEY,
      "fixtureId" TEXT,
      "kind" TEXT,
      "filename" TEXT,
      "state" TEXT,
      "createdAt" TIMESTAMP NOT NULL DEFAULT NOW()
    );
    CREATE TABLE "GoalOfWeek" (id TEXT PRIMARY KEY,"weekOf" TIMESTAMP);
    CREATE TABLE "GoalOfWeekCandidate" (id TEXT PRIMARY KEY,marker TEXT);
    CREATE TABLE "GoalOfWeekNomination" (id TEXT PRIMARY KEY,marker TEXT);
    CREATE TABLE "GoalOfWeekVote" (id TEXT PRIMARY KEY,marker TEXT);
    INSERT INTO "GoalOfWeek" VALUES ('weekly-winner','2026-08-31');
    INSERT INTO "GoalOfWeekCandidate" VALUES ('weekly-goal','unchanged');
    INSERT INTO "GoalOfWeekNomination" VALUES ('weekly-nomination','unchanged');
    INSERT INTO "GoalOfWeekVote" VALUES ('weekly-vote','unchanged');`);
  sql(read(migration));
  sql(read(clipMigration));
  sql(read(candidateClipMigration));
  sql(`UPDATE "GoalAwardTransition" SET "firstMonth"='2026-09',"weeklyNominationsCloseAt"='2026-09-13T23:00:00',"weeklyVotingClosesAt"='2026-09-15T17:00:00' WHERE id='monthly'`);
  db = new PrismaClient({ datasources: { db: { url } } });
  const load = loader({ '@/lib/prisma': { prisma: db } });
  awards = load('src/lib/goal-of-month/community.ts'); calendar = load('src/lib/goal-of-month/calendar.ts');
});
test.beforeEach(() => {
  sql(`TRUNCATE "GoalOfMonthVote","GoalOfMonthNomination","GoalOfMonthCandidate","SixflTvFootageAsset","MatchResult","Fixture","Team","League","User" CASCADE;
    INSERT INTO "User" VALUES ('u1'),('u2'),('u3'),('u4');
    INSERT INTO "Team" VALUES ('home','Home FC',NULL),('away','Away FC',NULL);
    INSERT INTO "League" VALUES ('league','Test League');
    INSERT INTO "Fixture" VALUES ('fixture','home','away','league',NOW(),TRUE,'https://youtu.be/dQw4w9WgXcQ','COMPLETED','2026-09-03T19:00:00'),
      ('previous','home','away','league',NOW(),TRUE,'https://youtu.be/dQw4w9WgXcQ','COMPLETED','2026-08-30T19:00:00');
    INSERT INTO "MatchResult" VALUES ('fixture',6,4),('previous',2,1);
    INSERT INTO "SixflTvFootageAsset" ("id","fixtureId","kind","filename","state","createdAt","clipNumber")
      VALUES
        ('clip-1','fixture','CLIP','clip-1.mp4','READY','2026-09-03T20:00:00',1),
        ('clip-2','fixture','CLIP','clip-2.mp4','READY','2026-09-03T20:00:01',2),
        ('clip-3','fixture','CLIP','clip-3.mp4','READY','2026-09-03T20:00:02',3);`);
});
test.after(async () => { await db?.$disconnect(); });

test('London calendar months, year rollover, leap year and DST boundaries are exact', () => {
  assert.equal(calendar.shiftMonth('2026-12', 1), '2027-01');
  assert.equal(calendar.shiftMonth('2026-01', -1), '2025-12');
  assert.equal(calendar.monthlyPeriod('2028-02').endsAt.toISOString(), '2028-03-01T00:00:00.000Z');
  assert.equal(calendar.monthlyPeriod('2026-09').startsAt.toISOString(), '2026-08-31T23:00:00.000Z');
  assert.equal(calendar.monthlyPeriod('2026-10').endsAt.toISOString(), '2026-11-01T00:00:00.000Z');
  assert.equal(calendar.monthKey(new Date('2026-09-30T23:30:00Z')), '2026-10');
  assert.equal(calendar.validMonthKey('2026-13'), false);
});
test('nominations run through the 5th, voting 6th to 12th, with overlapping next-month nominations', () => {
  assert.equal(calendar.nominationOpen('2026-09', new Date('2026-10-05T22:59:59Z')), true);
  assert.equal(calendar.nominationOpen('2026-09', new Date('2026-10-05T23:00:00Z')), false);
  assert.deepEqual(calendar.monthlyCycle(new Date('2026-10-03T12:00:00Z')).nominationMonths, ['2026-09', '2026-10']);
  assert.equal(calendar.monthlyCycle(new Date('2026-10-05T23:00:00Z')).votingOpen, true);
  assert.equal(calendar.monthlyCycle(new Date('2026-10-12T22:59:59Z')).votingOpen, true);
  assert.equal(calendar.monthlyCycle(new Date('2026-10-12T23:00:00Z')).votingOpen, false);
  assert.equal(calendar.monthlyCycle(new Date('2026-10-12T23:00:00Z')).latestClosedMonth, '2026-09');
});
test('migration replay preserves every weekly record and the fixed transition deadline', () => {
  const tables = ['GoalOfWeek', 'GoalOfWeekCandidate', 'GoalOfWeekNomination', 'GoalOfWeekVote', 'GoalAwardTransition'];
  const snapshots = tables.map(table => sql(`SELECT json_agg(t ORDER BY id) FROM "${table}" t`));
  sql(read(migration));
  tables.forEach((table, index) => assert.equal(sql(`SELECT json_agg(t ORDER BY id) FROM "${table}" t`), snapshots[index]));
});
test('one goal produces one nominee card regardless of repeated and concurrent nominations', async () => {
  await Promise.all([awards.nominateMonthlyGoal(input('u1'), now), awards.nominateMonthlyGoal(input('u2'), now)]);
  const repeated = await awards.nominateMonthlyGoal(input('u1'), now);
  assert.equal(repeated.alreadyNominated, true);
  const goals = await awards.getMonthlyCandidates('2026-09');
  assert.equal(goals.length, 1); assert.equal(goals[0].nominationCount, 2);
  const payload = awards.monthlyCandidatePayload(goals[0]);
  assert.deepEqual(payload.videoUrls, ['https://youtu.be/dQw4w9WgXcQ']);
  assert.equal(payload.goalNumber, 1); assert.equal(payload.teamName, 'Home FC');
});
test('saved SIXFL TV clips become exact nominees with stable clip playback and thumbnails', async () => {
  await Promise.all([
    awards.nominateMonthlyGoal(clipInput('u1'), now),
    awards.nominateMonthlyGoal(clipInput('u2'), now),
  ]);
  const goals = await awards.getMonthlyCandidates('2026-09');
  const clipGoal = goals.find(goal => goal.clipAssetId === 'clip-1');
  assert.ok(clipGoal);
  assert.equal(clipGoal.clipNumber, 1);
  assert.equal(clipGoal.goalNumber, null);
  assert.equal(clipGoal.nominationCount, 2);
  const payload = awards.monthlyCandidatePayload(clipGoal);
  assert.equal(payload.clipNumber, 1);
  assert.equal(payload.clipAssetId, 'clip-1');
  assert.equal(payload.clipUrl, `/api/goal-of-month/clips/${clipGoal.id}`);
  assert.equal(payload.thumbnailUrl, `/api/goal-of-month/clips/${clipGoal.id}/thumbnail`);
  const fixture = (await awards.getMonthlyFixtures('2026-09'))[0];
  assert.deepEqual(fixture.clips.map(clip => clip.clipNumber), [1,2,3]);
});
test('concurrent requests cannot exceed three nominations per account and month', async () => {
  const results = await Promise.allSettled([1,2,3,4].map(number => awards.nominateMonthlyGoal(input('u1', number), now)));
  assert.equal(results.filter(result => result.status === 'fulfilled').length, 3);
  assert.equal(sql('SELECT COUNT(*) FROM "GoalOfMonthNomination"'), '3');
});
test('match date controls eligibility and saved clips no longer depend on a YouTube publication', async () => {
  await assert.rejects(awards.nominateMonthlyGoal(input('u1', 1, 'previous'), now), /closed/);
  await assert.rejects(awards.nominateMonthlyGoal(input('u1', 11), now), /goal number/);
  await assert.rejects(awards.nominateMonthlyGoal({ ...clipInput(), scoringTeamId: 'another' }, now), /scoring team/);

  sql(`UPDATE "Fixture" SET "sixflTvRecorded"=FALSE,"sixflTvUrl"='' WHERE id='fixture'`);
  const clipNomination = await awards.nominateMonthlyGoal(clipInput(), now);
  assert.ok(clipNomination.candidateId);

  sql(`TRUNCATE "GoalOfMonthVote","GoalOfMonthNomination","GoalOfMonthCandidate" CASCADE`);
  for (const assignment of ["status='SCHEDULED'", '"publishedAt"=NULL']) {
    sql(`UPDATE "Fixture" SET status='COMPLETED',"publishedAt"=NOW() WHERE id='fixture'`);
    sql(`UPDATE "Fixture" SET ${assignment} WHERE id='fixture'`);
    await assert.rejects(awards.nominateMonthlyGoal(clipInput(), now), /completed|published|available/);
  }
  sql(`UPDATE "Fixture" SET status='COMPLETED',"publishedAt"=NOW() WHERE id='fixture'`);
  await assert.rejects(awards.nominateMonthlyGoal(clipInput(), new Date('2026-10-06T12:00:00Z')), /closed/);
});
test('scoring-team conflicts and removed candidates cannot be duplicated or resurrected', async () => {
  await awards.nominateMonthlyGoal(input(), now);
  await assert.rejects(awards.nominateMonthlyGoal({ ...input('u2'), scoringTeamId: 'away' }, now), /different scoring team/);
  sql(`UPDATE "GoalOfMonthCandidate" SET status='REMOVED'`);
  await assert.rejects(awards.nominateMonthlyGoal(input('u2'), now), /removed/);
  assert.equal((await awards.getMonthlyCandidates('2026-09')).length, 0);
});
test('six finalists and a single changeable monthly vote, with no premature winner', async () => {
  for (let goal = 1; goal <= 7; goal++) await awards.nominateMonthlyGoal(input(goal <= 3 ? 'u1' : goal <= 6 ? 'u2' : 'u3', goal), now);
  const ballot = await awards.getMonthlyCandidates('2026-09', 6);
  assert.equal(ballot.length, 6);
  const excluded = (await awards.getMonthlyCandidates('2026-09')).find(goal => !ballot.some(row => row.id === goal.id));
  const during = new Date('2026-10-08T12:00:00Z');
  await assert.rejects(awards.voteMonthlyGoal('u1', excluded.id, during), /six finalists/);
  await assert.rejects(awards.voteMonthlyGoal('u1', ballot[0].id, now), /not open/);
  await awards.voteMonthlyGoal('u1', ballot[0].id, during);
  await awards.voteMonthlyGoal('u1', ballot[1].id, during);
  assert.equal(sql('SELECT COUNT(*) FROM "GoalOfMonthVote"'), '1');
  assert.equal((await awards.getMonthlyWinners(during)).length, 0);
  assert.equal((await awards.getMonthlyWinners(new Date('2026-10-13T12:00:00Z')))[0].id, ballot[1].id);
  await assert.rejects(awards.voteMonthlyGoal('u1', ballot[0].id, new Date('2026-10-13T12:00:00Z')), /not open/);
});
test('public nominees and dashboard use the same payload, refreshed as soon as a nomination is saved', async () => {
  assert.equal((await awards.getMonthlyPageData(null, now)).nominations[0].candidates.length, 0);
  const goal = await awards.nominateMonthlyGoal(input(), now);
  const data = await awards.getMonthlyPageData('u1', now);
  assert.equal(data.nominations[0].candidates[0].id, goal.candidateId);
  assert.deepEqual(data.nominations[0].nominatedCandidateIds, [goal.candidateId]);
  assert.equal(data.nominations[0].usedNominations, 1);
  assert.equal(data.winners.length, 0);
});
test('unsafe video URLs cannot become links or embeds', () => {
  assert.deepEqual(awards.safeVideoLinks('javascript:alert(1)\nhttps://user:pass@example.com/a\nhttps://youtu.be/dQw4w9WgXcQ\nhttps://youtu.be/dQw4w9WgXcQ'), ['https://youtu.be/dQw4w9WgXcQ']);
});
test('nominee cards render footage, goal identity and nomination count without autoplay', () => {
  const React = require('react'); const { renderToStaticMarkup } = require('react-dom/server');
  const Card = loader()('src/components/goal-of-month/GoalNomineeCard.tsx').default;
  const html = renderToStaticMarkup(React.createElement(Card, { goal: { id: 'goal', fixtureId:'fixture',teamId:'home',monthKey:'2026-09',goalNumber:null,clipAssetId:'clip-2',clipNumber:2,clipUrl:'/api/goal-of-month/clips/goal',thumbnailUrl:'/api/goal-of-month/clips/goal/thumbnail',scorerName:'Test scorer',teamName:'Home FC',opponentName:'Away FC',teamLogoUrl:null,leagueName:'Test League',kickoffAt:'2026-09-03T19:00:00Z',nominationCount:3,voteCount:0,videoUrls:[] } }));
  assert.match(html, /Clip 2/); assert.match(html, /3 nominations/);
  assert.match(html, /<video/); assert.match(html, /thumbnail/); assert.equal(html.includes('<iframe'), false); assert.equal(html.includes('autoplay'), false);
});
test('native competition and dashboard reuse one clip component and one monthly API', () => {
  const panel = read('src/components/goal-of-month/MonthlyGoalsPanel.tsx');
  const dashboard = read('src/components/goal-of-week/GoalOfWeekDashboardPromo.tsx');
  for (const source of [panel, dashboard]) { assert.ok(source.includes('GoalNomineeCard')); assert.ok(source.includes('useMonthlyGoals')); }
  assert.ok(read('src/components/goal-of-month/useMonthlyGoals.ts').includes('/api/goal-of-month/community'));
  assert.equal(/MutationObserver|querySelector/.test(panel + dashboard), false);
});
