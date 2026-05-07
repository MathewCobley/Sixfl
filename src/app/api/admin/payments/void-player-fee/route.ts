// ========================================
// File: src/app/api/admin/payments/void-player-fee/route.ts
// ========================================

import { NotificationDispatchStatus, PlayerMatchFeeStatus } from "@prisma/client";
import { NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/requireAdmin";

const PLAYER_MATCH_FEE_SOURCE_TYPES = [
  "PLAYER_MATCH_FEE_REQUEST",
  "PLAYER_MATCH_FEE_CHASE_24H",
  "PLAYER_MATCH_FEE_CHASE_72H",
];

function getString(value: unknown) {
  const parsed = String(value ?? "").trim();
  return parsed || null;
}

export async function POST(request: Request) {
  await requireAdmin();

  const body = await request.json().catch(() => null);
  const feeId = getString((body as { feeId?: unknown } | null)?.feeId);
  const reason =
    getString((body as { reason?: unknown } | null)?.reason) ??
    "Voided by admin from payments screen.";

  if (!feeId) {
    return NextResponse.json({ error: "Missing player charge id." }, { status: 400 });
  }

  const fee = await prisma.playerMatchFee.findUnique({
    where: { id: feeId },
    select: {
      id: true,
      status: true,
      note: true,
    },
  });

  if (!fee) {
    return NextResponse.json({ error: "Player charge not found." }, { status: 404 });
  }

  if (fee.status !== PlayerMatchFeeStatus.OPEN) {
    return NextResponse.json({ ok: true, voided: false, status: fee.status });
  }

  const now = new Date();
  const note = [fee.note, `Voided: ${reason}`].filter(Boolean).join("\n");

  await prisma.$transaction([
    prisma.playerMatchFee.update({
      where: { id: fee.id },
      data: {
        status: PlayerMatchFeeStatus.CANCELLED,
        cancelledAt: now,
        note,
      },
    }),
    prisma.notificationDispatch.updateMany({
      where: {
        sourceId: fee.id,
        sourceType: {
          in: PLAYER_MATCH_FEE_SOURCE_TYPES,
        },
        status: {
          in: [
            NotificationDispatchStatus.QUEUED,
            NotificationDispatchStatus.PROCESSING,
          ],
        },
      },
      data: {
        status: NotificationDispatchStatus.CANCELLED,
        cancelledAt: now,
        failureReason: `Player match fee voided by admin: ${reason}`,
      },
    }),
  ]);

  return NextResponse.json({ ok: true, voided: true });
}
