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
import { getTeamPaymentLedger } from "@/lib/payments/team-payment-ledger";
import { reconcileFixtureChargeFromPlayerPayments } from "@/lib/payments/player-match-fee-reconciliation";
import {
  applyExistingTeamCreditToChargeFirst,
  getMaximumAdditionalCollectionPence,
} from "@/lib/payments/team-credit-policy";
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

async function isConfirmedCheckoutPayment(
  session: Stripe.Checkout.Session,
  stripe: Stripe,
) {
  if (session.mode !== "payment" || session.payment_status !== "paid") {
    return false;
  }

  const paymentIntentId = getPaymentIntentId(session);
  if (!paymentIntentId) return false;

  const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId);
  const expectedAmountPence = session.amount_total ?? 0;

  return (
    paymentIntent.status === "succeeded" &&
    paymentIntent.amount_received > 0 &&
    (expectedAmountPence <= 0 || paymentIntent.amount_received >= expectedAmountPence)
  );
}

function getPlayerMatchFeeIdFromTransactionNotes(notes: string | null) {
  const match = /Player fee ID:\s*([a-zA-Z0-9_-]+)/i.exec(notes ?? "");
  return match?.[1] ?? null;
}

async function invalidateFailedStripeTransaction(input: {
  sessionId?: string | null;
  paymentIntentId?: string | null;
  playerMatchFeeId?: string | null;
  reason: string;
}) {
  const orFilters: Prisma.PaymentTransactionWhereInput[] = [];
  if (input.sessionId) {
    orFilters.push({ stripeCheckoutSessionId: input.sessionId });
  }
  if (input.paymentIntentId) {
    orFilters.push({ stripePaymentIntentId: input.paymentIntentId });
  }
  if (orFilters.length === 0) return;

  const transaction = await prisma.paymentTransaction.findFirst({
    where: { OR: orFilters },
    select: {
      id: true,
      teamId: true,
      chargeId: true,
      notes: true,
      paidAt: true,
    },
  });

  if (!transaction) return;

  const playerMatchFeeId =
    input.playerMatchFeeId?.trim() ||
    getPlayerMatchFeeIdFromTransactionNotes(transaction.notes);

  await prisma.paymentTransaction.delete({ where: { id: transaction.id } });

  if (playerMatchFeeId) {
    const fee = await prisma.playerMatchFee.findUnique({
      where: { id: playerMatchFeeId },
      select: {
        id: true,
        teamId: true,
        fixtureId: true,
        status: true,
        paidAt: true,
        note: true,
      },
    });

    if (fee) {
      const anotherRecordedPayment = await prisma.paymentTransaction.findFirst({
        where: {
          amountPence: { gt: 0 },
          notes: { contains: `Player fee ID: ${fee.id}` },
        },
        select: { id: true },
      });
      const paidAtMatchesRemovedTransaction =
        Boolean(fee.paidAt) &&
        Math.abs((fee.paidAt?.getTime() ?? 0) - transaction.paidAt.getTime()) < 60_000;

      if (
        fee.status === "PAID" &&
        paidAtMatchesRemovedTransaction &&
        !anotherRecordedPayment
      ) {
        await prisma.playerMatchFee.update({
          where: { id: fee.id },
          data: {
            status: "OPEN",
            paidAt: null,
            waivedAt: null,
            cancelledAt: null,
            note: [
              fee.note,
              `Stripe payment attempt was not successful and was reopened automatically: ${input.reason}` ,
            ]
              .filter(Boolean)
              .join("\n"),
          },
        });
      }

      await reconcileFixtureChargeFromPlayerPayments({
        teamId: fee.teamId,
        fixtureId: fee.fixtureId,
      });
    }
  }

  if (transaction.chargeId) {
    const charge = await prisma.paymentCharge.findUnique({
      where: { id: transaction.chargeId },
      include: { transactions: { select: { amountPence: true } } },
    });

    if (charge) {
      const paidTotalPence = getChargePaidTotal(charge.transactions);
      const nextStatus = getChargeStatusFromAmounts(charge.amountPence, paidTotalPence);
      await prisma.paymentCharge.update({
        where: { id: charge.id },
        data: { status: nextStatus },
      });
    }
  }
}

async function handleFailedCheckoutSession(
  session: Stripe.Checkout.Session,
  reason: string,
) {
  await invalidateFailedStripeTransaction({
    sessionId: session.id,
    paymentIntentId: getPaymentIntentId(session),
    playerMatchFeeId: session.metadata?.playerMatchFeeId ?? null,
    reason,
  });
}

