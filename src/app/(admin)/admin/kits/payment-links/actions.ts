"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { getChargePaidTotal } from "@/lib/payments/charge-status";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/requireAdmin";
import { getStripeServerClient } from "@/lib/stripe/client";

const EXTRA_KIT_TITLE_PREFIX = "Additional kit contribution •";
const PAYMENT_LINKS_PATH = "/admin/kits/payment-links";

function readString(formData: FormData, key: string) {
  return String(formData.get(key) ?? "").trim();
}

function destination(input: { notice?: string; error?: string }) {
  const params = new URLSearchParams();
  if (input.notice) params.set("notice", input.notice);
  if (input.error) params.set("error", input.error);
  const query = params.toString();
  return `${PAYMENT_LINKS_PATH}${query ? `?${query}` : ""}`;
}

export async function voidExtraKitPaymentLinkAction(formData: FormData) {
  await requireAdmin();

  const chargeId = readString(formData, "chargeId");
  if (!chargeId) {
    redirect(destination({ error: "invalid" }));
  }

  try {
    const charge = await prisma.paymentCharge.findUnique({
      where: { id: chargeId },
      select: {
        id: true,
        title: true,
        status: true,
        lastStripeCheckoutSessionId: true,
        transactions: { select: { amountPence: true } },
      },
    });

    if (!charge || !charge.title.startsWith(EXTRA_KIT_TITLE_PREFIX)) {
      redirect(destination({ error: "invalid" }));
    }

    const paidPence = getChargePaidTotal(charge.transactions);
    if (paidPence > 0 || charge.status !== "OPEN") {
      redirect(destination({ error: "not_open" }));
    }

    if (charge.lastStripeCheckoutSessionId) {
      const stripe = getStripeServerClient();
      const session = await stripe.checkout.sessions.retrieve(
        charge.lastStripeCheckoutSessionId,
      );

      if (session.payment_status === "paid" || session.status === "complete") {
        redirect(destination({ error: "already_paid" }));
      }

      if (session.status === "open") {
        await stripe.checkout.sessions.expire(session.id);
      }
    }

    const updated = await prisma.paymentCharge.updateMany({
      where: {
        id: charge.id,
        status: "OPEN",
      },
      data: {
        status: "VOID",
        lastStripeCheckoutUrl: null,
        lastStripeCheckoutSessionId: null,
        lastStripeCheckoutCreatedAt: null,
        lastStripeCheckoutAmountPence: null,
      },
    });

    if (updated.count !== 1) {
      redirect(destination({ error: "not_open" }));
    }
  } catch (error) {
    if (
      typeof error === "object" &&
      error !== null &&
      "digest" in error &&
      String((error as { digest?: unknown }).digest ?? "").startsWith("NEXT_REDIRECT")
    ) {
      throw error;
    }

    console.error("Extra-kit payment link void failed", error);
    redirect(destination({ error: "save_failed" }));
  }

  revalidatePath(PAYMENT_LINKS_PATH);
  revalidatePath("/admin/kits");
  revalidatePath("/captain");
  redirect(destination({ notice: "voided" }));
}
