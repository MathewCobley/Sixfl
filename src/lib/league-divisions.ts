// ========================================
// File: src/lib/league-divisions.ts
// ========================================

import { randomUUID } from "crypto";
import { Prisma } from "@prisma/client";

import { setSeasonTeamDivision } from "@/lib/league-season-teams";
import { prisma } from "@/lib/prisma";

export type LeagueDivisionRow = {
  id: string;
  leagueId: string;
  name: string;
  slug: string;
  sortOrder: number;
  isActive: boolean;
  teamCount: number;
};

export type LeagueDivisionOption = LeagueDivisionRow & {
  leagueName: string;
  leagueSeason: string | null;
};

export const DEFAULT_DIVISIONS = [
  { name: "Premiership", slug: "premiership", sortOrder: 1 },
  { name: "Championship", slug: "championship", sortOrder: 2 },
];

export function slugifyDivision(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function normaliseDivisionRows(rows: LeagueDivisionRow[]) {
  return rows.map((row) => ({
    ...row,
    sortOrder: Number(row.sortOrder ?? 0),
    teamCount: Number(row.teamCount ?? 0),
    isActive: Boolean(row.isActive),
  }));
}

export async function getLeagueDivisions(leagueId: string) {
  try {
    const rows = await prisma.$queryRaw<LeagueDivisionRow[]>(Prisma.sql`
      SELECT
        d."id",
        d."leagueId",
        d."name",
        d."slug",
        d."sortOrder",
        d."isActive",
        COUNT(t."id")::int AS "teamCount"
      FROM "LeagueDivision" d
      LEFT JOIN "LeagueSeasonTeam" lst
        ON lst."leagueId" = d."leagueId"
       AND lst."divisionId" = d."id"
       AND lst."isActive" = true
      LEFT JOIN "Team" t
        ON t."id" = lst."teamId"
       AND COALESCE(t."isFixturePlaceholder", false) = false
      WHERE d."leagueId" = ${leagueId}
        AND d."isActive" = true
      GROUP BY d."id", d."leagueId", d."name", d."slug", d."sortOrder", d."isActive"
      ORDER BY d."sortOrder" ASC, d."name" ASC
    `);

    return normaliseDivisionRows(rows);
  } catch {
    return [];
  }
}

export async function getAllLeagueDivisionOptions() {
  try {
    const rows = await prisma.$queryRaw<LeagueDivisionOption[]>(Prisma.sql`
      SELECT
        d."id",
        d."leagueId",
        d."name",
        d."slug",
        d."sortOrder",
        d."isActive",
        COUNT(t."id")::int AS "teamCount",
        l."name" AS "leagueName",
        l."season" AS "leagueSeason"
      FROM "LeagueDivision" d
      JOIN "League" l ON l."id" = d."leagueId"
      LEFT JOIN "LeagueSeasonTeam" lst
        ON lst."leagueId" = d."leagueId"
       AND lst."divisionId" = d."id"
       AND lst."isActive" = true
      LEFT JOIN "Team" t
        ON t."id" = lst."teamId"
       AND COALESCE(t."isFixturePlaceholder", false) = false
      WHERE d."isActive" = true
      GROUP BY d."id", d."leagueId", d."name", d."slug", d."sortOrder", d."isActive", l."name", l."season"
      ORDER BY l."name" ASC, l."season" ASC, d."sortOrder" ASC, d."name" ASC
    `);

    return rows.map((row) => ({
      ...row,
      sortOrder: Number(row.sortOrder ?? 0),
      teamCount: Number(row.teamCount ?? 0),
      isActive: Boolean(row.isActive),
    }));
  } catch {
    return [];
  }
}

/**
 * Compatibility helper for older callers. The current division is read from the
 * active LeagueSeasonTeam row for the team's competition current season, never
 * from Team.divisionId.
 */
export async function getTeamDivisionId(teamId: string) {
  try {
    const rows = await prisma.$queryRaw<Array<{ divisionId: string | null }>>(Prisma.sql`
      SELECT current_lst."divisionId"
      FROM "Team" t
      LEFT JOIN "League" legacy_l ON legacy_l."id" = t."leagueId"
      LEFT JOIN "LeagueCompetition" c
        ON c."id" = COALESCE(t."competitionId", legacy_l."competitionId")
      LEFT JOIN "LeagueSeasonTeam" current_lst
        ON current_lst."teamId" = t."id"
       AND current_lst."leagueId" = c."currentLeagueId"
       AND current_lst."isActive" = true
      WHERE t."id" = ${teamId}
      LIMIT 1
    `);

    return rows[0]?.divisionId ?? null;
  } catch {
    return null;
  }
}

export async function getTeamDivisionMap(leagueId: string) {
  try {
    const rows = await prisma.$queryRaw<Array<{ id: string; divisionId: string | null }>>(Prisma.sql`
      SELECT lst."teamId" AS "id", lst."divisionId"
      FROM "LeagueSeasonTeam" lst
      WHERE lst."leagueId" = ${leagueId}
        AND lst."isActive" = true
    `);

    return new Map(rows.map((row) => [row.id, row.divisionId]));
  } catch {
    return new Map<string, string | null>();
  }
}

export async function createLeagueDivision(input: {
  leagueId: string;
  name: string;
  slug?: string | null;
  sortOrder?: number | null;
  isActive?: boolean;
}) {
  const name = input.name.trim();
  const slug = slugifyDivision(input.slug?.trim() || name);
  const sortOrder = input.sortOrder ?? 0;
  const id = randomUUID();

  if (!name || !slug) {
    throw new Error("Division name is required.");
  }

  await prisma.$executeRaw(Prisma.sql`
    INSERT INTO "LeagueDivision" (
      "id",
      "leagueId",
      "name",
      "slug",
      "sortOrder",
      "isActive",
      "createdAt",
      "updatedAt"
    )
    VALUES (
      ${id},
      ${input.leagueId},
      ${name},
      ${slug},
      ${sortOrder},
      ${input.isActive ?? true},
      NOW(),
      NOW()
    )
  `);

  return { id, name, slug };
}

export async function ensureDefaultLeagueDivisions(leagueId: string) {
  for (const division of DEFAULT_DIVISIONS) {
    await prisma.$executeRaw(Prisma.sql`
      INSERT INTO "LeagueDivision" (
        "id",
        "leagueId",
        "name",
        "slug",
        "sortOrder",
        "isActive",
        "createdAt",
        "updatedAt"
      )
      VALUES (
        ${randomUUID()},
        ${leagueId},
        ${division.name},
        ${division.slug},
        ${division.sortOrder},
        true,
        NOW(),
        NOW()
      )
      ON CONFLICT ("leagueId", "slug") DO UPDATE
      SET
        "name" = EXCLUDED."name",
        "sortOrder" = EXCLUDED."sortOrder",
        "isActive" = true,
        "updatedAt" = NOW()
    `);
  }
}

/**
 * Compatibility wrapper. All division assignment now updates the canonical
 * LeagueSeasonTeam row; Team.divisionId is never written here.
 */
export async function updateTeamDivision(input: {
  teamId: string;
  leagueId: string | null;
  divisionId: string | null;
}) {
  if (!input.leagueId) {
    throw new Error("A current season is required before assigning a division.");
  }

  await setSeasonTeamDivision({
    teamId: input.teamId,
    leagueId: input.leagueId,
    divisionId: input.divisionId,
  });
}
