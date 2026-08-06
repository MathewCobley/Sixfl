import { NotificationDispatchStatus } from "@prisma/client";
import { NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";
import { requireCaptain } from "@/lib/requireCaptain";

const EXTRA_KIT_TITLE_PREFIX = "Additional kit contribution •";

export async function DELETE(
  _request: Request,
  {
    params,
  }: {
    params: Promise<{ teamid: string; chargeId: string }>;
  },
) {
  const { teamid, chargeId } = await params;
  await requireCaptain(teamid);

  const charge = await prisma.paymentCharge.findFirst({
    where: {
      id: chargeId,
      teamId: teamid,
      title: { startsWith: EXTRA_KIT_TITLE_PREFIX },
    },
    select: {
      id: true,
      status: true,
      transactions: { select: { amountPence: true } },
    },
  });

  if (!charge) {
    return NextResponse.json(
      { error: "That kit payment request could not be found." },
      { status: 404 },
    );
  }

  if (charge.status === "VOID") {
    return NextResponse.json({ ok: true });
  }

  const paidPence = charge.transactions.reduce(
    (sum, transaction) => sum + transaction.amountPence,
    0,
  );

  if (paidPence > 0 || charge.status === "PAID") {
    return NextResponse.json(
      {
        error:
          "This request has received payment and cannot be cancelled here. SIXFL admin must review it.",
      },
      { status: 409 },
    );
  }

  await prisma.$transaction([
    prisma.paymentCharge.update({
      where: { id: charge.id },
      data: { status: "VOID" },
    }),
    prisma.notificationDispatch.updateMany({
      where: {
        sourceType: "EXTRA_TEAM_KIT_PAYMENT",
        sourceId: charge.id,
        status: {
          in: [
            NotificationDispatchStatus.QUEUED,
            NotificationDispatchStatus.PROCESSING,
          ],
        },
      },
      data: {
        status: NotificationDispatchStatus.CANCELLED,
        failureReason: "Kit payment request cancelled by the captain.",
      },
    }),
  ]);

  return NextResponse.json({ ok: true });
}
