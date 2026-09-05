// ========================================
// File: src/lib/payments/team-autopay.ts
// ========================================

import type Stripe from "stripe";
import { Prisma } from "@prisma/client";

import { isMatchFeeChargeDueToday } from "@/lib/payments/match-day-billing";
import { verifyTeamAutoPayStripeEvidence } from "@/lib/payments/team-autopay-verification";
import { prisma } from "@/lib/prisma";
import { getStripeServerClient } from "@/lib/stripe/client";

type AutoPayDb = Pick<typeof prisma, "$executeRaw" | "$queryRaw">;

export const TEAM_AUTOPAY_MANDATE_TEXT =
  "By saving this card, you authorise SIXFL to charge the agreed team match fee as a one-off payment on the actual matchday only. If a fixture is postponed or cancelled, SIXFL will not take that fixture's match fee from this saved card.";

type DueAutoPayCharge = {
  chargeId: string;
  teamId: string;
  teamName: string;
  stripeCustomerId: string;
  stripeDefaultPaymentMethodId: string;
  autoPaySetupCheckoutSessionId: string;
  fixtureId: string;
  title: string;
  description: string | null;
  amountPence: number;
  paidPence: number;
  autoPayCapPence: number | null;
  dueDate: Date | null;
};

export type MatchdayAutoPayResult = {
  chargeId: string;
  teamId: string;
  status: "paid" | "skipped" | "failed" | "requires_action";
  amountPence: number;
  paymentIntentId?: string | null;
  message?: string;
};

function getStripeId(value: unknown): string | null {
  if (typeof value === "string") return value;
  if (value && typeof value === "object" && "id" in value) {
    const id = (value as { id?: unknown }).id;
    return typeof id === "string" ? id : null;
  }
  return null;
}

function getPaymentIntentStatus(error: unknown) {
  if (
    error &&
    typeof error === "object" &&
    "payment_intent" in error
  ) {
    const paymentIntent = (error as { payment_intent?: Stripe.PaymentIntent }).payment_intent;
    if (paymentIntent?.status === "requires_action") return "requires_action" as const;
  }

  return "failed" as const;
}

function getErrorMessage(error: unknown) {
  if (error instanceof Error && error.message.trim()) return error.message;
  if (typeof error === "string" && error.trim()) return error;
  return "Stripe could not take the saved-card matchday payment.";
}

export async function saveTeamAutoPaySetup(input: {
  teamId: string;
  stripeCustomerId: string;
  stripeDefaultPaymentMethodId: string;
  setupCheckoutSessionId: string;
  mandateText?: string | null;
  db?: AutoPayDb;
}) {
  const db = input.db ?? prisma;
  const mandateText = input.mandateText?.trim() || TEAM_AUTOPAY_MANDATE_TEXT;
  const setupCheckoutSessionId = input.setupCheckoutSessionId.trim();

  if (!setupCheckoutSessionId) {
    throw new Error("A completed Stripe saved-card setup session is required.");
  }

  await db.$executeRaw(Prisma.sql`
    UPDATE "Team"
    SET
      "stripeCustomerId" = ${input.stripeCustomerId},
      "stripeDefaultPaymentMethodId" = ${input.stripeDefaultPaymentMethodId},
      "autoPayEnabled" = true,
      "autoPayMandateAcceptedAt" = NOW(),
      "autoPayMandateText" = ${mandateText},
      "autoPaySetupCheckoutSessionId" = ${setupCheckoutSessionId},
      "autoPayLastFailureAt" = NULL,
      "autoPayLastFailureReason" = NULL
    WHERE "id" = ${input.teamId}
  `);
}

export async function disableTeamAutoPay(input: {
  teamId: string;
  reason?: string | null;
  db?: AutoPayDb;
}) {
  const db = input.db ?? prisma;

  await db.$executeRaw(Prisma.sql`
    UPDATE "Team"
    SET
      "autoPayEnabled" = false,
      "autoPayLastFailureAt" = NOW(),
      "autoPayLastFailureReason" = ${input.reason ?? "Saved-card team autopay disabled."}
    WHERE "id" = ${input.teamId}
  `);
}

