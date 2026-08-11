import type Stripe from "stripe";

import { saveTeamAutoPaySetup, TEAM_AUTOPAY_MANDATE_TEXT } from "@/lib/payments/team-autopay";
import { verifyTeamAutoPayStripeEvidence } from "@/lib/payments/team-autopay-verification";
import { prisma } from "@/lib/prisma";
import { getStripeServerClient } from "@/lib/stripe/client";

export type TeamAutoPaySnapshot = {
  stripeCustomerId: string | null;
  stripeDefaultPaymentMethodId: string | null;
  autoPayEnabled: boolean;
  autoPayMandateAcceptedAt: Date | null;
  autoPayMandateText: string | null;
  autoPaySetupCheckoutSessionId: string | null;
  autoPayLastAttemptAt: Date | null;
  autoPayLastFailureAt: Date | null;
  autoPayLastFailureReason: string | null;
};

export function isConfirmedTeamAutoPaySetup(
  autoPay: TeamAutoPaySnapshot | null | undefined,
) {
  return Boolean(
    autoPay?.autoPayEnabled &&
      autoPay.stripeCustomerId?.trim() &&
      autoPay.stripeDefaultPaymentMethodId?.trim() &&
      autoPay.autoPayMandateAcceptedAt &&
      autoPay.autoPayMandateText?.trim() &&
      autoPay.autoPaySetupCheckoutSessionId?.trim(),
  );
}

function getStripeId(value: unknown) {
  if (typeof value === "string") return value;
  if (value && typeof value === "object" && "id" in value) {
    const id = (value as { id?: unknown }).id;
    return typeof id === "string" ? id : null;
  }
  return null;
}

async function getStoredTeamAutoPaySnapshot(teamId: string) {
  const rows = await prisma.$queryRaw<TeamAutoPaySnapshot[]>`
    SELECT
      "stripeCustomerId",
      "stripeDefaultPaymentMethodId",
      "autoPayEnabled",
      "autoPayMandateAcceptedAt",
      "autoPayMandateText",
      "autoPaySetupCheckoutSessionId",
      "autoPayLastAttemptAt",
      "autoPayLastFailureAt",
      "autoPayLastFailureReason"
    FROM "Team"
    WHERE "id" = ${teamId}
    LIMIT 1
  `;

  return rows[0] ?? null;
}

/**
 * A local database flag is not enough to tell a captain that a card is ready.
 * Re-check the completed Stripe setup session and attached card before exposing
 * the team as "Saved card setup complete". If Stripe cannot verify it, return
 * an incomplete snapshot so the UI and management route fail safe.
 */
export async function getTeamAutoPaySnapshot(teamId: string) {
  const current = await getStoredTeamAutoPaySnapshot(teamId);
  if (!current || !isConfirmedTeamAutoPaySetup(current)) return current;

  const stripeCustomerId = current.stripeCustomerId?.trim();
  const stripeDefaultPaymentMethodId = current.stripeDefaultPaymentMethodId?.trim();
  const setupCheckoutSessionId = current.autoPaySetupCheckoutSessionId?.trim();

  if (!stripeCustomerId || !stripeDefaultPaymentMethodId || !setupCheckoutSessionId) {
    return { ...current, autoPayEnabled: false };
  }

  try {
    const verification = await verifyTeamAutoPayStripeEvidence({
      stripe: getStripeServerClient(),
      evidence: {
        teamId,
        stripeCustomerId,
        stripeDefaultPaymentMethodId,
        setupCheckoutSessionId,
      },
    });

    if (verification.verified) return current;

    return {
      ...current,
      autoPayEnabled: false,
      autoPayLastFailureReason:
        verification.reason || "Saved-card setup could not be verified with Stripe.",
    };
  } catch (error) {
    console.warn("Could not verify team saved-card setup with Stripe", {
      teamId,
      setupCheckoutSessionId,
      error,
    });

    return {
      ...current,
      autoPayEnabled: false,
      autoPayLastFailureReason:
        "SIXFL could not verify the saved card with Stripe. No automatic payment should be treated as authorised until verification succeeds.",
    };
  }
}

async function getSetupIntent(
  stripe: Stripe,
  session: Stripe.Checkout.Session,
) {
  if (!session.setup_intent) return null;
  if (typeof session.setup_intent === "string") {
    return stripe.setupIntents.retrieve(session.setup_intent, {
      expand: ["payment_method"],
    });
  }
  return session.setup_intent;
}

/**
 * Stripe normally completes saved-card setup through the webhook. This is a
 * second, idempotent reconciliation path for the captain's return to SIXFL so
 * the page does not stay stuck in an incomplete state if the webhook is delayed
 * or missed.
 */
export async function reconcileTeamAutoPaySetup(teamId: string) {
  const current = await getTeamAutoPaySnapshot(teamId);
  if (!current) return null;

  if (isConfirmedTeamAutoPaySetup(current)) {
    return current;
  }

  const stored = await getStoredTeamAutoPaySnapshot(teamId);
  const sessionId = stored?.autoPaySetupCheckoutSessionId?.trim();
  if (!sessionId) return current;

  try {
    const stripe = getStripeServerClient();
    const session = await stripe.checkout.sessions.retrieve(sessionId, {
      expand: ["setup_intent.payment_method"],
    });

    const sessionTeamId =
      session.metadata?.teamId?.trim() || session.client_reference_id?.trim();
    if (
      session.mode !== "setup" ||
      session.status !== "complete" ||
      session.metadata?.type !== "team_autopay_setup" ||
      sessionTeamId !== teamId
    ) {
      return current;
    }

    const stripeCustomerId = getStripeId(session.customer);
    const setupIntent = await getSetupIntent(stripe, session);
    const paymentMethodId = getStripeId(setupIntent?.payment_method);

    if (!stripeCustomerId || !setupIntent || setupIntent.status !== "succeeded" || !paymentMethodId) {
      return current;
    }

    await saveTeamAutoPaySetup({
      teamId,
      stripeCustomerId,
      stripeDefaultPaymentMethodId: paymentMethodId,
      setupCheckoutSessionId: session.id,
      mandateText: session.metadata?.mandateText || TEAM_AUTOPAY_MANDATE_TEXT,
    });

    return getTeamAutoPaySnapshot(teamId);
  } catch (error) {
    console.warn("Could not reconcile team saved-card setup from Stripe", {
      teamId,
      sessionId,
      error,
    });
    return current;
  }
}
