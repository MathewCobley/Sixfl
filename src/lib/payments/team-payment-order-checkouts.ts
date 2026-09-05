import type Stripe from "stripe";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getStripeServerClient } from "@/lib/stripe/client";
import { getTeamPaymentOrder } from "@/lib/payments/team-payment-order";

export function directTeamCheckoutCharge(session: Pick<Stripe.Checkout.Session, "mode" | "metadata" | "client_reference_id">) {
  const metadata = session.metadata ?? {};
  // Legacy generic team-charge checkouts have no type. Do not infer an exemption
  // from a browser flag: these values were written to Stripe by SIXFL's server.
  if (session.mode !== "payment" || (metadata.type && metadata.type !== "team_charge")) return null;
  if (metadata.playerMatchFeeId || metadata.extraKitChargeId || metadata.remittanceAmountPence) return null;
  const chargeId = metadata.chargeId?.trim();
  const teamId = metadata.teamId?.trim();
  if (!chargeId || !teamId || session.client_reference_id !== chargeId) return null;
  return { chargeId, teamId };
}

async function expireDirectSession(stripe: Stripe, sessionId: string) {
  try {
    await stripe.checkout.sessions.expire(sessionId, {}, { idempotencyKey: `sixfl-payment-order-expire-${sessionId}` });
    return "expired" as const;
  } catch (error) {
    // A payment can finish between list/retrieve and expire. Preserve its stated
    // fixture allocation; never refund or move that payment behind the payer's back.
    const current = await stripe.checkout.sessions.retrieve(sessionId);
    if (current.status === "expired") return "expired" as const;
    if (current.status === "complete") return "complete" as const;
    throw error;
  }
}

/** Never reuse an expired/paid checkout merely because its URL was cached. */
export async function reusableTeamChargeCheckout(input: {
  sessionId: string | null;
  chargeId: string;
  amountPence: number;
  stripe: Stripe;
}) {
  if (!input.sessionId) return { url: null, paymentPending: false };
  const session = await input.stripe.checkout.sessions.retrieve(input.sessionId);
  const identity = directTeamCheckoutCharge(session);
  if (!identity || identity.chargeId !== input.chargeId) throw new Error("The cached team checkout could not be verified.");
  if (session.status === "complete") {
    const recorded = await prisma.paymentTransaction.findUnique({
      where: { stripeCheckoutSessionId: session.id }, select: { id: true },
    });
    return { url: null, paymentPending: !recorded };
  }
  if (session.status === "open" && session.amount_total === input.amountPence) {
    if (!session.url) throw new Error("The open team checkout has no usable payment URL.");
    return { url: session.url, paymentPending: false };
  }
  if (session.status === "open") {
    const outcome = await expireDirectSession(input.stripe, session.id);
    if (outcome === "complete") return { url: null, paymentPending: true };
  }
  return { url: null, paymentPending: false };
}

/** One bounded, resumable page per cron run, including superseded legacy URLs. */
export async function reconcileTeamPaymentOrderCheckouts(options?: { stripe?: Stripe }) {
  const [lease] = await prisma.$queryRaw<Array<{ cursor: string | null }>>(Prisma.sql`
    UPDATE "TeamPaymentOrderMaintenance"
    SET "leaseUntil" = NOW() + INTERVAL '2 minutes'
    WHERE "id" = 'open-checkouts' AND ("leaseUntil" IS NULL OR "leaseUntil" < NOW())
    RETURNING "cursor"
  `);
  if (!lease) return { checked: 0, expired: 0, inFlight: 0, busy: true, hasMore: false };
  let checked = 0, expired = 0, inFlight = 0;
  try {
    const stripe = options?.stripe ?? getStripeServerClient();
    const page = await stripe.checkout.sessions.list({
      status: "open", limit: 100, ...(lease.cursor ? { starting_after: lease.cursor } : {}),
    });
    const orders = new Map<string, Awaited<ReturnType<typeof getTeamPaymentOrder>>>();
    for (const session of page.data) {
      const identity = directTeamCheckoutCharge(session);
      if (!identity) continue;
      const charge = await prisma.paymentCharge.findUnique({
        where: { id: identity.chargeId }, select: { teamId: true },
      });
      if (!charge || charge.teamId !== identity.teamId) continue;
      checked++;
      let order = orders.get(charge.teamId);
      if (!order) { order = await getTeamPaymentOrder(charge.teamId); orders.set(charge.teamId, order); }
      if (!order.enabled) continue;
      const decision = order.decision(identity.chargeId);
      if (decision.allowed) continue;
      const outcome = await expireDirectSession(stripe, session.id);
      const event = outcome === "expired" ? "EXPIRED" : "COMPLETED_OUT_OF_ORDER";
      await prisma.$executeRaw(Prisma.sql`
        INSERT INTO "TeamPaymentOrderCheckoutAudit" ("checkoutSessionId", "event", "chargeId", "teamId", "blockingChargeId")
        VALUES (${session.id}, ${event}, ${identity.chargeId}, ${identity.teamId}, ${decision.blocker?.chargeId ?? null})
        ON CONFLICT DO NOTHING
      `);
      if (outcome === "expired") {
        expired++;
        await prisma.paymentCharge.updateMany({
          where: { id: identity.chargeId, lastStripeCheckoutSessionId: session.id },
          data: { lastStripeCheckoutSessionId: null, lastStripeCheckoutUrl: null,
            lastStripeCheckoutCreatedAt: null, lastStripeCheckoutAmountPence: null },
        });
      } else inFlight++;
    }
    const cursor = page.has_more ? page.data.at(-1)?.id ?? null : null;
    await prisma.$executeRaw(Prisma.sql`
      UPDATE "TeamPaymentOrderMaintenance" SET "cursor" = ${cursor}, "leaseUntil" = NULL,
        "lastCheckedAt" = NOW(), "lastFailure" = NULL WHERE "id" = 'open-checkouts'
    `);
    return { checked, expired, inFlight, busy: false, hasMore: page.has_more };
  } catch {
    await prisma.$executeRaw(Prisma.sql`
      UPDATE "TeamPaymentOrderMaintenance" SET "leaseUntil" = NULL,
        "lastFailure" = 'Could not verify payment priority or close an open checkout. Retrying on the next run.'
      WHERE "id" = 'open-checkouts'
    `);
    throw new Error("Team payment-order checkout cleanup failed; no completed payment was moved. Retry required.");
  }
}
