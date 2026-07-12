// ========================================
// File: src/lib/payments/team-payment-ledger.ts
// ========================================

import { Prisma } from "@prisma/client";

import { formatDateTimeInLondon } from "@/lib/datetime/london";
import { isMatchFeeChargePayable } from "@/lib/payments/match-day-billing";
import {
  getDirectChargePaidTotal,
  getDisplayChargeOutstandingPence,
  getDisplayChargeStatus,
} from "@/lib/payments/charge-summary";
import { prisma } from "@/lib/prisma";

type RelatedTeamRow = {
  id: string;
};

type PlayerFeeRow = {
  teamId: string;
  fixtureId: string;
  amountPence: number;
};

export type TeamPaymentLedgerEntry = {
  chargeId: string;
  teamId: string;
  teamName: string;
  fixtureId: string | null;
  title: string;
  description: string | null;
  paymentToken: string | null;
  fixtureLabel: string;
  leagueName: string | null;
  leagueSeason: string | null;
  divisionName: string | null;
  dueDate: Date | null;
  kickoffAt: Date | null;
  venueName: string | null;
  createdAt: Date;
  amountPence: number;
  directPaidPence: number;
  playerPaidPence: number;
  playerOpenPence: number;
  paidPence: number;
  outstandingPence: number;
  overpaidPence: number;
  storedStatus: string;
  displayStatus: string;
  isPayableNow: boolean;
};

export type TeamPaymentLedger = {
  teamId: string;
  teamName: string;
  relatedTeamIds: string[];
  entries: TeamPaymentLedgerEntry[];
  openEntries: TeamPaymentLedgerEntry[];
  outstandingPence: number;
  openChargeCount: number;
  selectedEntry: TeamPaymentLedgerEntry | null;
};

export function formatPaymentMoney(amountPence: number) {
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: "GBP",
  }).format(amountPence / 100);
}

