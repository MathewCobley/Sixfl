import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { RESULT_OVERTURN_REASONS } from "./result-score";

type Db = Pick<typeof prisma, "user" | "fixture" | "matchResult" | "matchResultOverturn" | "$queryRaw" | "$executeRaw">;
export class ResultOverturnError extends Error {}

export type ResultOverturnInput = {
  fixtureId: string; actorUserId: string; requestId: string; winnerTeamId: string;
  reasonCode: string; evidenceNote: string; rulesBasis: string;
  expectedResultUpdatedAt: string; expectedHomeScore: number; expectedAwayScore: number;
  confirmed: boolean;
};

async function administrator(db: Db, id: string) {
  const actor = id ? await db.user.findUnique({ where: { id }, select: { id: true, role: true, name: true, email: true } }) : null;
  if (!actor || actor.role !== "ADMIN") throw new ResultOverturnError("Administrator access is required.");
  return actor;
}

/** No payments, notifications, predictor regeneration or fixture updates. The
 * recorded score is the official competition result; the audit holds the play. */
export async function recordResultOverturn(input: ResultOverturnInput) {
  await administrator(prisma, input.actorUserId);
  if (!input.confirmed) throw new ResultOverturnError("Confirm the played result, evidence and awarded winner first.");
  if (!/^[0-9a-f-]{36}$/i.test(input.requestId)) throw new ResultOverturnError("Reload the form before saving.");
  if (!RESULT_OVERTURN_REASONS.some(r => r.value === input.reasonCode)) throw new ResultOverturnError("Choose a valid decision reason.");
  const evidenceNote = input.evidenceNote.trim();
  const rulesBasis = input.rulesBasis.trim();
  if (evidenceNote.length < 10 || evidenceNote.length > 4000 || rulesBasis.length < 5 || rulesBasis.length > 500)
    throw new ResultOverturnError("Record the evidence (10–4,000 characters) and applicable rules (5–500 characters).");

  return prisma.$transaction(async db => {
    const actor = await administrator(db, input.actorUserId);
    // Same fixture -> result lock order for concurrent administrative decisions.
    await db.$queryRaw(Prisma.sql`SELECT id FROM "Fixture" WHERE id=${input.fixtureId} FOR UPDATE`);
    await db.$queryRaw(Prisma.sql`SELECT id FROM "MatchResult" WHERE "fixtureId"=${input.fixtureId} FOR UPDATE`);
    const fixture = await db.fixture.findUnique({ where: { id: input.fixtureId }, include: {
      league: { select: { slug: true } }, homeTeam: { select: { id: true, name: true } }, awayTeam: { select: { id: true, name: true } },
      result: { include: { overturn: true } },
    } });
    if (!fixture || !fixture.result) throw new ResultOverturnError("A recorded played result is required.");
    const result = fixture.result;
    const receipt = { fixtureId: fixture.id, leagueSlug: fixture.league.slug, homeTeamId: fixture.homeTeamId, awayTeamId: fixture.awayTeamId };
    const awardedHomeScore = input.winnerTeamId === fixture.homeTeamId ? 3 : 0;
    const awardedAwayScore = input.winnerTeamId === fixture.awayTeamId ? 3 : 0;
    if (!awardedHomeScore && !awardedAwayScore) throw new ResultOverturnError("The awarded winner must be one of these two teams.");
    if (result.overturn) {
      const d = result.overturn;
      if (d.id === input.requestId && d.decidedByUserId === actor.id && d.awardedHomeScore === awardedHomeScore &&
          d.awardedAwayScore === awardedAwayScore && d.reasonCode === input.reasonCode && d.evidenceNote === evidenceNote && d.rulesBasis === rulesBasis)
        return { ...receipt, alreadySaved: true };
      throw new ResultOverturnError("This result already has an immutable overturn decision. Open its recorded history.");
    }
    if (fixture.status !== "COMPLETED" || !fixture.publishedAt || fixture.kickoffAt.getTime() > Date.now())
      throw new ResultOverturnError("Only a published, completed played fixture can be overturned here.");
    const abandoned = await db.$queryRaw<Array<{ id: string }>>(Prisma.sql`SELECT id FROM "FixtureAbandonment" WHERE "fixtureId"=${fixture.id}`);
    if (abandoned.length) throw new ResultOverturnError("Use the separate abandoned/no-show decision workflow for this fixture.");
    if (result.homeScore !== input.expectedHomeScore || result.awayScore !== input.expectedAwayScore ||
        result.updatedAt.toISOString() !== input.expectedResultUpdatedAt)
      throw new ResultOverturnError("The result changed after the form was opened. Reload and review it again.");
    await db.matchResultOverturn.create({ data: {
      id: input.requestId, matchResultId: result.id, fixtureId: fixture.id,
      homeTeamId: fixture.homeTeamId, awayTeamId: fixture.awayTeamId,
      homeTeamName: fixture.homeTeam.name, awayTeamName: fixture.awayTeam.name,
      originalHomeScore: result.homeScore, originalAwayScore: result.awayScore, originalEnteredAt: result.enteredAt,
      awardedHomeScore, awardedAwayScore, reasonCode: input.reasonCode, evidenceNote, rulesBasis,
      decidedByUserId: actor.id, decidedByName: actor.name || actor.email || "SIXFL administrator",
    } });
    await db.$queryRaw(Prisma.sql`SELECT set_config('sixfl.result_overturn_id', ${input.requestId}, true)`);
    // Preserve enteredAt and enteredByUserId: the original referee record and
    // pre-kickoff predictor backtests must not acquire a later decision date.
    await db.matchResult.update({ where: { id: result.id }, data: { homeScore: awardedHomeScore, awayScore: awardedAwayScore } });
    return { ...receipt, alreadySaved: false };
  }, { maxWait: 5000, timeout: 15000 });
}
