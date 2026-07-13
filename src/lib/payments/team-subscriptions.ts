// ========================================
// File: src/lib/payments/team-subscriptions.ts
// ========================================

import { randomUUID } from "crypto";
import type Stripe from "stripe";

import { isMatchFeeChargeDueToday } from "@/lib/payments/match-day-billing";
import { prisma } from "@/lib/prisma";

type TeamSubscriptionDb = Pick<
  typeof prisma,
  "$executeRaw" | "$queryRaw" | "paymentTransaction"
>;

type RawTeamSubscriptionRow = {
  id: string;
  stripeCustomerId: string | null;
  stripeSubscriptionId: string | null;
  subscriptionStatus: string | null;
  subscriptionPriceId: string | null;
  subscriptionCurrentPeriodEnd: Date | null;
  subscriptionStartedAt: Date | null;
  subscriptionCancelledAt: Date | null;
  subscriptionLastInvoiceId: string | null;
  subscriptionLastPaymentAt: Date | null;
  subscriptionLastPaymentFailedAt: Date | null;
};

export type TeamSubscriptionSnapshot = RawTeamSubscriptionRow;

export type TeamSubscriptionListItem = RawTeamSubscriptionRow & {
  name: string;
  leagueName: string | null;
  leagueSeason: string | null;
};

type StripeInvoiceLike = Stripe.Invoice & {
  subscription?: string | Stripe.Subscription | null;
  customer?: string | Stripe.Customer | null;
  payment_intent?: string | Stripe.PaymentIntent | null;
  charge?: string | Stripe.Charge | null;
  amount_paid?: number | null;
  total?: number | null;
  status_transitions?: {
    paid_at?: number | null;
  } | null;
};

type StripeSubscriptionLike = Stripe.Subscription & {
  current_period_end?: number | null;
  current_period_start?: number | null;
  canceled_at?: number | null;
  ended_at?: number | null;
  trial_end?: number | null;
};

type OpenChargeRow = {
  id: string;
  amountPence: number;
  paidPence: number;
  dueDate: Date | null;
};

function toDateFromUnix(value: number | null | undefined) {
  return typeof value === "number" && Number.isFinite(value)
    ? new Date(value * 1000)
    : null;
}

function getStripeId(value: unknown): string | null {
  if (typeof value === "string") return value;
  if (value && typeof value === "object" && "id" in value) {
    const id = (value as { id?: unknown }).id;
    return typeof id === "string" ? id : null;
  }
  return null;
}

function getSubscriptionPriceId(subscription: Stripe.Subscription) {
  const firstItem = subscription.items?.data?.[0];
  return firstItem?.price?.id ?? null;
}

function getSubscriptionPeriodEnd(subscription: Stripe.Subscription) {
  const typed = subscription as StripeSubscriptionLike;
  return toDateFromUnix(typed.current_period_end ?? typed.trial_end ?? null);
}

function getSubscriptionCancelledAt(subscription: Stripe.Subscription) {
  const typed = subscription as StripeSubscriptionLike;
  return toDateFromUnix(typed.canceled_at ?? typed.ended_at ?? null);
}

export function getTeamSubscriptionPriceId() {
  const value =
    process.env.STRIPE_TEAM_SUBSCRIPTION_PRICE_ID?.trim() ||
    process.env.STRIPE_TEAM_WEEKLY_PRICE_ID?.trim() ||
    process.env.STRIPE_TEAM_MONTHLY_PRICE_ID?.trim();

  if (!value) {
    throw new Error(
      "Missing STRIPE_TEAM_SUBSCRIPTION_PRICE_ID, STRIPE_TEAM_WEEKLY_PRICE_ID, or STRIPE_TEAM_MONTHLY_PRICE_ID.",
    );
  }

  return value;
}

export async function getTeamSubscriptionSnapshot(
  teamId: string,
  db: TeamSubscriptionDb = prisma,
) {
  const rows = await db.$queryRaw<RawTeamSubscriptionRow[]>`
    SELECT
      "id",
      "stripeCustomerId",
      "stripeSubscriptionId",
      "subscriptionStatus",
      "subscriptionPriceId",
      "subscriptionCurrentPeriodEnd",
      "subscriptionStartedAt",
      "subscriptionCancelledAt",
      "subscriptionLastInvoiceId",
      "subscriptionLastPaymentAt",
      "subscriptionLastPaymentFailedAt"
    FROM "Team"
    WHERE "id" = ${teamId}
    LIMIT 1
  `;

  return rows[0] ?? null;
}

