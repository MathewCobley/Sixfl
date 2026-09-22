const assert = require('node:assert/strict');
const fs = require('node:fs');
const { execFileSync } = require('node:child_process');
const { PGlite } = require(process.env.PGLITE_MODULE || '@electric-sql/pglite');
const ts = require('typescript');
const { Prisma } = require('@prisma/client');
const migration = 'prisma/migrations/20260922233000_early_match_reports/migration.sql';
const ownGoalMigration = 'prisma/migrations/20260922234500_own_goal_match_reports/migration.sql';
function load(file, mocks) {
  const mod = { exports: {} };
  const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText;
  new Function('require', 'module', 'exports', code)(id => mocks[id] || require(id), mod, mod.exports);
  return mod.exports;
}
(async () => {
  const db = new PGlite();
  try {
    const schema = execFileSync('node', ['node_modules/prisma/build/index.js', 'migrate', 'diff', '--from-empty', '--to-schema-datamodel', 'prisma/schema.prisma', '--script'], { encoding: 'utf8', env: { ...process.env, DATABASE_URL: 'postgresql://unused:unused@localhost:5432/unused' }, stdio: ['ignore', 'pipe', 'pipe'] });
    await db.exec(schema);
    await db.exec('DROP TABLE "FixtureMatchReport"');
    await db.exec(fs.readFileSync('prisma/migrations/20260803010000_canonical_player_match_performance/migration.sql', 'utf8'));
    await db.exec(fs.readFileSync(migration, 'utf8'));
    await db.exec(fs.readFileSync(ownGoalMigration, 'utf8'));
    const query = async (strings, ...values) => {
      const sql = strings.text ? strings : Prisma.sql(strings, ...values);
      return (await db.query(sql.text, sql.values)).rows;
    };
    const { getMatchReportWarnings } = load('src/lib/match-reports/review.ts', { '@/lib/prisma': { prisma: { $queryRaw: query } } });
    await db.exec(`INSERT INTO "League" ("id","name","slug","updatedAt") VALUES ('l','Test league','test',NOW());
      INSERT INTO "Team" ("id","name","claimCode","updatedAt") VALUES ('a','Test A','a',NOW()),('b','Test B','b',NOW());
      INSERT INTO "User" ("id","name") VALUES ('u1','Player A'),('u2','Player B');
      INSERT INTO "TeamMember" ("id","userId","teamId") VALUES ('m1','u1','a'),('m2','u2','b');`);
    async function fixture(id) { await db.query(`INSERT INTO "Fixture" ("id","leagueId","homeTeamId","awayTeamId","kickoffAt","publishedAt","updatedAt") VALUES ($1,'l','a','b',NOW()-INTERVAL '1 day',NOW()-INTERVAL '2 days',NOW())`, [id]); }
    async function draft(id, team, goals, member, name, ownGoals = 0) {
      await db.query(`INSERT INTO "FixtureMatchReport" ("fixtureId","teamId","contributions","performances","ownGoals","playerOfMatchName","coreCompletedAt","assistsCompletedAt","ratingsCompletedAt","updatedAt") VALUES ($1,$2,$3,$4,$5,$6,'2026-09-22 20:00','2026-09-22 20:00','2026-09-22 20:00',NOW())`, [id, team, JSON.stringify([{ teamMemberId: member, name, goals, assists: goals > 0 ? 1 : 0 }]), JSON.stringify([{ teamMemberId: member, rating: 9.2 }]), ownGoals, name]);
    }
    await fixture('f1');
    await draft('f1','a',5,'m1','Player A');
    await draft('f1','b',0,'m2','Player B',1);
    assert.equal((await query`SELECT * FROM "MatchResult"`).length, 0, 'saving reports must not fabricate scores');
    assert.equal((await query`SELECT * FROM "PlayerMatchPerformance"`).length, 0, 'pending reports do not change published player stats');
    await db.exec(`INSERT INTO "MatchResult" ("id","fixtureId","homeScore","awayScore","updatedAt") VALUES ('r1','f1',3,1,NOW())`);
    const metas = await query`SELECT * FROM "MatchResultTeamMeta" ORDER BY "teamId"`;
    assert.equal(metas.length, 2); assert.equal(metas[0].goalsRecorded,5); assert.equal(metas[0].ownGoals,0); assert.equal(metas[0].priorityCoreCompletedAt,null);
    const awayMeta=(await query`SELECT "goalsRecorded","ownGoals","priorityCoreCompletedAt"::text AS stamp FROM "MatchResultTeamMeta" WHERE "teamId"='b'`)[0];
    assert.equal(awayMeta.goalsRecorded,0); assert.equal(awayMeta.ownGoals,1);
    assert.equal(awayMeta.stamp, '2026-09-22 20:00:00', 'an own goal can complete the official team score without inventing a player scorer');
    const performances = await query`SELECT * FROM "PlayerMatchPerformance" ORDER BY "teamId"`;
    assert.equal(performances.length,2); assert.equal(performances[0].rating,9.2); assert.equal(performances[0].goals,5); assert.equal(performances[0].appearanceRecorded,true); assert.equal(performances[0].isPlayerOfMatch,true);
    let warnings = await getMatchReportWarnings(); assert.equal(warnings.length,1); assert.equal(warnings[0].teamId,'a'); assert.equal(warnings[0].goalsExpected,3);
    await db.exec(`UPDATE "MatchResult" SET "homeScore"=5 WHERE "id"='r1'`);
    assert.equal((await getMatchReportWarnings()).length,0,'score correction clears warning');
    await db.exec(`UPDATE "MatchResultTeamMeta" SET "goalsRecorded"=2,"scorers"='[{"teamMemberId":"m1","name":"Player A","goals":2,"assists":0}]' WHERE "teamId"='a'`);
    await db.exec(`UPDATE "MatchResult" SET "homeScore"=2 WHERE "id"='r1'`);
    assert.equal((await query`SELECT "goalsRecorded" FROM "MatchResultTeamMeta" WHERE "teamId"='a'`)[0].goalsRecorded,2,'later result edits never re-import stale draft');
    await db.exec(`INSERT INTO "MatchResultOverturn" ("id","matchResultId","fixtureId","homeTeamId","awayTeamId","homeTeamName","awayTeamName","originalHomeScore","originalAwayScore","originalEnteredAt","awardedHomeScore","awardedAwayScore","reasonCode","evidenceNote","rulesBasis","decidedByUserId","decidedByName") VALUES ('o1','r1','f1','a','b','Test A','Test B',2,1,NOW(),0,3,'PLAYER_LIMIT','Test evidence','Test rule','u1','Test admin'); UPDATE "MatchResult" SET "homeScore"=0,"awayScore"=3 WHERE "id"='r1'`);
    assert.equal((await getMatchReportWarnings()).length,0,'overturned result compares report with original played score');
    await db.exec(`UPDATE "MatchResultTeamMeta" SET "scorers"='[{"teamMemberId":"m2","name":"Player B","goals":1,"assists":2}]' WHERE "teamId"='b'`);
    assert.equal((await getMatchReportWarnings('f1'))[0].assistsRecorded,2,'excess assists are flagged too');
    assert.equal((await getMatchReportWarnings(undefined,[])).length,0);
    assert.equal((await getMatchReportWarnings(undefined,['other-fixture'])).length,0,'night board warnings stay scoped to visible fixtures');
    await fixture('f2'); await draft('f2','a',1,'m1','Player A');
    await db.exec(`DELETE FROM "TeamMember" WHERE "id"='m1'`);
    await db.exec(`INSERT INTO "MatchResult" ("id","fixtureId","homeScore","awayScore","updatedAt") VALUES ('r2','f2',1,0,NOW())`);
    assert.equal((await query`SELECT * FROM "MatchResult" WHERE "id"='r2'`).length,1,'removed member does not block official result');
    await fixture('f3'); await draft('f3','a',1,'removed','Old member');
    await db.exec(`UPDATE "Fixture" SET "homeTeamId"='b',"awayTeamId"='b' WHERE "id"='f3'`);
    await db.exec(`INSERT INTO "MatchResult" ("id","fixtureId","homeScore","awayScore","updatedAt") VALUES ('r3','f3',1,0,NOW())`);
    assert.equal((await query`SELECT * FROM "MatchResultTeamMeta" WHERE "matchResultId"='r3'`).length,0,'replaced team report cannot attach to another team');
    console.log('PASS: real PostgreSQL migration, own goals, both teams, promotion, player evidence, excess goals, corrections, timestamps, removed members and replaced teams.');
  } finally { await db.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
