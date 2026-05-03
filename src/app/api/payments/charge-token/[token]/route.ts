// ========================================
// File: src/app/api/payments/charge-token/[token]/route.ts
// ========================================

import { NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;

  const charge = await prisma.paymentCharge.findUnique({
    where: {
      paymentToken: token,
    },
    select: {
      id: true,
      teamId: true,
      status: true,
    },
  });

  if (!charge) {
    return NextResponse.json({ error: "Charge not found." }, { status: 404 });
  }

  return NextResponse.json({
    chargeId: charge.id,
    teamId: charge.teamId,
    status: charge.status,
  });
}
