// ========================================
// File: src/lib/leagueTable.ts
// ========================================

import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { getFixturePlaceholderTeamIds } from "@/lib/teams/fixture-placeholders";

export type LeagueFormResult = "W" | "D" | "L";
export type LeaguePositionMovement = "UP" | "DOWN" | "SAME" | null;

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
  doublePointsPlayed?: number;
  recentForm: LeagueFormResult[];
  movement?: LeaguePositionMovement;
};

export type LeagueTableOptions = {
  divisionId?: string | null;
  teamIds?: string[];
  beforeKickoffAt?: Date;
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
    doublePointsPlayed: 0,
    recentForm: [],
    movement: null,
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

  return teams.filter(
    (team) =>
      !placeholderTeamIds.has(team.id) &&
      team.name.trim().toUpperCase() !== "TBC",
  );
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
        AND t."leagueId" IS NOT NULL
      ORDER BY t."name" ASC
    `);

    return removeFixturePlaceholderTeams(divisionTeams);
  }

  if (options.teamIds?.length) {
    const selectedTeams = await prisma.team.findMany({
      where: {
        id: { in: options.teamIds },
        leagueId,
      },
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
        AND t."leagueId" IS NOT NULL
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
  // The legacy Team.leagueId may still point at another season, so equality is
  // deliberately not required here. A NULL leagueId is different: it is the
  // explicit admin choice "No league" and must remove the team from standings
  // even if a stale active LeagueSeasonTeam row remains.
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

function londonDateKey(value: Date) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/London",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(value);
  const get = (type: "year" | "month" | "day") =>
    parts.find((entry) => entry.type === type)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

function sortLeagueRows(rows: LeagueTableRow[]) {
  rows.sort((a, b) => {
    if (b.points !== a.points) return b.points - a.points;
    if (b.goalDifference !== a.goalDifference) return b.goalDifference - a.goalDifference;
    if (b.goalsFor !== a.goalsFor) return b.goalsFor - a.goalsFor;
    return a.teamName.localeCompare(b.teamName);
  });
  return rows;
}

function buildTableRows(
  teams: TableTeamRow[],
  fixtures: Array<{
    homeTeamId: string;
    awayTeamId: string;
    homeTeam: TableTeamRow;
    awayTeam: TableTeamRow;
    result: { homeScore: number; awayScore: number } | null;
    doublePoints?: boolean;
  }>,
) {
  const table = new Map<string, LeagueTableRow>();
  const allowedTeamIds = new Set(teams.map((team) => team.id));

  for (const team of teams) table.set(team.id, createRow(team));

  for (const fixture of fixtures) {
    if (!fixture.result) continue;
    if (!allowedTeamIds.has(fixture.homeTeamId) || !allowedTeamIds.has(fixture.awayTeamId)) continue;

    const home = getOrCreateRow(table, fixture.homeTeam);
    const away = getOrCreateRow(table, fixture.awayTeam);
    const homeScore = fixture.result.homeScore;
    const awayScore = fixture.result.awayScore;
    const pointsMultiplier = fixture.doublePoints ? 2 : 1;

    home.played += 1;
    away.played += 1;
    if (fixture.doublePoints) {
      home.doublePointsPlayed = (home.doublePointsPlayed ?? 0) + 1;
      away.doublePointsPlayed = (away.doublePointsPlayed ?? 0) + 1;
    }
    home.goalsFor += homeScore;
    home.goalsAgainst += awayScore;
    away.goalsFor += awayScore;
    away.goalsAgainst += homeScore;

    if (homeScore > awayScore) {
      home.won += 1;
      home.points += 3 * pointsMultiplier;
      away.lost += 1;
      home.recentForm.push("W");
      away.recentForm.push("L");
    } else if (awayScore > homeScore) {
      away.won += 1;
      away.points += 3 * pointsMultiplier;
      home.lost += 1;
      away.recentForm.push("W");
      home.recentForm.push("L");
    } else {
      home.drawn += 1;
      away.drawn += 1;
      home.points += 1 * pointsMultiplier;
      away.points += 1 * pointsMultiplier;
      home.recentForm.push("D");
      away.recentForm.push("D");
    }
  }

  return sortLeagueRows(Array.from(table.values()).map((row) => ({
    ...row,
    goalDifference: row.goalsFor - row.goalsAgainst,
    recentForm: row.recentForm.slice(-5),
  })));
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
        result: { isNot: null },
        ...(options.beforeKickoffAt
          ? { kickoffAt: { lt: options.beforeKickoffAt } }
          : {}),
      },
      orderBy: { kickoffAt: "asc" },
      include: {
        homeTeam: { select: { id: true, name: true, logoUrl: true } },
        awayTeam: { select: { id: true, name: true, logoUrl: true } },
        result: { select: { homeScore: true, awayScore: true } },
        doublePoints: true,
      },
    }),
  ]);

  const rows = buildTableRows(teams, fixtures);
  const latestPlayedFixture = [...fixtures].reverse().find((fixture) => fixture.result);
  if (!latestPlayedFixture) return rows;

  // Movement is measured against the table before the latest match night,
  // so all teams playing on the same evening share the same baseline.
  const latestMatchday = londonDateKey(latestPlayedFixture.kickoffAt);
  const previousRows = buildTableRows(
    teams,
    fixtures.filter(
      (fixture) => fixture.result && londonDateKey(fixture.kickoffAt) !== latestMatchday,
    ),
  );
  const previousPositions = new Map(
    previousRows.map((row, index) => [row.teamId, index + 1]),
  );

  return rows.map((row, index) => {
    const previous = previousPositions.get(row.teamId);
    const current = index + 1;
    return {
      ...row,
      movement:
        previous == null
          ? null
          : current < previous
            ? "UP"
            : current > previous
              ? "DOWN"
              : "SAME",
    };
  });
}
