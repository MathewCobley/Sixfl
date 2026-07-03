// ========================================
// File: src/app/api/captain/team/[teamid]/league-table/route.ts
// ========================================

import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";

import { getLeagueTable, type LeagueTableRow } from "@/lib/leagueTable";
import { prisma } from "@/lib/prisma";
import { requireCaptain } from "@/lib/requireCaptain";

type SeasonTeamRow = {
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
  teamId: string;
  legacyDivisionId: string | null;
}) {
  const seasonTeamRows = await prisma.$queryRaw<SeasonTeamRow[]>(Prisma.sql`
    SELECT lst."divisionId", d."name" AS "divisionName"
    FROM "LeagueSeasonTeam" lst
    LEFT JOIN "LeagueDivision" d ON d."id" = lst."divisionId"
    WHERE lst."leagueId" = ${input.leagueId}
      AND lst."teamId" = ${input.teamId}
      AND lst."isActive" = true
    LIMIT 1
  `);

  const seasonTeam = seasonTeamRows[0] ?? null;

  if (seasonTeam?.divisionId) {
    return seasonTeam;
  }

  if (!input.legacyDivisionId) {
    return seasonTeam;
  }

  const legacyDivisionRows = await prisma.$queryRaw<SeasonTeamRow[]>(Prisma.sql`
    SELECT d."id" AS "divisionId", d."name" AS "divisionName"
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

  const team = await prisma.team.findUnique({
    where: { id: teamid },
    select: {
      id: true,
      leagueId: true,
      divisionId: true,
      league: {
        select: {
          id: true,
          name: true,
          season: true,
          competition: {
            select: {
              id: true,
              name: true,
              currentLeague: {
                select: {
                  id: true,
                  name: true,
                  season: true,
                },
              },
            },
          },
        },
      },
    },
  });

  if (!team) {
    return NextResponse.json({ error: "Team not found." }, { status: 404 });
  }

  const currentLeague = team.league?.competition?.currentLeague ?? team.league ?? null;

  if (!currentLeague) {
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
      leagueId: currentLeague.id,
      teamId: team.id,
      legacyDivisionId: team.divisionId,
    }),
    prisma.$queryRaw<DivisionRow[]>(Prisma.sql`
      SELECT "id", "name", "slug", "sortOrder"
      FROM "LeagueDivision"
      WHERE "leagueId" = ${currentLeague.id}
        AND "isActive" = true
      ORDER BY "sortOrder" ASC, "name" ASC
    `),
  ]);

  const divisionTables: DivisionPayload[] = await Promise.all(
    divisionRows.map(async (division) => ({
      ...division,
      table: await getLeagueTable(currentLeague.id, { divisionId: division.id }),
      isTeamDivision: division.id === seasonTeam?.divisionId,
    })),
  );

  const fallbackDivision =
    divisionTables.find((division) => division.table.some((row) => row.teamId === team.id)) ?? null;
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
    : await getLeagueTable(currentLeague.id);
  const title = getPublicLeagueTableTitle({
    leagueName: currentLeague.name,
    divisionName: activeDivisionName,
  });

  return NextResponse.json({
    title,
    description: getPublicLeagueTableDescription(title),
    rows,
    currentTeamId: team.id,
    leagueId: currentLeague.id,
    leagueName: currentLeague.name,
    leagueSeason: currentLeague.season,
    divisionId: activeDivisionId,
    divisionName: activeDivisionName,
    divisions: divisionTables,
  });
}
