// ========================================
// File: src/lib/league-competitions.ts
// ========================================

import { randomUUID } from "crypto";
import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";

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

export async function getCompetitionSummaryForLeague(leagueId: string): Promise<CompetitionSummary> {
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

    const seasons = await prisma.$queryRaw<CompetitionSeasonRow[]>(Prisma.sql`
      SELECT
        l."id",
        l."name",
        l."slug",
        l."season",
        l."isActive",
        COUNT(DISTINCT t."id")::int AS "teamCount",
        COUNT(DISTINCT f."id")::int AS "fixtureCount",
        COUNT(DISTINCT CASE WHEN f."status" = 'COMPLETED' THEN f."id" END)::int AS "completedFixtureCount",
        (l."id" = ${row.currentLeagueId}) AS "isCurrent"
      FROM "League" l
      LEFT JOIN "Team" t ON t."leagueId" = l."id"
      LEFT JOIN "Fixture" f ON f."leagueId" = l."id"
      WHERE l."competitionId" = ${row.competitionId}
      GROUP BY l."id", l."name", l."slug", l."season", l."isActive"
      ORDER BY COALESCE(l."season", '') DESC, l."createdAt" DESC
    `);

    return {
      competition: {
        id: row.competitionId,
        name: row.competitionName,
        slug: row.competitionSlug,
        currentLeagueId: row.currentLeagueId,
      },
      seasons: seasons.map((season) => ({
        ...season,
        isActive: Boolean(season.isActive),
        isCurrent: Boolean(season.isCurrent),
        teamCount: Number(season.teamCount ?? 0),
        fixtureCount: Number(season.fixtureCount ?? 0),
        completedFixtureCount: Number(season.completedFixtureCount ?? 0),
      })),
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
    if (!row?.competitionId) {
      return null;
    }

    const seasons = await prisma.$queryRaw<CompetitionSeasonRow[]>(Prisma.sql`
      SELECT
        l."id",
        l."name",
        l."slug",
        l."season",
        l."isActive",
        COUNT(DISTINCT t."id")::int AS "teamCount",
        COUNT(DISTINCT f."id")::int AS "fixtureCount",
        COUNT(DISTINCT CASE WHEN f."status" = 'COMPLETED' THEN f."id" END)::int AS "completedFixtureCount",
        (l."id" = ${row.currentLeagueId}) AS "isCurrent"
      FROM "League" l
      LEFT JOIN "Team" t ON t."leagueId" = l."id"
      LEFT JOIN "Fixture" f ON f."leagueId" = l."id"
      WHERE l."competitionId" = ${row.competitionId}
        AND l."isActive" = true
      GROUP BY l."id", l."name", l."slug", l."season", l."isActive"
      ORDER BY (l."id" = ${row.currentLeagueId}) DESC, COALESCE(l."season", '') DESC, l."createdAt" DESC
    `);

    return {
      leagueId: row.leagueId,
      competition: {
        id: row.competitionId,
        name: row.competitionName,
        slug: row.competitionSlug,
        currentLeagueId: row.currentLeagueId,
      },
      seasons: seasons.map((season) => ({
        ...season,
        isActive: Boolean(season.isActive),
        isCurrent: Boolean(season.isCurrent),
        teamCount: Number(season.teamCount ?? 0),
        fixtureCount: Number(season.fixtureCount ?? 0),
        completedFixtureCount: Number(season.completedFixtureCount ?? 0),
      })),
    };
  } catch {
    return null;
  }
}

async function getUniqueClaimCode() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

  for (let attempt = 0; attempt < 20; attempt += 1) {
    let code = "";
    for (let i = 0; i < 8; i += 1) {
      code += chars.charAt(Math.floor(Math.random() * chars.length));
    }

    const existing = await prisma.team.findUnique({
      where: { claimCode: code },
      select: { id: true },
    });

    if (!existing) return code;
  }

  return randomUUID().replace(/-/g, "").slice(0, 10).toUpperCase();
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
  if (league.competitionId) return league.competitionId;

  const competitionId = randomUUID();
  const competitionSlug = slugifyCompetition(
    league.name.replace(new RegExp(`\\s*[—-]\\s*${league.season ?? ""}\\s*$`, "i"), ""),
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

    if (input.copyTeams) {
      const sourceTeams = await tx.$queryRaw<Array<{
        id: string;
        name: string;
        logoUrl: string | null;
        teamMode: string;
        isRecruiting: boolean;
        squadTargetSize: number | null;
        matchdayTargetSize: number | null;
        managerNotes: string | null;
        contactName: string | null;
        contactEmail: string | null;
        contactPhone: string | null;
        secondaryContactName: string | null;
        secondaryContactEmail: string | null;
        secondaryContactPhone: string | null;
        latestKickoffTime: string | null;
        divisionId: string | null;
      }>>(Prisma.sql`
        SELECT
          "id",
          "name",
          "logoUrl",
          "teamMode",
          "isRecruiting",
          "squadTargetSize",
          "matchdayTargetSize",
          "managerNotes",
          "contactName",
          "contactEmail",
          "contactPhone",
          "secondaryContactName",
          "secondaryContactEmail",
          "secondaryContactPhone",
          "latestKickoffTime",
          "divisionId"
        FROM "Team"
        WHERE "leagueId" = ${source.id}
        ORDER BY "name" ASC
      `);

      for (const team of sourceTeams) {
        const newTeamId = randomUUID();
        const newDivisionId = team.divisionId ? divisionIdMap.get(team.divisionId) ?? null : null;
        const claimCode = await getUniqueClaimCode();

        await tx.$executeRaw(Prisma.sql`
          INSERT INTO "Team" (
            "id",
            "name",
            "claimCode",
            "logoUrl",
            "teamMode",
            "isRecruiting",
            "squadTargetSize",
            "matchdayTargetSize",
            "managerNotes",
            "contactName",
            "contactEmail",
            "contactPhone",
            "secondaryContactName",
            "secondaryContactEmail",
            "secondaryContactPhone",
            "latestKickoffTime",
            "leagueId",
            "divisionId",
            "createdAt",
            "updatedAt"
          )
          VALUES (
            ${newTeamId},
            ${team.name},
            ${claimCode},
            ${team.logoUrl},
            ${team.teamMode}::"TeamMode",
            ${Boolean(team.isRecruiting)},
            ${team.squadTargetSize},
            ${team.matchdayTargetSize},
            ${team.managerNotes},
            ${team.contactName},
            ${team.contactEmail},
            ${team.contactPhone},
            ${team.secondaryContactName},
            ${team.secondaryContactEmail},
            ${team.secondaryContactPhone},
            ${team.latestKickoffTime},
            ${newLeagueId},
            ${newDivisionId},
            NOW(),
            NOW()
          )
        `);
      }
    }

    await tx.$executeRaw(Prisma.sql`
      UPDATE "LeagueCompetition"
      SET "currentLeagueId" = ${newLeagueId}, "updatedAt" = NOW()
      WHERE "id" = ${competitionId}
    `);
  });

  return { leagueId: newLeagueId, slug: newSlug };
}
