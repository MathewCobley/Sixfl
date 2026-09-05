// ========================================
// File: src/app/api/stripe/webhook/route.ts
// ========================================

import type { Prisma } from "@prisma/client";
import type Stripe from "stripe";
import { NextResponse } from "next/server";

import {
  getChargePaidTotal,
  getChargeStatusFromAmounts,
} from "@/lib/payments/charge-status";
import { cancelQueuedMatchFeeNotificationDispatches } from "@/lib/payments/fixture-match-fees";
import { cancelQueuedPlayerMatchFeeNotificationDispatches } from "@/lib/payments/cancel-player-match-fee-notifications";
import { reconcileFixtureChargeFromPlayerPayments } from "@/lib/payments/player-match-fee-reconciliation";
import {
  saveTeamAutoPaySetup,
  TEAM_AUTOPAY_MANDATE_TEXT,
} from "@/lib/payments/team-autopay";
import {
  markTeamSubscriptionDeleted,
  markTeamSubscriptionInvoiceFailed,
  recordTeamSubscriptionInvoicePaid,
  syncTeamSubscriptionFromStripe,
} from "@/lib/payments/team-subscriptions";
import { prisma } from "@/lib/prisma";
import {
  getStripeServerClient,
  getStripeWebhookSecret,
} from "@/lib/stripe/client";

export const dynamic = "force-dynamic";

function getPaymentIntentId(session: Stripe.Checkout.Session) {
  return typeof session.payment_intent === "string"
    ? session.payment_intent
    : session.payment_intent?.id ?? null;
}

function getSetupIntentId(session: Stripe.Checkout.Session) {
  return typeof session.setup_intent === "string"
    ? session.setup_intent
    : session.setup_intent?.id ?? null;
}

function getStripeId(value: unknown): string | null {
  if (typeof value === "string") return value;
  if (value && typeof value === "object" && "id" in value) {
    const id = (value as { id?: unknown }).id;
    return typeof id === "string" ? id : null;
  }
  return null;
}

function getChargeIdFromCheckoutSession(session: Stripe.Checkout.Session) {
  return session.metadata?.chargeId?.trim() || session.client_reference_id?.trim() || null;
}

async function hasExistingTransaction(sessionId: string) {
  const existingTransaction = await prisma.paymentTransaction.findUnique({
    where: { stripeCheckoutSessionId: sessionId },
    select: { id: true },
  });

  return Boolean(existingTransaction);
}

