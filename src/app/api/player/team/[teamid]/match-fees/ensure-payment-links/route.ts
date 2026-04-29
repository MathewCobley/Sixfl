// ========================================
// File: src/app/api/player/team/[teamid]/match-fees/ensure-payment-links/route.ts
// ========================================

import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { PlayerMatchFeeStatus } from "@prisma/client";

import { authOptions } from "@/auth";
import { ensurePlayerMatchFeePaymentDetailsForFees } from "@/lib/payments/player-match-fees";
import { prisma } from "@/lib/prisma";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ teamid: string }> },
) {
  const session = await getServerSession(authOptions);

  if (!session?.user?.email) {
    return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
  }

  const { teamid } = await params;
  const email = session.user.email.trim().toLowerCase();

  const user = await prisma.user.findUnique({
    where: { email },
    select: {
      id: true,
      role: true,
      teamMembers: {
        where: { teamId: teamid },
        select: { id: true },
        take: 1,
      },
    },
  });

  const membership = user?.teamMembers[0] ?? null;

  if (!membership && user?.role !== "ADMIN") {
    return NextResponse.json({ error: "Not linked to this team" }, { status: 403 });
  }

  const openFees = membership
    ? await prisma.playerMatchFee.findMany({
        where: {
          teamId: teamid,
          teamMemberId: membership.id,
          status: PlayerMatchFeeStatus.OPEN,
        },
        select: {
          id: true,
          paymentUrl: true,
          paymentToken: true,
        },
      })
    : [];

  const needsLink = openFees.filter((fee) => !fee.paymentUrl || !fee.paymentToken);

  if (needsLink.length > 0) {
    await ensurePlayerMatchFeePaymentDetailsForFees(needsLink.map((fee) => fee.id));
  }

  return NextResponse.json({
    checked: openFees.length,
    updated: needsLink.length,
  });
}
