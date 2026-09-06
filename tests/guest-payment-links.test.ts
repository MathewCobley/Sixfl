import assert from "node:assert/strict";
import { before, after, beforeEach, test } from "node:test";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { PrismaClient } from "@prisma/client";
import { canManageGuestPayments, assertGuestPaymentAccess, parseGuestAmount, parseGuestPayment, readGuestPayment } from "../src/lib/fixtures/guest-payment-policy";

const rawUrl = process.env.GUEST_PAYMENT_TEST_DATABASE_URL;
if (!rawUrl) throw new Error("Use an isolated local GUEST_PAYMENT_TEST_DATABASE_URL; this suite never uses production.");
const url = new URL(rawUrl);
if (!["localhost", "127.0.0.1", "::1", "[::1]"].includes(url.hostname)) throw new Error("Guest payment tests require localhost.");
const schema = `guest_payments_${randomUUID().replaceAll("-", "")}`;
const admin = new PrismaClient({ datasources: { db: { url: rawUrl } } });
url.searchParams.set("schema", schema);
process.env.DATABASE_URL = url.toString();
const db = new PrismaClient({ datasources: { db: { url: url.toString() } } });
let service: typeof import("../src/lib/fixtures/guest-payments");
let passes: typeof import("../src/lib/temporary-player-passes");
let locks: typeof import("../src/lib/payments/temporary-request-lock");
let appDb: typeof import("../src/lib/prisma");
const kickoff = new Date(Date.now() + 7 * 86400000);
const paymentUrl = (token: string) => `https://example.invalid/pay/player-match-fee/${token}`;
const input = () => ({ teamId: "home", actorUserId: "captain", ...parseGuestPayment({
  fixtureId: "fixture", approvalId: "approval", action: "create", amount: "6.00",
  expectedRevision: 1, expectedKickoffAt: kickoff.toISOString(),
}) });

async function sql(source: string) {
  for (const statement of source.split(";").map((s) => s.trim()).filter(Boolean)) await db.$executeRawUnsafe(statement);
}
before(async () => {
  await admin.$executeRawUnsafe(`CREATE SCHEMA "${schema}"`);
  await sql(`
    CREATE TYPE "FixtureStatus" AS ENUM ('SCHEDULED','COMPLETED','CANCELLED','POSTPONED','ABANDONED');
    CREATE TYPE "PlayerMatchFeeStatus" AS ENUM ('OPEN','PAID','WAIVED','CANCELLED');
    CREATE TYPE "TeamRole" AS ENUM ('CAPTAIN','PLAYER');
    CREATE TABLE "User" ("id" TEXT PRIMARY KEY, "name" TEXT, "email" TEXT, "role" TEXT NOT NULL);
    CREATE TABLE "Team" ("id" TEXT PRIMARY KEY, "name" TEXT, "teamMode" TEXT NOT NULL);
    CREATE TABLE "Fixture" ("id" TEXT PRIMARY KEY, "homeTeamId" TEXT REFERENCES "Team"("id"), "awayTeamId" TEXT REFERENCES "Team"("id"), "kickoffAt" TIMESTAMP(3), "publishedAt" TIMESTAMP(3), "status" "FixtureStatus" NOT NULL);
    CREATE TABLE "TeamMember" ("id" TEXT PRIMARY KEY, "teamId" TEXT REFERENCES "Team"("id"), "userId" TEXT REFERENCES "User"("id"), "role" "TeamRole");
    CREATE TABLE "TeamPlayerProspect" ("id" TEXT PRIMARY KEY, "email" TEXT);
    CREATE TABLE "PlayerMatchFee" (
      "id" TEXT PRIMARY KEY, "fixtureId" TEXT REFERENCES "Fixture"("id"), "teamId" TEXT REFERENCES "Team"("id"),
      "temporaryUserId" TEXT REFERENCES "User"("id"), "teamMemberId" TEXT REFERENCES "TeamMember"("id"), "prospectId" TEXT REFERENCES "TeamPlayerProspect"("id"),
      "amountPence" INTEGER NOT NULL, "status" "PlayerMatchFeeStatus" NOT NULL, "waivedAt" TIMESTAMP(3), "paidAt" TIMESTAMP(3),
      "paymentToken" TEXT, "paymentUrl" TEXT, "note" TEXT, "lastChasedAt" TIMESTAMP(3), "createdAt" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP
    )
  `);
  await sql(readFileSync("prisma/migrations/20260906010000_fixture_guest_approvals/migration.sql", "utf8"));
  await sql(readFileSync("prisma/migrations/20260906023000_fixture_guest_payment_audit/migration.sql", "utf8"));
  service = await import("../src/lib/fixtures/guest-payments");
  passes = await import("../src/lib/temporary-player-passes");
  locks = await import("../src/lib/payments/temporary-request-lock");
  appDb = await import("../src/lib/prisma");
  await passes.ensureTemporaryPlayerPassTable();
});
after(async () => {
  await appDb?.prisma.$disconnect();
  await db.$disconnect();
  await admin.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
  await admin.$disconnect();
});
beforeEach(async () => {
  await db.$executeRawUnsafe('TRUNCATE "User", "Team", "Fixture", "TeamMember", "TeamPlayerProspect", "PlayerMatchFee", "FixtureGuestApproval", "FixtureGuestApprovalEvent", "FixtureGuestPaymentAudit", "TemporaryPlayerPass" CASCADE');
  await sql(`INSERT INTO "User" VALUES ('admin','Admin','admin@example.invalid','ADMIN'), ('captain','Captain','captain@example.invalid','USER'), ('guest','Guest Player','guest@example.invalid','USER'), ('other','Other Captain','other@example.invalid','USER');
    INSERT INTO "Team" VALUES ('home','Receiving team','STANDARD'), ('away','Opponents','STANDARD'), ('permanent','Permanent team','STANDARD');
    INSERT INTO "TeamMember" VALUES ('cap','home','captain','CAPTAIN'), ('othercap','away','other','CAPTAIN'), ('original','permanent','guest','PLAYER')`);
  await db.$executeRawUnsafe('INSERT INTO "Fixture" VALUES ($1,$2,$3,$4,NOW(),\'SCHEDULED\')', 'fixture','home','away',kickoff);
  await db.$executeRawUnsafe('INSERT INTO "FixtureGuestApproval" ("id","fixtureId","teamId","playerUserId","status","revision","approvedAt","approvedByUserId","approvedByName") VALUES (\'approval\',\'fixture\',\'home\',\'guest\',\'APPROVED\',1,NOW(),\'admin\',\'Admin\')');
});

