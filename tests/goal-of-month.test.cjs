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
const clipMigration = 'prisma/migrations/20260918181000_goal_of_month_clip_assets/migration.sql';
const renderMigration = 'prisma/migrations/20260919203000_goal_of_month_nominee_renders/migration.sql';
const brandingRequeueMigration = 'prisma/migrations/20260919223000_requeue_goal_month_branding_renders/migration.sql';
const overlayRefreshMigration = 'prisma/migrations/20260919234000_refresh_goal_month_overlay/migration.sql';
const scorerLinkMigration = 'prisma/migrations/20260920001000_goal_month_link_scorer/migration.sql';
const fontRefreshMigration = 'prisma/migrations/20260920002000_refresh_goal_month_font_renders/migration.sql';
const teamHighlightRefreshMigration = 'prisma/migrations/20260920010500_refresh_goal_month_team_highlight/migration.sql';
const finalVideoFlowMigration = 'prisma/migrations/20260920014500_refresh_goal_month_final_video_flow/migration.sql';
const visualPolishMigration = 'prisma/migrations/20260920015200_refresh_goal_month_video_visual_polish/migration.sql';
const titleReplaySpacingMigration = 'prisma/migrations/20260920175500_refresh_goal_month_title_replay_spacing/migration.sql';
const now = new Date('2026-09-20T12:00:00Z');
const input = (userId = 'u1', goalNumber = 1, fixtureId = 'fixture') => ({ userId, goalNumber, fixtureId, scoringTeamId: 'home', scorerTeamMemberId: 'member-home' });
globalThis.fetch = async () => { throw new Error('Real network requests are forbidden in goal award tests'); };
test.before(() => {
  const url = process.env.GOAL_MONTH_TEST_DATABASE_URL;
  assert.ok(url, 'Dedicated test database required');
  const parsed = new URL(url);
  assert.ok(['localhost', '127.0.0.1'].includes(parsed.hostname));
  assert.equal(parsed.pathname, '/sixfl_goal_month_test');
  sql = query => execFileSync('psql', [url, '-X', '-v', 'ON_ERROR_STOP=1', '-Atc', query], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  sql(`CREATE TABLE "User" (id TEXT PRIMARY KEY,name TEXT,email TEXT);
    CREATE TABLE "Team" (id TEXT PRIMARY KEY,name TEXT,"logoUrl" TEXT);
    CREATE TABLE "TeamMember" (id TEXT PRIMARY KEY,"userId" TEXT NOT NULL,"teamId" TEXT NOT NULL,role TEXT NOT NULL DEFAULT 'PLAYER',"createdAt" TIMESTAMP DEFAULT NOW());
    CREATE TABLE "TeamMemberProfile" (id TEXT PRIMARY KEY,"teamMemberId" TEXT UNIQUE,"squadNumber" INTEGER);
    CREATE TABLE "League" (id TEXT PRIMARY KEY,name TEXT);
    CREATE TABLE "Fixture" (id TEXT PRIMARY KEY,"homeTeamId" TEXT,"awayTeamId" TEXT,"leagueId" TEXT,"publishedAt" TIMESTAMP,"sixflTvRecorded" BOOLEAN,"sixflTvUrl" TEXT,status TEXT,"kickoffAt" TIMESTAMP);
    CREATE TABLE "MatchResult" ("fixtureId" TEXT PRIMARY KEY,"homeScore" INTEGER,"awayScore" INTEGER);
    CREATE TABLE "SixflTvFootageAsset" (
      id TEXT PRIMARY KEY, "fixtureId" TEXT, kind TEXT, filename TEXT,
      state TEXT, position INTEGER DEFAULT 0, "createdAt" TIMESTAMP DEFAULT NOW()
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
  sql(read(renderMigration));
  sql(read(scorerLinkMigration));
  sql(`UPDATE "GoalAwardTransition" SET "firstMonth"='2026-09',"weeklyNominationsCloseAt"='2026-09-13T23:00:00',"weeklyVotingClosesAt"='2026-09-15T17:00:00' WHERE id='monthly'`);
  db = new PrismaClient({ datasources: { db: { url } } });
  const load = loader({ '@/lib/prisma': { prisma: db } });
  awards = load('src/lib/goal-of-month/community.ts'); calendar = load('src/lib/goal-of-month/calendar.ts');
});
test.beforeEach(() => {
  sql(`TRUNCATE "GoalOfMonthVote","GoalOfMonthNomination","GoalOfMonthCandidate","SixflTvFootageAsset","MatchResult","Fixture","TeamMemberProfile","TeamMember","Team","League","User" CASCADE;
    INSERT INTO "User" (id,name,email) VALUES
      ('u1','Test Scorer','u1@example.com'),('u2','Second Player','u2@example.com'),
      ('u3','Third Player','u3@example.com'),('u4','Fourth Player','u4@example.com'),
      ('scorer-away','Away Scorer','away@example.com');
    INSERT INTO "Team" VALUES ('home','Home FC',NULL),('away','Away FC',NULL);
    INSERT INTO "TeamMember" (id,"userId","teamId",role) VALUES
      ('member-home','u1','home','PLAYER'),
      ('member-home-2','u2','home','BACKUP_PLAYER'),
      ('member-away','scorer-away','away','PLAYER');
    INSERT INTO "TeamMemberProfile" (id,"teamMemberId","squadNumber") VALUES
      ('profile-home','member-home',10),
      ('profile-away','member-away',9);
    INSERT INTO "League" VALUES ('league','Test League');
    INSERT INTO "Fixture" VALUES ('fixture','home','away','league',NOW(),TRUE,'https://youtu.be/dQw4w9WgXcQ','COMPLETED','2026-09-03T19:00:00'),
      ('previous','home','away','league',NOW(),TRUE,'https://youtu.be/dQw4w9WgXcQ','COMPLETED','2026-08-30T19:00:00');
    INSERT INTO "MatchResult" VALUES ('fixture',6,4),('previous',2,1);`);
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
test('new monthly nominations attach to the exact numbered SIXFL TV clip', async () => {
  sql(`UPDATE "Fixture" SET "sixflTvRecorded"=FALSE,"sixflTvUrl"=NULL WHERE id='fixture';
    INSERT INTO "SixflTvFootageAsset" (id,"fixtureId",kind,filename,state,position,"createdAt","clipNumber")
    VALUES ('clip-one','fixture','CLIP','goal.mp4','READY',0,NOW(),1);`);
  const result = await awards.nominateMonthlyGoal({
    userId: 'u1', fixtureId: 'fixture', scoringTeamId: 'home',
    clipAssetId: 'clip-one', scorerTeamMemberId: 'member-home',
  }, now);
  const goals = await awards.getMonthlyCandidates('2026-09');
  assert.equal(goals.length, 1);
  assert.equal(goals[0].clipAssetId, 'clip-one');
  assert.equal(Number(goals[0].clipNumber), 1);
  assert.equal(goals[0].goalNumber, null);
  const payload = awards.monthlyCandidatePayload(goals[0]);
  assert.equal(payload.clipVideoUrl, `/api/goal-of-month/clips/${result.candidateId}`);
  assert.equal(payload.thumbnailUrl, `/api/goal-of-month/thumbnails/${result.candidateId}?v=sixfl-gotm-9`);
  assert.equal(payload.scorerTeamMemberId, 'member-home');
  assert.equal(payload.scorerName, 'Test Scorer');
  assert.equal(sql(`SELECT "state" FROM "GoalOfMonthClipRender" WHERE "candidateId"='${result.candidateId}'`), 'QUEUED');
});

test('new nominations persist a verified squad player identity and reject players from the other team', async () => {
  const created = await awards.nominateMonthlyGoal(input('u1'), now);
  assert.equal(sql(`SELECT "scorerTeamMemberId" || '|' || "scorerName" FROM "GoalOfMonthCandidate" WHERE "id"='${created.candidateId}'`), 'member-home|Test Scorer');
  await assert.rejects(
    awards.nominateMonthlyGoal({ userId:'u2', goalNumber:2, fixtureId:'fixture', scoringTeamId:'home', scorerTeamMemberId:'member-away' }, now),
    /scorer from that team.*squad|scoring team/i,
  );
  const [fixture] = await awards.getMonthlyFixtures('2026-09', db, 'fixture');
  assert.deepEqual(
    fixture.squadPlayers.filter(player => player.teamId === 'home').map(player => [player.teamMemberId, player.name, player.squadNumber]),
    [['member-home','Test Scorer',10],['member-home-2','Second Player',null]],
  );
});

test('admin can upgrade a legacy goal-number nominee to an exact clip without losing nominations or votes', async () => {
  const legacy = await awards.nominateMonthlyGoal(input('u1', 1), now);
  sql(`INSERT INTO "GoalOfMonthVote" ("id","candidateId","userId","monthKey") VALUES ('legacy-vote','${legacy.candidateId}','u2','2026-09');
    INSERT INTO "SixflTvFootageAsset" (id,"fixtureId",kind,filename,state,position,"createdAt","clipNumber")
    VALUES ('legacy-upgrade-clip','fixture','CLIP','legacy-goal.mp4','READY',0,NOW(),7);`);
  const result = await db.$transaction(tx => awards.switchLegacyMonthlyCandidateToClip(legacy.candidateId, 'legacy-upgrade-clip', tx));
  assert.equal(result.candidateId, legacy.candidateId);
  assert.equal(result.clipAssetId, 'legacy-upgrade-clip');
  assert.equal(result.clipNumber, 7);
  assert.equal(result.nominationCount, 1);
  assert.equal(result.voteCount, 1);
  assert.equal(sql(`SELECT COALESCE("goalNumber"::text,'NULL') || '|' || COALESCE("clipAssetId",'NULL') FROM "GoalOfMonthCandidate" WHERE "id"='${legacy.candidateId}'`), 'NULL|legacy-upgrade-clip');
  assert.equal(sql(`SELECT "state" || '|' || "sourceAssetId" FROM "GoalOfMonthClipRender" WHERE "candidateId"='${legacy.candidateId}'`), 'QUEUED|legacy-upgrade-clip');
});

test('branding refresh requeues existing active nominee renders while preserving the old object until replacement', async () => {
  sql(`UPDATE "Fixture" SET "sixflTvRecorded"=FALSE,"sixflTvUrl"=NULL WHERE id='fixture';
    INSERT INTO "SixflTvFootageAsset" (id,"fixtureId",kind,filename,state,position,"createdAt","clipNumber")
    VALUES ('branding-refresh-clip','fixture','CLIP','goal.mp4','READY',0,NOW(),1);`);
  const nomination = await awards.nominateMonthlyGoal({
    userId: 'u1', fixtureId: 'fixture', scoringTeamId: 'home',
    clipAssetId: 'branding-refresh-clip', scorerTeamMemberId: 'member-home',
  }, now);
  sql(`UPDATE "GoalOfMonthClipRender"
    SET "state"='READY',"objectKey"='old-render.mp4',"sizeBytes"=123,"durationMs"=22000,
        "leaseToken"='old-lease',"busyUntil"=NOW(),"completedAt"=NOW()
    WHERE "candidateId"='${nomination.candidateId}'`);
  sql(read(brandingRequeueMigration));
  const state = sql(`SELECT "state" || '|' || "objectKey" || '|' || COALESCE("leaseToken",'NULL') || '|' || ("completedAt" IS NULL)::text
    FROM "GoalOfMonthClipRender" WHERE "candidateId"='${nomination.candidateId}'`);
  assert.equal(state, 'QUEUED|old-render.mp4|NULL|true');
});

test('overlay readability refresh requeues completed nominee renders without discarding the old object', async () => {
  sql(`UPDATE "Fixture" SET "sixflTvRecorded"=FALSE,"sixflTvUrl"=NULL WHERE id='fixture';
    INSERT INTO "SixflTvFootageAsset" (id,"fixtureId",kind,filename,state,position,"createdAt","clipNumber")
    VALUES ('overlay-refresh-clip','fixture','CLIP','goal.mp4','READY',0,NOW(),1);`);
  const nomination = await awards.nominateMonthlyGoal({
    userId: 'u1', fixtureId: 'fixture', scoringTeamId: 'home',
    clipAssetId: 'overlay-refresh-clip', scorerTeamMemberId: 'member-home',
  }, now);
  sql(`UPDATE "GoalOfMonthClipRender"
    SET "state"='READY',"objectKey"='old-overlay-render.mp4',"sizeBytes"=123,"durationMs"=22000,
        "completedAt"=NOW()
    WHERE "candidateId"='${nomination.candidateId}'`);
  sql(read(overlayRefreshMigration));
  const state = sql(`SELECT "state" || '|' || "objectKey" || '|' || ("completedAt" IS NULL)::text
    FROM "GoalOfMonthClipRender" WHERE "candidateId"='${nomination.candidateId}'`);
  assert.equal(state, 'QUEUED|old-overlay-render.mp4|true');
});

test('font rendering refresh requeues completed nominee renders while keeping their previous object until replacement', async () => {
  sql(`UPDATE "Fixture" SET "sixflTvRecorded"=FALSE,"sixflTvUrl"=NULL WHERE id='fixture';
    INSERT INTO "SixflTvFootageAsset" (id,"fixtureId",kind,filename,state,position,"createdAt","clipNumber")
    VALUES ('font-refresh-clip','fixture','CLIP','goal.mp4','READY',0,NOW(),1);`);
  const nomination = await awards.nominateMonthlyGoal({
    userId: 'u1', fixtureId: 'fixture', scoringTeamId: 'home',
    clipAssetId: 'font-refresh-clip', scorerTeamMemberId: 'member-home',
  }, now);
  sql(`UPDATE "GoalOfMonthClipRender"
    SET "state"='READY',"objectKey"='old-font-render.mp4',"sizeBytes"=123,"durationMs"=22000,
        "completedAt"=NOW()
    WHERE "candidateId"='${nomination.candidateId}'`);
  sql(read(fontRefreshMigration));
  const state = sql(`SELECT "state" || '|' || "objectKey" || '|' || ("completedAt" IS NULL)::text
    FROM "GoalOfMonthClipRender" WHERE "candidateId"='${nomination.candidateId}'`);
  assert.equal(state, 'QUEUED|old-font-render.mp4|true');
});

test('scorer-team highlight refresh requeues completed nominee renders while retaining the previous object', async () => {
  sql(`UPDATE "Fixture" SET "sixflTvRecorded"=FALSE,"sixflTvUrl"=NULL WHERE id='fixture';
    INSERT INTO "SixflTvFootageAsset" (id,"fixtureId",kind,filename,state,position,"createdAt","clipNumber")
    VALUES ('team-highlight-clip','fixture','CLIP','goal.mp4','READY',0,NOW(),1);`);
  const nomination = await awards.nominateMonthlyGoal({
    userId: 'u1', fixtureId: 'fixture', scoringTeamId: 'home',
    clipAssetId: 'team-highlight-clip', scorerTeamMemberId: 'member-home',
  }, now);
  sql(`UPDATE "GoalOfMonthClipRender"
    SET "state"='READY',"objectKey"='old-team-highlight-render.mp4',"sizeBytes"=123,"durationMs"=22000,
        "completedAt"=NOW()
    WHERE "candidateId"='${nomination.candidateId}'`);
  sql(read(teamHighlightRefreshMigration));
  const state = sql(`SELECT "state" || '|' || "objectKey" || '|' || ("completedAt" IS NULL)::text
    FROM "GoalOfMonthClipRender" WHERE "candidateId"='${nomination.candidateId}'`);
  assert.equal(state, 'QUEUED|old-team-highlight-render.mp4|true');
});

test('final nominee video flow refresh requeues completed renders while preserving the old object until replacement', async () => {
  sql(`UPDATE "Fixture" SET "sixflTvRecorded"=FALSE,"sixflTvUrl"=NULL WHERE id='fixture';
    INSERT INTO "SixflTvFootageAsset" (id,"fixtureId",kind,filename,state,position,"createdAt","clipNumber")
    VALUES ('final-flow-clip','fixture','CLIP','goal.mp4','READY',0,NOW(),1);`);
  const nomination = await awards.nominateMonthlyGoal({
    userId: 'u1', fixtureId: 'fixture', scoringTeamId: 'home',
    clipAssetId: 'final-flow-clip', scorerTeamMemberId: 'member-home',
  }, now);
  sql(`UPDATE "GoalOfMonthClipRender"
    SET "state"='READY',"objectKey"='old-final-flow-render.mp4',"sizeBytes"=123,"durationMs"=22000,
        "completedAt"=NOW()
    WHERE "candidateId"='${nomination.candidateId}'`);
  sql(read(finalVideoFlowMigration));
  const state = sql(`SELECT "state" || '|' || "objectKey" || '|' || ("completedAt" IS NULL)::text
    FROM "GoalOfMonthClipRender" WHERE "candidateId"='${nomination.candidateId}'`);
  assert.equal(state, 'QUEUED|old-final-flow-render.mp4|true');
});

test('visual polish refresh requeues completed nominee renders while keeping the current object until replacement', async () => {
  sql(`UPDATE "Fixture" SET "sixflTvRecorded"=FALSE,"sixflTvUrl"=NULL WHERE id='fixture';
    INSERT INTO "SixflTvFootageAsset" (id,"fixtureId",kind,filename,state,position,"createdAt","clipNumber")
    VALUES ('visual-polish-clip','fixture','CLIP','goal.mp4','READY',0,NOW(),1);`);
  const nomination = await awards.nominateMonthlyGoal({
    userId: 'u1', fixtureId: 'fixture', scoringTeamId: 'home',
    clipAssetId: 'visual-polish-clip', scorerTeamMemberId: 'member-home',
  }, now);
  sql(`UPDATE "GoalOfMonthClipRender"
    SET "state"='READY',"objectKey"='old-visual-polish-render.mp4',"sizeBytes"=123,"durationMs"=22000,
        "completedAt"=NOW()
    WHERE "candidateId"='${nomination.candidateId}'`);
  sql(read(visualPolishMigration));
  const state = sql(`SELECT "state" || '|' || "objectKey" || '|' || ("completedAt" IS NULL)::text
    FROM "GoalOfMonthClipRender" WHERE "candidateId"='${nomination.candidateId}'`);
  assert.equal(state, 'QUEUED|old-visual-polish-render.mp4|true');
});

test('title and replay spacing refresh requeues completed nominee renders while preserving the current object', async () => {
  sql(`UPDATE "Fixture" SET "sixflTvRecorded"=FALSE,"sixflTvUrl"=NULL WHERE id='fixture';
    INSERT INTO "SixflTvFootageAsset" (id,"fixtureId",kind,filename,state,position,"createdAt","clipNumber")
    VALUES ('title-replay-spacing-clip','fixture','CLIP','goal.mp4','READY',0,NOW(),1);`);
  const nomination = await awards.nominateMonthlyGoal({
    userId: 'u1', fixtureId: 'fixture', scoringTeamId: 'home',
    clipAssetId: 'title-replay-spacing-clip', scorerTeamMemberId: 'member-home',
  }, now);
  sql(`UPDATE "GoalOfMonthClipRender"
    SET "state"='READY',"objectKey"='old-title-replay-render.mp4',"sizeBytes"=123,"durationMs"=22000,
        "completedAt"=NOW()
    WHERE "candidateId"='${nomination.candidateId}'`);
  sql(read(titleReplaySpacingMigration));
  const state = sql(`SELECT "state" || '|' || "objectKey" || '|' || ("completedAt" IS NULL)::text
    FROM "GoalOfMonthClipRender" WHERE "candidateId"='${nomination.candidateId}'`);
  assert.equal(state, 'QUEUED|old-title-replay-render.mp4|true');
});

test('concurrent requests cannot exceed three nominations per account and month', async () => {
  const results = await Promise.allSettled([1,2,3,4].map(number => awards.nominateMonthlyGoal(input('u1', number), now)));
  assert.equal(results.filter(result => result.status === 'fulfilled').length, 3);
  assert.equal(sql('SELECT COUNT(*) FROM "GoalOfMonthNomination"'), '3');
});
test('match date rather than upload date controls eligibility, with recorded completed fixtures only', async () => {
  await assert.rejects(awards.nominateMonthlyGoal(input('u1', 1, 'previous'), now), /closed/);
  await assert.rejects(awards.nominateMonthlyGoal(input('u1', 11), now), /goal number/);
  await assert.rejects(awards.nominateMonthlyGoal({ ...input(), scoringTeamId: 'another' }, now), /scoring team/);
  for (const assignment of ["status='SCHEDULED'", '"sixflTvRecorded"=FALSE', '"publishedAt"=NULL']) {
    sql(`UPDATE "Fixture" SET ${assignment} WHERE id='fixture'`);
    await assert.rejects(awards.nominateMonthlyGoal(input(), now), /completed/);
    sql(`UPDATE "Fixture" SET status='COMPLETED',"sixflTvRecorded"=TRUE,"publishedAt"=NOW() WHERE id='fixture'`);
  }
  await assert.rejects(awards.nominateMonthlyGoal(input(), new Date('2026-10-06T12:00:00Z')), /closed/);
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
  const html = renderToStaticMarkup(React.createElement(Card, { goal: { id: 'goal', fixtureId:'fixture',teamId:'home',monthKey:'2026-09',goalNumber:2,scorerName:'Test scorer',teamName:'Home FC',opponentName:'Away FC',teamLogoUrl:null,leagueName:'Test League',kickoffAt:'2026-09-03T19:00:00Z',nominationCount:3,voteCount:0,videoUrls:['https://youtu.be/dQw4w9WgXcQ'] } }));
  assert.match(html, /Watch footage/); assert.match(html, /Goal 2/); assert.match(html, /3 nominations/);
  assert.equal(html.includes('<iframe'), false); assert.equal(html.includes('autoplay'), false);
});
test('clip nominees hide internal clip numbers and force the current poster version', () => {
  const React = require('react'); const { renderToStaticMarkup } = require('react-dom/server');
  const Card = loader()('src/components/goal-of-month/GoalNomineeCard.tsx').default;
  const html = renderToStaticMarkup(React.createElement(Card, { goal: {
    id:'clip-goal', fixtureId:'fixture', teamId:'home', monthKey:'2026-09',
    goalNumber:null, clipNumber:7, clipAssetId:'clip-one', scorerName:'Test scorer',
    teamName:'Home FC', opponentName:'Away FC', teamLogoUrl:null, leagueName:'Test League',
    kickoffAt:'2026-09-03T19:00:00Z', nominationCount:3, voteCount:0,
    clipVideoUrl:'/api/goal-of-month/clips/clip-goal',
    thumbnailUrl:'/api/goal-of-month/thumbnails/clip-goal?v=sixfl-gotm-9',
    videoUrls:[],
  } }));
  assert.match(html, /Goal of the Month nominee/);
  assert.match(html, /sixfl-gotm-9/);
  assert.equal(html.includes('Clip 7'), false);
  const thumbnailRoute = read('src/app/api/goal-of-month/thumbnails/[candidateId]/route.ts');
  assert.match(thumbnailRoute, /private, no-store, max-age=0/);
});

test('existing nominees are backed rather than re-nominated before the finalist vote', () => {
  const panel = read('src/components/goal-of-month/MonthlyGoalsPanel.tsx').replace(/\s+/g, ' ');
  const promo = read('src/components/goal-of-week/GoalOfWeekDashboardPromo.tsx');
  assert.match(panel, /Back this goal/);
  assert.match(panel, /You backed this goal/);
  assert.match(panel, /Each different player who backs a goal adds to its nomination total/);
  assert.match(panel, /Backing a goal uses one of your three monthly nominations/);
  assert.match(promo, /Nominate \/ back goals/);
  assert.match(promo, /six most-backed nominees go to the player vote/);
  assert.doesNotMatch(panel, /actionLabel=.*Nominate this goal/);
});

test('native competition and dashboard reuse one clip component and one monthly API', () => {
  const panel = read('src/components/goal-of-month/MonthlyGoalsPanel.tsx').replace(/\s+/g, ' ');
  const dashboard = read('src/components/goal-of-week/GoalOfWeekDashboardPromo.tsx');
  for (const source of [panel, dashboard]) { assert.ok(source.includes('GoalNomineeCard')); assert.ok(source.includes('useMonthlyGoals')); }
  assert.ok(read('src/components/goal-of-month/useMonthlyGoals.ts').includes('/api/goal-of-month/community'));
  assert.equal(/MutationObserver|querySelector/.test(panel + dashboard), false);
});


test('Goal of the Month admin links scorers to squad members instead of free text', () => {
  const admin = read('src/app/(admin)/admin/sixfl-tv/goal-of-month/page.tsx');
  const publicPanel = read('src/components/goal-of-month/MonthlyGoalsPanel.tsx').replace(/\s+/g, ' ');
  assert.match(admin, /name="scorerTeamMemberId"/);
  assert.match(admin, /FormListboxField/);
  assert.match(admin, /Scorer missing\? Open team squad/);
  assert.doesNotMatch(admin, /name="scorerName"/);
  assert.match(publicPanel, /Choose the scorer from the squad/);
  assert.match(publicPanel, /Ask the captain to add the scorer to the SIXFL squad/);
  assert.doesNotMatch(publicPanel, /name="scorerName"/);
});


test('Goal of the Month intro may show the scorer-team score, while the approved thumbnail stays score-free', () => {
  const graphics = read('src/lib/sixfl-tv/graphics.ts');
  const thumbnailStart = graphics.indexOf('export async function createGoalOfMonthNominationThumbnail');
  const introStart = graphics.indexOf('export async function createGoalOfMonthNomineeIntro');
  const overlayStart = graphics.indexOf('export async function createGoalOfMonthClipOverlay');
  assert.ok(thumbnailStart >= 0 && introStart > thumbnailStart && overlayStart > introStart);
  const thumbnail = graphics.slice(thumbnailStart, introStart);
  const intro = graphics.slice(introStart, overlayStart);

  assert.doesNotMatch(thumbnail, /homeScore|awayScore|FT|leagueName|matchDate/);
  assert.match(thumbnail, /MATCHWEEK/);
  assert.match(thumbnail, /NOMINEE/);

  assert.match(intro, /const scorerIsHome =/);
  assert.match(intro, /const scorerIsAway =/);
  assert.match(intro, /const homeFill = scorerIsHome \? "#10b981" : "#cbd5e1"/);
  assert.match(intro, /const awayFill = scorerIsAway \? "#10b981" : "#cbd5e1"/);
  assert.match(intro, /String\(input\.homeScore\)/);
  assert.match(intro, /String\(input\.awayScore\)/);
  assert.match(intro, /fill: homeFill/);
  assert.match(intro, /fill: awayFill/);
  assert.match(intro, /GOAL OF THE MONTH NOMINEE/);
  assert.match(intro, /MATCHWEEK/);
  assert.match(intro, /leagueText/);
  assert.match(intro, /fixedCanvasTextPng\(\{ text: league/);
  assert.match(intro, /left: 410, top: 874/);
  assert.match(intro, /align: "center"/);
});

test('Goal of the Month intro keeps the team name clear of the scorer', () => {
  const graphics = read('src/lib/sixfl-tv/graphics.ts');
  const introStart = graphics.indexOf('export async function createGoalOfMonthNomineeIntro');
  const overlayStart = graphics.indexOf('export async function createGoalOfMonthClipOverlay', introStart);
  const intro = graphics.slice(introStart, overlayStart);
  assert.match(intro, /fontSize: 28/);
  assert.match(intro, /\{ input: scorerText, left: 500, top: 350 \}/);
  assert.match(intro, /\{ input: teamText, left: 504, top: 482 \}/);
});

test('Goal of the Month vote card carries the actual competition dates', () => {
  const graphics = read('src/lib/sixfl-tv/graphics.ts');
  const worker = read('scripts/sixfl-tv-worker.ts');
  assert.match(graphics, /REMEMBER TO VOTE/);
  assert.match(graphics, /SIXFL\.CO\.UK\/GOAL-OF-THE-MONTH/);
  assert.match(graphics, /WATCH THE NOMINEES\. PICK YOUR FAVOURITE\./);
  assert.match(worker, /NOMINATIONS CLOSE ·/);
  assert.match(worker, /VOTING ·/);
  assert.match(worker, /WINNER ANNOUNCED ·/);
  assert.doesNotMatch(worker, /23:59/);
  assert.match(worker, /monthlyPeriod\(key\)/);
});


test('Goal of the Month video graphics use restrained SIXFL green and a non-clipping replay label', () => {
  const graphics = read('src/lib/sixfl-tv/graphics.ts');
  const introStart = graphics.indexOf('export async function createGoalOfMonthNomineeIntro');
  const overlayStart = graphics.indexOf('export async function createGoalOfMonthClipOverlay', introStart);
  const voteStart = graphics.indexOf('export async function createGoalOfMonthVoteCard', overlayStart);
  const scoreBugStart = graphics.indexOf('export async function createSixflTvScoreBug', voteStart);
  const intro = graphics.slice(introStart, overlayStart);
  const overlay = graphics.slice(overlayStart, voteStart);
  const vote = graphics.slice(voteStart, scoreBugStart);

  assert.doesNotMatch(intro, /#2dd4bf/);
  assert.doesNotMatch(overlay, /#2dd4bf/);
  assert.doesNotMatch(vote, /#2dd4bf/);
  assert.match(overlay, /const replayWidth = 144/);
  assert.match(overlay, /const replayHeight = 42/);
  assert.match(overlay, /fill="#07110d" stroke="#10b981"/);
  assert.match(overlay, /fontSize: 14/);
  assert.match(vote, /input\.nominationsCloseLabel/);
  assert.match(vote, /input\.winnerLabel/);
});
