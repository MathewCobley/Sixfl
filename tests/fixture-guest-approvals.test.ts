import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { PrismaClient, Prisma } from "@prisma/client";
import { assertGuestApprovalAccess, assertGuestApprovalOrigin, canManageGuestApprovals, GuestApprovalError, parseGuestDecision, readGuestDecision } from "../src/lib/fixtures/guest-approval-policy";
import { getFixtureGuestApprovals, searchGuestCandidates, setFixtureGuestApproval } from "../src/lib/fixtures/guest-approvals";

const baseAccess = { session: { user: { email: "admin@example.test" } }, user: { id: "admin", role: "ADMIN" }, isAdmin: true, isCaptain: false, accessMode: "captain" };
const valid = { fixtureId: "f1", playerUserId: "p1", decision: "approve", reason: "", expectedRevision: null, expectedKickoffAt: new Date(Date.now() + 86400000).toISOString() };
const status = (n: number) => (e: unknown) => e instanceof GuestApprovalError && e.status === n;

test("only signed-in full admins can manage; captain and both preview modes cannot", () => {
  assert.equal(canManageGuestApprovals(baseAccess), true);
  for (const patch of [
    { session: null }, { user: null }, { isAdmin: false, isCaptain: true },
    { user: { id: "captain", role: "PLAYER" } }, { accessMode: "captain-preview" }, { accessMode: "admin-preview" },
  ]) {
    const access = { ...baseAccess, ...patch };
    assert.equal(canManageGuestApprovals(access), false);
    assert.throws(() => assertGuestApprovalAccess(access, true), status(403));
  }
  assert.doesNotThrow(() => assertGuestApprovalAccess({ ...baseAccess, isAdmin: false, isCaptain: true }));
  assert.throws(() => assertGuestApprovalAccess({ ...baseAccess, isAdmin: false, isCaptain: false }), status(403));
});

test("decision input requires explicit fixture, player, revision and context", () => {
  assert.equal(parseGuestDecision(valid).decision, "approve");
  for (const patch of [{ fixtureId: "../other" }, { playerUserId: "" }, { decision: "delete" }, { expectedRevision: undefined }, { expectedRevision: -1 }, { expectedKickoffAt: "invalid" }, { reason: "x".repeat(501) }]) {
    assert.throws(() => parseGuestDecision({ ...valid, ...patch }), GuestApprovalError);
  }
  assert.throws(() => parseGuestDecision({ ...valid, decision: "revoke", reason: " " }), GuestApprovalError);
});

test("same-origin approval requests only; absent origin and cross-site requests rejected", () => {
  assert.doesNotThrow(() => assertGuestApprovalOrigin(new Request("https://sixfl.co.uk/api/test", { headers: { origin: "https://sixfl.co.uk" } })));
  const cases: Record<string, string>[] = [{}, { origin: "https://attacker.example.test" }, { origin: "https://sixfl.co.uk", "sec-fetch-site": "cross-site" }];
  for (const headers of cases) {
    assert.throws(() => assertGuestApprovalOrigin(new Request("https://sixfl.co.uk/api/test", { headers })), status(403));
  }
});

test("JSON body validation includes chunked uploads without Content-Length", async () => {
  const request = (body: string, headers: Record<string, string> = { "Content-Type": "application/json" }) => new Request("https://sixfl.co.uk", { method: "POST", headers, body });
  assert.equal((await readGuestDecision(request(JSON.stringify(valid)))).playerUserId, "p1");
  await assert.rejects(() => readGuestDecision(request("x".repeat(8193))), status(413));
  await assert.rejects(() => readGuestDecision(request("{}", { "Content-Type": "application/json", "Content-Length": "9000" })), status(413));
  await assert.rejects(() => readGuestDecision(request("broken json")), status(400));
  await assert.rejects(() => readGuestDecision(request("{}", { "Content-Type": "text/plain" })), status(415));
});

// A dedicated local-only database is mandatory; never touch production data during tests.
const rawUrl = process.env.GUEST_APPROVAL_TEST_DATABASE_URL;
if (!rawUrl) throw new Error("GUEST_APPROVAL_TEST_DATABASE_URL is required for the PostgreSQL integration contracts.");
const url = new URL(rawUrl);
if (!["localhost", "127.0.0.1", "postgres"].includes(url.hostname)) throw new Error("Guest approval tests require a local test database.");
const schema = `guest_approval_contract_${randomUUID().replaceAll("-", "")}`;
const admin = new PrismaClient({ datasources: { db: { url: rawUrl } } });
url.searchParams.set("schema", schema);
const db = new PrismaClient({ datasources: { db: { url: url.toString() } } });

