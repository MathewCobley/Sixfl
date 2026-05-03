// ========================================
// File: src/app/api/captain/team/[teamId]/match-fees/void-fixture/route.ts
// ========================================

import { NextResponse } from "next/server";

import { cancelQueuedPlayerMatchFeeNotificationDispatches } from "@/lib/payments/cancel-player-match-fee-notifications";
import { prisma } from "@/lib/prisma";
import { requireCaptain } from "@/lib/requireCaptain";

function getString(value: unknown) {
  const parsed = String(value ?? "").trim();
  return parsed || null;
}

function appendVoidNote(input: {
  existingNote: string | null;
  reason: string;
}) {
  const existingNote = input.existingNote?.trim();
  const voidNote = `Voided: ${input.reason}`;

  if (!existingNote) return voidNote;
  if (existingNote.includes(voidNote)) return existingNote;

  return `${existingNote}\n${voidNote}`;
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ teamId: string }> },
) {
  const { teamId } = await params;
  await requireCaptain(teamId);

  const body = await request.json().catch(() => null);
  const fixtureId = getString((body as { fixtureId?: unknown } | null)?.fixtureId);
  const reason =
    getString((body as { reason?: unknown } | null)?.reason) ??
    "Game conceded / fixture not played";

  if (!fixtureId) {
    return NextResponse.json({ error: "Missing fixture id." }, { status: 400 });
  }

  const fixture = await prisma.fixture.findFirst({
    where: {
      id: fixtureId,
      OR: [{ homeTeamId: teamId }, { awayTeamId: teamId }],
    },
    select: {
      id: true,
    },
  });

  if (!fixture) {
    return NextResponse.json({ error: "Fixture not found." }, { status: 404 });
  }

  const fees = await prisma.playerMatchFee.findMany({
    where: {
      teamId,
      fixtureId,
      status: {
        in: ["OPEN", "WAIVED", "CANCELLED"],
      },
    },
    select: {
      id: true,
      note: true,
      status: true,
    },
  });

  const now = new Date();

  for (const fee of fees) {
    await prisma.playerMatchFee.update({
      where: { id: fee.id },
      data: {
        status: "CANCELLED",
        paidAt: null,
        waivedAt: null,
        cancelledAt: now,
        note: appendVoidNote({
          existingNote: fee.note,
          reason,
        }),
      },
    });
  }

  await cancelQueuedPlayerMatchFeeNotificationDispatches(
    fees.map((fee) => fee.id),
    `Player match fees voided: ${reason}`,
  );

  const paidFeesLeft = await prisma.playerMatchFee.count({
    where: {
      teamId,
      fixtureId,
      status: "PAID",
    },
  });

  return NextResponse.json({
    ok: true,
    voided: fees.length,
    paidFeesLeft,
  });
}
