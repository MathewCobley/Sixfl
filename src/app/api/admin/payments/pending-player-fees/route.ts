// ========================================
// File: src/app/api/admin/payments/pending-player-fees/route.ts
// ========================================

import { PlayerMatchFeeStatus } from "@prisma/client";
import { NextResponse } from "next/server";

import { ensurePlayerMatchFeePaymentDetailsForFees } from "@/lib/payments/player-match-fees";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/requireAdmin";

function formatMoney(amountPence: number) {
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: "GBP",
  }).format(amountPence / 100);
}

function getPlayerName(input: {
  teamMember: { user: { name: string | null; email: string | null } } | null;
  prospect: { firstName: string; lastName: string | null; email: string | null } | null;
}) {
  if (input.teamMember) {
    return input.teamMember.user.name || input.teamMember.user.email || "Linked player";
  }

  if (input.prospect) {
    return [input.prospect.firstName, input.prospect.lastName]
      .filter(Boolean)
      .join(" ")
      .trim() || input.prospect.email || "Prospect";
  }

  return "Player";
}

function formatFixtureDate(value: Date) {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/London",
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(value);
}

export async function GET() {
  await requireAdmin();

  const openFees = await prisma.playerMatchFee.findMany({
    where: {
      status: PlayerMatchFeeStatus.OPEN,
    },
    orderBy: [{ createdAt: "desc" }],
    take: 100,
    select: {
      id: true,
      amountPence: true,
      paymentUrl: true,
      paymentToken: true,
      createdAt: true,
      fixture: {
        select: {
          kickoffAt: true,
          homeTeam: { select: { name: true } },
          awayTeam: { select: { name: true } },
        },
      },
      team: {
        select: {
          id: true,
          name: true,
        },
      },
      teamMember: {
        select: {
          user: {
            select: {
              name: true,
              email: true,
            },
          },
        },
      },
      prospect: {
        select: {
          firstName: true,
          lastName: true,
          email: true,
        },
      },
    },
  });

  const feesMissingLinks = openFees.filter((fee) => !fee.paymentUrl || !fee.paymentToken);

  if (feesMissingLinks.length > 0) {
    await ensurePlayerMatchFeePaymentDetailsForFees(feesMissingLinks.map((fee) => fee.id));
  }

  const refreshedFees = feesMissingLinks.length
    ? await prisma.playerMatchFee.findMany({
        where: {
          id: {
            in: openFees.map((fee) => fee.id),
          },
        },
        select: {
          id: true,
          paymentUrl: true,
          paymentToken: true,
        },
      })
    : [];

  const refreshedById = new Map(refreshedFees.map((fee) => [fee.id, fee]));
  const totalOutstandingPence = openFees.reduce((sum, fee) => sum + fee.amountPence, 0);

  return NextResponse.json({
    count: openFees.length,
    totalOutstanding: formatMoney(totalOutstandingPence),
    totalOutstandingPence,
    linksCreated: feesMissingLinks.length,
    items: openFees.map((fee) => {
      const refreshed = refreshedById.get(fee.id);
      const paymentUrl = refreshed?.paymentUrl ?? fee.paymentUrl;

      return {
        id: fee.id,
        amount: formatMoney(fee.amountPence),
        amountPence: fee.amountPence,
        paymentUrl,
        teamId: fee.team.id,
        teamName: fee.team.name,
        playerName: getPlayerName({
          teamMember: fee.teamMember,
          prospect: fee.prospect,
        }),
        fixtureLabel: `${fee.fixture.homeTeam.name} vs ${fee.fixture.awayTeam.name}`,
        fixtureDate: formatFixtureDate(fee.fixture.kickoffAt),
        createdAt: fee.createdAt.toISOString(),
      };
    }),
  });
}
