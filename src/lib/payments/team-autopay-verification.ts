import type Stripe from "stripe";

function getStripeId(value: unknown): string | null {
  if (typeof value === "string") return value;
  if (value && typeof value === "object" && "id" in value) {
    const id = (value as { id?: unknown }).id;
    return typeof id === "string" ? id : null;
  }
  return null;
}

export type TeamAutoPayStripeEvidence = {
  teamId: string;
  stripeCustomerId: string;
  stripeDefaultPaymentMethodId: string;
  setupCheckoutSessionId: string;
};

export type TeamAutoPayStripeVerification = {
  verified: boolean;
  reason: string | null;
};

export async function verifyTeamAutoPayStripeEvidence(input: {
  stripe: Stripe;
  evidence: TeamAutoPayStripeEvidence;
}): Promise<TeamAutoPayStripeVerification> {
  const { stripe, evidence } = input;

  if (
    !evidence.stripeCustomerId.startsWith("cus_") ||
    !evidence.stripeDefaultPaymentMethodId.startsWith("pm_") ||
    !evidence.setupCheckoutSessionId.startsWith("cs_")
  ) {
    return {
      verified: false,
      reason: "Saved-card record does not contain valid Stripe setup identifiers.",
    };
  }

  const session = await stripe.checkout.sessions.retrieve(
    evidence.setupCheckoutSessionId,
    { expand: ["setup_intent.payment_method"] },
  );
  const sessionTeamId =
    session.metadata?.teamId?.trim() || session.client_reference_id?.trim() || null;
  const sessionCustomerId = getStripeId(session.customer);

  if (
    session.mode !== "setup" ||
    session.status !== "complete" ||
    session.metadata?.type !== "team_autopay_setup" ||
    sessionTeamId !== evidence.teamId ||
    sessionCustomerId !== evidence.stripeCustomerId
  ) {
    return {
      verified: false,
      reason: "Stripe does not confirm a completed saved-card setup for this team.",
    };
  }

  let setupIntent: Stripe.SetupIntent | null = null;
  if (typeof session.setup_intent === "string") {
    setupIntent = await stripe.setupIntents.retrieve(session.setup_intent, {
      expand: ["payment_method"],
    });
  } else if (session.setup_intent) {
    setupIntent = session.setup_intent;
  }

  if (!setupIntent || setupIntent.status !== "succeeded") {
    return {
      verified: false,
      reason: "Stripe setup has not completed successfully.",
    };
  }

  const setupPaymentMethodId = getStripeId(setupIntent.payment_method);
  if (setupPaymentMethodId !== evidence.stripeDefaultPaymentMethodId) {
    return {
      verified: false,
      reason: "The stored card does not match the completed Stripe setup.",
    };
  }

  const paymentMethod =
    typeof setupIntent.payment_method === "string"
      ? await stripe.paymentMethods.retrieve(setupIntent.payment_method)
      : setupIntent.payment_method;
  const paymentMethodCustomerId = getStripeId(paymentMethod?.customer);

  if (
    !paymentMethod ||
    paymentMethod.type !== "card" ||
    paymentMethodCustomerId !== evidence.stripeCustomerId
  ) {
    return {
      verified: false,
      reason: "Stripe no longer shows this card attached to the team customer.",
    };
  }

  return { verified: true, reason: null };
}
