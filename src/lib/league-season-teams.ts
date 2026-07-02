// ========================================
// File: src/lib/league-season-teams.ts
// ========================================

import { randomUUID } from "crypto";
import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";

type PrismaClientLike = typeof prisma | Prisma.TransactionClient;

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

export async function ensureSeasonTeamRowsForLeague(
  leagueId: string,
  client: PrismaClientLike = prisma,
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
      ${"lst_"} || md5(random()::text || clock_timestamp()::text || t."id"),
      t."leagueId",
      t."id",
      t."divisionId",
      true,
      NOW(),
      NOW()
    FROM "Team" t
    WHERE t."leagueId" = ${leagueId}
    ON CONFLICT ("leagueId", "teamId") DO UPDATE
    SET
      "divisionId" = COALESCE("LeagueSeasonTeam"."divisionId", EXCLUDED."divisionId"),
      "isActive" = true,
      "updatedAt" = NOW()
  `);
}

export async function getLeagueSeasonTeams(input: {
  leagueId: string;
  divisionId?: string | null;
  activeOnly?: boolean;
}) {
  await ensureSeasonTeamRowsForLeague(input.leagueId);

  const activeOnly = input.activeOnly ?? true;

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
    ORDER BY t."name" ASC
  `);
}

export async function getLeagueSeasonTeamIds(input: {
  leagueId: string;
  divisionId?: string | null;
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

  await prisma.$executeRaw(Prisma.sql`
    UPDATE "Team"
    SET
      "divisionId" = CASE WHEN "leagueId" = ${input.leagueId} THEN ${input.divisionId} ELSE "divisionId" END,
      "updatedAt" = NOW()
    WHERE "id" = ${input.teamId}
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
