// ========================================
// File: src/lib/payments/team-payment-ledger.ts
// ========================================

import { randomBytes } from "node:crypto";
import { Prisma } from "@prisma/client";

import { formatDateTimeInLondon } from "@/lib/datetime/london";
import { isMatchFeeChargePayable } from "@/lib/payments/match-day-billing";
import {
  getDirectChargePaidTotal,
  getDisplayChargeOutstandingPence,
  getDisplayChargeStatus,
} from "@/lib/payments/charge-summary";
import {
  getPlayerFeeCashReceivedPence,
  getPlayerFeeSubsidyPence,
} from "@/lib/payments/player-fee-coverage";
import { hydrateCaptainAssignedPlayerFees } from "@/lib/payments/player-fee-assigned-share";
import {
  getLegacyAdminAdjustmentWaivedPence,
  getTeamChargeWaivedPence,
  stripTeamChargeWaiverMarkers,
} from "@/lib/payments/team-charge-waivers";
import { prisma } from "@/lib/prisma";

type RelatedTeamRow = {
  id: string;
};

type PaymentLedgerTeamRow = {
  id: string;
  name: string;
  teamMode: "STANDARD" | "MANAGED";
  standardCreditStartedAt: Date | null;
};

type PlayerFeeRow = {
  id: string;
  teamId: string;
  fixtureId: string;
  amountPence: number;
  status: string;
  note: string | null;
  captainAssignedAmountPence?: number | null;
};

