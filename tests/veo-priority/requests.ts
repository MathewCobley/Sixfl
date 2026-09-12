import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { prisma } from '../../src/lib/prisma';
import { requestVeoPriority, readVeoOffer, reviewVeoPriorityRequest, pendingVeoRequests, pendingVeoRequestCount, approvePendingVeoRequests, VEO_REQUEST_TERMS } from '../../src/lib/veo/priority-requests';

const url = new URL(process.env.DATABASE_URL!);
assert.equal(process.env.VEO_TEST_DATABASE, '1');
assert.ok(['127.0.0.1', 'localhost'].includes(url.hostname));
assert.equal(url.pathname, '/sixfl_veo_test', 'Never run request tests against production.');
const id = () => `veo-request-test-${randomUUID()}`;
let passed = 0;
const pass = (name: string) => console.log(`PASS ${++passed}: ${name}`);

async function main() {
  const league = await prisma.league.create({ data: { id: id(), name: 'Request test league', slug: id() }, select: { id: true } });
  const team = await prisma.team.create({ data: { id: id(), name: 'Request test team', claimCode: id(), leagueId: league.id, standardMatchFeePence: 4000 }, select: { id: true } });
  const captain = await prisma.user.create({ data: { id: id(), name: 'Test captain', role: 'USER' }, select: { id: true } });
  const other = await prisma.user.create({ data: { id: id(), name: 'Test other player', role: 'USER' }, select: { id: true } });
  const admin = await prisma.user.create({ data: { id: id(), name: 'Test admin', role: 'ADMIN' }, select: { id: true } });
  await prisma.teamMember.create({ data: { teamId: team.id, userId: captain.id, role: 'CAPTAIN' }, select: { id: true } });
  await prisma.teamMember.create({ data: { teamId: team.id, userId: other.id, role: 'PLAYER' }, select: { id: true } });
  const input = { leagueId: league.id, teamId: team.id, actorId: captain.id, agreed: true, termsVersion: VEO_REQUEST_TERMS };
  const financialState = async () => JSON.stringify({
    fixtures: await prisma.fixture.findMany({ orderBy: { id: 'asc' } }),
    charges: await prisma.paymentCharge.findMany({ orderBy: { id: 'asc' } }),
    playerFees: await prisma.playerMatchFee.findMany({ orderBy: { id: 'asc' } }),
    messages: await prisma.notificationDispatch.findMany({ orderBy: { id: 'asc' } }),
  });
  const financialBefore = await financialState();
  assert.equal(await readVeoOffer(league.id, team.id), null);
  await assert.rejects(requestVeoPriority(input), /not currently available/);
  await prisma.$executeRaw`INSERT INTO "VeoLeagueSettings" ("leagueId", enabled, pitch) VALUES (${league.id}, true, '1')`;
  assert.ok(await readVeoOffer(league.id, team.id));
  await assert.rejects(requestVeoPriority({ ...input, agreed: false }), /agree/);
  await assert.rejects(requestVeoPriority({ ...input, termsVersion: 'wrong' }), /agree/);
  await assert.rejects(requestVeoPriority({ ...input, actorId: other.id }), /active captain/);
  await assert.rejects(requestVeoPriority({ ...input, actorId: admin.id }), /active captain/);
  await assert.rejects(requestVeoPriority({ ...input, teamId: 'unknown-team' }), /active captain/);
  pass('OFF leagues, missing consent, wrong terms, other players, previews/admins and other teams cannot request');

  await prisma.$executeRaw`UPDATE "Team" SET "teamMode" = 'MANAGED' WHERE id = ${team.id}`;
  assert.equal(await readVeoOffer(league.id, team.id), null);
  await assert.rejects(requestVeoPriority(input), /not currently available/);
  await prisma.$executeRaw`UPDATE "Team" SET "teamMode" = 'STANDARD', "isFixturePlaceholder" = true WHERE id = ${team.id}`;
  assert.equal(await readVeoOffer(league.id, team.id), null);
  await prisma.$executeRaw`UPDATE "Team" SET "isFixturePlaceholder" = false WHERE id = ${team.id}`;
  await prisma.$executeRaw`UPDATE "TeamMember" SET "isActive" = false WHERE "teamId" = ${team.id} AND "userId" = ${captain.id}`;
  await assert.rejects(requestVeoPriority(input), /active captain/);
  await prisma.$executeRaw`UPDATE "TeamMember" SET "isActive" = true WHERE "teamId" = ${team.id} AND "userId" = ${captain.id}`;
  pass('managed teams, placeholders and inactive captains are excluded');

  await prisma.$executeRaw`INSERT INTO "LeagueSeasonTeam" (id, "leagueId", "teamId", "isActive") VALUES (${id()}, ${league.id}, ${team.id}, false)`;
  assert.equal(await readVeoOffer(league.id, team.id), null);
  await assert.rejects(requestVeoPriority(input), /not currently available/);
  await prisma.$executeRaw`UPDATE "LeagueSeasonTeam" SET "isActive" = true WHERE "leagueId" = ${league.id} AND "teamId" = ${team.id}`;
  const results = await Promise.all([requestVeoPriority(input), requestVeoPriority(input)]);
  assert.deepEqual(results, ['PENDING', 'PENDING']);
  assert.equal(await pendingVeoRequestCount(league.id), 1);
  assert.equal((await readVeoOffer(league.id, team.id))?.priority, false);
  assert.equal(await financialState(), financialBefore);
  pass('exact active season membership; concurrent duplicate requests save once without opting in or billing');

  const request = (await pendingVeoRequests(league.id))[0];
  const review = { leagueId: league.id, requestId: request.id, actorId: admin.id, decision: 'APPROVED' as const };
  await assert.rejects(reviewVeoPriorityRequest({ ...review, actorId: captain.id }), /Administrator/);
  await assert.rejects(reviewVeoPriorityRequest({ ...review, leagueId: 'other-league' }), /not found/);
  await prisma.$executeRaw`UPDATE "VeoLeagueSettings" SET enabled = false WHERE "leagueId" = ${league.id}`;
  await assert.rejects(reviewVeoPriorityRequest(review), /no longer eligible/);
  await prisma.$executeRaw`UPDATE "VeoLeagueSettings" SET enabled = true WHERE "leagueId" = ${league.id}`;
  await prisma.$executeRaw`UPDATE "LeagueSeasonTeam" SET "isActive" = false WHERE "leagueId" = ${league.id}`;
  await assert.rejects(reviewVeoPriorityRequest(review), /no longer eligible/);
  await prisma.$executeRaw`UPDATE "LeagueSeasonTeam" SET "isActive" = true WHERE "leagueId" = ${league.id}`;
  await Promise.all([reviewVeoPriorityRequest(review), reviewVeoPriorityRequest(review)]);
  assert.equal((await readVeoOffer(league.id, team.id))?.priority, true);
  assert.equal((await readVeoOffer(league.id, team.id))?.request?.status, 'APPROVED');
  assert.equal(await pendingVeoRequestCount(league.id), 0);
  assert.equal(await requestVeoPriority(input), 'ON');
  assert.equal(await financialState(), financialBefore);
  pass('admin review rechecks current eligibility; approval enables only future Priority and never changes money or fixtures');

  await prisma.$executeRaw`UPDATE "VeoTeamPriority" SET enabled = false WHERE "leagueId" = ${league.id} AND "teamId" = ${team.id}`;
  await reviewVeoPriorityRequest(review);
  assert.equal((await readVeoOffer(league.id, team.id))?.priority, false);
  await requestVeoPriority(input);
  const second = (await pendingVeoRequests(league.id))[0];
  await reviewVeoPriorityRequest({ ...review, requestId: second.id, decision: 'DECLINED' });
  assert.equal((await readVeoOffer(league.id, team.id))?.request?.status, 'DECLINED');
  assert.equal((await readVeoOffer(league.id, team.id))?.priority, false);
  await assert.rejects(requestVeoPriority(input), /not approved/);
  await assert.rejects(reviewVeoPriorityRequest({ ...review, requestId: second.id }), /already reviewed/);
  pass('stale approval cannot re-enable; declined requests remain visible without automatic billing or repeated spam');

  const competition = await prisma.leagueCompetition.create({ data: { id: id(), name: 'Test competition', slug: id(), currentLeagueId: league.id }, select: { id: true } });
  const archive = await prisma.league.create({ data: { id: id(), name: 'Test old season', slug: id(), competitionId: competition.id }, select: { id: true } });
  await prisma.$executeRaw`INSERT INTO "VeoLeagueSettings" ("leagueId", enabled, pitch) VALUES (${archive.id}, true, '1')`;
  await prisma.$executeRaw`INSERT INTO "LeagueSeasonTeam" (id, "leagueId", "teamId", "isActive") VALUES (${id()}, ${archive.id}, ${team.id}, true)`;
  assert.equal(await readVeoOffer(archive.id, team.id), null);
  pass('archived seasons do not advertise or accept requests');

  // Seed a genuine pending request on the existing browser-test league. Keep it OFF
  // afterwards so the old OFF-state and completed-video tests remain meaningful.
  const seed = JSON.parse(readFileSync('artifacts/veo/seed.json', 'utf8'));
  const target = await prisma.team.findFirstOrThrow({ where: { leagueId: seed.leagueId }, orderBy: { name: 'asc' }, select: { id: true } });
  await prisma.teamMember.create({ data: { teamId: target.id, userId: captain.id, role: 'CAPTAIN' }, select: { id: true } });
  await prisma.$executeRaw`UPDATE "VeoLeagueSettings" SET enabled = true WHERE "leagueId" = ${seed.leagueId}`;
  await requestVeoPriority({ ...input, leagueId: seed.leagueId, teamId: target.id });
  await prisma.$transaction(tx => approvePendingVeoRequests(tx, seed.leagueId, target.id, admin.id));
  assert.equal(await pendingVeoRequestCount(seed.leagueId), 0);
  await requestVeoPriority({ ...input, leagueId: seed.leagueId, teamId: target.id });
  await prisma.$executeRaw`UPDATE "VeoLeagueSettings" SET enabled = false WHERE "leagueId" = ${seed.leagueId}`;
  assert.equal(await pendingVeoRequestCount(seed.leagueId), 1);
  assert.equal(await financialState(), financialBefore);
  const audit = await prisma.$queryRaw<{ count: number }[]>`SELECT COUNT(*)::integer AS count FROM "VeoSettingsAudit" WHERE "leagueId" = ${league.id} AND details->>'kind' = 'captain_priority_request'`;
  assert.equal(audit[0].count, 2);
  pass('manual approval closes the queue; all decisions and consent are audited; no fixture/payment/message mutations');
  console.log(`${passed} request database checks passed.`);
}
main().finally(() => prisma.$disconnect());
