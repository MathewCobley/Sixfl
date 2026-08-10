import type Stripe from "stripe";

import { saveTeamAutoPaySetup, TEAM_AUTOPAY_MANDATE_TEXT } from "@/lib/payments/team-autopay";
import { prisma } from "@/lib/prisma";
import { getStripeServerClient } from "@/lib/stripe/client";

export type TeamAutoPaySnapshot = {
  stripeCustomerId: string | null;
  stripeDefaultPaymentMethodId: string | null;
  autoPayEnabled: boolean;
  autoPayMandateAcceptedAt: Date | null;
  autoPaySetupCheckoutSessionId: string | null;
  autoPayLastAttemptAt: Date | null;
  autoPayLastFailureAt: Date | null;
  autoPayLastFailureReason: string | null;
};

function getStripeId(value: unknown) {
  if (typeof value === "string") return value;
  if (value && typeof value === "object" && "id" in value) {
    const id = (value as { id?: unknown }).id;
    return typeof id === "string" ? id : null;
  }
  return null;
}

export async function getTeamAutoPaySnapshot(teamId: string) {
  const rows = await prisma.$queryRaw<TeamAutoPaySnapshot[]>`
    SELECT
      "stripeCustomerId",
      "stripeDefaultPaymentMethodId",
      "autoPayEnabled",
      "autoPayMandateAcceptedAt",
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
 * the page does not stay stuck in an "account linked" state if the webhook is
 * delayed or missed.
 */
export async function reconcileTeamAutoPaySetup(teamId: string) {
  const current = await getTeamAutoPaySnapshot(teamId);
  if (!current) return null;

  if (
    current.autoPayEnabled &&
    current.stripeCustomerId &&
    current.stripeDefaultPaymentMethodId
  ) {
    return current;
  }

  const sessionId = current.autoPaySetupCheckoutSessionId?.trim();
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
