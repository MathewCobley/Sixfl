// ========================================
// File: src/app/api/admin/fixtures/matchup-grid/route.ts
// ========================================

import { FixtureStatus, Prisma } from "@prisma/client";
import { NextResponse } from "next/server";

import { getCurrentLeagueOptions } from "@/lib/current-leagues";
import { ensureSeasonTeamRowsForLeague } from "@/lib/league-season-teams";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/requireAdmin";

type MatchupCell = {
  opponentId: string;
  opponentName: string;
  meetingCount: number;
  latestKickoffAt: string | null;
};

type DivisionOption = {
  id: string;
  name: string;
  slug: string;
  sortOrder: number;
};

type TeamOption = {
  id: string;
  name: string;
};

type FixtureVisibilityFilter = "all" | "published" | "draft";
type FixtureStatusFilter = "active" | "postponed" | "cancelled" | "all";

const COUNTABLE_FIXTURE_STATUSES = [
  FixtureStatus.SCHEDULED,
  FixtureStatus.COMPLETED,
] as const;

function getCellLabel(cell: MatchupCell) {
  if (cell.meetingCount === 0) return "—";
  return `${cell.meetingCount} fixture${cell.meetingCount === 1 ? "" : "s"}`;
}

function parseVisibility(value: string | null): FixtureVisibilityFilter {
  if (value === "published" || value === "draft") return value;
  return "all";
}

function parseStatusFilter(value: string | null): FixtureStatusFilter {
  if (value === "postponed" || value === "cancelled" || value === "all") return value;
  return "active";
}

function getPublishedWhere(visibility: FixtureVisibilityFilter) {
  if (visibility === "published") return { publishedAt: { not: null } };
  if (visibility === "draft") return { publishedAt: null };
  return {};
}

function getStatusWhere(statusFilter: FixtureStatusFilter) {
  if (statusFilter === "postponed") return { status: FixtureStatus.POSTPONED };
  if (statusFilter === "cancelled") return { status: FixtureStatus.CANCELLED };
  if (statusFilter === "all") return {};

  return {
    status: {
      in: [...COUNTABLE_FIXTURE_STATUSES],
    },
  };
}

function isCountableFixtureStatus(status: FixtureStatus) {
  return COUNTABLE_FIXTURE_STATUSES.includes(status as (typeof COUNTABLE_FIXTURE_STATUSES)[number]);
}

async function getLeagueDivisions(leagueId: string) {
  try {
    return prisma.$queryRaw<DivisionOption[]>(Prisma.sql`
      SELECT "id", "name", "slug", "sortOrder"
      FROM "LeagueDivision"
      WHERE "leagueId" = ${leagueId}
        AND "isActive" = true
      ORDER BY "sortOrder" ASC, "name" ASC
    `);
  } catch {
    return [];
  }
}

async function getSeasonTeams(input: {
  leagueId: string;
  divisionId: string | null;
}) {
  await ensureSeasonTeamRowsForLeague(input.leagueId);

  if (input.divisionId) {
    return prisma.$queryRaw<TeamOption[]>(Prisma.sql`
      SELECT t."id", t."name"
      FROM "LeagueSeasonTeam" lst
      JOIN "Team" t ON t."id" = lst."teamId"
      WHERE lst."leagueId" = ${input.leagueId}
        AND lst."divisionId" = ${input.divisionId}
        AND lst."isActive" = true
        AND t."leagueId" = ${input.leagueId}
      ORDER BY t."name" ASC
    `);
  }

  return prisma.$queryRaw<TeamOption[]>(Prisma.sql`
    SELECT t."id", t."name"
    FROM "LeagueSeasonTeam" lst
    JOIN "Team" t ON t."id" = lst."teamId"
    WHERE lst."leagueId" = ${input.leagueId}
      AND lst."isActive" = true
      AND t."leagueId" = ${input.leagueId}
    ORDER BY t."name" ASC
  `);
}

function getFallbackConfirmationStatus(input: {
  fixtureStatus: FixtureStatus;
  kickoffAt: Date;
}) {
  if (input.fixtureStatus !== FixtureStatus.SCHEDULED) return null;
  const diffMs = input.kickoffAt.getTime() - Date.now();
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  return diffHours <= 24 ? "OVERDUE" : "PENDING";
}

