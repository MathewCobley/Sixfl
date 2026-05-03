// ========================================
// File: src/app/api/admin/payments/voidable-charges/route.ts
// ========================================

import { NextResponse } from "next/server";

import { summariseCharge } from "@/lib/payments/charge-status";
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
        },
      },
    },
  });

  return NextResponse.json({
    items: charges.map((charge) => {
      const summary = summariseCharge({
        amountPence: charge.amountPence,
        transactions: charge.transactions,
      });

      return {
        id: charge.id,
        teamId: charge.team.id,
        teamName: charge.team.name,
        title: charge.title,
        description: charge.description,
        status: charge.status,
        amount: formatMoney(charge.amountPence),
        outstanding: formatMoney(summary.outstandingPence),
        outstandingPence: summary.outstandingPence,
        paidTotalPence: summary.paidTotalPence,
        fixtureLabel: charge.fixture
          ? `${charge.fixture.homeTeam.name} vs ${charge.fixture.awayTeam.name}`
          : null,
      };
    }),
  });
}