async function ensurePaymentTransactionPlayerFeeColumn() {
  await prisma.$executeRawUnsafe(`
    ALTER TABLE "PaymentTransaction"
      ADD COLUMN IF NOT EXISTS "playerMatchFeeId" TEXT;
  `);

  await prisma.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS "PaymentTransaction_playerMatchFeeId_idx"
      ON "PaymentTransaction"("playerMatchFeeId");
  `);

  await prisma.$executeRawUnsafe(`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'PaymentTransaction_playerMatchFeeId_fkey'
      ) THEN
        ALTER TABLE "PaymentTransaction"
          ADD CONSTRAINT "PaymentTransaction_playerMatchFeeId_fkey"
          FOREIGN KEY ("playerMatchFeeId") REFERENCES "PlayerMatchFee"("id")
          ON DELETE SET NULL ON UPDATE CASCADE;
      END IF;
    END $$;
  `);
}

async function closePlayerMatchFeeFromStripeSession(input: {
  playerMatchFeeId: string;
  paidAt: Date;
  paidAmountPence?: number | null;
}) {
  const fee = await prisma.playerMatchFee.findUnique({
    where: { id: input.playerMatchFeeId },
    select: {
      id: true,
      teamId: true,
      fixtureId: true,
      amountPence: true,
      status: true,
    },
  });

  if (!fee) return;

  const paidAmountPence = input.paidAmountPence ?? null;
  const shouldSyncAmount =
    typeof paidAmountPence === "number" &&
    paidAmountPence > 0 &&
    paidAmountPence !== fee.amountPence;

  if (fee.status === "OPEN" || shouldSyncAmount) {
    await prisma.playerMatchFee.update({
      where: { id: input.playerMatchFeeId },
      data: {
        ...(shouldSyncAmount ? { amountPence: paidAmountPence } : {}),
        ...(fee.status === "OPEN"
          ? {
              status: "PAID",
              paidAt: input.paidAt,
              waivedAt: null,
              cancelledAt: null,
            }
          : {}),
      },
    });
  }

  await cancelQueuedPlayerMatchFeeNotificationDispatches(
    [input.playerMatchFeeId],
    "Player match fee was paid before the queued payment reminder was sent.",
  );

  await reconcileFixtureChargeFromPlayerPayments({
    teamId: fee.teamId,
    fixtureId: fee.fixtureId,
  });
}

async function findExistingPlayerFeeTransaction(input: {
  playerMatchFeeId: string;
  paymentIntentId: string | null;
}) {
  const orFilters: Prisma.PaymentTransactionWhereInput[] = [
    {
      notes: {
        contains: `Player fee ID: ${input.playerMatchFeeId}`,
      },
    },
  ];

  if (input.paymentIntentId) {
    orFilters.push({
      stripePaymentIntentId: input.paymentIntentId,
    });
  }

  return prisma.paymentTransaction.findFirst({
    where: { OR: orFilters },
    select: { id: true, paidAt: true, amountPence: true },
    orderBy: { paidAt: "desc" },
  });
}

async function handleCompletedPlayerMatchFeeCheckoutSession(
  session: Stripe.Checkout.Session,
) {
  const playerMatchFeeId = session.metadata?.playerMatchFeeId?.trim();

  if (!playerMatchFeeId) return false;

  const paidAt = new Date((session.created ?? Math.floor(Date.now() / 1000)) * 1000);
  const amountPence = session.amount_total ?? 0;

  if (await hasExistingTransaction(session.id)) {
    await closePlayerMatchFeeFromStripeSession({
      playerMatchFeeId,
      paidAt,
      paidAmountPence: amountPence,
    });
    return true;
  }

  const fee = await prisma.playerMatchFee.findUnique({
    where: { id: playerMatchFeeId },
    select: {
      id: true,
      teamId: true,
      fixtureId: true,
      amountPence: true,
      status: true,
    },
  });

  if (!fee) return true;

  if (fee.status !== "OPEN") {
    if (fee.status === "PAID") {
      await closePlayerMatchFeeFromStripeSession({
        playerMatchFeeId: fee.id,
        paidAt,
        paidAmountPence: amountPence,
      });
    }

    return true;
  }

  if (amountPence <= 0) return true;

  const paymentIntentId = getPaymentIntentId(session);
  const existingPlayerFeeTransaction = await findExistingPlayerFeeTransaction({
    playerMatchFeeId: fee.id,
    paymentIntentId,
  });

  if (existingPlayerFeeTransaction) {
    await closePlayerMatchFeeFromStripeSession({
      playerMatchFeeId: fee.id,
      paidAt: existingPlayerFeeTransaction.paidAt,
      paidAmountPence: existingPlayerFeeTransaction.amountPence,
    });
    return true;
  }

  await ensurePaymentTransactionPlayerFeeColumn();

  await prisma.$transaction(async (tx) => {
    const transaction = await tx.paymentTransaction.create({
      data: {
        teamId: fee.teamId,
        chargeId: null,
        amountPence,
        method: "STRIPE",
        reference: paymentIntentId || session.id,
        notes: `Player match fee paid online via Stripe Checkout. Player fee ID: ${fee.id}`,
        paidAt,
        stripeCheckoutSessionId: session.id,
        stripePaymentIntentId: paymentIntentId,
      },
      select: { id: true },
    });

    await tx.$executeRaw`
      UPDATE "PaymentTransaction"
      SET "playerMatchFeeId" = ${fee.id}
      WHERE "id" = ${transaction.id}
    `;

    await tx.playerMatchFee.update({
      where: { id: fee.id },
      data: {
        amountPence,
        status: "PAID",
        paidAt,
        waivedAt: null,
        cancelledAt: null,
      },
    });
  });

  await cancelQueuedPlayerMatchFeeNotificationDispatches(
    [fee.id],
    "Player match fee was paid before the queued payment reminder was sent.",
  );

  await reconcileFixtureChargeFromPlayerPayments({
    teamId: fee.teamId,
    fixtureId: fee.fixtureId,
  });

  return true;
}

async function handleCompletedTeamAutoPaySetupCheckoutSession(
  session: Stripe.Checkout.Session,
  stripe: Stripe,
) {
  const isTeamAutoPaySetup =
    session.mode === "setup" && session.metadata?.type === "team_autopay_setup";

  if (!isTeamAutoPaySetup) return false;

  const teamId = session.metadata?.teamId?.trim() || session.client_reference_id?.trim() || null;
  const setupIntentId = getSetupIntentId(session);
  const stripeCustomerId = getStripeId(session.customer);

  if (!teamId || !setupIntentId || !stripeCustomerId) return true;

  const setupIntent = await stripe.setupIntents.retrieve(setupIntentId, {
    expand: ["payment_method"],
  });
  const paymentMethodId = getStripeId(setupIntent.payment_method);

  if (!paymentMethodId) return true;

  await saveTeamAutoPaySetup({
    teamId,
    stripeCustomerId,
    stripeDefaultPaymentMethodId: paymentMethodId,
    setupCheckoutSessionId: session.id,
    mandateText: session.metadata?.mandateText || TEAM_AUTOPAY_MANDATE_TEXT,
  });

  return true;
}

async function handleCompletedTeamSubscriptionCheckoutSession(
  session: Stripe.Checkout.Session,
  stripe: Stripe,
) {
  const isTeamSubscriptionSession =
    session.mode === "subscription" || session.metadata?.type === "team_subscription";

  if (!isTeamSubscriptionSession) return false;

  const subscriptionId = getStripeId(session.subscription);
  const teamId = session.metadata?.teamId?.trim() || session.client_reference_id || null;

  if (!subscriptionId) return true;

  const subscription = await stripe.subscriptions.retrieve(subscriptionId);
  await syncTeamSubscriptionFromStripe({ subscription, teamId });

  return true;
}

async function handleCompletedCheckoutSession(
  session: Stripe.Checkout.Session,
  stripe: Stripe,
) {
  const handledTeamAutoPaySetup = await handleCompletedTeamAutoPaySetupCheckoutSession(session, stripe);

  if (handledTeamAutoPaySetup) return;

  const handledTeamSubscription = await handleCompletedTeamSubscriptionCheckoutSession(session, stripe);

  if (handledTeamSubscription) return;

  const handledPlayerMatchFee = await handleCompletedPlayerMatchFeeCheckoutSession(session);

  if (handledPlayerMatchFee) return;

  const chargeId = getChargeIdFromCheckoutSession(session);

  if (!chargeId) return;
  if (await hasExistingTransaction(session.id)) return;

  const charge = await prisma.paymentCharge.findUnique({
    where: { id: chargeId },
    include: { transactions: { select: { amountPence: true } } },
  });

  if (!charge) return;

  const amountPence = session.amount_total ?? 0;

  if (amountPence <= 0) return;

  const paymentIntentId = getPaymentIntentId(session);

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
    where: { id: charge.id },
    data: { status: nextStatus },
  });

  if (nextStatus === "PAID") {
    await cancelQueuedMatchFeeNotificationDispatches([charge.id]);
  }
}

export async function POST(request: Request) {
  const stripe = getStripeServerClient();
  const signature = request.headers.get("stripe-signature")?.trim();

  if (!signature) {
    return NextResponse.json({ ok: false, error: "Missing Stripe signature header." }, { status: 400 });
  }

  const payload = await request.text();
  let event: Stripe.Event;

  try {
    event = stripe.webhooks.constructEvent(payload, signature, getStripeWebhookSecret());
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Stripe webhook verification failed.",
      },
      { status: 400 },
    );
  }

  try {
    switch (event.type) {
      case "checkout.session.completed":
      case "checkout.session.async_payment_succeeded": {
        await handleCompletedCheckoutSession(event.data.object as Stripe.Checkout.Session, stripe);
        break;
      }
      case "customer.subscription.created":
      case "customer.subscription.updated": {
        await syncTeamSubscriptionFromStripe({ subscription: event.data.object as Stripe.Subscription });
        break;
      }
      case "customer.subscription.deleted": {
        await markTeamSubscriptionDeleted({ subscription: event.data.object as Stripe.Subscription });
        break;
      }
      case "invoice.paid":
      case "invoice.payment_succeeded": {
        await recordTeamSubscriptionInvoicePaid({ invoice: event.data.object as Stripe.Invoice, stripe });
        break;
      }
      case "invoice.payment_failed": {
        await markTeamSubscriptionInvoiceFailed({ invoice: event.data.object as Stripe.Invoice });
        break;
      }
      default:
        break;
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Stripe webhook handler failed", error);
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Webhook handler failed.",
      },
      { status: 500 },
    );
  }
}
