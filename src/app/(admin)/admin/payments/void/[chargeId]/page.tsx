// ========================================
// File: src/app/(admin)/admin/payments/void/[chargeId]/page.tsx
// ========================================

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { cancelQueuedMatchFeeNotificationDispatches } from "@/lib/payments/fixture-match-fees";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/requireAdmin";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type PageProps = {
  params: Promise<{ chargeId: string }>;
};

export default async function VoidPaymentChargePage({ params }: PageProps) {
  await requireAdmin();

  const { chargeId } = await params;
  const id = chargeId.trim();

  if (!id) {
    redirect("/admin/payments?error=invalid_charge");
  }

  const charge = await prisma.paymentCharge.findUnique({
    where: { id },
    select: {
      id: true,
      status: true,
    },
  });

  if (!charge) {
    redirect("/admin/payments?error=invalid_charge");
  }

  if (charge.status !== "PAID") {
    await prisma.paymentCharge.update({
      where: { id: charge.id },
      data: { status: "VOID" },
    });

    await cancelQueuedMatchFeeNotificationDispatches([charge.id]);
  }

  revalidatePath("/admin/payments");
  redirect("/admin/payments?created=charge_voided");
}
