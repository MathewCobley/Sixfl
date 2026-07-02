// ========================================
// File: src/app/api/captain/team/[teamid]/league-table/route.ts
// ========================================

import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";

import { getLeagueTable } from "@/lib/leagueTable";
import { prisma } from "@/lib/prisma";
import { requireCaptain } from "@/lib/requireCaptain";

type SeasonTeamRow = {
  divisionId: string | null;
  divisionName: string | null;
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
    });
  }

  const seasonTeamRows = await prisma.$queryRaw<SeasonTeamRow[]>(Prisma.sql`
    SELECT lst."divisionId", d."name" AS "divisionName"
    FROM "LeagueSeasonTeam" lst
    LEFT JOIN "LeagueDivision" d ON d."id" = lst."divisionId"
    WHERE lst."leagueId" = ${currentLeague.id}
      AND lst."teamId" = ${team.id}
      AND lst."isActive" = true
    LIMIT 1
  `);

  const seasonTeam = seasonTeamRows[0] ?? null;
  const rows = await getLeagueTable(currentLeague.id, {
    divisionId: seasonTeam?.divisionId ?? null,
  });
  const title = getPublicLeagueTableTitle({
    leagueName: currentLeague.name,
    divisionName: seasonTeam?.divisionName ?? null,
  });

  return NextResponse.json({
    title,
    description: getPublicLeagueTableDescription(title),
    rows,
    currentTeamId: team.id,
    leagueId: currentLeague.id,
    leagueName: currentLeague.name,
    leagueSeason: currentLeague.season,
    divisionId: seasonTeam?.divisionId ?? null,
    divisionName: seasonTeam?.divisionName ?? null,
  });
}