export async function listTeamSubscriptionSnapshots(
  db: TeamSubscriptionDb = prisma,
) {
  return db.$queryRaw<TeamSubscriptionListItem[]>`
    SELECT
      t."id",
      t."name",
      l."name" AS "leagueName",
      l."season" AS "leagueSeason",
      t."stripeCustomerId",
      t."stripeSubscriptionId",
      t."subscriptionStatus",
      t."subscriptionPriceId",
      t."subscriptionCurrentPeriodEnd",
      t."subscriptionStartedAt",
      t."subscriptionCancelledAt",
      t."subscriptionLastInvoiceId",
      t."subscriptionLastPaymentAt",
      t."subscriptionLastPaymentFailedAt"
    FROM "Team" t
    LEFT JOIN "League" l ON l."id" = t."leagueId"
    WHERE t."stripeCustomerId" IS NOT NULL
      OR t."stripeSubscriptionId" IS NOT NULL
      OR t."subscriptionStatus" IS NOT NULL
    ORDER BY
      CASE
        WHEN t."subscriptionStatus" IN ('active', 'trialing') THEN 0
        WHEN t."subscriptionStatus" IN ('past_due', 'unpaid', 'incomplete') THEN 1
        WHEN t."subscriptionStatus" IS NULL THEN 3
        ELSE 2
      END,
      t."name" ASC
  `;
}

export async function setTeamStripeCustomerId(input: {
  teamId: string;
  stripeCustomerId: string;
  db?: TeamSubscriptionDb;
}) {
  const db = input.db ?? prisma;

  await db.$executeRaw`
    UPDATE "Team"
    SET "stripeCustomerId" = ${input.stripeCustomerId}
    WHERE "id" = ${input.teamId}
  `;
}

export async function findTeamIdForStripeSubscription(input: {
  stripeSubscriptionId?: string | null;
  stripeCustomerId?: string | null;
  metadataTeamId?: string | null;
  db?: TeamSubscriptionDb;
}) {
  const db = input.db ?? prisma;
  const metadataTeamId = input.metadataTeamId?.trim() || null;

  if (metadataTeamId) {
    const rows = await db.$queryRaw<Array<{ id: string }>>`
      SELECT "id"
      FROM "Team"
      WHERE "id" = ${metadataTeamId}
      LIMIT 1
    `;

    if (rows[0]?.id) return rows[0].id;
  }

  if (input.stripeSubscriptionId) {
    const rows = await db.$queryRaw<Array<{ id: string }>>`
      SELECT "id"
      FROM "Team"
      WHERE "stripeSubscriptionId" = ${input.stripeSubscriptionId}
      LIMIT 1
    `;

    if (rows[0]?.id) return rows[0].id;
  }

  if (input.stripeCustomerId) {
    const rows = await db.$queryRaw<Array<{ id: string }>>`
      SELECT "id"
      FROM "Team"
      WHERE "stripeCustomerId" = ${input.stripeCustomerId}
      LIMIT 1
    `;

    if (rows[0]?.id) return rows[0].id;
  }

  return null;
}

async function findTodaysMatchdayChargeForSubscriptionPayment(input: {
  teamId: string;
  amountPence: number;
  db: TeamSubscriptionDb;
}) {
  const rows = await input.db.$queryRaw<OpenChargeRow[]>`
    SELECT
      pc."id",
      pc."amountPence"::int AS "amountPence",
      pc."dueDate",
      COALESCE(SUM(tx."amountPence"), 0)::int AS "paidPence"
    FROM "PaymentCharge" pc
    JOIN "Fixture" f ON f."id" = pc."fixtureId"
    LEFT JOIN "PaymentTransaction" tx ON tx."chargeId" = pc."id"
    WHERE pc."teamId" = ${input.teamId}
      AND pc."fixtureId" IS NOT NULL
      AND pc."status" <> 'VOID'
      AND f."status" IN ('SCHEDULED', 'COMPLETED')
    GROUP BY pc."id", pc."amountPence", pc."dueDate", pc."createdAt"
    HAVING pc."amountPence" > COALESCE(SUM(tx."amountPence"), 0)
    ORDER BY
      CASE WHEN (pc."amountPence" - COALESCE(SUM(tx."amountPence"), 0)) = ${input.amountPence} THEN 0 ELSE 1 END,
      COALESCE(pc."dueDate", pc."createdAt") ASC,
      pc."createdAt" ASC
  `;

  return rows.find((row) => isMatchFeeChargeDueToday(row.dueDate)) ?? null;
}