async function handleFailedPaymentIntent(
  paymentIntent: Stripe.PaymentIntent,
  reason: string,
) {
  await invalidateFailedStripeTransaction({
    paymentIntentId: paymentIntent.id,
    playerMatchFeeId: paymentIntent.metadata?.playerMatchFeeId ?? null,
    reason,
  });
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

async function refundInvalidPlayerMatchFeeCheckout(input: {
  session: Stripe.Checkout.Session;
  stripe: Stripe;
  reason: string;
}) {
  const paymentIntentId = getPaymentIntentId(input.session);
  if (!paymentIntentId) return;

  await input.stripe.refunds.create(
    {
      payment_intent: paymentIntentId,
      reason: "requested_by_customer",
      metadata: {
        paymentType: "PLAYER_MATCH_FEE_AUTOMATIC_REFUND",
        checkoutSessionId: input.session.id,
        refundReason: input.reason.slice(0, 450),
      },
    },
    { idempotencyKey: `invalid-player-match-fee-${input.session.id}` },
  );
}

async function handleCompletedPlayerMatchFeeCheckoutSession(
  session: Stripe.Checkout.Session,
  stripe: Stripe,
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

  const paymentIntentId = getPaymentIntentId(session);

  if (fee.status !== "OPEN") {
    if (fee.status === "PAID") {
      await closePlayerMatchFeeFromStripeSession({
        playerMatchFeeId: fee.id,
        paidAt,
        paidAmountPence: amountPence,
      });
    } else if (amountPence > 0) {
      await refundInvalidPlayerMatchFeeCheckout({
        session,
        stripe,
        reason: `Player fee ${fee.id} was ${fee.status.toLowerCase()} before payment completed.`,
      });
    }

    return true;
  }

  if (amountPence <= 0) return true;

  const ledger = await getTeamPaymentLedger(fee.teamId);
  const chargeEntry =
    ledger?.entries.find(
      (entry) =>
        entry.fixtureId === fee.fixtureId &&
        entry.teamId === fee.teamId &&
        entry.displayStatus !== "VOID",
    ) ?? null;
  if (!chargeEntry || chargeEntry.amountPence <= 0) {
    await refundInvalidPlayerMatchFeeCheckout({
      session,
      stripe,
      reason: `Player fee ${fee.id} no longer has a positive active fixture charge.`,
    });

    await prisma.playerMatchFee.update({
      where: { id: fee.id },
      data: {
        status: "CANCELLED",
        paymentUrl: null,
        paymentToken: null,
        cancelledAt: new Date(),
      },
    });
    await cancelQueuedPlayerMatchFeeNotificationDispatches(
      [fee.id],
      "Player fee checkout was automatically refunded because no positive fixture charge remained.",
    );
    return true;
  }

  const creditApplication = await applyExistingTeamCreditToChargeFirst({
    teamId: fee.teamId,
    chargeId: chargeEntry.chargeId,
    fixtureFeePence: chargeEntry.amountPence,
    description: `Team credit automatically used against ${chargeEntry.title} before completing a player payment.`,
  });
  const refreshedLedger = await getTeamPaymentLedger(fee.teamId);
  const refreshedChargeEntry =
    refreshedLedger?.entries.find(
      (entry) =>
        entry.fixtureId === fee.fixtureId &&
        entry.teamId === fee.teamId &&
        entry.displayStatus !== "VOID",
    ) ?? null;
  const maximumAdditionalCollectionPence = refreshedChargeEntry
    ? getMaximumAdditionalCollectionPence({
        outstandingFixturePence: refreshedChargeEntry.outstandingPence,
        creditHeadroomPence: creditApplication.policy.creditHeadroomPence,
      })
    : 0;

  if (!refreshedChargeEntry || amountPence > maximumAdditionalCollectionPence) {
    await refundInvalidPlayerMatchFeeCheckout({
      session,
      stripe,
      reason: `Player fee ${fee.id} would take team credit above the one-match-fee limit.`,
    });

    await prisma.playerMatchFee.update({
      where: { id: fee.id },
      data: {
        status: "CANCELLED",
        paymentUrl: null,
        paymentToken: null,
        cancelledAt: new Date(),
      },
    });
    await cancelQueuedPlayerMatchFeeNotificationDispatches(
      [fee.id],
      "Player fee checkout was automatically refunded because the team credit limit had been reached.",
    );
    return true;
  }
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

  const paymentConfirmed = await isConfirmedCheckoutPayment(session, stripe);
  if (!paymentConfirmed) return;

  const handledPlayerMatchFee = await handleCompletedPlayerMatchFeeCheckoutSession(session, stripe);

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
      case "checkout.session.async_payment_failed":
      case "checkout.session.expired": {
        const session = event.data.object as Stripe.Checkout.Session;
        await handleFailedCheckoutSession(session, event.type);
        break;
      }
      case "payment_intent.payment_failed":
      case "payment_intent.canceled": {
        const paymentIntent = event.data.object as Stripe.PaymentIntent;
        const failureReason =
          paymentIntent.last_payment_error?.code ||
          paymentIntent.cancellation_reason ||
          event.type;
        await handleFailedPaymentIntent(paymentIntent, failureReason);
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
