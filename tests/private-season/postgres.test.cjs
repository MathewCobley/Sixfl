const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { execFileSync } = require('node:child_process');
const { PrismaClient } = require('@prisma/client');
const { sourceLoader } = require('./load.cjs');

const connection = process.env.SEASON_TEST_DATABASE_URL;
assert.ok(connection, 'SEASON_TEST_DATABASE_URL is required; never fall back to production DATABASE_URL');
const url = new URL(connection);
assert.ok(['127.0.0.1', 'localhost'].includes(url.hostname) && url.pathname === '/season_test', 'Only the isolated localhost season_test database is allowed');
const schema = `private_season_${process.pid}`;
const datasource = new URL(connection);
datasource.searchParams.set('schema', schema);
const prisma = new PrismaClient({ datasources: { db: { url: datasource.toString() } } });
const load = sourceLoader({ '@/lib/prisma': { prisma } });
const competition = load('src/lib/league-competitions.ts');
const membership = load('src/lib/league-season-teams.ts');
const { makeLeagueSeasonCurrent } = load('src/lib/leagues/season-activation.ts');
const runSql = (sql) => execFileSync('psql', [connection, '-X', '-v', 'ON_ERROR_STOP=1', '-q'], {
  input: `SET search_path TO "${schema}";\n${sql}`, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'],
});
const read = (path) => fs.readFileSync(path, 'utf8');
const raw = (sql) => prisma.$queryRawUnsafe(sql);
const current = async () => (await raw('SELECT "currentLeagueId" FROM "LeagueCompetition" WHERE id=\'c\''))[0].currentLeagueId;
const pointers = () => raw('SELECT id, "leagueId", "competitionId", "divisionId" FROM "Team" WHERE NOT "isFixturePlaceholder" ORDER BY id');
const history = () => raw('SELECT id, "leagueId", status, "publishedAt", score, "amountPence" FROM "Fixture" ORDER BY id');
const create = (name, copyTeams = true) => competition.createNextLeagueSeason({ sourceLeagueId: 'old', seasonName: name, copyTeams });
const activate = (leagueId, expectedCurrentLeagueId = 'old', confirmed = true) => makeLeagueSeasonCurrent({ leagueId, expectedCurrentLeagueId, confirmed });

const ddl = `
CREATE TYPE "PreferredNight" AS ENUM ('TUESDAY');
CREATE TYPE "LeagueType" AS ENUM ('MENS');
CREATE TYPE "TeamMode" AS ENUM ('STANDARD', 'MANAGED');
CREATE TABLE "LeagueCompetition" (
 id text PRIMARY KEY, name text, slug text UNIQUE, "currentLeagueId" text,
 "isActive" boolean NOT NULL DEFAULT true, area text, "dayOfWeek" "PreferredNight",
 "leagueType" "LeagueType", "venueName" text,
 "createdAt" timestamp(3) DEFAULT NOW(), "updatedAt" timestamp(3) DEFAULT NOW()
);
CREATE TABLE "League" (
 id text PRIMARY KEY, name text, slug text UNIQUE, season text,
 "isActive" boolean NOT NULL DEFAULT true, "competitionId" text REFERENCES "LeagueCompetition"(id),
 "publicAt" timestamp(3) DEFAULT NOW(), area text, "dayOfWeek" "PreferredNight", "leagueType" "LeagueType",
 "venueName" text, "kickoffInfo" text, format text, surface text, description text,
 "heroImageUrl" text, "badgeUrl" text, "ctaText" text, "requiredRefereesPerNight" int DEFAULT 1,
 "proposedStartDate" timestamp(3), "minutesPerGame" int DEFAULT 40,
 "costPerTeamPerMatchPence" int DEFAULT 4000, "targetTeamCount" int DEFAULT 12,
 "createdAt" timestamp(3) DEFAULT NOW(), "updatedAt" timestamp(3) DEFAULT NOW()
);
CREATE TABLE "LeagueDivision" (
 id text PRIMARY KEY, "leagueId" text REFERENCES "League"(id), name text, slug text, "sortOrder" int,
 "isActive" boolean DEFAULT true, "createdAt" timestamp(3) DEFAULT NOW(), "updatedAt" timestamp(3) DEFAULT NOW()
);
CREATE TABLE "Team" (
 id text PRIMARY KEY, name text, "leagueId" text REFERENCES "League"(id), "competitionId" text REFERENCES "LeagueCompetition"(id),
 "divisionId" text REFERENCES "LeagueDivision"(id), "logoUrl" text, "contactEmail" text, "contactPhone" text,
 "isFixturePlaceholder" boolean DEFAULT false, "claimCode" text, "teamMode" "TeamMode" DEFAULT 'STANDARD',
 "isRecruiting" boolean DEFAULT false, "createdAt" timestamp(3) DEFAULT NOW(), "updatedAt" timestamp(3) DEFAULT NOW()
);
CREATE TABLE "LeagueSeasonTeam" (
 id text PRIMARY KEY, "leagueId" text REFERENCES "League"(id), "teamId" text REFERENCES "Team"(id),
 "divisionId" text REFERENCES "LeagueDivision"(id), "isActive" boolean DEFAULT true,
 "createdAt" timestamp(3) DEFAULT NOW(), "updatedAt" timestamp(3) DEFAULT NOW(), UNIQUE("leagueId", "teamId")
);
CREATE TABLE "Fixture" (
 id text PRIMARY KEY, "leagueId" text REFERENCES "League"(id), status text,
 "publishedAt" timestamp(3), score text, "amountPence" int
);
`;