async function refreshChargeStatus(input: {
  chargeId: string;
  db: TeamSubscriptionDb;
}) {
  await input.db.$executeRaw`
    UPDATE "PaymentCharge" pc
    SET "status" = CASE
      WHEN totals."paidPence" >= pc."amountPence" THEN 'PAID'::"PaymentChargeStatus"
      WHEN totals."paidPence" > 0 THEN 'PART_PAID'::"PaymentChargeStatus"
      ELSE 'OPEN'::"PaymentChargeStatus"
    END
    FROM (
      SELECT
        pc_inner."id" AS "chargeId",
        COALESCE(SUM(tx."amountPence"), 0)::int AS "paidPence"
      FROM "PaymentCharge" pc_inner
      LEFT JOIN "PaymentTransaction" tx ON tx."chargeId" = pc_inner."id"
      WHERE pc_inner."id" = ${input.chargeId}
      GROUP BY pc_inner."id"
    ) totals
    WHERE pc."id" = totals."chargeId"
      AND pc."status" <> 'VOID'
  `;
}

export async function syncTeamSubscriptionFromStripe(input: {
  subscription: Stripe.Subscription;
  teamId?: string | null;
  db?: TeamSubscriptionDb;
}) {
  const db = input.db ?? prisma;
  const subscription = input.subscription;
  const typedSubscription = subscription as StripeSubscriptionLike;
  const stripeSubscriptionId = subscription.id;
  const stripeCustomerId = getStripeId(subscription.customer);
  const teamId =
    input.teamId?.trim() ||
    (await findTeamIdForStripeSubscription({
      stripeSubscriptionId,
      stripeCustomerId,
      metadataTeamId: subscription.metadata?.teamId,
      db,
    }));

  if (!teamId) return null;

  await db.$executeRaw`
    UPDATE "Team"
    SET
      "stripeCustomerId" = COALESCE(${stripeCustomerId}, "stripeCustomerId"),
      "stripeSubscriptionId" = ${stripeSubscriptionId},
      "subscriptionStatus" = ${subscription.status},
      "subscriptionPriceId" = ${getSubscriptionPriceId(subscription)},
      "subscriptionCurrentPeriodEnd" = ${getSubscriptionPeriodEnd(subscription)},
      "subscriptionStartedAt" = COALESCE("subscriptionStartedAt", ${toDateFromUnix(typedSubscription.created)}),
      "subscriptionCancelledAt" = ${getSubscriptionCancelledAt(subscription)}
    WHERE "id" = ${teamId}
  `;

  return teamId;
}

export async function markTeamSubscriptionDeleted(input: {
  subscription: Stripe.Subscription;
  db?: TeamSubscriptionDb;
}) {
  const db = input.db ?? prisma;
  const subscription = input.subscription;
  const stripeSubscriptionId = subscription.id;
  const stripeCustomerId = getStripeId(subscription.customer);
  const teamId = await findTeamIdForStripeSubscription({
    stripeSubscriptionId,
    stripeCustomerId,
    metadataTeamId: subscription.metadata?.teamId,
    db,
  });

  if (!teamId) return null;

  await db.$executeRaw`
    UPDATE "Team"
    SET
      "subscriptionStatus" = ${subscription.status || "canceled"},
      "subscriptionCancelledAt" = ${getSubscriptionCancelledAt(subscription) ?? new Date()},
      "subscriptionCurrentPeriodEnd" = ${getSubscriptionPeriodEnd(subscription)}
    WHERE "id" = ${teamId}
  `;

  return teamId;
}

async function hasRecordedStripeInvoice(input: {
  stripeInvoiceId: string;
  db: TeamSubscriptionDb;
}) {
  const rows = await input.db.$queryRaw<Array<{ id: string }>>`
    SELECT "id"
    FROM "PaymentTransaction"
    WHERE "stripeInvoiceId" = ${input.stripeInvoiceId}
    LIMIT 1
  `;

  return Boolean(rows[0]?.id);
}

