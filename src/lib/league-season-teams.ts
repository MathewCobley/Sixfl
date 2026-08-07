// ========================================
// File: src/lib/league-season-teams.ts
// ========================================

import { randomUUID } from "crypto";
import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";

type RawDbClient = Pick<typeof prisma, "$executeRaw" | "$queryRaw">;

export type LeagueSeasonTeamRow = {
  id: string;
  teamId: string;
  teamName: string;
  logoUrl: string | null;
  contactEmail: string | null;
  contactPhone: string | null;
  divisionId: string | null;
  divisionName: string | null;
};

export type CompetitionOption = {
  id: string;
  name: string;
  slug: string;
  currentLeagueId: string | null;
  currentSeason: string | null;
};

/**
 * Backfill legacy Team.leagueId rows without changing an explicit season status.
 *
 * The key distinction is:
 * - Team affiliation is long-lived (Team.competitionId / legacy Team.leagueId).
 * - LeagueSeasonTeam.isActive controls whether the team is playing this season.
 *
 * A read must never reactivate a team that an admin deliberately removed from a
 * season, so the conflict update intentionally leaves isActive untouched.
 */
export async function ensureSeasonTeamRowsForLeague(
  leagueId: string,
  client: RawDbClient = prisma,
) {
  await client.$executeRaw(Prisma.sql`
    INSERT INTO "LeagueSeasonTeam" (
      "id",
      "leagueId",
      "teamId",
      "divisionId",
      "isActive",
      "createdAt",
      "updatedAt"
    )
    SELECT
      ${"lst_"} || md5(t."id" || ':' || t."leagueId"),
      t."leagueId",
      t."id",
      t."divisionId",
      true,
      NOW(),
      NOW()
    FROM "Team" t
    WHERE t."leagueId" = ${leagueId}
      AND COALESCE(t."isFixturePlaceholder", false) = false
    ON CONFLICT ("leagueId", "teamId") DO UPDATE
    SET
      "divisionId" = COALESCE("LeagueSeasonTeam"."divisionId", EXCLUDED."divisionId"),
      "updatedAt" = NOW()
  `);
}

export async function getLeagueSeasonTeams(input: {
  leagueId: string;
  divisionId?: string | null;
  activeOnly?: boolean;
  includeFixturePlaceholders?: boolean;
}) {
  await ensureSeasonTeamRowsForLeague(input.leagueId);

  const activeOnly = input.activeOnly ?? true;
  const includeFixturePlaceholders = input.includeFixturePlaceholders ?? false;

  if (input.divisionId) {
    return prisma.$queryRaw<LeagueSeasonTeamRow[]>(Prisma.sql`
      SELECT
        lst."id",
        t."id" AS "teamId",
        t."name" AS "teamName",
        t."logoUrl",
        t."contactEmail",
        t."contactPhone",
        lst."divisionId",
        d."name" AS "divisionName"
      FROM "LeagueSeasonTeam" lst
      JOIN "Team" t ON t."id" = lst."teamId"
      LEFT JOIN "LeagueDivision" d ON d."id" = lst."divisionId"
      WHERE lst."leagueId" = ${input.leagueId}
        AND lst."divisionId" = ${input.divisionId}
        AND (${activeOnly} = false OR lst."isActive" = true)
        AND (${includeFixturePlaceholders} = true OR COALESCE(t."isFixturePlaceholder", false) = false)
      ORDER BY t."name" ASC
    `);
  }

  return prisma.$queryRaw<LeagueSeasonTeamRow[]>(Prisma.sql`
    SELECT
      lst."id",
      t."id" AS "teamId",
      t."name" AS "teamName",
      t."logoUrl",
      t."contactEmail",
      t."contactPhone",
      lst."divisionId",
      d."name" AS "divisionName"
    FROM "LeagueSeasonTeam" lst
    JOIN "Team" t ON t."id" = lst."teamId"
    LEFT JOIN "LeagueDivision" d ON d."id" = lst."divisionId"
    WHERE lst."leagueId" = ${input.leagueId}
      AND (${activeOnly} = false OR lst."isActive" = true)
      AND (${includeFixturePlaceholders} = true OR COALESCE(t."isFixturePlaceholder", false) = false)
    ORDER BY t."name" ASC
  `);
}

/**
 * Teams affiliated with the parent competition but not entered in this season.
 * These teams retain captain access, PlayerPool visibility and league comms,
 * while staying out of tables, fixtures and season counts.
 *
 * Team.leagueId = NULL is the explicit "No league" state. Such a team must not
 * appear as affiliated to any competition even if stale competitionId data is
 * still present from an older migration or admin flow.
 */
