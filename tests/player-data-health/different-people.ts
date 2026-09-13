import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import { prisma } from "../../src/lib/prisma";
import { getPlayerRecruitmentMatches } from "../../src/lib/players/player-data-health-matches";
import { markPlayerDataHealthDifferentPeople } from "../../src/lib/players/player-data-health-exclusions";

const url = new URL(process.env.DATABASE_URL || "http://invalid");
assert.ok(process.env.SIXFL_DATA_HEALTH_TEST === "1" && url.hostname === "127.0.0.1" && url.pathname === "/sixfl_data_health_test", "Disposable test database only");
let adminId: string;
let teamId: string;
let userId: string;
let prospectId: string;

before(async () => {
  execFileSync("psql", [process.env.DATABASE_URL!, "-v", "ON_ERROR_STOP=1", "-f", "prisma/migrations/20260913173500_player_data_health_different_people/migration.sql"], { stdio: "pipe" });
  adminId = (await prisma.user.create({ data: { name: "Different People Admin", role: "ADMIN", email: `${randomUUID()}@example.invalid` } })).id;
  const team = await prisma.team.create({ data: { name: `NEO Mercy ${randomUUID()}`, claimCode: randomUUID() } });
  teamId = team.id;
  const user = await prisma.user.create({ data: { name: "Jonny Walker", email: `${randomUUID()}@example.invalid`, emailVerified: new Date() } });
  userId = user.id;
  await prisma.teamMember.create({ data: { teamId, userId, role: "PLAYER" } });
  const prospect = await prisma.teamPlayerProspect.create({ data: {
    firstName: "Jack", lastName: "Walker", email: `${randomUUID()}@example.invalid`, phone: "07932469695", status: "NEW",
  } });
  prospectId = prospect.id;
});
after(async () => { await prisma.$disconnect(); });

test("admin can mark a suggested pair as different people and the exact pairing stays suppressed", async () => {
  const beforeProspect = await prisma.teamPlayerProspect.findUniqueOrThrow({ where: { id: prospectId } });
  const beforeUser = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
  const beforeMember = await prisma.teamMember.findFirstOrThrow({ where: { userId, teamId } });
  const match = (await getPlayerRecruitmentMatches()).find(row => row.record.id === prospectId);
  assert.ok(match, "similar first initial and surname should be suggested before review");
  assert.equal(match.candidates.length, 1);
  assert.equal(match.candidates[0].userId, userId);
  assert.match(match.candidates[0].evidence.join(" "), /Similar name/);

  await markPlayerDataHealthDifferentPeople({
    kind: "PROSPECT", recordId: prospectId, userId, fingerprint: match.fingerprint,
    actorUserId: adminId, reason: "Checked the contact details and these are different people.",
  });

  assert.equal((await getPlayerRecruitmentMatches()).some(row => row.record.id === prospectId), false, "the rejected exact pairing must not return");
  assert.deepEqual(await prisma.teamPlayerProspect.findUniqueOrThrow({ where: { id: prospectId } }), beforeProspect);
  assert.deepEqual(await prisma.user.findUniqueOrThrow({ where: { id: userId } }), beforeUser);
  assert.deepEqual(await prisma.teamMember.findFirstOrThrow({ where: { userId, teamId } }), beforeMember);
  const exclusion = (await prisma.$queryRaw<Array<{actorUserId:string;reason:string}>>`
    SELECT "actorUserId", reason FROM "PlayerDataHealthExclusion" WHERE "recordType"='PROSPECT' AND "recordId"=${prospectId} AND "userId"=${userId}
  `)[0];
  assert.equal(exclusion.actorUserId, adminId);
  assert.match(exclusion.reason, /different people/i);
});
