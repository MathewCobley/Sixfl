import { createHash, createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { OVERTURN_REASONS, type OverturnReason } from "./result-scores";

export class ResultOverturnError extends Error {
  constructor(message: string, public status = 400) { super(message); }
}
function fail(message: string, status = 400): never { throw new ResultOverturnError(message, status); }
type Db = Pick<typeof prisma, "$queryRaw" | "user" | "fixture" | "matchResult" | "matchResultOverturn">;

async function assertAdmin(actorUserId: string, db: Db) {
  const user = actorUserId ? await db.user.findUnique({ where: { id: actorUserId }, select: { id: true, role: true } }) : null;
  if (!user || user.role !== "ADMIN") fail("Administrator access is required.", 403);
}
async function loadFixture(fixtureId: string, db: Db) {
  const fixture = await db.fixture.findUnique({ where: { id: fixtureId }, select: {
    id: true, leagueId: true, status: true, publishedAt: true, kickoffAt: true,
    homeTeamId: true, awayTeamId: true,
    homeTeam: { select: { name: true } }, awayTeam: { select: { name: true } },
    league: { select: { slug: true, name: true } },
    result: { select: { id: true, homeScore: true, awayScore: true, enteredAt: true,
      updatedAt: true, originalHomeScore: true, originalAwayScore: true, overturnedAt: true } },
  } });
  if (!fixture?.result) fail("A recorded result is required.", 404);
  if (fixture.status !== "COMPLETED" || !fixture.publishedAt) fail("Only published, completed fixtures can be overturned.");
  return { ...fixture, result: fixture.result };
}
async function assertNotAbandoned(fixtureId: string, db: Db) {
  const rows = await db.$queryRaw<Array<{ id: string }>>(Prisma.sql`SELECT id FROM "FixtureAbandonment" WHERE "fixtureId"=${fixtureId} LIMIT 1`);
  if (rows.length) fail("This is an abandonment or no-show. Use its existing decision process instead.");
}

export async function getResultOverturnPage(fixtureId: string, actorUserId: string) {
  await assertAdmin(actorUserId, prisma);
  const fixture = await loadFixture(fixtureId, prisma);
  const decision = await prisma.matchResultOverturn.findUnique({ where: { fixtureId } });
  if (!decision) await assertNotAbandoned(fixtureId, prisma);
  return { fixture, decision };
}

type Snapshot = Awaited<ReturnType<typeof loadFixture>>;
const fingerprint = (fixture: Snapshot) => createHash("sha256").update(JSON.stringify(fixture)).digest("hex");
function secret() {
  const key = process.env.NEXTAUTH_SECRET;
  if (!key) throw new Error("A signing secret is required for result decisions.");
  return key;
}
function requiredText(value: unknown, name: string, min: number, max: number) {
  if (typeof value !== "string" || value.trim().length < min || value.trim().length > max) fail(`${name} must be ${min}–${max} characters.`);
  return value.trim();
}
type Confirmation = {
  id: string; fixtureId: string; actorUserId: string; winnerTeamId: string;
  reasonCode: OverturnReason; decisionReason: string; evidenceReference: string;
  rulesBasis: string; fingerprint: string; expiresAt: number;
};
function sign(data: Confirmation) {
  const body = Buffer.from(JSON.stringify(data)).toString("base64url");
  return `${body}.${createHmac("sha256", secret()).update(body).digest("base64url")}`;
}
function readToken(token: unknown, fixtureId: string, actorUserId: string): Confirmation {
  if (typeof token !== "string" || token.length > 20000) fail("Invalid decision preview.");
  const [body, signature, extra] = token.split(".");
  if (!body || !signature || extra) fail("Invalid decision preview.");
  const expected = createHmac("sha256", secret()).update(body).digest();
  const actual = Buffer.from(signature, "base64url");
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) fail("The preview has changed. Preview again.");
  let data: Confirmation;
  try { data = JSON.parse(Buffer.from(body, "base64url").toString("utf8")); }
  catch { return fail("Invalid decision preview."); }
  if (data.fixtureId !== fixtureId || data.actorUserId !== actorUserId || !Number.isFinite(data.expiresAt) || data.expiresAt < Date.now()) fail("This preview has expired or belongs to another administrator or fixture. Preview again.");
  return data;
}
const awardedScores = (fixture: Snapshot, winnerTeamId: string) => {
  if (![fixture.homeTeamId, fixture.awayTeamId].includes(winnerTeamId)) fail("Select one of this fixture's teams.");
  return { homeScore: winnerTeamId === fixture.homeTeamId ? 3 : 0, awayScore: winnerTeamId === fixture.awayTeamId ? 3 : 0 };
};