before(async () => {
  await admin.$executeRawUnsafe(`CREATE SCHEMA "${schema}"`);
  const setup = [
    'CREATE TABLE "User" ("id" TEXT PRIMARY KEY, "name" TEXT, "email" TEXT, "role" TEXT NOT NULL)',
    'CREATE TABLE "Team" ("id" TEXT PRIMARY KEY, "name" TEXT NOT NULL)',
    'CREATE TABLE "Fixture" ("id" TEXT PRIMARY KEY, "homeTeamId" TEXT NOT NULL, "awayTeamId" TEXT NOT NULL, "kickoffAt" TIMESTAMP(3) NOT NULL, "publishedAt" TIMESTAMP(3), "status" TEXT NOT NULL)',
    'CREATE TABLE "TeamMember" ("id" TEXT PRIMARY KEY, "userId" TEXT NOT NULL, "teamId" TEXT NOT NULL)',
    'CREATE TABLE "PlayerMatchFee" ("id" TEXT PRIMARY KEY, "amountPence" INTEGER, "status" TEXT, "note" TEXT)',
  ];
  for (const statement of setup) await db.$executeRawUnsafe(statement);
  const migration = readFileSync("prisma/migrations/20260906010000_fixture_guest_approvals/migration.sql", "utf8");
  for (const statement of migration.split(";").filter((s) => s.trim())) await db.$executeRawUnsafe(statement);
});
after(async () => {
  await db.$disconnect();
  await admin.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
  await admin.$disconnect();
});

async function seed() {
  const key = randomUUID().replaceAll("-", "");
  const [actor, player, a, b, c, fixtureId, memberId, feeId] = ["actor", "player", "a", "b", "c", "fixture", "member", "fee"].map((x) => `${x}_${key}`);
  const kickoff = new Date(Date.now() + 86400000);
  await db.$executeRaw(Prisma.sql`INSERT INTO "User" VALUES (${actor}, 'Test admin', ${`${key}@admin.example.test`}, 'ADMIN'), (${player}, ${`Guest ${key}`}, ${`${key}@player.example.test`}, 'PLAYER')`);
  await db.$executeRaw(Prisma.sql`INSERT INTO "Team" VALUES (${a}, 'Receiving team'), (${b}, 'Opponent'), (${c}, 'Original team')`);
  await db.$executeRaw(Prisma.sql`INSERT INTO "TeamMember" VALUES (${memberId}, ${player}, ${c})`);
  await db.$executeRaw(Prisma.sql`INSERT INTO "PlayerMatchFee" VALUES (${feeId}, 750, 'PAID', 'Existing settled payment')`);
  await db.$executeRaw(Prisma.sql`INSERT INTO "Fixture" VALUES (${fixtureId}, ${a}, ${b}, ${kickoff}, NOW(), 'SCHEDULED')`);
  const input = { fixtureId, teamId: a, playerUserId: player, actorUserId: actor, decision: "approve" as const, reason: "Cover for absent player", expectedRevision: null, expectedKickoffAt: kickoff.toISOString() };
  return { input, actor, player, a, b, c, fixtureId, memberId, feeId, key };
}
const save = (input: Parameters<typeof setFixtureGuestApproval>[0]) => setFixtureGuestApproval(input, db);
const rows = <T>(sql: Prisma.Sql) => db.$queryRaw<T[]>(sql);

test("approval persists against one match and leaves original membership and paid fees unchanged", async () => {
  const s = await seed();
  const beforeMembers = await rows(Prisma.sql`SELECT * FROM "TeamMember" WHERE "userId" = ${s.player}`);
  const beforeFees = await rows(Prisma.sql`SELECT * FROM "PlayerMatchFee" WHERE "id" = ${s.feeId}`);
  await save(s.input);
  const result = await getFixtureGuestApprovals(s.a, s.fixtureId, db);
  assert.equal(result.approvals.length, 1);
  assert.equal(result.approvals[0].status, "APPROVED");
  assert.equal(result.approvals[0].approvedByName, "Test admin");
  assert.equal(result.fixture.teamName, "Receiving team");
  assert.deepEqual(await rows(Prisma.sql`SELECT * FROM "TeamMember" WHERE "userId" = ${s.player}`), beforeMembers);
  assert.deepEqual(await rows(Prisma.sql`SELECT * FROM "PlayerMatchFee" WHERE "id" = ${s.feeId}`), beforeFees);
  assert.equal((await getFixtureGuestApprovals(s.b, s.fixtureId, db)).approvals.length, 0);
});