export type TeamPaymentLedgerEntry = {
  chargeId: string;
  teamId: string;
  teamName: string;
  fixtureId: string | null;
  title: string;
  description: string | null;
  latePaymentFeeStatus: string;
  latePaymentFeeAmountPence: number;
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
  baseMatchFeePence: number;
  directPaidPence: number;
  playerPaidPence: number;
  playerSubsidyPence: number;
  playerOpenPence: number;
  paidPence: number;
  coveredPence: number;
  waivedPence: number;
  settledPence: number;
  outstandingPence: number;
  overpaidPence: number;
  storedStatus: string;
  displayStatus: string;
  isPayableNow: boolean;
  payments: Array<{
    id: string;
    amountPence: number;
    method: string;
    reference: string | null;
    notes: string | null;
    paidAt: Date;
  }>;
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

function createPaymentToken() {
  return randomBytes(24).toString("hex");
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

function buildPlayerFeeCoverageByTeamFixture(fees: PlayerFeeRow[]) {
  const totals = new Map<string, { cashPence: number; subsidyPence: number }>();
  for (const fee of fees) {
    const key = playerFeeKey(fee.teamId, fee.fixtureId);
    const current = totals.get(key) ?? { cashPence: 0, subsidyPence: 0 };
    current.cashPence += getPlayerFeeCashReceivedPence(fee);
    current.subsidyPence += getPlayerFeeSubsidyPence(fee);
    totals.set(key, current);
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
  const [team] = await prisma.$queryRaw<PaymentLedgerTeamRow[]>(Prisma.sql`
    SELECT
      "id",
      "name",
      "teamMode"::text AS "teamMode",
      "standardCreditStartedAt"
    FROM "Team"
    WHERE "id" = ${teamId}
    LIMIT 1
  `);

  if (!team) return null;

  // Once a managed squad has converted to standard, this exact Team row becomes
  // a new standard-credit identity. Do not bridge it to same-named historical
  // STANDARD rows, otherwise old credit/charges could leak across the boundary.
  if (team.teamMode === "STANDARD" && team.standardCreditStartedAt) {
    return {
      team,
      relatedTeamIds: [team.id],
    };
  }

  // Teams were historically duplicated per season. Until there is a permanent clubId,
  // same-name team rows are the only reliable way to keep old unpaid fixture charges visible
  // to the same captain/admin team view after season/division moves.
  // Never bridge STANDARD and MANAGED records: the two modes have different payment models.
  const rows = await prisma.$queryRaw<RelatedTeamRow[]>(Prisma.sql`
    SELECT DISTINCT "id"
    FROM "Team"
    WHERE LOWER(TRIM("name")) = LOWER(TRIM(${team.name}))
      AND "teamMode"::text = ${team.teamMode}
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

  const [charges, coveredPlayerFees, openPlayerFees] = await Promise.all([
    prisma.paymentCharge.findMany({
      where: {
        teamId: { in: relatedTeamIds },
        status: { not: "VOID" },
      },
      orderBy: [{ dueDate: "asc" }, { createdAt: "asc" }],
      include: {
        team: { select: { id: true, name: true } },
        transactions: {
          orderBy: { paidAt: "asc" },
          select: {
            id: true,
            amountPence: true,
            method: true,
            reference: true,
            notes: true,
            paidAt: true,
          },
        },
        fixture: {
          select: {
            id: true,
            kickoffAt: true,
            matchFeePence: true,
            homeMatchFeePence: true,
            awayMatchFeePence: true,
            homeTeamId: true,
            awayTeamId: true,
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
        status: { in: ["PAID", "WAIVED"] },
      },
      select: {
        id: true,
        teamId: true,
        fixtureId: true,
        amountPence: true,
        status: true,
        note: true,
      },
    }),
    prisma.playerMatchFee.findMany({
      where: {
        teamId: { in: relatedTeamIds },
        status: "OPEN",
      },
      select: {
        id: true,
        teamId: true,
        fixtureId: true,
        amountPence: true,
        status: true,
        note: true,
      },
    }),
  ]);

  const coveredPlayerFeesWithAssignedShares =
    await hydrateCaptainAssignedPlayerFees(coveredPlayerFees);

  // Older/manual charge rows can legitimately exist without a checkout token.
  // Captains used to always have a direct Pay now route for an active unpaid charge,
  // so repair that missing token lazily when the ledger is opened instead of leaving
  // "Use team credit" as the only visible action.
  await Promise.all(
    charges.map(async (charge) => {
      if (charge.paymentToken || charge.status === "PAID") return;

      const paymentToken = createPaymentToken();
      await prisma.paymentCharge.update({
        where: { id: charge.id },
        data: { paymentToken },
      });
      charge.paymentToken = paymentToken;
    }),
  );

  const coverageByTeamFixture = buildPlayerFeeCoverageByTeamFixture(coveredPlayerFeesWithAssignedShares);
  const openByTeamFixture = buildPlayerFeeTotalsByTeamFixture(openPlayerFees);

  const unsortedEntries = charges.map<TeamPaymentLedgerEntry>((charge) => {
    const fixtureKey = charge.fixtureId ? playerFeeKey(charge.teamId, charge.fixtureId) : null;
    const directPaidPence = getDirectChargePaidTotal(charge.transactions);
    const playerCoverage = fixtureKey ? coverageByTeamFixture.get(fixtureKey) : null;
    const playerPaidPence = playerCoverage?.cashPence ?? 0;
    const playerSubsidyPence = playerCoverage?.subsidyPence ?? 0;
    const playerOpenPence = fixtureKey ? openByTeamFixture.get(fixtureKey) ?? 0 : 0;
    const paidPence = directPaidPence + playerPaidPence;
    const appliedLatePaymentFeePence =
      charge.latePaymentFeeStatus === "APPLIED"
        ? Math.max(charge.latePaymentFeeAmountPence, 0)
        : 0;
    const fixtureBaseMatchFeePence = charge.fixture
      ? charge.fixture.homeTeamId === charge.teamId
        ? charge.fixture.homeMatchFeePence ?? charge.fixture.matchFeePence
        : charge.fixture.awayTeamId === charge.teamId
          ? charge.fixture.awayMatchFeePence ?? charge.fixture.matchFeePence
          : null
      : null;
    const authoritativeBaseMatchFeePence =
      fixtureBaseMatchFeePence ??
      Math.max(charge.amountPence - appliedLatePaymentFeePence, 0);
    const effectiveChargeAmountPence =
      appliedLatePaymentFeePence > 0
        ? authoritativeBaseMatchFeePence + appliedLatePaymentFeePence
        : charge.amountPence;
    const coveredPence = paidPence + playerSubsidyPence;
    const waivedPence =
      getTeamChargeWaivedPence(charge.description) +
      getLegacyAdminAdjustmentWaivedPence(charge.description, charge.amountPence);
    const settledPence = coveredPence + waivedPence;
    const displayStatus = getDisplayChargeStatus({
      storedStatus: charge.status,
      amountPence: effectiveChargeAmountPence,
      paidPence: settledPence,
    });
    const outstandingPence = getDisplayChargeOutstandingPence({
      displayStatus,
      amountPence: effectiveChargeAmountPence,
      paidPence: settledPence,
    });

    const chargeFinancialDate = charge.fixture?.kickoffAt ?? charge.dueDate ?? charge.createdAt;
    const isAfterStandardCreditBoundary =
      !team.standardCreditStartedAt || chargeFinancialDate >= team.standardCreditStartedAt;

    // Managed squads collect individual player fees; a player-fee surplus must never
    // become standard team credit. After a MANAGED -> STANDARD conversion, managed-era
    // fixtures remain visible as history but can never display or generate team credit.
    // SIXFL subsidy is coverage, never cash, so it cannot create overpayment credit.
    const overpaidPence =
      team.teamMode === "STANDARD" && isAfterStandardCreditBoundary
        ? Math.max(paidPence - effectiveChargeAmountPence, 0)
        : 0;
    const fixtureLabel = charge.fixture
      ? `${charge.fixture.homeTeam.name} vs ${charge.fixture.awayTeam.name}`
      : charge.title;
    const isPayableNow = displayStatus !== "VOID" && isMatchFeeChargePayable(charge.dueDate);

    return {
      chargeId: charge.id,
      teamId: charge.teamId,
      teamName: charge.team.name,
      fixtureId: charge.fixtureId,
      title: charge.title,
      description: stripTeamChargeWaiverMarkers(charge.description),
      latePaymentFeeStatus: charge.latePaymentFeeStatus,
      latePaymentFeeAmountPence: charge.latePaymentFeeAmountPence,
      paymentToken: charge.paymentToken,
      fixtureLabel,
      leagueName: charge.fixture?.league?.name ?? null,
      leagueSeason: charge.fixture?.league?.season ?? null,
      divisionName: charge.fixture?.division?.name ?? null,
      dueDate: charge.dueDate,
      kickoffAt: charge.fixture?.kickoffAt ?? null,
      venueName: charge.fixture?.venue?.name ?? null,
      createdAt: charge.createdAt,
      amountPence: effectiveChargeAmountPence,
      baseMatchFeePence: authoritativeBaseMatchFeePence,
      directPaidPence,
      playerPaidPence,
      playerSubsidyPence,
      playerOpenPence,
      paidPence,
      coveredPence,
      waivedPence,
      settledPence,
      outstandingPence,
      overpaidPence,
      storedStatus: charge.status,
      displayStatus,
      isPayableNow,
      payments: charge.transactions.map((transaction) => ({
        id: transaction.id,
        amountPence: transaction.amountPence,
        method: transaction.method,
        reference: transaction.reference,
        notes: transaction.notes,
        paidAt: transaction.paidAt,
      })),
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