export async function recordTeamSubscriptionInvoicePaid(input: {
  invoice: Stripe.Invoice;
  stripe?: Stripe;
  db?: TeamSubscriptionDb;
}) {
  const db = input.db ?? prisma;
  const invoice = input.invoice as StripeInvoiceLike;
  const stripeInvoiceId = invoice.id;

  if (!stripeInvoiceId) return null;
  if (await hasRecordedStripeInvoice({ stripeInvoiceId, db })) return null;

  let stripeSubscriptionId = getStripeId(invoice.subscription);
  let stripeCustomerId = getStripeId(invoice.customer);
  let metadataTeamId = invoice.metadata?.teamId?.trim() || null;

  if ((!metadataTeamId || !stripeSubscriptionId) && stripeSubscriptionId && input.stripe) {
    const subscription = await input.stripe.subscriptions.retrieve(stripeSubscriptionId);
    metadataTeamId = metadataTeamId || subscription.metadata?.teamId?.trim() || null;
    stripeCustomerId = stripeCustomerId || getStripeId(subscription.customer);
    await syncTeamSubscriptionFromStripe({ subscription, db });
  }

  const teamId = await findTeamIdForStripeSubscription({
    stripeSubscriptionId,
    stripeCustomerId,
    metadataTeamId,
    db,
  });

  if (!teamId) return null;

  const amountPence = invoice.amount_paid ?? invoice.total ?? 0;
  if (amountPence <= 0) return null;

  const paidAt =
    toDateFromUnix(invoice.status_transitions?.paid_at) ??
    toDateFromUnix(invoice.created) ??
    new Date();

  const paymentIntentId = getStripeId(invoice.payment_intent);
  const stripeChargeId = getStripeId(invoice.charge);
  const targetCharge = await findTodaysMatchdayChargeForSubscriptionPayment({
    teamId,
    amountPence,
    db,
  });
  const transactionId = `ptx_${randomUUID()}`;
  const transactionRows = await db.$queryRaw<Array<{ id: string }>>`
    INSERT INTO "PaymentTransaction" (
      "id",
      "teamId",
      "chargeId",
      "amountPence",
      "method",
      "reference",
      "notes",
      "paidAt",
      "stripePaymentIntentId",
      "stripeChargeId",
      "stripeInvoiceId",
      "createdAt",
      "updatedAt"
    )
    VALUES (
      ${transactionId},
      ${teamId},
      ${targetCharge?.id ?? null},
      ${amountPence},
      'STRIPE'::"PaymentMethod",
      ${stripeInvoiceId},
      ${targetCharge
        ? "Recurring team subscription paid via Stripe and applied to today's matchday team charge."
        : "Recurring team subscription paid via Stripe, but no matchday team charge was due today."},
      ${paidAt},
      ${paymentIntentId},
      ${stripeChargeId},
      ${stripeInvoiceId},
      NOW(),
      NOW()
    )
    ON CONFLICT ("stripeInvoiceId") WHERE "stripeInvoiceId" IS NOT NULL DO NOTHING
    RETURNING "id"
  `;

  const transaction = transactionRows[0] ?? null;
  if (!transaction) return null;

  if (targetCharge?.id) {
    await refreshChargeStatus({ chargeId: targetCharge.id, db });
  }

  await db.$executeRaw`
    UPDATE "Team"
    SET
      "subscriptionLastInvoiceId" = ${stripeInvoiceId},
      "subscriptionLastPaymentAt" = ${paidAt},
      "subscriptionLastPaymentFailedAt" = NULL
    WHERE "id" = ${teamId}
  `;

  return transaction.id;
}

export async function markTeamSubscriptionInvoiceFailed(input: {
  invoice: Stripe.Invoice;
  stripe?: Stripe;
  db?: TeamSubscriptionDb;
}) {
  const db = input.db ?? prisma;
  const invoice = input.invoice as StripeInvoiceLike;

  let stripeSubscriptionId = getStripeId(invoice.subscription);
  let stripeCustomerId = getStripeId(invoice.customer);
  let metadataTeamId = invoice.metadata?.teamId?.trim() || null;

  if ((!metadataTeamId || !stripeSubscriptionId) && stripeSubscriptionId && input.stripe) {
    const subscription = await input.stripe.subscriptions.retrieve(stripeSubscriptionId);
    metadataTeamId = metadataTeamId || subscription.metadata?.teamId?.trim() || null;
    stripeCustomerId = stripeCustomerId || getStripeId(subscription.customer);
    await syncTeamSubscriptionFromStripe({ subscription, db });
  }

  const teamId = await findTeamIdForStripeSubscription({
    stripeSubscriptionId,
    stripeCustomerId,
    metadataTeamId,
    db,
  });

  if (!teamId) return null;

  await db.$executeRaw`
    UPDATE "Team"
    SET
      "subscriptionLastInvoiceId" = ${invoice.id ?? null},
      "subscriptionLastPaymentFailedAt" = ${new Date()},
      "subscriptionStatus" = COALESCE("subscriptionStatus", 'past_due')
    WHERE "id" = ${teamId}
  `;

  return teamId;
}
