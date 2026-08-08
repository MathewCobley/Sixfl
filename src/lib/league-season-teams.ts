// ========================================
// File: src/lib/league-season-teams.ts
// ========================================

import { randomUUID } from "crypto";
import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";

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
 * Deprecated compatibility shim while callers are migrated away from the old
 * helper. It intentionally performs no database write. Missing legacy rows are
 * handled once by a deployment migration, never as a side effect of reading a
 * page or API.
 */
export async function ensureSeasonTeamRowsForLeague(
  _leagueId: string,
  _client?: unknown,
) {
  return;
}

/**
 * LeagueSeasonTeam is the authoritative record for current season participation
 * and division placement. Reads in this module are deliberately side-effect free:
 * they never create or repair membership rows from legacy Team.leagueId or
 * Team.divisionId values.
 */
export async function getLeagueSeasonTeams(input: {
  leagueId: string;
  divisionId?: string | null;
  activeOnly?: boolean;
  includeFixturePlaceholders?: boolean;
}) {
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
 * Team.leagueId remains a temporary compatibility field for the older explicit
 * "No league" admin state. It is not used to decide active season membership.
 */
export async function getAffiliatedTeamsOutsideSeason(leagueId: string) {
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

async function assertTeamCanEnterSeason(input: {
  leagueId: string;
  teamId: string;
}) {
  const rows = await prisma.$queryRaw<Array<{ id: string }>>(Prisma.sql`
    SELECT t."id"
    FROM "Team" t
    JOIN "League" target ON target."id" = ${input.leagueId}
    LEFT JOIN "League" legacy_league ON legacy_league."id" = t."leagueId"
    WHERE t."id" = ${input.teamId}
      AND COALESCE(t."isFixturePlaceholder", false) = false
      AND (
        EXISTS (
          SELECT 1
          FROM "LeagueSeasonTeam" existing
          WHERE existing."leagueId" = target."id"
            AND existing."teamId" = t."id"
        )
        OR (
          target."competitionId" IS NOT NULL
          AND (
            t."competitionId" = target."competitionId"
            OR legacy_league."competitionId" = target."competitionId"
          )
        )
        OR (
          target."competitionId" IS NULL
          AND t."leagueId" = target."id"
        )
      )
    LIMIT 1
  `);

  if (!rows[0]) {
    throw new Error(
      "This team is not affiliated with this competition. Set its competition affiliation before entering it in the season.",
    );
  }
}

export async function setSeasonTeamDivision(input: {
  leagueId: string;
  teamId: string;
  divisionId: string | null;
}) {
  await assertTeamCanEnterSeason({
    leagueId: input.leagueId,
    teamId: input.teamId,
  });

  if (input.divisionId) {
    const matchingDivision = await prisma.$queryRaw<Array<{ id: string }>>(Prisma.sql`
      SELECT "id"
      FROM "LeagueDivision"
      WHERE "id" = ${input.divisionId}
        AND "leagueId" = ${input.leagueId}
        AND "isActive" = true
      LIMIT 1
    `);

    if (!matchingDivision[0]) {
      throw new Error("Division must be an active division in this season.");
    }
  }

  await prisma.$executeRaw(Prisma.sql`
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
      current_lst."divisionId" AS "divisionId",
      COALESCE(t."competitionId", l."competitionId") AS "competitionId",
      c."name" AS "competitionName",
      c."currentLeagueId" AS "currentLeagueId",
      current_l."season" AS "currentSeason",
      COALESCE(current_lst."isActive", false) AS "currentSeasonIsActive"
    FROM "Team" t
    LEFT JOIN "League" l ON l."id" = t."leagueId"
    LEFT JOIN "LeagueCompetition" c ON c."id" = COALESCE(t."competitionId", l."competitionId")
    LEFT JOIN "League" current_l ON current_l."id" = c."currentLeagueId"
    LEFT JOIN "LeagueSeasonTeam" current_lst
      ON current_lst."teamId" = t."id"
     AND current_lst."leagueId" = c."currentLeagueId"
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

    // Team.competitionId is the long-lived affiliation. leagueId is retained only
    // as a temporary compatibility pointer for older admin surfaces; it does not
    // activate the team in the season and divisionId is no longer mirrored here.
    await tx.$executeRaw(Prisma.sql`
      UPDATE "Team"
      SET
        "competitionId" = ${competition.competitionId},
        "leagueId" = ${competition.currentLeagueId},
        "divisionId" = NULL,
        "updatedAt" = NOW()
      WHERE "id" = ${input.teamId}
    `);
  });
}