test("the storage layer independently rejects non-admin and missing actors", async () => {
  const s = await seed();
  await assert.rejects(() => save({ ...s.input, actorUserId: s.player }), status(403));
  await assert.rejects(() => save({ ...s.input, actorUserId: "missing" }), status(403));
});

test("foreign team, unknown player and unpublished fixture cannot be approved", async () => {
  const s = await seed();
  await assert.rejects(() => save({ ...s.input, teamId: s.c }), status(404));
  await assert.rejects(() => getFixtureGuestApprovals(s.c, s.fixtureId, db), status(404));
  await assert.rejects(() => save({ ...s.input, playerUserId: "missing" }), status(404));
  await db.$executeRaw(Prisma.sql`UPDATE "Fixture" SET "publishedAt" = NULL WHERE "id" = ${s.fixtureId}`);
  await assert.rejects(() => save(s.input), status(404));
});

test("existing permanent member cannot gain redundant guest status", async () => {
  const s = await seed();
  await db.$executeRaw(Prisma.sql`INSERT INTO "TeamMember" VALUES (${`extra_${s.key}`}, ${s.player}, ${s.a})`);
  await assert.rejects(() => save(s.input), status(409));
  assert.equal((await getFixtureGuestApprovals(s.a, s.fixtureId, db)).approvals.length, 0);
});

test("scheduled future fixture is mandatory and a rescheduled match requires a fresh read", async () => {
  const s = await seed();
  for (const state of ["CANCELLED", "POSTPONED", "COMPLETED", "ABANDONED"]) {
    await db.$executeRaw(Prisma.sql`UPDATE "Fixture" SET "status" = ${state} WHERE "id" = ${s.fixtureId}`);
    await assert.rejects(() => save(s.input), status(409));
  }
  await db.$executeRaw(Prisma.sql`UPDATE "Fixture" SET "status" = 'SCHEDULED', "kickoffAt" = NOW() - INTERVAL '1 minute' WHERE "id" = ${s.fixtureId}`);
  await assert.rejects(() => save(s.input), status(409));
  await db.$executeRaw(Prisma.sql`UPDATE "Fixture" SET "kickoffAt" = NOW() + INTERVAL '2 days' WHERE "id" = ${s.fixtureId}`);
  await assert.rejects(() => save(s.input), status(409));
});

test("concurrent approvals are serialized and create just one approval and audit event", async () => {
  const s = await seed();
  const outcomes = await Promise.allSettled([save(s.input), save(s.input)]);
  assert.equal(outcomes.filter((r) => r.status === "fulfilled").length, 1);
  const rejection = outcomes.find((r) => r.status === "rejected") as PromiseRejectedResult;
  assert.equal(rejection.reason.status, 409);
  const saved = (await getFixtureGuestApprovals(s.a, s.fixtureId, db)).approvals[0];
  assert.equal(saved.revision, 1);
  const events = await rows(Prisma.sql`SELECT * FROM "FixtureGuestApprovalEvent" WHERE "approvalId" = ${saved.id}`);
  assert.equal(events.length, 1);
});

test("one player cannot be approved for both sides of the same match", async () => {
  const s = await seed();
  await save(s.input);
  await assert.rejects(() => save({ ...s.input, teamId: s.b }), status(409));
});

test("repeat at current revision is idempotent, stale approval cannot overwrite a revocation", async () => {
  const s = await seed();
  await save(s.input);
  assert.equal((await save({ ...s.input, expectedRevision: 1 })).changed, false);
  await save({ ...s.input, decision: "revoke", reason: "Player no longer needed", expectedRevision: 1 });
  await assert.rejects(() => save({ ...s.input, expectedRevision: 1 }), status(409));
  assert.equal((await getFixtureGuestApprovals(s.a, s.fixtureId, db)).approvals[0].status, "REVOKED");
});

