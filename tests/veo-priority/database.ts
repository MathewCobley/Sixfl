import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { Prisma } from '@prisma/client';
import { prisma } from '../../src/lib/prisma';
import { prepareVeoPublication, previewVeoNight, readVeoSettings, readVeoSnapshots, londonVeoDate, validVeoDate } from '../../src/lib/veo/service';

const url = new URL(process.env.DATABASE_URL!);
assert.equal(process.env.VEO_TEST_DATABASE, '1', 'Explicit isolated-test opt-in required.');
assert.ok(['127.0.0.1', 'localhost'].includes(url.hostname), 'Never run against a remote/production database.');
assert.equal(url.pathname, '/sixfl_veo_test');

const id = (label: string) => `veo-test-${label}-${randomUUID()}`;
const start = new Date(Date.now() + 7 * 86400000); start.setUTCHours(17, 0, 0, 0);
const date = londonVeoDate(start);
const options = { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, maxWait: 10000, timeout: 60000 };
let passed = 0;
function pass(label: string) { console.log(`PASS ${++passed}: ${label}`); }

async function publish(leagueId: string) {
  for (let attempt = 0; ; attempt++) {
    try {
      return await prisma.$transaction(async tx => {
        await prepareVeoPublication(tx, { leagueId });
        await tx.fixture.updateMany({ where: { leagueId, publishedAt: null, status: 'SCHEDULED' }, data: { publishedAt: new Date() } });
      }, options);
    } catch (error) {
      if (attempt >= 2 || !(error instanceof Prisma.PrismaClientKnownRequestError)
        || !(error.code === 'P2034' || (error.code === 'P2010' && ['40001', '40P01'].includes(String(error.meta?.code))))) throw error;
    }
  }
}
async function main() {
  const venue = await prisma.venue.create({ data: { id: id('venue'), name: 'Veo integration venue' }, select: { id: true } });
  const league = await prisma.league.create({ data: { id: id('league'), name: 'Veo integration league', slug: id('slug') }, select: { id: true } });
  const teamIds: string[] = [];
  const fixtureIds: string[] = [];
  for (let n = 0; n < 12; n++) {
    const team = await prisma.team.create({ data: { id: id('team'), name: `Veo test team ${n + 1}`, claimCode: id('claim'), leagueId: league.id, standardMatchFeePence: 4000 }, select: { id: true } });
    teamIds.push(team.id);
  }
  for (let n = 0; n < 6; n++) {
    const fixture = await prisma.fixture.create({ data: {
      id: id('fixture'), leagueId: league.id, venueId: venue.id, homeTeamId: teamIds[n * 2], awayTeamId: teamIds[n * 2 + 1],
      kickoffAt: new Date(start.getTime() + Math.floor(n / 2) * 40 * 60000), pitch: String(n % 2 + 1), round: 1,
      homeMatchFeePence: 4000, awayMatchFeePence: 4000, matchFeePence: 4000,
    }, select: { id: true } }); fixtureIds.push(fixture.id);
  }
  const before = await prisma.fixture.findMany({ where: { leagueId: league.id }, orderBy: { id: 'asc' } });
  assert.equal((await readVeoSettings(league.id)).enabled, false);
  await prisma.$transaction(tx => prepareVeoPublication(tx, { leagueId: league.id }), options);
  assert.deepEqual(await prisma.fixture.findMany({ where: { leagueId: league.id }, orderBy: { id: 'asc' } }), before);
  assert.equal((await readVeoSnapshots(league.id, date)).length, 0);
  pass('missing settings are OFF; fixtures, prices and snapshots untouched');

  await prisma.$executeRaw`INSERT INTO "VeoLeagueSettings" ("leagueId", enabled, pitch, "venueId") VALUES (${league.id}, true, 'Pitch 1', ${venue.id})`;
  for (const n of [2, 3, 6, 7, 10]) await prisma.$executeRaw`INSERT INTO "VeoTeamPriority" ("leagueId", "teamId", enabled) VALUES (${league.id}, ${teamIds[n]}, true)`;
  const preview = await previewVeoNight(league.id, date);
  assert.deepEqual(preview.choices.map(c => c.fixtureId), [fixtureIds[1], fixtureIds[3], fixtureIds[5]]);
  assert.deepEqual(await prisma.fixture.findMany({ where: { leagueId: league.id }, orderBy: { id: 'asc' } }), before);
  pass('read-only preview chooses all three Priority fixtures');

  await assert.rejects(prisma.$transaction(async tx => { await prepareVeoPublication(tx, { leagueId: league.id }); throw new Error('intentional rollback'); }, options), /intentional rollback/);
  assert.deepEqual(await prisma.fixture.findMany({ where: { leagueId: league.id }, orderBy: { id: 'asc' } }), before);
  assert.equal((await readVeoSnapshots(league.id, date)).length, 0);
  pass('a failed publication rolls back pitch swaps, fee changes and snapshots');

  await Promise.all([publish(league.id), publish(league.id)]);
  const snapshots = await readVeoSnapshots(league.id, date);
  assert.equal(snapshots.length, 6); assert.equal(snapshots.filter(s => s.allocated).length, 3);
  assert.equal(snapshots.reduce((sum, s) => sum + s.homeSupplementPence + s.awaySupplementPence, 0), 2500);
  for (const f of await prisma.fixture.findMany({ where: { leagueId: league.id } })) {
    const previous = before.find(b => b.id === f.id)!;
    assert.equal(f.kickoffAt.getTime(), previous.kickoffAt.getTime());
    assert.equal(f.homeTeamId, previous.homeTeamId); assert.equal(f.awayTeamId, previous.awayTeamId); assert.equal(f.venueId, previous.venueId);
    const s = snapshots.find(s => s.fixtureId === f.id)!;
    assert.equal(f.homeMatchFeePence, s.homeBasePence + s.homeSupplementPence);
    assert.equal(f.awayMatchFeePence, s.awayBasePence + s.awaySupplementPence);
  }
  assert.equal(snapshots.find(s => s.fixtureId === fixtureIds[5])!.awaySupplementPence, 0);
  pass('concurrent publishing is idempotent; only the opted-in side receives £5');

  const frozen = JSON.stringify(snapshots);
  await prisma.$executeRaw`UPDATE "VeoLeagueSettings" SET enabled = false WHERE "leagueId" = ${league.id}`;
  await prisma.$executeRaw`UPDATE "VeoTeamPriority" SET enabled = false WHERE "leagueId" = ${league.id}`;
  await publish(league.id);
  assert.equal(JSON.stringify(await readVeoSnapshots(league.id, date)), frozen);
  await assert.rejects(prisma.$executeRaw`UPDATE "VeoFixtureSnapshot" SET "homeBasePence" = 1 WHERE "fixtureId" = ${fixtureIds[1]}`);
  await assert.rejects(prisma.$executeRaw`DELETE FROM "VeoFixtureSnapshot" WHERE "fixtureId" = ${fixtureIds[1]}`);
  pass('later switches and repeat publishes cannot rewrite historical agreements');

  // A separate test night checks partial-round publication fails before any writes commit.
  const nextStart = new Date(start.getTime() + 7 * 86400000);
  await prisma.$executeRaw`UPDATE "VeoLeagueSettings" SET enabled = true WHERE "leagueId" = ${league.id}`;
  for (let n = 0; n < 2; n++) await prisma.fixture.create({ data: { id: id('partial'), leagueId: league.id, venueId: venue.id,
    homeTeamId: teamIds[n * 2], awayTeamId: teamIds[n * 2 + 1], kickoffAt: nextStart, pitch: String(n + 1), round: n + 2 }, select: { id: true } });
  await assert.rejects(prisma.$transaction(tx => prepareVeoPublication(tx, { leagueId: league.id, round: 2 }), options), /Publish all divisions/);
  assert.equal((await readVeoSnapshots(league.id, londonVeoDate(nextStart))).length, 0);
  pass('partial-night publication fails safely instead of silently misallocating across divisions');

  const freeLeague = await prisma.league.create({ data: { id: id('free-league'), name: 'Veo free fixture test', slug: id('free-slug') }, select: { id: true } });
  await prisma.$executeRaw`INSERT INTO "VeoLeagueSettings" ("leagueId", enabled, pitch, "venueId") VALUES (${freeLeague.id}, true, '1', ${venue.id})`;
  for (const teamId of teamIds.slice(0, 2)) await prisma.$executeRaw`INSERT INTO "VeoTeamPriority" ("leagueId", "teamId", enabled) VALUES (${freeLeague.id}, ${teamId}, true)`;
  const freeFixture = await prisma.fixture.create({ data: { id: id('free'), leagueId: freeLeague.id, venueId: venue.id, homeTeamId: teamIds[0], awayTeamId: teamIds[1], kickoffAt: start, pitch: '1', homeMatchFeePence: 0, awayMatchFeePence: 4000, matchFeePence: 4000 }, select: { id: true } });
  await publish(freeLeague.id);
  const free = await prisma.fixture.findUniqueOrThrow({ where: { id: freeFixture.id } });
  assert.equal(free.homeMatchFeePence, 0); assert.equal(free.awayMatchFeePence, 4500);
  assert.equal(await prisma.paymentCharge.count(), 0); assert.equal(await prisma.notificationDispatch.count(), 0);
  pass('explicit £0 stays £0; allocation itself creates no payments or messages');

  assert.equal(londonVeoDate(new Date('2026-09-20T23:30:00Z')), '2026-09-21');
  assert.equal(londonVeoDate(new Date('2026-12-20T23:30:00Z')), '2026-12-20');
  assert.equal(validVeoDate('2026-02-30'), false);
  const source = readFileSync('src/app/(admin)/admin/fixtures/publish-actions.ts', 'utf8');
  assert.ok(source.indexOf('await prepareVeoPublication(tx, input)') < source.indexOf('const unpublishedFixtures = await tx.fixture.findMany'));
  assert.ok(!readFileSync('src/app/(admin)/admin/leagues/[id]/veo-priority/page.tsx', 'utf8').includes('<select'));
  pass('London date boundaries, publication hook order and native UI controls');

  // Leave an OFF league with an already-completed filmed fixture for the browser test.
  await prisma.$executeRaw`UPDATE "VeoLeagueSettings" SET enabled = false WHERE "leagueId" = ${league.id}`;
  await prisma.$executeRaw`UPDATE "Fixture" SET status = 'COMPLETED' WHERE id = ${fixtureIds[1]}`;
  mkdirSync('artifacts/veo', { recursive: true });
  writeFileSync('artifacts/veo/seed.json', JSON.stringify({ leagueId: league.id, date, completedFixtureId: fixtureIds[1] }));
  console.log(`${passed} database checks passed.`);
}
main().finally(() => prisma.$disconnect());