export async function getAffiliatedTeamsOutsideSeason(leagueId: string) {
  await ensureSeasonTeamRowsForLeague(leagueId);

  return prisma.$queryRaw<LeagueSeasonTeamRow[]>(Prisma.sql`
    SELECT
      COALESCE(lst."id", ${"affiliated_"} || md5(t."id" || ':' || target."id")) AS "id",
      t."id" AS "teamId",
      t."name" AS "teamName",
      t."logoUrl",
      t."contactEmail",
      t."contactPhone",
      lst."divisionId",
      d."name" AS "divisionName"
    FROM "League" target
    JOIN "Team" t ON (
      t."leagueId" = target."id"
      OR (
        target."competitionId" IS NOT NULL
        AND (
          t."competitionId" = target."competitionId"
          OR EXISTS (
            SELECT 1
            FROM "League" team_league
            WHERE team_league."id" = t."leagueId"
              AND team_league."competitionId" = target."competitionId"
          )
        )
      )
    )
    LEFT JOIN "LeagueSeasonTeam" lst
      ON lst."leagueId" = target."id"
     AND lst."teamId" = t."id"
    LEFT JOIN "LeagueDivision" d ON d."id" = lst."divisionId"
    WHERE target."id" = ${leagueId}
      AND t."leagueId" IS NOT NULL
      AND COALESCE(lst."isActive", false) = false
      AND COALESCE(t."isFixturePlaceholder", false) = false
    ORDER BY t."name" ASC
  `);
}

export async function getLeagueSeasonTeamIds(input: {
  leagueId: string;
  divisionId?: string | null;
  includeFixturePlaceholders?: boolean;
}) {
  const rows = await getLeagueSeasonTeams(input);
  return rows.map((row) => row.teamId);
}

export async function setSeasonTeamDivision(input: {
  leagueId: string;
  teamId: string;
  divisionId: string | null;
}) {
  await ensureSeasonTeamRowsForLeague(input.leagueId);

  if (input.divisionId) {
    const matchingDivision = await prisma.$queryRaw<Array<{ id: string }>>(Prisma.sql`
      SELECT "id"
      FROM "LeagueDivision"
      WHERE "id" = ${input.divisionId}
        AND "leagueId" = ${input.leagueId}
      LIMIT 1
    `);

    if (!matchingDivision[0]) {
      throw new Error("Division must belong to this season.");
    }
  }

  await prisma.$transaction(async (tx) => {
    await tx.$executeRaw(Prisma.sql`
      INSERT INTO "LeagueSeasonTeam" (
        "id",
        "leagueId",
        "teamId",
        "divisionId",
        "isActive",
        "createdAt",
        "updatedAt"
      )
      VALUES (
        ${randomUUID()},
        ${input.leagueId},
        ${input.teamId},
        ${input.divisionId},
        true,
        NOW(),
        NOW()
      )
      ON CONFLICT ("leagueId", "teamId") DO UPDATE
      SET
        "divisionId" = EXCLUDED."divisionId",
        "isActive" = true,
        "updatedAt" = NOW()
    `);

    await tx.$executeRaw(Prisma.sql`
      UPDATE "Team" t
      SET
        "leagueId" = l."id",
        "competitionId" = COALESCE(l."competitionId", t."competitionId"),
        "divisionId" = ${input.divisionId},
        "updatedAt" = NOW()
      FROM "League" l
      WHERE t."id" = ${input.teamId}
        AND l."id" = ${input.leagueId}
    `);
  });
}

export async function setTeamCompetitionFromLeague(input: {
  teamId: string;
  leagueId: string | null;
}) {
  if (!input.leagueId) return;

  await prisma.$executeRaw(Prisma.sql`
    UPDATE "Team" t
    SET
      "competitionId" = l."competitionId",
      "updatedAt" = NOW()
    FROM "League" l
    WHERE t."id" = ${input.teamId}
      AND l."id" = ${input.leagueId}
      AND l."competitionId" IS NOT NULL
  `);
}

export async function getCompetitionOptions() {
  try {
    return prisma.$queryRaw<CompetitionOption[]>(Prisma.sql`
      SELECT
        c."id",
        c."name",
        c."slug",
        c."currentLeagueId",
        l."season" AS "currentSeason"
      FROM "LeagueCompetition" c
      LEFT JOIN "League" l ON l."id" = c."currentLeagueId"
      WHERE c."isActive" = true
      ORDER BY c."name" ASC
    `);
  } catch {
    return [];
  }
}