test("revoke and reapprove retain all audit history without creating a permanent registration", async () => {
  const s = await seed();
  const approved = await save(s.input);
  await save({ ...s.input, decision: "revoke", expectedRevision: 1, reason: "Withdrawn by organiser" });
  await save({ ...s.input, expectedRevision: 2, reason: "Organiser reconfirmed" });
  const row = (await getFixtureGuestApprovals(s.a, s.fixtureId, db)).approvals[0];
  assert.equal(row.revision, 3);
  assert.equal(row.revokedAt, null);
  const events = await rows<{ decision: string; revision: number }>(Prisma.sql`SELECT "decision", "revision" FROM "FixtureGuestApprovalEvent" WHERE "approvalId" = ${approved.id} ORDER BY "revision"`);
  assert.deepEqual(events.map((e) => e.decision), ["APPROVED", "REVOKED", "APPROVED"]);
  assert.equal((await rows(Prisma.sql`SELECT * FROM "TeamMember" WHERE "userId" = ${s.player}`)).length, 1);
});

test("revocation cannot rewrite permission history after kickoff", async () => {
  const s = await seed();
  await save(s.input);
  await db.$executeRaw(Prisma.sql`UPDATE "Fixture" SET "kickoffAt" = NOW() - INTERVAL '1 minute' WHERE "id" = ${s.fixtureId}`);
  await assert.rejects(() => save({ ...s.input, decision: "revoke", expectedRevision: 1, reason: "Late request" }), status(409));
  assert.equal((await getFixtureGuestApprovals(s.a, s.fixtureId, db)).fixture.editable, false);
});

test("audit failure rolls back the approval as well", async () => {
  const s = await seed();
  await db.$executeRawUnsafe(`ALTER TABLE "FixtureGuestApprovalEvent" ADD CONSTRAINT "contract_failure" CHECK ("reason" <> 'force-audit-failure')`);
  try {
    await assert.rejects(() => save({ ...s.input, reason: "force-audit-failure" }));
    assert.equal((await getFixtureGuestApprovals(s.a, s.fixtureId, db)).approvals.length, 0);
  } finally { await db.$executeRawUnsafe('ALTER TABLE "FixtureGuestApprovalEvent" DROP CONSTRAINT "contract_failure"'); }
});

test("player search is bound, matches existing records, excludes permanent receiving members and escapes wildcards", async () => {
  const s = await seed();
  assert.equal((await searchGuestCandidates(s.a, s.key, db)).some((r) => r.id === s.player), true);
  assert.equal((await searchGuestCandidates(s.c, s.key, db)).some((r) => r.id === s.player), false);
  assert.equal((await searchGuestCandidates(s.a, "a", db)).length, 0);
  assert.equal((await searchGuestCandidates(s.a, "%_", db)).length, 0);
  await assert.rejects(() => searchGuestCandidates(s.a, "x".repeat(81), db), status(400));
});

test("permission does not carry into the next fixture", async () => {
  const s = await seed();
  await save(s.input);
  const nextFixture = `next_${s.key}`;
  await db.$executeRaw(Prisma.sql`INSERT INTO "Fixture" VALUES (${nextFixture}, ${s.a}, ${s.b}, NOW() + INTERVAL '7 days', NOW(), 'SCHEDULED')`);
  assert.equal((await getFixtureGuestApprovals(s.a, nextFixture, db)).approvals.length, 0);
});

test("native route wiring, protected API, private-note redaction and original selection remain present after prebuild", () => {
  const read = (p: string) => readFileSync(p, "utf8");
  const layout = read("src/app/captain/team/[teamid]/match-fees/layout.tsx");
  const page = read("src/app/captain/team/[teamid]/match-fees/page.tsx");
  const route = read("src/app/api/captain/team/[teamid]/guest-approvals/route.ts");
  const component = read("src/components/captain/FixtureGuestApprovals.tsx");
  assert.match(layout, /<FixtureGuestApprovals/);
  assert.match(layout, /\{children\}/);
  assert.match(page, /MatchdaySquadSelectionForm/);
  assert.match(route, /assertGuestApprovalAccess\(access, true\)/);
  assert.match(route, /assertGuestApprovalOrigin\(request\)/);
  assert.match(route, /canManage \? row :/);
  assert.match(component, /Guest — SIXFL approved/);
  assert.match(component, /Confirm revocation/);
  assert.match(component, /key=\{`\$\{teamId\}:\$\{fixtureId\}`\}/);
  const store = read("src/lib/fixtures/guest-approvals.ts");
  assert.doesNotMatch(store, /(?:INSERT INTO|UPDATE|DELETE FROM) "(?:TeamMember|PlayerMatchFee|User|FixtureSelection)"/);
});
