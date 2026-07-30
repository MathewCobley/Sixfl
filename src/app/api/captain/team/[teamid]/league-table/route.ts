// ========================================
// File: src/app/api/captain/team/[teamid]/league-table/route.ts
// ========================================

import { NextResponse } from "next/server";

import { getCaptainRelatedTeamContext } from "@/lib/captain/related-teams";
import { getLeagueStandings, getTeamStanding } from "@/lib/standings";
import { requireCaptain } from "@/lib/requireCaptain";

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

  const [standings, teamStanding] = await Promise.all([
    getLeagueStandings(currentLeagueId),
    getTeamStanding({ leagueId: currentLeagueId, teamIds: relatedTeamIds }),
  ]);

  const activeDivision = teamStanding.divisionId
    ? standings.divisions.find((division) => division.id === teamStanding.divisionId) ?? null
    : null;
  const rows = activeDivision?.rows ?? standings.rows;
  const title = getPublicLeagueTableTitle({
    leagueName: currentLeague.name,
    divisionName: teamStanding.divisionName,
  });

  return NextResponse.json({
    title,
    description: getPublicLeagueTableDescription(title),
    rows,
    currentTeamId: teamStanding.teamId || team.id,
    relatedTeamIds,
    leagueId: currentLeagueId,
    leagueName: currentLeague.name,
    leagueSeason: currentLeague.season,
    divisionId: teamStanding.divisionId,
    divisionName: teamStanding.divisionName,
    divisions: standings.divisions.map((division) => ({
      ...division,
      table: division.rows,
      isTeamDivision: division.id === teamStanding.divisionId,
    })),
  });
}
