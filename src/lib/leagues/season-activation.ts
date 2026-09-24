import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

export class SeasonActivationError extends Error {
  constructor(message: string, public readonly status = 400) {
    super(message);
    this.name = "SeasonActivationError";
  }
}

/** Called only by the authenticated admin endpoint. This is NOT publication:
 * it cannot set publicAt, publish fixtures, change fees or queue messages. */
export async function makeLeagueSeasonCurrent(input: {
  leagueId: string;
  expectedCurrentLeagueId: string | null;
  confirmed: boolean;
}) {
  if (input.confirmed !== true) {
    throw new SeasonActivationError("Please confirm the season switch.");
  }

  return prisma.$transaction(async (tx) => {
    const rows = await tx.$queryRaw<Array<{
      id: string;
      slug: string;
      competitionId: string;
      currentLeagueId: string | null;
      isActive: boolean;
      competitionActive: boolean;
      publicAt: Date | null;
    }>>(Prisma.sql`
      SELECT l."id", l."slug", l."competitionId", l."isActive", l."publicAt",
        c."currentLeagueId", c."isActive" AS "competitionActive"
      FROM "League" l
      JOIN "LeagueCompetition" c ON c."id" = l."competitionId"
      WHERE l."id" = ${input.leagueId}
      FOR UPDATE OF c, l
    `);
    const target = rows[0];
    if (!target) {
      throw new SeasonActivationError("This season is not linked to a competition.", 404);
    }
    if (!target.isActive || !target.competitionActive) {
      throw new SeasonActivationError("The season and its competition must be active before switching.");
    }
    if (!target.publicAt || target.publicAt.getTime() > Date.now()) {
      throw new SeasonActivationError(
        "This season is still private or scheduled. Save a Public go-live time that has arrived before making it current.",
      );
    }
    if (target.currentLeagueId === target.id) {
      return { leagueId: target.id, slug: target.slug, previousLeagueId: target.id, previousSlug: target.slug, teamIds: [] as string[] };
    }
    if (target.currentLeagueId !== input.expectedCurrentLeagueId) {
      throw new SeasonActivationError("The current season has changed. Refresh the page and review the switch again.", 409);
    }

    const teams = await tx.$queryRaw<Array<{
      id: string;
      competitionId: string | null;
      leagueId: string | null;
      divisionId: string | null;
      divisionLeagueId: string | null;
    }>>(Prisma.sql`
      SELECT t."id", t."competitionId", t."leagueId", lst."divisionId",
        d."leagueId" AS "divisionLeagueId"
      FROM "LeagueSeasonTeam" lst
      JOIN "Team" t ON t."id" = lst."teamId"
      LEFT JOIN "LeagueDivision" d ON d."id" = lst."divisionId"
      WHERE lst."leagueId" = ${target.id} AND lst."isActive" = true
      ORDER BY t."id"
      FOR UPDATE OF t, lst
    `);
    if (teams.some((team) => team.competitionId !== target.competitionId || !team.leagueId)) {
      throw new SeasonActivationError("Some teams have left this competition. Review the season team list before switching.");
    }
    if (teams.some((team) => team.divisionId && team.divisionLeagueId !== target.id)) {
      throw new SeasonActivationError("A team has a division from another season. Review its division before switching.");
    }

    const previous = target.currentLeagueId
      ? await tx.league.findUnique({ where: { id: target.currentLeagueId }, select: { slug: true } })
      : null;

    await tx.$executeRaw(Prisma.sql`
      UPDATE "LeagueCompetition"
      SET "currentLeagueId" = ${target.id}, "updatedAt" = NOW()
      WHERE "id" = ${target.competitionId}
    `);
    await tx.$executeRaw(Prisma.sql`
      UPDATE "Team" t
      SET "leagueId" = ${target.id}, "divisionId" = lst."divisionId", "updatedAt" = NOW()
      FROM "LeagueSeasonTeam" lst
      WHERE lst."teamId" = t."id" AND lst."leagueId" = ${target.id}
        AND lst."isActive" = true AND t."competitionId" = ${target.competitionId}
    `);

    // Old season memberships, results, fixtures and all financial records remain.
    return {
      leagueId: target.id,
      slug: target.slug,
      previousLeagueId: target.currentLeagueId,
      previousSlug: previous?.slug ?? null,
      teamIds: teams.map((team) => team.id),
    };
  });
}