export async function getDueMatchdayAutoPayCharges(db: AutoPayDb = prisma) {
  const rows = await db.$queryRaw<DueAutoPayCharge[]>(Prisma.sql`
    SELECT
      pc."id" AS "chargeId",
      pc."teamId",
      t."name" AS "teamName",
      t."stripeCustomerId",
      t."stripeDefaultPaymentMethodId",
      t."autoPaySetupCheckoutSessionId",
      pc."fixtureId",
      pc."title",
      pc."description",
      pc."amountPence"::int AS "amountPence",
      COALESCE(SUM(tx."amountPence"), 0)::int AS "paidPence",
      COALESCE(
        t."standardMatchFeePence",
        CASE
          WHEN f."homeTeamId" = pc."teamId" THEN f."homeMatchFeePence"
          WHEN f."awayTeamId" = pc."teamId" THEN f."awayMatchFeePence"
          ELSE NULL
        END,
        f."matchFeePence"
      )::int AS "autoPayCapPence",
      pc."dueDate"
    FROM "PaymentCharge" pc
    JOIN "Fixture" f ON f."id" = pc."fixtureId"
    JOIN "Team" t ON t."id" = pc."teamId"
    LEFT JOIN "PaymentTransaction" tx ON tx."chargeId" = pc."id"
    WHERE pc."fixtureId" IS NOT NULL
      AND pc."status" <> 'VOID'
      AND f."status" IN ('SCHEDULED', 'COMPLETED')
      AND t."autoPayEnabled" = true
      AND t."stripeCustomerId" IS NOT NULL
      AND t."stripeDefaultPaymentMethodId" IS NOT NULL
      AND t."autoPayMandateAcceptedAt" IS NOT NULL
      AND NULLIF(BTRIM(t."autoPayMandateText"), '') IS NOT NULL
      AND NULLIF(BTRIM(t."autoPaySetupCheckoutSessionId"), '') IS NOT NULL
    GROUP BY
      pc."id",
      pc."teamId",
      t."name",
      t."stripeCustomerId",
      t."stripeDefaultPaymentMethodId",
      t."autoPaySetupCheckoutSessionId",
      t."standardMatchFeePence",
      f."homeTeamId",
      f."awayTeamId",
      f."homeMatchFeePence",
      f."awayMatchFeePence",
      f."matchFeePence",
      pc."fixtureId",
      pc."title",
      pc."description",
      pc."amountPence",
      pc."dueDate"
    HAVING pc."amountPence" > COALESCE(SUM(tx."amountPence"), 0)
    ORDER BY pc."dueDate" ASC, pc."createdAt" ASC
  `);

  return rows.filter((row) => isMatchFeeChargeDueToday(row.dueDate));
}

async function refreshChargeStatus(input: { chargeId: string; db: AutoPayDb }) {
  await input.db.$executeRaw(Prisma.sql`
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
  `);
}

async function recordSuccessfulAutoPay(input: {
  row: DueAutoPayCharge;
  amountPence: number;
  paymentIntent: Stripe.PaymentIntent;
  db: AutoPayDb;
}) {
  const paymentIntentId = input.paymentIntent.id;
  const chargeId = getStripeId(input.paymentIntent.latest_charge);

  const insertedRows = await input.db.$queryRaw<Array<{ id: string }>>(Prisma.sql`
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
      "createdAt",
      "updatedAt"
    )
    SELECT
      ${`ptx_${paymentIntentId}`},
      ${input.row.teamId},
      ${input.row.chargeId},
      ${input.amountPence},
      'STRIPE'::"PaymentMethod",
      ${paymentIntentId},
      'Saved-card matchday team payment taken automatically by SIXFL.',
      NOW(),
      ${paymentIntentId},
      ${chargeId},
      NOW(),
      NOW()
    WHERE NOT EXISTS (
      SELECT 1 FROM "PaymentTransaction" WHERE "stripePaymentIntentId" = ${paymentIntentId}
    )
    ON CONFLICT ("id") DO NOTHING
    RETURNING "id"
  `);

  await refreshChargeStatus({ chargeId: input.row.chargeId, db: input.db });

  await input.db.$executeRaw(Prisma.sql`
    UPDATE "Team"
    SET
      "autoPayLastAttemptAt" = NOW(),
      "autoPayLastFailureAt" = NULL,
      "autoPayLastFailureReason" = NULL
    WHERE "id" = ${input.row.teamId}
  `);

  return insertedRows[0]?.id ?? null;
}