export async function GET(request: Request) {
  await requireAdmin();

  const url = new URL(request.url);
  const requestedLeagueId = url.searchParams.get("leagueId")?.trim() || null;
  const requestedDivisionId = url.searchParams.get("divisionId")?.trim() || null;
  const visibility = parseVisibility(url.searchParams.get("visibility"));
  const statusFilter = parseStatusFilter(url.searchParams.get("status"));

  const leagues = await getCurrentLeagueOptions(requestedLeagueId);
  const league = leagues.find((item) => item.id === requestedLeagueId) ?? leagues[0] ?? null;

  if (!league) {
    return NextResponse.json({
      leagues: [],
      divisions: [],
      selectedLeagueId: null,
      selectedDivisionId: null,
      selectedVisibility: visibility,
      selectedStatus: statusFilter,
      selectedLeagueLabel: null,
      selectedDivisionLabel: null,
      teams: [],
      cells: [],
      fixtures: [],
      summary: {
        scheduledPairs: 0,
        singleMeetingPairs: 0,
        twoMeetingPairs: 0,
        missingPairs: 0,
      },
    });
  }

  const divisions = await getLeagueDivisions(league.id);
  const selectedDivision = requestedDivisionId
    ? divisions.find((division) => division.id === requestedDivisionId) ?? null
    : null;
  const selectedDivisionId = selectedDivision?.id ?? null;

  const [teams, fixtures] = await Promise.all([
    getSeasonTeams({ leagueId: league.id, divisionId: selectedDivisionId }),
    prisma.fixture.findMany({
      where: {
        leagueId: league.id,
        ...(selectedDivisionId ? { divisionId: selectedDivisionId } : {}),
        ...getPublishedWhere(visibility),
        ...getStatusWhere(statusFilter),
      },
      orderBy: [{ kickoffAt: "asc" }, { round: "asc" }, { position: "asc" }],
      select: {
        id: true,
        leagueId: true,
        homeTeamId: true,
        awayTeamId: true,
        kickoffAt: true,
        round: true,
        position: true,
        pitch: true,
        status: true,
        publishedAt: true,
        matchFeePence: true,
        venue: { select: { name: true } },
        homeTeam: { select: { name: true } },
        awayTeam: { select: { name: true } },
        paymentCharges: {
          where: { status: { not: "VOID" } },
          select: {
            teamId: true,
            amountPence: true,
            status: true,
            transactions: { select: { amountPence: true } },
          },
        },
        captainConfirmations: {
          select: {
            teamId: true,
            status: true,
            note: true,
            confirmedAt: true,
            issueRaisedAt: true,
            lastChasedAt: true,
          },
        },
      },
    }),
  ]);

  const teamIds = new Set(teams.map((team) => team.id));
  const cellMap = new Map<string, MatchupCell>();

  function getCell(teamId: string, opponentId: string) {
    const key = `${teamId}:${opponentId}`;
    const existing = cellMap.get(key);
    if (existing) return existing;

    const opponentName = teams.find((team) => team.id === opponentId)?.name ?? "Unknown team";
    const cell: MatchupCell = {
      opponentId,
      opponentName,
      meetingCount: 0,
      latestKickoffAt: null,
    };

    cellMap.set(key, cell);
    return cell;
  }

  for (const fixture of fixtures) {
    if (!isCountableFixtureStatus(fixture.status)) continue;
    if (!fixture.homeTeamId || !fixture.awayTeamId) continue;
    if (!teamIds.has(fixture.homeTeamId) || !teamIds.has(fixture.awayTeamId)) continue;

    // homeTeamId/awayTeamId are storage slots only. Each fixture increments the
    // meeting count for both teams equally; direction has no sporting meaning.
    const firstCell = getCell(fixture.homeTeamId, fixture.awayTeamId);
    firstCell.meetingCount += 1;
    firstCell.latestKickoffAt = fixture.kickoffAt.toISOString();

    const secondCell = getCell(fixture.awayTeamId, fixture.homeTeamId);
    secondCell.meetingCount += 1;
    secondCell.latestKickoffAt = fixture.kickoffAt.toISOString();
  }

  const cells = teams.map((team) => ({
    teamId: team.id,
    teamName: team.name,
    opponents: teams.map((opponent) => {
      if (opponent.id === team.id) {
        return {
          opponentId: opponent.id,
          opponentName: opponent.name,
          meetingCount: 0,
          latestKickoffAt: null,
          label: "—",
          isSelf: true,
        };
      }

      const cell = getCell(team.id, opponent.id);

      return {
        ...cell,
        label: getCellLabel(cell),
        isSelf: false,
      };
    }),
  }));

  let missingPairs = 0;
  let singleMeetingPairs = 0;
  let twoMeetingPairs = 0;
  let scheduledPairs = 0;

  for (let row = 0; row < teams.length; row += 1) {
    for (let col = row + 1; col < teams.length; col += 1) {
      const a = teams[row];
      const b = teams[col];
      const meetingCount = getCell(a.id, b.id).meetingCount;

      if (meetingCount === 0) missingPairs += 1;
      else if (meetingCount === 1) singleMeetingPairs += 1;
      else twoMeetingPairs += 1;
      if (meetingCount > 0) scheduledPairs += 1;
    }
  }

  return NextResponse.json({
    leagues: leagues.map((item) => ({
      id: item.id,
      name: item.name,
      season: item.season,
      isActive: item.isActive,
    })),
    divisions,
    selectedLeagueId: league.id,
    selectedDivisionId,
    selectedVisibility: visibility,
    selectedStatus: statusFilter,
    selectedLeagueLabel: `${league.name}${league.season ? ` · ${league.season}` : ""}`,
    selectedDivisionLabel: selectedDivision?.name ?? null,
    teams,
    cells,
    fixtures: fixtures.map((fixture) => {
      const homeCharge = fixture.paymentCharges.find((charge) => charge.teamId === fixture.homeTeamId);
      const awayCharge = fixture.paymentCharges.find((charge) => charge.teamId === fixture.awayTeamId);
      const legacyFee = fixture.matchFeePence ?? null;

      function getFeeInfo(charge: typeof fixture.paymentCharges[number] | undefined) {
        const amountPence = charge?.amountPence ?? legacyFee;
        const paidPence = charge?.transactions.reduce((sum, transaction) => sum + transaction.amountPence, 0) ?? null;
        const outstandingPence = amountPence === null
          ? null
          : Math.max(0, amountPence - (paidPence ?? 0));

        return {
          amountPence,
          paidPence,
          outstandingPence,
          status: charge?.status ?? null,
          hasPaymentCharge: Boolean(charge),
        };
      }

      const homeFee = getFeeInfo(homeCharge);
      const awayFee = getFeeInfo(awayCharge);
      const homeConfirmation = fixture.captainConfirmations.find((item) => item.teamId === fixture.homeTeamId) ?? null;
      const awayConfirmation = fixture.captainConfirmations.find((item) => item.teamId === fixture.awayTeamId) ?? null;
      const shouldShowCaptainConfirmations = Boolean(fixture.publishedAt) && fixture.status === FixtureStatus.SCHEDULED;
      const displayStatus = fixture.publishedAt ? fixture.status : "DRAFT";

      return {
        id: fixture.id,
        leagueId: fixture.leagueId,
        homeTeamId: fixture.homeTeamId,
        awayTeamId: fixture.awayTeamId,
        homeTeamName: fixture.homeTeam.name,
        awayTeamName: fixture.awayTeam.name,
        kickoffAt: fixture.kickoffAt.toISOString(),
        round: fixture.round,
        position: fixture.position,
        pitch: fixture.pitch,
        venueName: fixture.venue?.name ?? null,
        status: displayStatus,
        publishedAt: fixture.publishedAt?.toISOString() ?? null,
        homeMatchFeePence: homeFee.amountPence,
        homePaidPence: homeFee.paidPence,
        homeOutstandingPence: homeFee.outstandingPence,
        homePaymentStatus: homeFee.status,
        homeHasPaymentCharge: homeFee.hasPaymentCharge,
        awayMatchFeePence: awayFee.amountPence,
        awayPaidPence: awayFee.paidPence,
        awayOutstandingPence: awayFee.outstandingPence,
        awayPaymentStatus: awayFee.status,
        awayHasPaymentCharge: awayFee.hasPaymentCharge,
        homeConfirmationStatus: shouldShowCaptainConfirmations
          ? homeConfirmation?.status ?? getFallbackConfirmationStatus({ fixtureStatus: fixture.status, kickoffAt: fixture.kickoffAt })
          : null,
        homeConfirmationNote: shouldShowCaptainConfirmations ? homeConfirmation?.note ?? null : null,
        homeConfirmedAt: shouldShowCaptainConfirmations ? homeConfirmation?.confirmedAt?.toISOString() ?? null : null,
        homeIssueRaisedAt: shouldShowCaptainConfirmations ? homeConfirmation?.issueRaisedAt?.toISOString() ?? null : null,
        homeLastChasedAt: shouldShowCaptainConfirmations ? homeConfirmation?.lastChasedAt?.toISOString() ?? null : null,
        awayConfirmationStatus: shouldShowCaptainConfirmations
          ? awayConfirmation?.status ?? getFallbackConfirmationStatus({ fixtureStatus: fixture.status, kickoffAt: fixture.kickoffAt })
          : null,
        awayConfirmationNote: shouldShowCaptainConfirmations ? awayConfirmation?.note ?? null : null,
        awayConfirmedAt: shouldShowCaptainConfirmations ? awayConfirmation?.confirmedAt?.toISOString() ?? null : null,
        awayIssueRaisedAt: shouldShowCaptainConfirmations ? awayConfirmation?.issueRaisedAt?.toISOString() ?? null : null,
        awayLastChasedAt: shouldShowCaptainConfirmations ? awayConfirmation?.lastChasedAt?.toISOString() ?? null : null,
      };
    }),
    summary: {
      scheduledPairs,
      singleMeetingPairs,
      twoMeetingPairs,
      missingPairs,
    },
  });
}
