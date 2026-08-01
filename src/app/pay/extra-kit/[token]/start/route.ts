import { NextResponse } from "next/server";

import {
  getChargeOutstandingPence,
  getChargePaidTotal,
} from "@/lib/payments/charge-status";
import { prisma } from "@/lib/prisma";
import { getPublicSiteUrl, getStripeServerClient } from "@/lib/stripe/client";

export const dynamic = "force-dynamic";

const EXTRA_KIT_TITLE_PREFIX = "Additional kit contribution •";

function returnUrl(token: string, state: "success" | "cancelled" | "unavailable") {
  const url = new URL(`/pay/extra-kit/${token}`, `${getPublicSiteUrl()}/`);
  url.searchParams.set("payment", state);
  return url.toString();
}

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;

  const charge = await prisma.paymentCharge.findUnique({
    where: { paymentToken: token },
    include: {
      transactions: { select: { amountPence: true } },
      team: { select: { id: true, name: true } },
    },
  });

  if (!charge || !charge.title.startsWith(EXTRA_KIT_TITLE_PREFIX)) {
    return NextResponse.redirect(returnUrl(token, "unavailable"), 303);
  }

  const paidPence = getChargePaidTotal(charge.transactions);
  const outstandingPence = getChargeOutstandingPence(
    charge.amountPence,
    paidPence,
  );

  if (charge.status === "VOID" || outstandingPence <= 0) {
    return NextResponse.redirect(returnUrl(token, "unavailable"), 303);
  }

  const canReuseExistingSession =
    charge.lastStripeCheckoutUrl &&
    charge.lastStripeCheckoutCreatedAt &&
    charge.lastStripeCheckoutAmountPence === outstandingPence &&
    Date.now() - charge.lastStripeCheckoutCreatedAt.getTime() <
      20 * 60 * 60 * 1000;

  if (canReuseExistingSession) {
    return NextResponse.redirect(charge.lastStripeCheckoutUrl!, 303);
  }

  const stripe = getStripeServerClient();
  const session = await stripe.checkout.sessions.create({
    mode: "payment",
    client_reference_id: charge.id,
    success_url: returnUrl(token, "success"),
    cancel_url: returnUrl(token, "cancelled"),
    line_items: [
      {
        quantity: 1,
        price_data: {
          currency: "gbp",
          unit_amount: outstandingPence,
          product_data: {
            name: charge.title,
            description: charge.description || undefined,
          },
        },
      },
    ],
    metadata: {
      chargeId: charge.id,
      teamId: charge.teamId,
      paymentToken: token,
      paymentType: "EXTRA_TEAM_KIT",
    },
    payment_intent_data: {
      metadata: {
        chargeId: charge.id,
        teamId: charge.teamId,
        paymentToken: token,
        paymentType: "EXTRA_TEAM_KIT",
      },
    },
  });

  if (!session.url) {
    throw new Error("Stripe checkout URL was not returned.");
  }

  await prisma.paymentCharge.update({
    where: { id: charge.id },
    data: {
      lastStripeCheckoutSessionId: session.id,
      lastStripeCheckoutUrl: session.url,
      lastStripeCheckoutCreatedAt: new Date(),
      lastStripeCheckoutAmountPence: outstandingPence,
    },
  });

  return NextResponse.redirect(session.url, 303);
}