export function formatPaymentFixtureDate(value: Date | null) {
  if (!value) return "No date set";
  return formatDateTimeInLondon(value, {
    weekday: "short",
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function playerFeeKey(teamId: string, fixtureId: string) {
  return `${teamId}:${fixtureId}`;
}

function buildPlayerFeeTotalsByTeamFixture(fees: PlayerFeeRow[]) {
  const totals = new Map<string, number>();
  for (const fee of fees) {
    const key = playerFeeKey(fee.teamId, fee.fixtureId);
    totals.set(key, (totals.get(key) ?? 0) + fee.amountPence);
  }
  return totals;
}

function getEntryDueTime(entry: TeamPaymentLedgerEntry, fallback: number) {
  return (entry.dueDate ?? entry.kickoffAt)?.getTime() ?? fallback;
}

function isOutstandingCharge(entry: TeamPaymentLedgerEntry) {
  return entry.displayStatus !== "PAID" && entry.displayStatus !== "VOID" && entry.outstandingPence > 0;
}

function getLedgerDisplayGroup(entry: TeamPaymentLedgerEntry) {
  if (isOutstandingCharge(entry) && entry.isPayableNow) return 0;
  if (isOutstandingCharge(entry)) return 1;
  return 2;
}

function sortLedgerEntriesForCaptain(entries: TeamPaymentLedgerEntry[]) {
  return [...entries].sort((a, b) => {
    const groupDiff = getLedgerDisplayGroup(a) - getLedgerDisplayGroup(b);
    if (groupDiff !== 0) return groupDiff;

    const group = getLedgerDisplayGroup(a);
    if (group === 2) {
      return getEntryDueTime(b, b.createdAt.getTime()) - getEntryDueTime(a, a.createdAt.getTime());
    }

    return getEntryDueTime(a, Number.MAX_SAFE_INTEGER) - getEntryDueTime(b, Number.MAX_SAFE_INTEGER);
  });
}

export async function getRelatedTeamIdsForPaymentLedger(teamId: string) {
  const team = await prisma.team.findUnique({
    where: { id: teamId },
    select: { id: true, name: true },
  });

  if (!team) return null;

  // Teams were historically duplicated per season. Until there is a permanent clubId,
  // same-name team rows are the only reliable way to keep old unpaid fixture charges visible
  // to the same captain/admin team view after season/division moves.
  const rows = await prisma.$queryRaw<RelatedTeamRow[]>(Prisma.sql`
    SELECT DISTINCT "id"
    FROM "Team"
    WHERE LOWER(TRIM("name")) = LOWER(TRIM(${team.name}))
  `);

  return {
    team,
    relatedTeamIds: Array.from(new Set([team.id, ...rows.map((row) => row.id)])),
  };
}

export async function getTeamPaymentLedger(teamId: string): Promise<TeamPaymentLedger | null> {
  const identity = await getRelatedTeamIdsForPaymentLedger(teamId);
  if (!identity) return null;

  const { team, relatedTeamIds } = identity;

  const [charges, paidPlayerFees, openPlayerFees] = await Promise.all([
    prisma.paymentCharge.findMany({
      where: {
        teamId: { in: relatedTeamIds },
        status: { not: "VOID" },
      },
      orderBy: [{ dueDate: "asc" }, { createdAt: "asc" }],
      include: {
        team: { select: { id: true, name: true } },
        transactions: { select: { amountPence: true, notes: true } },
        fixture: {
          select: {
            id: true,
            kickoffAt: true,
            homeTeam: { select: { name: true } },
            awayTeam: { select: { name: true } },
            venue: { select: { name: true } },
            league: { select: { name: true, season: true } },
            division: { select: { name: true } },
          },
        },
      },
    }),
    prisma.playerMatchFee.findMany({
      where: {
        teamId: { in: relatedTeamIds },
        status: "PAID",
      },
      select: { teamId: true, fixtureId: true, amountPence: true },
    }),
    prisma.playerMatchFee.findMany({
      where: {
        teamId: { in: relatedTeamIds },
        status: "OPEN",
      },
      select: { teamId: true, fixtureId: true, amountPence: true },
    }),
  ]);

  const paidByTeamFixture = buildPlayerFeeTotalsByTeamFixture(paidPlayerFees);
  const openByTeamFixture = buildPlayerFeeTotalsByTeamFixture(openPlayerFees);

  const unsortedEntries = charges.map<TeamPaymentLedgerEntry>((charge) => {
    const fixtureKey = charge.fixtureId ? playerFeeKey(charge.teamId, charge.fixtureId) : null;
    const directPaidPence = getDirectChargePaidTotal(charge.transactions);
    const playerPaidPence = fixtureKey ? paidByTeamFixture.get(fixtureKey) ?? 0 : 0;
    const playerOpenPence = fixtureKey ? openByTeamFixture.get(fixtureKey) ?? 0 : 0;
    const paidPence = directPaidPence + playerPaidPence;
    const displayStatus = getDisplayChargeStatus({
      storedStatus: charge.status,
      amountPence: charge.amountPence,
      paidPence,
    });
    const outstandingPence = getDisplayChargeOutstandingPence({
      displayStatus,
      amountPence: charge.amountPence,
      paidPence,
    });
    const overpaidPence = Math.max(paidPence - charge.amountPence, 0);
    const fixtureLabel = charge.fixture
      ? `${charge.fixture.homeTeam.name} vs ${charge.fixture.awayTeam.name}`
      : charge.title;
    const isPayableNow = isMatchFeeChargePayable(charge.dueDate);

    return {
      chargeId: charge.id,
      teamId: charge.teamId,
      teamName: charge.team.name,
      fixtureId: charge.fixtureId,
      title: charge.title,
      description: charge.description,
      paymentToken: charge.paymentToken,
      fixtureLabel,
      leagueName: charge.fixture?.league?.name ?? null,
      leagueSeason: charge.fixture?.league?.season ?? null,
      divisionName: charge.fixture?.division?.name ?? null,
      dueDate: charge.dueDate,
      kickoffAt: charge.fixture?.kickoffAt ?? null,
      venueName: charge.fixture?.venue?.name ?? null,
      createdAt: charge.createdAt,
      amountPence: charge.amountPence,
      directPaidPence,
      playerPaidPence,
      playerOpenPence,
      paidPence,
      outstandingPence,
      overpaidPence,
      storedStatus: charge.status,
      displayStatus,
      isPayableNow,
    };
  });

  const entries = sortLedgerEntriesForCaptain(unsortedEntries);
  const openEntries = entries.filter((entry) => isOutstandingCharge(entry) && entry.isPayableNow);

  return {
    teamId: team.id,
    teamName: team.name,
    relatedTeamIds,
    entries,
    openEntries,
    outstandingPence: openEntries.reduce((sum, entry) => sum + entry.outstandingPence, 0),
    openChargeCount: openEntries.length,
    selectedEntry: openEntries[0] ?? entries[0] ?? null,
  };
}