async function seed() {
  runSql(`TRUNCATE "Fixture", "LeagueSeasonTeam", "Team", "LeagueDivision", "League", "LeagueCompetition" CASCADE;
    INSERT INTO "LeagueCompetition" (id,name,slug,"currentLeagueId") VALUES ('c','Test competition','test','old'),('other','Other','other','other-season');
    INSERT INTO "League" (id,name,slug,season,"competitionId","publicAt") VALUES
      ('old','Test','test-summer-2026','Summer 2026','c','2026-01-01'),
      ('other-season','Other','other-summer-2026','Summer 2026','other','2026-01-01');
    INSERT INTO "LeagueDivision" (id,"leagueId",name,slug,"sortOrder") VALUES ('old-div','old','Premiership','premiership',1);
    INSERT INTO "Team" (id,name,"leagueId","competitionId","divisionId") VALUES
      ('t1','Test One','old','c','old-div'),('t2','Test Two','old','c',NULL);
    INSERT INTO "Fixture" VALUES ('historic','old','COMPLETED','2026-01-02','4-1',4000);`);
}

test('private preparation and explicit switch preserve live seasons with real database triggers', async (t) => {
  execFileSync('psql', [connection, '-X', '-v', 'ON_ERROR_STOP=1', '-q', '-c', `CREATE SCHEMA "${schema}"`]);
  try {
    runSql(ddl);
    // Start with the existing live triggers, then apply only our forward migration.
    runSql(read('prisma/migrations/20260807020500_preserve_season_division_membership/migration.sql'));
    runSql(read('prisma/migrations/20260822161600_auto_create_tbc_on_league/migration.sql'));
    runSql(read('prisma/migrations/20260924233000_preserve_private_and_historical_seasons/migration.sql'));
    for (const [name, check] of [
      ['copying teams creates a private non-current season and preserves the live pointers and results', async () => {
        const before = await pointers(); const oldHistory = await history();
        const next = await create('Winter 2026');
        assert.equal(await current(), 'old'); assert.deepEqual(await pointers(), before); assert.deepEqual(await history(), oldHistory);
        const league = (await prisma.$queryRaw`SELECT "publicAt", "isActive" FROM "League" WHERE id=${next.leagueId}`)[0];
        assert.equal(league.publicAt, null, 'must override even a non-null database default'); assert.equal(league.isActive, true);
        const teams = await membership.getLeagueSeasonTeams({ leagueId: next.leagueId });
        assert.equal(teams.length, 2); assert.notEqual(teams[0].divisionId, 'old-div');
        const summary = await competition.getCompetitionSummaryForLeague(next.leagueId);
        assert.equal(summary.competition.currentLeagueId, 'old');
        assert.equal(summary.seasons.find(s => s.id === next.leagueId).publicAt, null);
        const visible = await competition.getPublicCompetitionSeasonsByLeagueSlug('test-summer-2026');
        assert.deepEqual(visible.seasons.map(s => s.id), ['old']);
        assert.equal(await competition.getPublicCompetitionSeasonsByLeagueSlug(next.slug), null);
      }],
      ['copy-teams off leaves an empty editable draft; duplicate season names cannot switch anything', async () => {
        const next = await create('Winter 2026', false);
        assert.deepEqual(await membership.getLeagueSeasonTeams({ leagueId: next.leagueId }), []);
        await assert.rejects(create('Winter 2026'), /already exists/); assert.equal(await current(), 'old');
      }],
      ['draft division edits do not change live assignments; editing the current season does not wipe drafts', async () => {
        const next = await create('Winter 2026'); const before = await pointers();
        await membership.setSeasonTeamDivision({ leagueId: next.leagueId, teamId: 't1', divisionId: null });
        assert.deepEqual(await pointers(), before);
        await membership.setSeasonTeamDivision({ leagueId: 'old', teamId: 't1', divisionId: null });
        assert.equal((await pointers())[0].divisionId, null);
        assert.equal((await membership.getLeagueSeasonTeams({ leagueId: next.leagueId })).length, 2);
        await assert.rejects(membership.setSeasonTeamDivision({ leagueId: next.leagueId, teamId: 't1', divisionId: 'old-div' }), /must belong/);
      }],
      ['private, future, inactive, unconfirmed and stale requests fail without switching', async () => {
        const next = await create('Winter 2026');
        await assert.rejects(activate(next.leagueId, 'old', false), /confirm/);
        await assert.rejects(activate(next.leagueId), /still private/);
        await prisma.$executeRaw`UPDATE "League" SET "publicAt"=NOW()+INTERVAL '1 day' WHERE id=${next.leagueId}`;
        await assert.rejects(activate(next.leagueId), /still private/);
        await prisma.$executeRaw`UPDATE "League" SET "publicAt"=NOW()-INTERVAL '1 minute', "isActive"=false WHERE id=${next.leagueId}`;
        await assert.rejects(activate(next.leagueId), /must be active/);
        await prisma.$executeRaw`UPDATE "League" SET "isActive"=true WHERE id=${next.leagueId}`;
        await assert.rejects(activate(next.leagueId, 'stale'), error => error.status === 409);
        assert.equal(await current(), 'old');
      }],
      ['explicit public switch is idempotent, ignores hidden TBC and keeps previous and other draft memberships', async () => {
        const next = await create('Winter 2026'); const later = await create('Spring 2027'); const oldHistory = await history();
        await prisma.$executeRaw`UPDATE "League" SET "publicAt"=NOW()-INTERVAL '1 minute' WHERE id=${next.leagueId}`;
        await prisma.$executeRaw`INSERT INTO "Fixture" VALUES ('draft',${next.leagueId},'SCHEDULED',NULL,NULL,4000)`;
        const result = await activate(next.leagueId);
        assert.equal(await current(), next.leagueId); assert.deepEqual(result.teamIds, ['t1', 't2']);
        assert.ok((await pointers()).every(team => team.leagueId === next.leagueId));
        assert.equal((await membership.getLeagueSeasonTeams({ leagueId: 'old' })).length, 2);
        assert.equal((await membership.getLeagueSeasonTeams({ leagueId: later.leagueId })).length, 2);
        assert.deepEqual((await history()).filter(f => f.id === 'historic'), oldHistory);
        assert.equal((await history()).find(f => f.id === 'draft').publishedAt, null);
        await activate(next.leagueId); assert.equal(await current(), next.leagueId);
      }],
      ['switch rejects stale foreign/no-league identities and cross-season divisions', async () => {
        const next = await create('Winter 2026');
        await prisma.$executeRaw`UPDATE "League" SET "publicAt"=NOW()-INTERVAL '1 minute' WHERE id=${next.leagueId}`;
        await prisma.$executeRaw`UPDATE "Team" SET "competitionId"='other' WHERE id='t1'`;
        await assert.rejects(activate(next.leagueId), /left this competition/);
        await prisma.$executeRaw`UPDATE "Team" SET "competitionId"='c' WHERE id='t1'`;
        await prisma.$executeRaw`UPDATE "LeagueSeasonTeam" SET "divisionId"='old-div' WHERE "leagueId"=${next.leagueId} AND "teamId"='t1'`;
        await assert.rejects(activate(next.leagueId), /another season/);
        assert.equal(await current(), 'old');
      }],
      ['failure while updating teams rolls back the parent pointer as well', async () => {
        const next = await create('Winter 2026');
        await prisma.$executeRaw`UPDATE "League" SET "publicAt"=NOW()-INTERVAL '1 minute' WHERE id=${next.leagueId}`;
        runSql(`CREATE FUNCTION fail_team_switch() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'test failure'; END; $$;
          CREATE TRIGGER test_failure BEFORE UPDATE OF "leagueId" ON "Team" FOR EACH ROW EXECUTE FUNCTION fail_team_switch();`);
        try { await assert.rejects(activate(next.leagueId), /test failure/); assert.equal(await current(), 'old'); }
        finally { runSql('DROP TRIGGER test_failure ON "Team"; DROP FUNCTION fail_team_switch();'); }
      }],
      ['explicit No league and moving to another competition still deactivate incompatible entries', async () => {
        const next = await create('Winter 2026');
        await prisma.$executeRaw`UPDATE "Team" SET "leagueId"=NULL WHERE id='t1'`;
        assert.equal((await raw('SELECT * FROM "LeagueSeasonTeam" WHERE "teamId"=\'t1\' AND "isActive"')).length, 0);
        await prisma.$executeRaw`UPDATE "Team" SET "leagueId"='other-season', "competitionId"='other', "divisionId"=NULL WHERE id='t2'`;
        assert.equal((await membership.getLeagueSeasonTeams({ leagueId: next.leagueId })).length, 0);
      }],
    ]) {
      await t.test(name, async () => { await seed(); await check(); });
    }
  } finally {
    await prisma.$disconnect();
    execFileSync('psql', [connection, '-X', '-v', 'ON_ERROR_STOP=1', '-q', '-c', `DROP SCHEMA "${schema}" CASCADE`]);
  }
});
