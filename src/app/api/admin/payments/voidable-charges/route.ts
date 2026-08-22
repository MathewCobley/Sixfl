// ========================================
// File: src/app/api/admin/payments/voidable-charges/route.ts
// ========================================

import { PlayerMatchFeeStatus } from "@prisma/client";
import { NextResponse } from "next/server";

import { summariseChargesWithPlayerMatchFees } from "@/lib/payments/charge-summary";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/requireAdmin";

function formatMoney(amountPence: number) {
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: "GBP",
  }).format(amountPence / 100);
}

export async function GET() {
  await requireAdmin();

  const charges = await prisma.paymentCharge.findMany({
    where: {
      status: {
        notIn: ["PAID", "VOID"],
      },
    },
    orderBy: [{ createdAt: "desc" }],
    take: 200,
    include: {
      team: {
        select: {
          id: true,
          name: true,
        },
      },
      fixture: {
        select: {
          id: true,
          homeTeam: { select: { name: true } },
          awayTeam: { select: { name: true } },
          kickoffAt: true,
        },
      },
      transactions: {
        select: {
          amountPence: true,
          notes: true,
        },
      },
    },
  });

  const fixtureIds = Array.from(
    new Set(charges.map((charge) => charge.fixtureId).filter((value): value is string => Boolean(value))),
  );
  const teamIds = Array.from(new Set(charges.map((charge) => charge.teamId)));

  const playerMatchFees = fixtureIds.length
    ? await prisma.playerMatchFee.findMany({
        where: {
          fixtureId: { in: fixtureIds },
          teamId: { in: teamIds },
          status: {
            in: [PlayerMatchFeeStatus.PAID, PlayerMatchFeeStatus.WAIVED],
          },
        },
        select: {
          teamId: true,
          fixtureId: true,
          amountPence: true,
          status: true,
          note: true,
        },
      })
    : [];

  const items = charges.flatMap((charge) => {
    const feesForCharge = charge.fixtureId
      ? playerMatchFees.filter(
          (fee) => fee.teamId === charge.teamId && fee.fixtureId === charge.fixtureId,
        )
      : [];
    const [summary] = summariseChargesWithPlayerMatchFees([charge], feesForCharge);

    if (!summary || summary.outstandingPence <= 0) return [];

    return [
      {
        id: charge.id,
        teamId: charge.team.id,
        teamName: charge.team.name,
        title: charge.title,
        description: charge.description,
        status: summary.displayStatus,
        amount: formatMoney(charge.amountPence),
        amountPence: charge.amountPence,
        outstanding: formatMoney(summary.outstandingPence),
        outstandingPence: summary.outstandingPence,
        paidTotalPence: summary.coveredPence,
        coveredPence: summary.coveredPence,
        fixtureLabel: charge.fixture
          ? `${charge.fixture.homeTeam.name} vs ${charge.fixture.awayTeam.name}`
          : null,
      },
    ];
  });

  return NextResponse.json({ items });
}