export async function chargeDueMatchdayAutoPayments(options?: {
  stripe?: Stripe;
  db?: AutoPayDb;
}) {
  const stripe = options?.stripe ?? getStripeServerClient();
  const db = options?.db ?? prisma;
  const rows = await getDueMatchdayAutoPayCharges(db);
  const results: MatchdayAutoPayResult[] = [];

  for (const row of rows) {
    const autoPayCapPence = row.autoPayCapPence;

    if (autoPayCapPence === null) {
      const message =
        "Automatic payment blocked because SIXFL could not verify this team's agreed match fee.";
      await db.$executeRaw(Prisma.sql`
        UPDATE "Team"
        SET
          "autoPayLastFailureAt" = NOW(),
          "autoPayLastFailureReason" = ${message}
        WHERE "id" = ${row.teamId}
      `);
      results.push({
        chargeId: row.chargeId,
        teamId: row.teamId,
        status: "skipped",
        amountPence: 0,
        message,
      });
      continue;
    }

    let chargeAmountPence = row.amountPence;

    if (chargeAmountPence > autoPayCapPence) {
      if (row.paidPence > 0) {
        const message =
          `Automatic payment blocked: stored charge ${chargeAmountPence}p exceeds the verified team fee ${autoPayCapPence}p and money is already recorded against the charge. Admin review is required.`;
        await db.$executeRaw(Prisma.sql`
          UPDATE "Team"
          SET
            "autoPayLastFailureAt" = NOW(),
            "autoPayLastFailureReason" = ${message}
          WHERE "id" = ${row.teamId}
        `);
        results.push({
          chargeId: row.chargeId,
          teamId: row.teamId,
          status: "skipped",
          amountPence: 0,
          message,
        });
        continue;
      }

      if (autoPayCapPence <= 0) {
        await db.$executeRaw(Prisma.sql`
          UPDATE "PaymentCharge"
          SET "status" = 'VOID'::"PaymentChargeStatus"
          WHERE "id" = ${row.chargeId}
            AND "status" <> 'VOID'::"PaymentChargeStatus"
        `);
        results.push({
          chargeId: row.chargeId,
          teamId: row.teamId,
          status: "skipped",
          amountPence: 0,
          message: "Automatic payment blocked because the verified team match fee is £0.00.",
        });
        continue;
      }

      await db.$executeRaw(Prisma.sql`
        UPDATE "PaymentCharge"
        SET
          "amountPence" = ${autoPayCapPence},
          "status" = 'OPEN'::"PaymentChargeStatus"
        WHERE "id" = ${row.chargeId}
          AND "status" <> 'VOID'::"PaymentChargeStatus"
      `);

      console.warn("Corrected saved-card charge down to verified team fee before Stripe debit", {
        chargeId: row.chargeId,
        teamId: row.teamId,
        storedAmountPence: row.amountPence,
        verifiedFeePence: autoPayCapPence,
      });
      chargeAmountPence = autoPayCapPence;
    }

    const outstandingPence = chargeAmountPence - row.paidPence;

    if (outstandingPence <= 0) {
      results.push({
        chargeId: row.chargeId,
        teamId: row.teamId,
        status: "skipped",
        amountPence: 0,
        message: "Charge is already paid.",
      });
      continue;
    }

    try {
      const verification = await verifyTeamAutoPayStripeEvidence({
        stripe,
        evidence: {
          teamId: row.teamId,
          stripeCustomerId: row.stripeCustomerId,
          stripeDefaultPaymentMethodId: row.stripeDefaultPaymentMethodId,
          setupCheckoutSessionId: row.autoPaySetupCheckoutSessionId,
        },
      });

      if (!verification.verified) {
        const message =
          verification.reason ||
          "Saved-card setup is not currently verified with Stripe. Automatic payment was not attempted.";
        await db.$executeRaw(Prisma.sql`
          UPDATE "Team"
          SET
            "autoPayLastFailureAt" = NOW(),
            "autoPayLastFailureReason" = ${message}
          WHERE "id" = ${row.teamId}
        `);
        results.push({
          chargeId: row.chargeId,
          teamId: row.teamId,
          status: "skipped",
          amountPence: 0,
          message,
        });
        continue;
      }

      await db.$executeRaw(Prisma.sql`
        UPDATE "Team"
        SET "autoPayLastAttemptAt" = NOW()
        WHERE "id" = ${row.teamId}
      `);

      const paymentIntent = await stripe.paymentIntents.create(
        {
          amount: outstandingPence,
          currency: "gbp",
          customer: row.stripeCustomerId,
          payment_method: row.stripeDefaultPaymentMethodId,
          off_session: true,
          confirm: true,
          description: row.description || row.title,
          metadata: {
            type: "team_matchday_auto_payment",
            teamId: row.teamId,
            chargeId: row.chargeId,
            fixtureId: row.fixtureId,
            verifiedTeamFeePence: String(autoPayCapPence),
            storedChargePence: String(row.amountPence),
          },
        },
        {
          idempotencyKey: `sixfl_matchday_autopay_${row.chargeId}_${chargeAmountPence}`,
        },
      );

      if (paymentIntent.status === "succeeded") {
        await recordSuccessfulAutoPay({ row, amountPence: outstandingPence, paymentIntent, db });
        results.push({
          chargeId: row.chargeId,
          teamId: row.teamId,
          status: "paid",
          amountPence: outstandingPence,
          paymentIntentId: paymentIntent.id,
        });
      } else {
        const message = `PaymentIntent ended with status ${paymentIntent.status}.`;
        await db.$executeRaw(Prisma.sql`
          UPDATE "Team"
          SET
            "autoPayLastFailureAt" = NOW(),
            "autoPayLastFailureReason" = ${message}
          WHERE "id" = ${row.teamId}
        `);
        results.push({
          chargeId: row.chargeId,
          teamId: row.teamId,
          status: paymentIntent.status === "requires_action" ? "requires_action" : "failed",
          amountPence: outstandingPence,
          paymentIntentId: paymentIntent.id,
          message,
        });
      }
    } catch (error) {
      const message = getErrorMessage(error);
      const status = getPaymentIntentStatus(error);
      await db.$executeRaw(Prisma.sql`
        UPDATE "Team"
        SET
          "autoPayLastFailureAt" = NOW(),
          "autoPayLastFailureReason" = ${message}
        WHERE "id" = ${row.teamId}
      `);
      results.push({
        chargeId: row.chargeId,
        teamId: row.teamId,
        status,
        amountPence: 0,
        message,
      });
    }
  }

  return results;
}