export async function previewResultOverturn(input: {
  fixtureId: string; actorUserId: string; winnerTeamId: unknown; reasonCode: unknown;
  decisionReason: unknown; evidenceReference: unknown; rulesBasis: unknown;
}) {
  await assertAdmin(input.actorUserId, prisma);
  const fixture = await loadFixture(input.fixtureId, prisma);
  if (fixture.result.overturnedAt) fail("This result already has an overturn decision.", 409);
  await assertNotAbandoned(input.fixtureId, prisma);
  const winnerTeamId = typeof input.winnerTeamId === "string" ? input.winnerTeamId : "";
  const awarded = awardedScores(fixture, winnerTeamId);
  const reasonCode = OVERTURN_REASONS.find(reason => reason.value === input.reasonCode)?.value;
  if (!reasonCode) fail("Choose a decision category.");
  const data: Confirmation = { id: randomUUID(), fixtureId: fixture.id, actorUserId: input.actorUserId,
    winnerTeamId, reasonCode,
    decisionReason: requiredText(input.decisionReason, "Decision reason", 20, 4000),
    evidenceReference: requiredText(input.evidenceReference, "Evidence reference", 5, 2000),
    rulesBasis: requiredText(input.rulesBasis, "Applicable rules", 5, 1000),
    fingerprint: fingerprint(fixture), expiresAt: Date.now() + 10 * 60_000 };
  return { token: sign(data), expiresAt: data.expiresAt,
    original: { homeScore: fixture.result.homeScore, awayScore: fixture.result.awayScore }, awarded };
}

export async function confirmResultOverturn(input: { fixtureId: string; actorUserId: string; token: unknown; confirmed: boolean }) {
  await assertAdmin(input.actorUserId, prisma);
  if (!input.confirmed) fail("Confirm the reviewed decision before saving.");
  const confirmation = readToken(input.token, input.fixtureId, input.actorUserId);
  return prisma.$transaction(async db => {
    await assertAdmin(input.actorUserId, db);
    // Stable lock ordering; the database trigger also protects concurrent raw/legacy writers.
    await db.$queryRaw(Prisma.sql`SELECT id FROM "Fixture" WHERE id=${input.fixtureId} FOR UPDATE`);
    await db.$queryRaw(Prisma.sql`SELECT id FROM "MatchResult" WHERE "fixtureId"=${input.fixtureId} FOR UPDATE`);
    const fixture = await loadFixture(input.fixtureId, db);
    const saved = await db.matchResultOverturn.findUnique({ where: { fixtureId: input.fixtureId } });
    if (saved) {
      if (saved.id !== confirmation.id || saved.decidedByUserId !== input.actorUserId) fail("Another decision has already been saved for this fixture.", 409);
      return { fixtureId: fixture.id, leagueId: fixture.leagueId, leagueSlug: fixture.league.slug,
        homeTeamId: fixture.homeTeamId, awayTeamId: fixture.awayTeamId, alreadySaved: true };
    }
    if (fixture.result.overturnedAt || fingerprint(fixture) !== confirmation.fingerprint) fail("The fixture or score changed after preview. Nothing was changed; preview again.", 409);
    await assertNotAbandoned(input.fixtureId, db);
    const awarded = awardedScores(fixture, confirmation.winnerTeamId);
    const decision = await db.matchResultOverturn.create({ data: {
      id: confirmation.id, matchResultId: fixture.result.id, fixtureId: fixture.id,
      homeTeamId: fixture.homeTeamId, awayTeamId: fixture.awayTeamId,
      originalHomeScore: fixture.result.homeScore, originalAwayScore: fixture.result.awayScore,
      awardedHomeScore: awarded.homeScore, awardedAwayScore: awarded.awayScore,
      winnerTeamId: confirmation.winnerTeamId, reasonCode: confirmation.reasonCode,
      decisionReason: confirmation.decisionReason, evidenceReference: confirmation.evidenceReference,
      rulesBasis: confirmation.rulesBasis, decidedByUserId: input.actorUserId,
    } });
    // The migration's INSERT trigger applies the award atomically. Fail closed if
    // it is absent rather than saving an audit record with an unchanged table.
    const after = await db.matchResult.findUnique({ where: { id: fixture.result.id } });
    if (!after || after.homeScore !== awarded.homeScore || after.awayScore !== awarded.awayScore ||
      after.originalHomeScore !== fixture.result.homeScore || after.originalAwayScore !== fixture.result.awayScore ||
      after.overturnedAt?.getTime() !== decision.decidedAt.getTime() || after.enteredAt.getTime() !== fixture.result.enteredAt.getTime()) {
      throw new Error("Result decision did not apply consistently; transaction rolled back.");
    }
    return { fixtureId: fixture.id, leagueId: fixture.leagueId, leagueSlug: fixture.league.slug,
      homeTeamId: fixture.homeTeamId, awayTeamId: fixture.awayTeamId, alreadySaved: false };
  }, { maxWait: 5000, timeout: 15000 });
}