test("strict penny amounts reject blanks, negative values, exponent notation and excess precision", () => {
  for (const bad of ["", "-1", "1e1", ".5", "5.001", "100.01", "101", "Infinity", "£6", null, 6]) assert.throws(() => parseGuestAmount(bad));
  assert.equal(parseGuestAmount("6.25"),625); assert.equal(parseGuestAmount("0"),0); assert.equal(parseGuestAmount("100"),10000);
});
test("only real captain/admin sessions can write; both preview modes and unauthenticated users are blocked", () => {
  const access = { session: {}, user: { id: "captain", role: "USER" }, isCaptain: true, isAdmin: false, accessMode: "captain" };
  assert.equal(canManageGuestPayments(access),true);
  assert.equal(canManageGuestPayments({ ...access, user: { id: "admin", role: "ADMIN" }, isAdmin: true }),true);
  for (const changed of [{ session: null }, { accessMode: "captain-preview" }, { accessMode: "admin-preview" }, { isCaptain: false }]) assert.throws(() => assertGuestPaymentAccess({ ...access, ...changed }));
});
test("bounded JSON rejects malformed, oversized and wrong-media-type requests", async () => {
  await assert.rejects(readGuestPayment(new Request("https://example.invalid", { method: "POST", body: "{}" })));
  await assert.rejects(readGuestPayment(new Request("https://example.invalid", { method: "POST", headers: { "content-type": "application/json" }, body: "x".repeat(5000) })), /too large/);
  await assert.rejects(readGuestPayment(new Request("https://example.invalid", { method: "POST", headers: { "content-type": "application/json" }, body: "{" })), /could not be read/);
});
test("captain creates fixture-specific guest fee, stable payment URL and atomic audit without permanent membership", async () => {
  const result = await service.prepareGuestPayment(input(), paymentUrl, db);
  assert.equal(result.status,"OPEN"); assert.equal(result.amountPence,600); assert.equal(result.created,true);
  const state = await service.getGuestPaymentState(input(),db);
  assert.equal(state.fee?.id,result.feeId); assert.match(state.fee?.paymentUrl ?? "", /^https:\/\/example\.invalid\/pay\/player-match-fee\/[a-f0-9]{48}$/);
  const members = await db.$queryRawUnsafe<Array<{ teamId: string }>>('SELECT "teamId" FROM "TeamMember" WHERE "userId"=\'guest\'');
  assert.deepEqual(members,[{ teamId: "permanent" }]);
  const audits = await db.$queryRawUnsafe<Array<{ createdByUserId: string; approvalId: string; amountPence: number }>>('SELECT "createdByUserId","approvalId","amountPence" FROM "FixtureGuestPaymentAudit"');
  assert.deepEqual(audits,[{createdByUserId:"captain",approvalId:"approval",amountPence:600}]);
});
test("storage independently blocks another team's captain", async () => {
  await assert.rejects(service.prepareGuestPayment({ ...input(), actorUserId: "other" },paymentUrl,db), /Only this team's captain/);
});
test("requires current SIXFL approval, not a revoked record", async () => {
  await db.$executeRawUnsafe('UPDATE "FixtureGuestApproval" SET "status"=\'REVOKED\'');
  await assert.rejects(service.prepareGuestPayment(input(),paymentUrl,db), /approval is required/);
});
test("wrong receiving team and fixture are rejected even for an administrator", async () => {
  await assert.rejects(service.prepareGuestPayment({ ...input(), actorUserId: "admin", teamId:"away" },paymentUrl,db), /does not belong/);
  await assert.rejects(service.prepareGuestPayment({ ...input(), fixtureId:"missing" },paymentUrl,db), /does not belong/);
});
test("stale approval revision and rescheduled fixture require a reload", async () => {
  await assert.rejects(service.prepareGuestPayment({ ...input(), expectedRevision: 2 },paymentUrl,db), /has changed/);
  await assert.rejects(service.prepareGuestPayment({ ...input(), expectedKickoffAt: new Date(kickoff.getTime()+60000).toISOString() },paymentUrl,db), /has changed/);
});
test("unpublished and cancelled fixtures cannot create fees", async () => {
  await db.$executeRawUnsafe('UPDATE "Fixture" SET "publishedAt"=NULL');
  await assert.rejects(service.prepareGuestPayment(input(),paymentUrl,db), /does not belong/);
  await db.$executeRawUnsafe('UPDATE "Fixture" SET "publishedAt"=NOW(),"status"=\'CANCELLED\'');
  await assert.rejects(service.prepareGuestPayment(input(),paymentUrl,db), /upcoming scheduled/);
});
test("completed recent fixtures can collect an already-approved guest fee", async () => {
  const past = new Date(Date.now()-86400000);
  await db.$executeRawUnsafe('UPDATE "Fixture" SET "status"=\'COMPLETED\',"kickoffAt"=$1',past);
  const result = await service.prepareGuestPayment({ ...input(), expectedKickoffAt:past.toISOString() },paymentUrl,db);
  assert.equal(result.amountPence,600);
});
test("missing email blocks a payable fee without creating a debt", async () => {
  await db.$executeRawUnsafe('UPDATE "User" SET "email"=NULL WHERE "id"=\'guest\'');
  await assert.rejects(service.prepareGuestPayment(input(),paymentUrl,db), /real email address/);
  assert.equal((await service.getGuestPaymentState(input(),db)).fee,null);
});
test("explicit zero creates no payable link", async () => {
  const result = await service.prepareGuestPayment({ ...input(), amountPence:0 },paymentUrl,db);
  assert.equal(result.status,"WAIVED");
  const rows = await db.$queryRawUnsafe<Array<{paymentToken: string|null; paymentUrl: string|null}>>('SELECT "paymentToken","paymentUrl" FROM "PlayerMatchFee"');
  assert.deepEqual(rows,[{paymentToken:null,paymentUrl:null}]);
});
test("retries and simultaneous double-clicks create one fee and one audit", async () => {
  const results = await Promise.all(Array.from({length:5},()=>service.prepareGuestPayment(input(),paymentUrl,db)));
  assert.equal(new Set(results.map(r=>r.feeId)).size,1);
  assert.equal(results.filter(r=>r.created).length,1);
  const audits = await db.$queryRawUnsafe<Array<{n:bigint}>>('SELECT COUNT(*) AS n FROM "FixtureGuestPaymentAudit"');
  assert.equal(Number(audits[0].n),1);
});
test("paid and waived fees are never reopened or altered", async () => {
  const created = await service.prepareGuestPayment(input(),paymentUrl,db);
  await db.$executeRawUnsafe('UPDATE "PlayerMatchFee" SET "status"=\'PAID\',"paidAt"=NOW()');
  const repeated = await service.prepareGuestPayment(input(),paymentUrl,db);
  assert.equal(repeated.feeId,created.feeId); assert.equal(repeated.status,"PAID");
  await assert.rejects(service.prepareGuestPayment({ ...input(), amountPence:700 },paymentUrl,db), /existing amount/);
  await db.$executeRawUnsafe('UPDATE "PlayerMatchFee" SET "status"=\'WAIVED\'');
  assert.equal((await service.prepareGuestPayment(input(),paymentUrl,db)).status,"WAIVED");
});
test("cancelled fees require review rather than a second charge", async () => {
  await service.prepareGuestPayment(input(),paymentUrl,db);
  await db.$executeRawUnsafe('UPDATE "PlayerMatchFee" SET "status"=\'CANCELLED\'');
  await assert.rejects(service.prepareGuestPayment(input(),paymentUrl,db), /cancelled/);
});
test("existing temporary-player fee is reused, including when no new guest audit exists", async () => {
  await db.$executeRawUnsafe('INSERT INTO "PlayerMatchFee" ("id","fixtureId","teamId","temporaryUserId","amountPence","status") VALUES (\'existing\',\'fixture\',\'home\',\'guest\',600,\'OPEN\')');
  const result = await service.prepareGuestPayment(input(),paymentUrl,db);
  assert.equal(result.feeId,"existing"); assert.equal(result.created,false);
});
test("prospect email conflicts cannot silently create duplicate fee records", async () => {
  await db.$executeRawUnsafe('INSERT INTO "TeamPlayerProspect" VALUES (\'prospect\',\'guest@example.invalid\')');
  await db.$executeRawUnsafe('INSERT INTO "PlayerMatchFee" ("id","fixtureId","teamId","prospectId","amountPence","status") VALUES (\'existing\',\'fixture\',\'home\',\'prospect\',600,\'OPEN\')');
  await assert.rejects(service.prepareGuestPayment(input(),paymentUrl,db), /reconcile/);
});
test("failed audit rolls back the fee", async () => {
  await db.$executeRawUnsafe('ALTER TABLE "FixtureGuestPaymentAudit" ADD CONSTRAINT test_reject CHECK ("amountPence" <> 601)');
  try {
    await assert.rejects(service.prepareGuestPayment({ ...input(), amountPence:601 },paymentUrl,db));
    assert.equal((await service.getGuestPaymentState(input(),db)).fee,null);
  } finally { await db.$executeRawUnsafe('ALTER TABLE "FixtureGuestPaymentAudit" DROP CONSTRAINT test_reject'); }
});
test("real pass redemption racing direct approval payment never creates two fees", async () => {
  await db.$executeRawUnsafe('INSERT INTO "TemporaryPlayerPass" ("id","userId","fixtureId","teamId","code","expiresAt") VALUES (\'pass\',\'guest\',\'fixture\',\'home\',\'TP-ABC234\',$1)',kickoff);
  const results = await Promise.allSettled([
    service.prepareGuestPayment(input(),paymentUrl,db),
    passes.redeemTemporaryPlayerPass({code:"TP-ABC234",fixtureId:"fixture",teamId:"home",amountPence:600,acceptedByUserId:"captain"}),
  ]);
  assert(results.some(result=>result.status === "fulfilled"));
  const fees = await db.$queryRawUnsafe<Array<{id:string}>>('SELECT "id" FROM "PlayerMatchFee"');
  assert.equal(fees.length,1);
  for (const result of results) if (result.status === "rejected") assert.match(String(result.reason),/already added/);
});
test("email mutex prevents overlapping manual and cron queue work and releases on failure", async () => {
  let started!: () => void; let release!: () => void;
  const entered = new Promise<void>(resolve=>{started=resolve;});
  const gate = new Promise<void>(resolve=>{release=resolve;});
  const first = locks.withTemporaryRequestLock("fee",async()=>{started();await gate;return {status:"queued",queued:1,skipped:0};},db);
  await entered;
  let secondRan = false;
  const second = await locks.withTemporaryRequestLock("fee",async()=>{secondRan=true;return {status:"queued"};},db);
  assert.equal(second.status,"processing"); assert.equal(secondRan,false);
  release(); await first;
  await assert.rejects(locks.withTemporaryRequestLock("fee",async()=>{throw new Error("simulated queue failure");},db));
  assert.equal((await locks.withTemporaryRequestLock("fee",async()=>({status:"queued"}),db)).status,"queued");
});
test("native UI, API and pass mutex survive full production preparation", () => {
  const read = (file:string)=>readFileSync(file,"utf8");
  assert.match(read("src/components/captain/FixtureGuestApprovals.tsx"), /<GuestPaymentControl/);
  assert.match(read("src/app/captain/team/[teamid]/player-payments/layout.tsx"), /match-fees\/layout/);
  const api = read("src/app/api/captain/team/[teamid]/guest-payments/route.ts");
  assert.match(api,/assertGuestPaymentAccess\(access\)/); assert.match(api,/assertGuestApprovalOrigin\(request\)/);
  assert.match(api,/queueTemporaryPlayerMatchFeeRequest\(result.feeId\)/);
  const pass = read("src/lib/temporary-player-passes.ts");
  assert(pass.indexOf("await lockTemporaryFixtureFee") < pass.indexOf("const existingFees"));
  assert.match(pass,/FixtureStatus.COMPLETED/);
  const source = read("src/lib/fixtures/guest-payments.ts");
  assert.doesNotMatch(source,/teamMember\.(create|upsert)|INSERT INTO "TeamMember"/);
  assert.doesNotMatch(source,/paymentIntents\.(create|confirm)|checkout\.sessions\.create/);
});
