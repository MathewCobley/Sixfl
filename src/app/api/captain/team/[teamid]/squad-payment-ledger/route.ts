// ========================================
// File: src/app/api/captain/team/[teamid]/squad-payment-ledger/route.ts
// ========================================

import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";

import { formatDateTimeInLondon } from "@/lib/datetime/london";
import { prisma } from "@/lib/prisma";
import { requireCaptain } from "@/lib/requireCaptain";

type RelatedTeamRow = {
  id: string;
};

function formatMoney(amountPence: number) {
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: "GBP",
  }).format(amountPence / 100);
}

function formatFixtureDate(value: Date | null) {
  if (!value) return "No fixture date";

  return formatDateTimeInLondon(value, {
    weekday: "short",
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function isPlayerMatchFeeTransaction(transaction: { notes: string | null }) {
  const notes = transaction.notes?.toLowerCase() ?? "";
  return notes.includes("player match fee paid online") || notes.includes("player fee id:");
}

function getFixtureLabel(charge: {
  title: string;
  fixture: {
    homeTeam: { name: string };
    awayTeam: { name: string };
  } | null;
}) {
  if (charge.fixture) {
    return `${charge.fixture.homeTeam.name} vs ${charge.fixture.awayTeam.name}`;
  }

  return charge.title;
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ teamid: string }> },
) {
  const { teamid } = await params;
  await requireCaptain(teamid);

  const team = await prisma.team.findUnique({
    where: { id: teamid },
    select: { id: true, name: true },
  });

  if (!team) {
    return NextResponse.json({ error: "Team not found." }, { status: 404 });
  }

  const relatedTeamRows = await prisma.$queryRaw<RelatedTeamRow[]>(Prisma.sql`
    SELECT DISTINCT "id"
    FROM "Team"
    WHERE LOWER(TRIM("name")) = LOWER(TRIM(${team.name}))
  `);
  const relatedTeamIds = Array.from(new Set([team.id, ...relatedTeamRows.map((row) => row.id)]));

  const [charges, paidPlayerFees, openPlayerFees] = await Promise.all([
    prisma.paymentCharge.findMany({
      where: {
        teamId: { in: relatedTeamIds },
        status: { not: "VOID" },
      },
      orderBy: [{ dueDate: "desc" }, { createdAt: "desc" }],
      include: {
        team: { select: { id: true, name: true } },
        transactions: { select: { amountPence: true, notes: true } },
        fixture: {
          select: {
            id: true,
            kickoffAt: true,
            matchFeePence: true,
            homeTeam: { select: { id: true, name: true } },
            awayTeam: { select: { id: true, name: true } },
            venue: { select: { name: true } },
            league: { select: { name: true, season: true } },
          },
        },
      },
    }),
    prisma.playerMatchFee.findMany({
      where: { teamId: { in: relatedTeamIds }, status: "PAID" },
      select: { fixtureId: true, amountPence: true },
    }),
    prisma.playerMatchFee.findMany({
      where: { teamId: { in: relatedTeamIds }, status: "OPEN" },
      select: { fixtureId: true, amountPence: true },
    }),
  ]);

  const paidByFixtureId = new Map<string, number>();
  const openByFixtureId = new Map<string, number>();

  for (const fee of paidPlayerFees) {
    paidByFixtureId.set(fee.fixtureId, (paidByFixtureId.get(fee.fixtureId) ?? 0) + fee.amountPence);
  }

  for (const fee of openPlayerFees) {
    openByFixtureId.set(fee.fixtureId, (openByFixtureId.get(fee.fixtureId) ?? 0) + fee.amountPence);
  }

  const entries = charges
    .map((charge) => {
      const fixtureId = charge.fixtureId ?? charge.fixture?.id ?? null;
      const directPaidPence = charge.transactions.reduce((sum, transaction) => {
        if (isPlayerMatchFeeTransaction(transaction)) return sum;
        return sum + transaction.amountPence;
      }, 0);
      const squadPaidPence = fixtureId ? paidByFixtureId.get(fixtureId) ?? 0 : 0;
      const squadOpenPence = fixtureId ? openByFixtureId.get(fixtureId) ?? 0 : 0;
      const paidPence = directPaidPence + squadPaidPence;
      const outstandingPence = charge.status === "PAID" ? 0 : Math.max(charge.amountPence - paidPence, 0);

      return {
        id: charge.id,
        teamId: charge.teamId,
        teamName: charge.team.name,
        title: charge.title,
        fixtureId,
        label: getFixtureLabel(charge),
        leagueName: charge.fixture?.league?.name ?? null,
        leagueSeason: charge.fixture?.league?.season ?? null,
        fixtureDateLabel: formatFixtureDate(charge.fixture?.kickoffAt ?? charge.dueDate ?? null),
        venueName: charge.fixture?.venue?.name ?? null,
        amountPence: charge.amountPence,
        amountLabel: formatMoney(charge.amountPence),
        paidPence,
        paidLabel: formatMoney(paidPence),
        outstandingPence,
        outstandingLabel: formatMoney(outstandingPence),
        squadPaidPence,
        squadPaidLabel: formatMoney(squadPaidPence),
        squadOpenPence,
        squadOpenLabel: formatMoney(squadOpenPence),
        status: charge.status,
      };
    })
    .filter((entry) => entry.status !== "PAID" || entry.outstandingPence > 0);

  const openEntries = entries.filter((entry) => entry.outstandingPence > 0);
  const selected = openEntries[0] ?? entries[0] ?? null;
  const outstandingPence = openEntries.reduce((sum, entry) => sum + entry.outstandingPence, 0);
  const collectedPence = selected?.paidPence ?? 0;
  const playerOutstandingPence = selected?.squadOpenPence ?? 0;

  return NextResponse.json({
    teamId: team.id,
    teamName: team.name,
    relatedTeamIds,
    outstandingPence,
    outstandingLabel: formatMoney(outstandingPence),
    openChargeCount: openEntries.length,
    selected,
    cards: {
      teamFeeLabel: selected?.amountLabel ?? formatMoney(4000),
      ledgerChargeLabel: selected?.amountLabel ?? formatMoney(0),
      collectedLabel: formatMoney(collectedPence),
      playerOutstandingLabel: formatMoney(playerOutstandingPence),
      ledgerStillToCoverLabel: formatMoney(selected?.outstandingPence ?? 0),
      allocationText: selected
        ? `The ledger charge is ${selected.amountLabel}. ${selected.paidLabel} has been counted against it, leaving ${selected.outstandingLabel} still to cover.`
        : "There are no open team charges or player payment collections for this team.",
    },
    entries,
  });
}
