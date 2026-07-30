// ========================================
// File: src/lib/leagueTable.ts
// ========================================

import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { getFixturePlaceholderTeamIds } from "@/lib/teams/fixture-placeholders";

export type LeagueFormResult = "W" | "D" | "L";

export type LeagueTableRow = {
  teamId: string;
  teamName: string;
  teamLogoUrl: string | null;
  played: number;
  won: number;
  drawn: number;
  lost: number;
  goalsFor: number;
  goalsAgainst: number;
  goalDifference: number;
  points: number;
  recentForm: LeagueFormResult[];
};

type LeagueTableOptions = {
  divisionId?: string | null;
  teamIds?: string[];
};

type TableTeamRow = {
  id: string;
  name: string;
  logoUrl: string | null;
};

type SeasonEntryPresenceRow = {
  hasEntries: boolean;
};

function createRow(input: {
  id: string;
  name: string;
  logoUrl: string | null;
}): LeagueTableRow {
  return {
    teamId: input.id,
    teamName: input.name,
    teamLogoUrl: input.logoUrl,
    played: 0,
    won: 0,
    drawn: 0,
    lost: 0,
    goalsFor: 0,
    goalsAgainst: 0,
    goalDifference: 0,
    points: 0,
    recentForm: [],
  };
}

function getOrCreateRow(
  table: Map<string, LeagueTableRow>,
  input: {
    id: string;
    name: string;
    logoUrl: string | null;
  },
): LeagueTableRow {
  const existing = table.get(input.id);

  if (existing) {
    existing.teamName = input.name;
    if (!existing.teamLogoUrl && input.logoUrl) {
      existing.teamLogoUrl = input.logoUrl;
    }
    return existing;
  }

  const created = createRow(input);
  table.set(input.id, created);
  return created;
}

async function removeFixturePlaceholderTeams(teams: TableTeamRow[]) {
  if (teams.length === 0) return teams;

  const placeholderTeamIds = await getFixturePlaceholderTeamIds(
    teams.map((team) => team.id),
  );

  if (placeholderTeamIds.size === 0) return teams;

  return teams.filter((team) => !placeholderTeamIds.has(team.id));
}

async function getLeagueTableTeams(
  leagueId: string,
  options: LeagueTableOptions,
) {
  if (options.divisionId) {
    const divisionTeams = await prisma.$queryRaw<TableTeamRow[]>(Prisma.sql`
      SELECT t."id", t."name", t."logoUrl"
      FROM "LeagueSeasonTeam" lst
      JOIN "Team" t ON t."id" = lst."teamId"
      WHERE lst."leagueId" = ${leagueId}
        AND lst."divisionId" = ${options.divisionId}
        AND lst."isActive" = true
      ORDER BY t."name" ASC
    `);

    return removeFixturePlaceholderTeams(divisionTeams);
  }

  if (options.teamIds?.length) {
    const selectedTeams = await prisma.team.findMany({
      where: { id: { in: options.teamIds } },
      orderBy: { name: "asc" },
      select: { id: true, name: true, logoUrl: true },
    });

    return removeFixturePlaceholderTeams(selectedTeams);
  }

  const [seasonTeams, seasonEntryPresence] = await Promise.all([
    prisma.$queryRaw<TableTeamRow[]>(Prisma.sql`
      SELECT t."id", t."name", t."logoUrl"
      FROM "LeagueSeasonTeam" lst
      JOIN "Team" t ON t."id" = lst."teamId"
      WHERE lst."leagueId" = ${leagueId}
        AND lst."isActive" = true
      ORDER BY t."name" ASC
    `),
    prisma.$queryRaw<SeasonEntryPresenceRow[]>(Prisma.sql`
      SELECT EXISTS (
        SELECT 1
        FROM "LeagueSeasonTeam"
        WHERE "leagueId" = ${leagueId}
      ) AS "hasEntries"
    `),
  ]);

  // Once a league uses season-team entries, those entries are authoritative.
  // An empty active set means the table should be empty, not that affiliated
  // teams should leak back in through the legacy Team.leagueId fallback.
  if (seasonTeams.length > 0 || seasonEntryPresence[0]?.hasEntries) {
    return removeFixturePlaceholderTeams(seasonTeams);
  }

  const legacyTeams = await prisma.team.findMany({
    where: { leagueId },
    orderBy: { name: "asc" },
    select: { id: true, name: true, logoUrl: true },
  });

  return removeFixturePlaceholderTeams(legacyTeams);
}

export async function getLeagueTable(
  leagueId: string,
  options: LeagueTableOptions = {},
): Promise<LeagueTableRow[]> {
  const [teams, fixtures] = await Promise.all([
    getLeagueTableTeams(leagueId, options),
    prisma.fixture.findMany({
      where: {
        leagueId,
        ...(options.divisionId ? { divisionId: options.divisionId } : {}),
        status: "COMPLETED",
        result: { isNot: null },
      },
      orderBy: { kickoffAt: "asc" },
      include: {
        homeTeam: { select: { id: true, name: true, logoUrl: true } },
        awayTeam: { select: { id: true, name: true, logoUrl: true } },
        result: { select: { homeScore: true, awayScore: true } },
      },
    }),
  ]);

  const table = new Map<string, LeagueTableRow>();

  // The selected/active team list is always authoritative, including when it
  // is empty. Historic completed fixtures must never recreate a removed or
  // affiliated-only team in the current league table.
  const allowedTeamIds = new Set(teams.map((team) => team.id));

  for (const team of teams) {
    table.set(team.id, createRow(team));
  }

  for (const fixture of fixtures) {
    if (!fixture.result) continue;
    if (
      !allowedTeamIds.has(fixture.homeTeamId) ||
      !allowedTeamIds.has(fixture.awayTeamId)
    ) {
      continue;
    }

    const home = getOrCreateRow(table, fixture.homeTeam);
    const away = getOrCreateRow(table, fixture.awayTeam);
    const homeScore = fixture.result.homeScore;
    const awayScore = fixture.result.awayScore;

    home.played += 1;
    away.played += 1;
    home.goalsFor += homeScore;
    home.goalsAgainst += awayScore;
    away.goalsFor += awayScore;
    away.goalsAgainst += homeScore;

    if (homeScore > awayScore) {
      home.won += 1;
      home.points += 3;
      away.lost += 1;
      home.recentForm.push("W");
      away.recentForm.push("L");
    } else if (awayScore > homeScore) {
      away.won += 1;
      away.points += 3;
      home.lost += 1;
      away.recentForm.push("W");
      home.recentForm.push("L");
    } else {
      home.drawn += 1;
      away.drawn += 1;
      home.points += 1;
      away.points += 1;
      home.recentForm.push("D");
      away.recentForm.push("D");
    }
  }

  const rows = Array.from(table.values()).map((row) => ({
    ...row,
    goalDifference: row.goalsFor - row.goalsAgainst,
    recentForm: row.recentForm.slice(-5),
  }));

  rows.sort((a, b) => {
    if (b.points !== a.points) return b.points - a.points;
    if (b.goalDifference !== a.goalDifference) {
      return b.goalDifference - a.goalDifference;
    }
    if (b.goalsFor !== a.goalsFor) return b.goalsFor - a.goalsFor;
    return a.teamName.localeCompare(b.teamName);
  });

  return rows;
}
