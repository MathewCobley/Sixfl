// ========================================
// File: src/lib/league-competitions.ts
// ========================================

import { randomUUID } from "crypto";
import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import {
  ensureSeasonTeamRowsForLeague,
  getLeagueSeasonTeams,
} from "@/lib/league-season-teams";

export type CompetitionSeasonRow = {
  id: string;
  name: string;
  slug: string;
  season: string | null;
  isActive: boolean;
  teamCount: number;
  fixtureCount: number;
  completedFixtureCount: number;
  isCurrent: boolean;
};

export type CompetitionSummary = {
  competition: {
    id: string;
    name: string;
    slug: string;
    currentLeagueId: string | null;
  } | null;
  seasons: CompetitionSeasonRow[];
};

export function slugifyCompetition(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function seasonSlugPart(value: string) {
  return slugifyCompetition(value) || "season";
}

function normaliseSeasonRows(rows: CompetitionSeasonRow[]) {
  return rows.map((season) => ({
    ...season,
    isActive: Boolean(season.isActive),
    isCurrent: Boolean(season.isCurrent),
    teamCount: Number(season.teamCount ?? 0),
    fixtureCount: Number(season.fixtureCount ?? 0),
    completedFixtureCount: Number(season.completedFixtureCount ?? 0),
  }));
}

async function getCompetitionSeasonRows(input: {
  competitionId: string;
  currentLeagueId: string | null;
  publicOnly?: boolean;
}) {
  const rows = await prisma.$queryRaw<CompetitionSeasonRow[]>(Prisma.sql`
    SELECT
      l."id",
      l."name",
      l."slug",
      l."season",
      l."isActive",
      COUNT(DISTINCT COALESCE(lst."teamId", t."id"))::int AS "teamCount",
      COUNT(DISTINCT f."id")::int AS "fixtureCount",
      COUNT(DISTINCT CASE WHEN f."status" = 'COMPLETED' THEN f."id" END)::int AS "completedFixtureCount",
      (l."id" = ${input.currentLeagueId}) AS "isCurrent"
    FROM "League" l
    LEFT JOIN "LeagueSeasonTeam" lst ON lst."leagueId" = l."id" AND lst."isActive" = true
    LEFT JOIN "Team" t ON t."leagueId" = l."id"
    LEFT JOIN "Fixture" f ON f."leagueId" = l."id"
    WHERE l."competitionId" = ${input.competitionId}
      AND (${input.publicOnly ?? false} = false OR l."isActive" = true)
    GROUP BY l."id", l."name", l."slug", l."season", l."isActive"
    ORDER BY (l."id" = ${input.currentLeagueId}) DESC, COALESCE(l."season", '') DESC, l."createdAt" DESC
  `);

  return normaliseSeasonRows(rows);
}

export async function getCompetitionSummaryForLeague(
  leagueId: string,
): Promise<CompetitionSummary> {
  try {
    const rows = await prisma.$queryRaw<Array<{
      competitionId: string | null;
      competitionName: string | null;
      competitionSlug: string | null;
      currentLeagueId: string | null;
    }>>(Prisma.sql`
      SELECT
        c."id" AS "competitionId",
        c."name" AS "competitionName",
        c."slug" AS "competitionSlug",
        c."currentLeagueId" AS "currentLeagueId"
      FROM "League" l
      LEFT JOIN "LeagueCompetition" c ON c."id" = l."competitionId"
      WHERE l."id" = ${leagueId}
      LIMIT 1
    `);

    const row = rows[0];
    if (!row?.competitionId || !row.competitionName || !row.competitionSlug) {
      return { competition: null, seasons: [] };
    }

    const seasons = await getCompetitionSeasonRows({
      competitionId: row.competitionId,
      currentLeagueId: row.currentLeagueId,
    });

    return {
      competition: {
        id: row.competitionId,
        name: row.competitionName,
        slug: row.competitionSlug,
        currentLeagueId: row.currentLeagueId,
      },
      seasons,
    };
  } catch {
    return { competition: null, seasons: [] };
  }
}

export async function getPublicCompetitionSeasonsByLeagueSlug(slug: string) {
  try {
    const rows = await prisma.$queryRaw<Array<{
      leagueId: string;
      competitionId: string | null;
      competitionName: string | null;
      competitionSlug: string | null;
      currentLeagueId: string | null;
    }>>(Prisma.sql`
      SELECT
        l."id" AS "leagueId",
        c."id" AS "competitionId",
        c."name" AS "competitionName",
        c."slug" AS "competitionSlug",
        c."currentLeagueId" AS "currentLeagueId"
      FROM "League" l
      LEFT JOIN "LeagueCompetition" c ON c."id" = l."competitionId"
      WHERE l."slug" = ${slug}
      LIMIT 1
    `);

    const row = rows[0];
    if (!row?.competitionId) return null;

    const seasons = await getCompetitionSeasonRows({
      competitionId: row.competitionId,
      currentLeagueId: row.currentLeagueId,
      publicOnly: true,
    });

    return {
      leagueId: row.leagueId,
      competition: {
        id: row.competitionId,
        name: row.competitionName,
        slug: row.competitionSlug,
        currentLeagueId: row.currentLeagueId,
      },
      seasons,
    };
  } catch {
    return null;
  }
}

export async function createCompetitionForLeague(leagueId: string) {
  const leagueRows = await prisma.$queryRaw<Array<{
    id: string;
    name: string;
    slug: string;
    season: string | null;
    area: string | null;
    dayOfWeek: string | null;
    leagueType: string | null;
    venueName: string | null;
    competitionId: string | null;
  }>>(Prisma.sql`
    SELECT "id", "name", "slug", "season", "area", "dayOfWeek", "leagueType", "venueName", "competitionId"
    FROM "League"
    WHERE "id" = ${leagueId}
    LIMIT 1
  `);

  const league = leagueRows[0];
  if (!league) throw new Error("League not found.");
  if (league.competitionId) {
    await ensureSeasonTeamRowsForLeague(league.id);
    await prisma.$executeRaw(Prisma.sql`
      UPDATE "Team" t
      SET "competitionId" = ${league.competitionId}, "updatedAt" = NOW()
      FROM "LeagueSeasonTeam" lst
      WHERE lst."teamId" = t."id"
        AND lst."leagueId" = ${league.id}
        AND t."competitionId" IS NULL
    `);
    return league.competitionId;
  }

  const competitionId = randomUUID();
  const competitionSlug =
    slugifyCompetition(
      league.name.replace(
        new RegExp(`\\s*[—-]\\s*${league.season ?? ""}\\s*$`, "i"),
        "",
      ),
    ) || league.slug;

  await prisma.$executeRaw(Prisma.sql`
    INSERT INTO "LeagueCompetition" (
      "id",
      "name",
      "slug",
      "area",
      "dayOfWeek",
      "leagueType",
      "venueName",
      "currentLeagueId",
      "createdAt",
      "updatedAt"
    )
    VALUES (
      ${competitionId},
      ${league.name},
      ${competitionSlug},
      ${league.area},
      ${league.dayOfWeek}::"PreferredNight",
      ${league.leagueType}::"LeagueType",
      ${league.venueName},
      ${league.id},
      NOW(),
      NOW()
    )
  `);

  await prisma.$executeRaw(Prisma.sql`
    UPDATE "League"
    SET "competitionId" = ${competitionId}, "updatedAt" = NOW()
    WHERE "id" = ${league.id}
  `);

  await ensureSeasonTeamRowsForLeague(league.id);
  await prisma.$executeRaw(Prisma.sql`
    UPDATE "Team" t
    SET "competitionId" = ${competitionId}, "updatedAt" = NOW()
    FROM "LeagueSeasonTeam" lst
    WHERE lst."teamId" = t."id"
      AND lst."leagueId" = ${league.id}
  `);

  return competitionId;
}

export async function createNextLeagueSeason(input: {
  sourceLeagueId: string;
  seasonName: string;
  copyTeams: boolean;
}) {
  const competitionId = await createCompetitionForLeague(input.sourceLeagueId);
  const sourceRows = await prisma.$queryRaw<Array<{
    id: string;
    name: string;
    slug: string;
    season: string | null;
  }>>(Prisma.sql`
    SELECT "id", "name", "slug", "season"
    FROM "League"
    WHERE "id" = ${input.sourceLeagueId}
    LIMIT 1
  `);

  const source = sourceRows[0];
  if (!source) throw new Error("League not found.");

  const newLeagueId = randomUUID();
  const newSlug = `${source.slug.replace(/-[a-z0-9]+-20\d{2}$/i, "")}-${seasonSlugPart(input.seasonName)}`;

  const existingSlug = await prisma.league.findUnique({
    where: { slug: newSlug },
    select: { id: true },
  });

  if (existingSlug) {
    throw new Error("A season with that slug already exists.");
  }

  await ensureSeasonTeamRowsForLeague(source.id);
  const sourceSeasonTeams = input.copyTeams
    ? await getLeagueSeasonTeams({ leagueId: source.id, activeOnly: true })
    : [];

  await prisma.$transaction(async (tx) => {
    await tx.$executeRaw(Prisma.sql`
      INSERT INTO "League" (
        "id",
        "name",
        "season",
        "isActive",
        "slug",
        "area",
        "dayOfWeek",
        "leagueType",
        "venueName",
        "kickoffInfo",
        "format",
        "surface",
        "description",
        "heroImageUrl",
        "badgeUrl",
        "ctaText",
        "competitionId",
        "requiredRefereesPerNight",
        "proposedStartDate",
        "minutesPerGame",
        "costPerTeamPerMatchPence",
        "targetTeamCount",
        "createdAt",
        "updatedAt"
      )
      SELECT
        ${newLeagueId},
        "name",
        ${input.seasonName},
        true,
        ${newSlug},
        "area",
        "dayOfWeek",
        "leagueType",
        "venueName",
        "kickoffInfo",
        "format",
        "surface",
        "description",
        "heroImageUrl",
        "badgeUrl",
        "ctaText",
        ${competitionId},
        "requiredRefereesPerNight",
        NULL,
        "minutesPerGame",
        "costPerTeamPerMatchPence",
        "targetTeamCount",
        NOW(),
        NOW()
      FROM "League"
      WHERE "id" = ${source.id}
    `);

    const sourceDivisions = await tx.$queryRaw<Array<{
      id: string;
      name: string;
      slug: string;
      sortOrder: number;
      isActive: boolean;
    }>>(Prisma.sql`
      SELECT "id", "name", "slug", "sortOrder", "isActive"
      FROM "LeagueDivision"
      WHERE "leagueId" = ${source.id}
      ORDER BY "sortOrder" ASC, "name" ASC
    `);

    const divisionIdMap = new Map<string, string>();
    for (const division of sourceDivisions) {
      const newDivisionId = randomUUID();
      divisionIdMap.set(division.id, newDivisionId);

      await tx.$executeRaw(Prisma.sql`
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
          ${newDivisionId},
          ${newLeagueId},
          ${division.name},
          ${division.slug},
          ${Number(division.sortOrder ?? 0)},
          ${Boolean(division.isActive)},
          NOW(),
          NOW()
        )
      `);
    }

    for (const entry of sourceSeasonTeams) {
      const newDivisionId = entry.divisionId
        ? divisionIdMap.get(entry.divisionId) ?? null
        : null;

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
          ${`lst_${newLeagueId}_${entry.teamId}`.slice(0, 64)},
          ${newLeagueId},
          ${entry.teamId},
          ${newDivisionId},
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
        UPDATE "Team"
        SET
          "competitionId" = ${competitionId},
          "leagueId" = ${newLeagueId},
          "divisionId" = ${newDivisionId},
          "updatedAt" = NOW()
        WHERE "id" = ${entry.teamId}
      `);
    }

    await tx.$executeRaw(Prisma.sql`
      UPDATE "LeagueCompetition"
      SET "currentLeagueId" = ${newLeagueId}, "updatedAt" = NOW()
      WHERE "id" = ${competitionId}
    `);
  });

  return { leagueId: newLeagueId, slug: newSlug };
}
