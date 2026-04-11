// ========================================
// File: src/app/api/stripe/webhook/route.ts
// ========================================

import type Stripe from "stripe";
import { NextResponse } from "next/server";

import {
  getChargeStatusFromAmounts,
  getChargePaidTotal,
} from "@/lib/payments/charge-status";
import { cancelQueuedMatchFeeNotificationDispatches } from "@/lib/payments/fixture-match-fees";
import { prisma } from "@/lib/prisma";
import {
  getStripeServerClient,
  getStripeWebhookSecret,
} from "@/lib/stripe/client";

export const dynamic = "force-dynamic";

async function handleCompletedCheckoutSession(session: Stripe.Checkout.Session) {
  const chargeId = session.metadata?.chargeId?.trim();

  if (!chargeId) {
    return;
  }

  const existingTransaction = await prisma.paymentTransaction.findUnique({
    where: {
      stripeCheckoutSessionId: session.id,
    },
    select: {
      id: true,
    },
  });

  if (existingTransaction) {
    return;
  }

  const charge = await prisma.paymentCharge.findUnique({
    where: {
      id: chargeId,
    },
    include: {
      transactions: {
        select: {
          amountPence: true,
        },
      },
    },
  });

  if (!charge) {
    return;
  }

  const amountPence = session.amount_total ?? 0;

  if (amountPence <= 0) {
    return;
  }

  const paymentIntentId =
    typeof session.payment_intent === "string"
      ? session.payment_intent
      : session.payment_intent?.id ?? null;

  await prisma.paymentTransaction.create({
    data: {
      teamId: charge.teamId,
      chargeId: charge.id,
      amountPence,
      method: "STRIPE",
      reference: paymentIntentId || session.id,
      notes: "Paid online via Stripe Checkout.",
      paidAt: new Date((session.created ?? Math.floor(Date.now() / 1000)) * 1000),
      stripeCheckoutSessionId: session.id,
      stripePaymentIntentId: paymentIntentId,
    },
  });

  const paidTotalPence = getChargePaidTotal(charge.transactions) + amountPence;
  const nextStatus = getChargeStatusFromAmounts(charge.amountPence, paidTotalPence);

  await prisma.paymentCharge.update({
    where: {
      id: charge.id,
    },
    data: {
      status: nextStatus,
    },
  });

  if (nextStatus === "PAID") {
    await cancelQueuedMatchFeeNotificationDispatches([charge.id]);
  }
}

export async function POST(request: Request) {
  const stripe = getStripeServerClient();
  const signature = request.headers.get("stripe-signature")?.trim();

  if (!signature) {
    return NextResponse.json(
      {
        ok: false,
        error: "Missing Stripe signature header.",
      },
      { status: 400 },
    );
  }

  const payload = await request.text();

  let event: Stripe.Event;

  try {
    event = stripe.webhooks.constructEvent(
      payload,
      signature,
      getStripeWebhookSecret(),
    );
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error:
          error instanceof Error
            ? error.message
            : "Stripe webhook verification failed.",
      },
      { status: 400 },
    );
  }

  try {
    switch (event.type) {
      case "checkout.session.completed":
      case "checkout.session.async_payment_succeeded": {
        await handleCompletedCheckoutSession(
          event.data.object as Stripe.Checkout.Session,
        );
        break;
      }
      default:
        break;
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error:
          error instanceof Error
            ? error.message
            : "Stripe webhook processing failed.",
      },
      { status: 500 },
    );
  }
}