export async function getTeamCompetitionData(teamId: string) {
  const rows = await prisma.$queryRaw<Array<{
    id: string;
    name: string;
    leagueId: string | null;
    divisionId: string | null;
    competitionId: string | null;
    competitionName: string | null;
    currentLeagueId: string | null;
    currentSeason: string | null;
    currentSeasonIsActive: boolean;
  }>>(Prisma.sql`
    SELECT
      t."id",
      t."name",
      t."leagueId",
      t."divisionId",
      COALESCE(t."competitionId", l."competitionId") AS "competitionId",
      c."name" AS "competitionName",
      c."currentLeagueId" AS "currentLeagueId",
      current_l."season" AS "currentSeason",
      EXISTS (
        SELECT 1
        FROM "LeagueSeasonTeam" current_lst
        WHERE current_lst."teamId" = t."id"
          AND current_lst."leagueId" = c."currentLeagueId"
          AND current_lst."isActive" = true
      ) AS "currentSeasonIsActive"
    FROM "Team" t
    LEFT JOIN "League" l ON l."id" = t."leagueId"
    LEFT JOIN "LeagueCompetition" c ON c."id" = COALESCE(t."competitionId", l."competitionId")
    LEFT JOIN "League" current_l ON current_l."id" = c."currentLeagueId"
    WHERE t."id" = ${teamId}
    LIMIT 1
  `);

  return rows[0] ?? null;
}

/**
 * Change long-term competition affiliation without automatically entering a
 * season. Existing active entries within the same competition are preserved;
 * entries from other competitions are deactivated.
 */
export async function updateTeamCompetition(input: {
  teamId: string;
  competitionId: string | null;
}) {
  if (!input.competitionId) {
    await prisma.$transaction(async (tx) => {
      await tx.$executeRaw(Prisma.sql`
        UPDATE "Team"
        SET
          "competitionId" = NULL,
          "leagueId" = NULL,
          "divisionId" = NULL,
          "updatedAt" = NOW()
        WHERE "id" = ${input.teamId}
      `);

      await tx.$executeRaw(Prisma.sql`
        UPDATE "LeagueSeasonTeam"
        SET
          "isActive" = false,
          "divisionId" = NULL,
          "updatedAt" = NOW()
        WHERE "teamId" = ${input.teamId}
      `);
    });
    return;
  }

  const rows = await prisma.$queryRaw<Array<{
    competitionId: string;
    currentLeagueId: string | null;
  }>>(Prisma.sql`
    SELECT "id" AS "competitionId", "currentLeagueId"
    FROM "LeagueCompetition"
    WHERE "id" = ${input.competitionId}
    LIMIT 1
  `);

  const competition = rows[0];
  if (!competition) throw new Error("Competition not found.");

  await prisma.$transaction(async (tx) => {
    await tx.$executeRaw(Prisma.sql`
      UPDATE "LeagueSeasonTeam" lst
      SET
        "isActive" = false,
        "divisionId" = NULL,
        "updatedAt" = NOW()
      FROM "League" l
      WHERE lst."leagueId" = l."id"
        AND lst."teamId" = ${input.teamId}
        AND l."competitionId" IS DISTINCT FROM ${competition.competitionId}
    `);

    if (competition.currentLeagueId) {
      await tx.$executeRaw(Prisma.sql`
        INSERT INTO "LeagueSeasonTeam" (
          "id",
          "leagueId",
          "teamId",
          "divisionId",
          "isActive",
          "createdAt",
          "updatedAt"
        )
        VALUES (
          ${randomUUID()},
          ${competition.currentLeagueId},
          ${input.teamId},
          NULL,
          false,
          NOW(),
          NOW()
        )
        ON CONFLICT ("leagueId", "teamId") DO NOTHING
      `);
    }

    await tx.$executeRaw(Prisma.sql`
      UPDATE "Team" t
      SET
        "competitionId" = ${competition.competitionId},
        "leagueId" = ${competition.currentLeagueId},
        "divisionId" = (
          SELECT lst."divisionId"
          FROM "LeagueSeasonTeam" lst
          WHERE lst."teamId" = t."id"
            AND lst."leagueId" = ${competition.currentLeagueId}
            AND lst."isActive" = true
          LIMIT 1
        ),
        "updatedAt" = NOW()
      WHERE t."id" = ${input.teamId}
    `);
  });
}
