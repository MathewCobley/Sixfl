// ========================================
// File: src/app/api/captain/team/[teamid]/outstanding-balance/route.ts
// ========================================

import { NextResponse } from "next/server";

import { getCaptainRelatedTeamContext } from "@/lib/captain/related-teams";
import { summariseChargesWithPlayerMatchFees } from "@/lib/payments/charge-summary";
import { prisma } from "@/lib/prisma";
import { requireCaptain } from "@/lib/requireCaptain";

function formatMoney(amountPence: number) {
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: "GBP",
  }).format(amountPence / 100);
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

  const teamIds = context.relatedTeamIds;

  const [paymentCharges, paidPlayerMatchFees, openPlayerMatchFees, activeChargeFixtureIds] =
    await Promise.all([
      prisma.paymentCharge.findMany({
        where: {
          teamId: { in: teamIds },
          status: {
            notIn: ["PAID", "VOID"],
          },
        },
        include: {
          transactions: {
            select: {
              amountPence: true,
              notes: true,
            },
          },
        },
      }),
      prisma.playerMatchFee.findMany({
        where: {
          teamId: { in: teamIds },
          status: "PAID",
        },
        select: {
          fixtureId: true,
          amountPence: true,
        },
      }),
      prisma.playerMatchFee.findMany({
        where: {
          teamId: { in: teamIds },
          status: "OPEN",
        },
        select: {
          fixtureId: true,
          amountPence: true,
        },
      }),
      prisma.paymentCharge.findMany({
        where: {
          teamId: { in: teamIds },
          status: {
            not: "VOID",
          },
          fixtureId: {
            not: null,
          },
        },
        select: {
          fixtureId: true,
        },
      }),
    ]);

  const chargeSummaries = summariseChargesWithPlayerMatchFees(
    paymentCharges,
    paidPlayerMatchFees,
  );
  const openChargeSummaries = chargeSummaries.filter(
    (summary) =>
      summary.displayStatus !== "PAID" &&
      summary.displayStatus !== "VOID" &&
      summary.outstandingPence > 0,
  );
  const chargeOutstandingPence = openChargeSummaries.reduce(
    (sum, summary) => sum + summary.outstandingPence,
    0,
  );

  const fixtureIdsWithAnyNonVoidCharge = new Set(
    activeChargeFixtureIds
      .map((charge) => charge.fixtureId)
      .filter((fixtureId): fixtureId is string => Boolean(fixtureId)),
  );
  const unlinkedOpenPlayerFees = openPlayerMatchFees.filter(
    (fee) => !fixtureIdsWithAnyNonVoidCharge.has(fee.fixtureId),
  );
  const unlinkedPlayerOutstandingPence = unlinkedOpenPlayerFees.reduce(
    (sum, fee) => sum + fee.amountPence,
    0,
  );
  const unlinkedCollectionFixtureCount = new Set(
    unlinkedOpenPlayerFees.map((fee) => fee.fixtureId),
  ).size;

  const outstandingPence = chargeOutstandingPence + unlinkedPlayerOutstandingPence;
  const itemCount = openChargeSummaries.length + unlinkedCollectionFixtureCount;
  const helperParts: string[] = [];

  if (openChargeSummaries.length > 0) {
    helperParts.push(
      `${openChargeSummaries.length} open charge${openChargeSummaries.length === 1 ? "" : "s"}`,
    );
  }

  if (unlinkedCollectionFixtureCount > 0) {
    helperParts.push(
      `${unlinkedCollectionFixtureCount} squad payment collection${unlinkedCollectionFixtureCount === 1 ? "" : "s"}`,
    );
  }

  return NextResponse.json({
    outstandingPence,
    outstandingLabel: formatMoney(outstandingPence),
    itemCount,
    openChargeCount: openChargeSummaries.length,
    unlinkedCollectionFixtureCount,
    relatedTeamCount: teamIds.length,
    helper:
      helperParts.length > 0
        ? `${helperParts.join(" and ")}.`
        : "0 open charges.",
  });
}
