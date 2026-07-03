// ========================================
// File: src/app/api/captain/team/[teamid]/league-table/route.ts
// ========================================

import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";

import { getCaptainRelatedTeamContext } from "@/lib/captain/related-teams";
import { getLeagueTable, type LeagueTableRow } from "@/lib/leagueTable";
import { prisma } from "@/lib/prisma";
import { requireCaptain } from "@/lib/requireCaptain";

type SeasonTeamRow = {
  teamId: string;
  divisionId: string | null;
  divisionName: string | null;
};

type DivisionRow = {
  id: string;
  name: string;
  slug: string;
  sortOrder: number;
};

type DivisionPayload = DivisionRow & {
  table: LeagueTableRow[];
  isTeamDivision: boolean;
};

function getPublicLeagueTableTitle(input: {
  leagueName?: string | null;
  divisionName?: string | null;
}) {
  const compactLeagueText = (input.leagueName ?? "")
    .replace(/·/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  const suffix = input.divisionName ? ` ${input.divisionName}` : "";

  if (/Harrogate\s+West/i.test(compactLeagueText)) {
    return `Current Harrogate West${suffix} 6 a side table`;
  }

  const beforeSeason = compactLeagueText.split(/Spring|Summer|Autumn|Winter|Season/i)[0]?.trim();
  const cleaned = beforeSeason
    ?.replace(/^SIXFL\s+/i, "")
    .replace(/\bMens\b/i, "")
    .replace(/\bWomens\b/i, "")
    .replace(/\bLeague\b/gi, "")
    .replace(/\bTuesday\b|\bWednesday\b|\bThursday\b|\bMonday\b|\bFriday\b|\bSaturday\b|\bSunday\b/gi, "")
    .replace(/\s+/g, " ")
    .trim();

  return cleaned ? `Current ${cleaned}${suffix} 6 a side table` : `Current${suffix} league table`;
}

function getPublicLeagueTableDescription(title: string) {
  const location = title.replace(/^Current\s+/i, "").replace(/\s+6 a side table$/i, "");

  return `Follow the latest standings, points, goal difference and recent form in this ${location} 6 a side football league.`;
}

async function getCurrentSeasonTeamDivision(input: {
  leagueId: string;
  relatedTeamIds: string[];
  legacyDivisionId: string | null;
}) {
  const seasonTeamRows = input.relatedTeamIds.length
    ? await prisma.$queryRaw<SeasonTeamRow[]>(Prisma.sql`
        SELECT lst."teamId", lst."divisionId", d."name" AS "divisionName"
        FROM "LeagueSeasonTeam" lst
        LEFT JOIN "LeagueDivision" d ON d."id" = lst."divisionId"
        WHERE lst."leagueId" = ${input.leagueId}
          AND lst."teamId" IN (${Prisma.join(input.relatedTeamIds)})
          AND lst."isActive" = true
          AND lst."divisionId" IS NOT NULL
        ORDER BY CASE WHEN lst."teamId" = ${input.relatedTeamIds[0]} THEN 0 ELSE 1 END ASC
        LIMIT 1
      `)
    : [];

  const seasonTeam = seasonTeamRows[0] ?? null;

  if (seasonTeam?.divisionId) {
    return seasonTeam;
  }

  if (!input.legacyDivisionId) {
    return seasonTeam;
  }

  const legacyDivisionRows = await prisma.$queryRaw<SeasonTeamRow[]>(Prisma.sql`
    SELECT ${input.relatedTeamIds[0] ?? ""} AS "teamId", d."id" AS "divisionId", d."name" AS "divisionName"
    FROM "LeagueDivision" d
    WHERE d."id" = ${input.legacyDivisionId}
      AND d."leagueId" = ${input.leagueId}
      AND d."isActive" = true
    LIMIT 1
  `);

  return legacyDivisionRows[0] ?? seasonTeam;
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ teamid: string }> },
) {
  const { teamid } = await params;
  await requireCaptain(teamid);

  const context = await getCaptainRelatedTeamContext(teamid);

  if (!context) {
    return NextResponse.json({ error: "Team not found." }, { status: 404 });
  }

  const { team, currentLeague, currentLeagueId, relatedTeamIds } = context;

  if (!currentLeague || !currentLeagueId) {
    return NextResponse.json({
      title: "Current league table",
      description: "Your team is not assigned to a competition yet, so there is no table to show here.",
      rows: [],
      currentTeamId: team.id,
      leagueId: null,
      divisionId: null,
      divisionName: null,
      divisions: [],
    });
  }

  const [seasonTeam, divisionRows] = await Promise.all([
    getCurrentSeasonTeamDivision({
      leagueId: currentLeagueId,
      relatedTeamIds,
      legacyDivisionId: team.divisionId,
    }),
    prisma.$queryRaw<DivisionRow[]>(Prisma.sql`
      SELECT "id", "name", "slug", "sortOrder"
      FROM "LeagueDivision"
      WHERE "leagueId" = ${currentLeagueId}
        AND "isActive" = true
      ORDER BY "sortOrder" ASC, "name" ASC
    `),
  ]);

  const divisionTables: DivisionPayload[] = await Promise.all(
    divisionRows.map(async (division) => ({
      ...division,
      table: await getLeagueTable(currentLeagueId, { divisionId: division.id }),
      isTeamDivision: division.id === seasonTeam?.divisionId,
    })),
  );

  const fallbackDivision =
    divisionTables.find((division) => division.table.some((row) => relatedTeamIds.includes(row.teamId))) ?? null;
  const activeDivisionId = seasonTeam?.divisionId ?? fallbackDivision?.id ?? null;
  const activeDivisionName =
    seasonTeam?.divisionName ??
    fallbackDivision?.name ??
    null;
  const activeDivision = activeDivisionId
    ? divisionTables.find((division) => division.id === activeDivisionId) ?? null
    : null;
  const rows = activeDivision
    ? activeDivision.table
    : await getLeagueTable(currentLeagueId);
  const title = getPublicLeagueTableTitle({
    leagueName: currentLeague.name,
    divisionName: activeDivisionName,
  });

  return NextResponse.json({
    title,
    description: getPublicLeagueTableDescription(title),
    rows,
    currentTeamId: activeDivision?.table.find((row) => relatedTeamIds.includes(row.teamId))?.teamId ?? team.id,
    relatedTeamIds,
    leagueId: currentLeagueId,
    leagueName: currentLeague.name,
    leagueSeason: currentLeague.season,
    divisionId: activeDivisionId,
    divisionName: activeDivisionName,
    divisions: divisionTables,
  });
}
