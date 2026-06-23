// ========================================
// File: src/app/(admin)/admin/payments/void/[chargeId]/page.tsx
// ========================================

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { NotificationDispatchStatus } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/requireAdmin";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type PageProps = {
  params: Promise<{ chargeId: string }>;
};

type VoidChargeResult =
  | { ok: true }
  | { ok: false; error: "invalid_charge" | "paid_charge_cannot_be_voided" | "void_failed" };

async function cancelQueuedChargeMessages(chargeId: string) {
  try {
    await prisma.notificationDispatch.updateMany({
      where: {
        status: NotificationDispatchStatus.QUEUED,
        OR: [
          { sourceType: "FIXTURE_MATCH_FEE", sourceId: chargeId },
          { sourceType: "FIXTURE_MATCH_FEE_REMINDER", sourceId: chargeId },
          {
            sourceType: "FIXTURE_MATCH_FEE_MANUAL_CHASE",
            sourceId: { startsWith: `${chargeId}:manual-sms:` },
          },
          { metadata: { path: ["chargeId"], equals: chargeId } },
        ],
      },
      data: {
        status: NotificationDispatchStatus.CANCELLED,
        cancelledAt: new Date(),
        failureReason: "Payment charge was voided by SIXFL admin.",
      },
    });
  } catch (error) {
    console.error("Could not cancel queued charge notifications after voiding charge", {
      chargeId,
      error,
    });
  }
}

async function voidPaymentCharge(chargeId: string): Promise<VoidChargeResult> {
  try {
    const charge = await prisma.paymentCharge.findUnique({
      where: { id: chargeId },
      select: {
        id: true,
        status: true,
      },
    });

    if (!charge) {
      return { ok: false, error: "invalid_charge" };
    }

    if (charge.status === "PAID") {
      return { ok: false, error: "paid_charge_cannot_be_voided" };
    }

    if (charge.status !== "VOID") {
      await prisma.paymentCharge.update({
        where: { id: charge.id },
        data: { status: "VOID" },
      });

      await cancelQueuedChargeMessages(charge.id);
    }

    return { ok: true };
  } catch (error) {
    console.error("Failed to void payment charge", { chargeId, error });
    return { ok: false, error: "void_failed" };
  }
}

export default async function VoidPaymentChargePage({ params }: PageProps) {
  await requireAdmin();

  const { chargeId } = await params;
  const id = chargeId.trim();

  if (!id) {
    redirect("/admin/payments?error=invalid_charge");
  }

  const result = await voidPaymentCharge(id);

  if (!result.ok) {
    redirect(`/admin/payments?error=${result.error}`);
  }

  revalidatePath("/admin/payments");
  redirect("/admin/payments?created=charge_voided");
}
