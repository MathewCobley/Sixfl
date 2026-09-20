import { NextResponse } from "next/server";

import {
  applyExistingTeamCreditToChargeFirst,
  getMaximumAdditionalCollectionPence,
  getTeamCreditPolicySnapshot,
} from "@/lib/payments/team-credit-policy";
import { getTeamPaymentOrder } from "@/lib/payments/team-payment-order";
import { reusableTeamChargeCheckout } from "@/lib/payments/team-payment-order-checkouts";
import { prisma } from "@/lib/prisma";
import { requireCaptain } from "@/lib/requireCaptain";
import { getPublicSiteUrl, getStripeServerClient } from "@/lib/stripe/client";

export const dynamic = "force-dynamic";

function paymentsUrl(teamId: string, values?: Record<string, string>) {
  const url = new URL(`/captain/team/${teamId}/payments`, `${getPublicSiteUrl()}/`);
  for (const [key, value] of Object.entries(values ?? {})) url.searchParams.set(key, value);
  return url;
}

function parsePounds(value: FormDataEntryValue | null) {
  const raw = String(value ?? "").replace(/[£,\s]/g, "").trim();
  const pounds = Number(raw);
  if (!Number.isFinite(pounds) || pounds <= 0) return null;
  const pence = Math.round(pounds * 100);
  return Number.isSafeInteger(pence) && pence > 0 ? pence : null;
}

function targetForOrder(order: Awaited<ReturnType<typeof getTeamPaymentOrder>>) {
  if (order.enabled) return order.next;
  return order.ledger.openEntries[0] ?? null;
}

export async function POST(
  request: Request,
  context: { params: Promise<{ teamid: string }> },
) {
  const { teamid } = await context.params;
  await requireCaptain(teamid);

  const formData = await request.formData();
  const requestedAmountPence = parsePounds(formData.get("amount"));
  if (!requestedAmountPence) {
    return NextResponse.redirect(paymentsUrl(teamid, { flexpay: "invalid" }), 303);
  }

  let order = await getTeamPaymentOrder(teamid);
  let target = targetForOrder(order);
  if (!target || target.outstandingPence <= 0) {
    return NextResponse.redirect(paymentsUrl(teamid, { flexpay: "none" }), 303);
  }

  // Keep the existing SIXFL rule: unallocated team credit is consumed before
  // taking more real cash. This also preserves oldest-first settlement.
  await applyExistingTeamCreditToChargeFirst({
    teamId: teamid,
    chargeId: target.chargeId,
    fixtureFeePence: target.amountPence,
    description: `Team credit automatically used before a captain-entered payment for ${target.title}.`,
  });

  order = await getTeamPaymentOrder(teamid);
  target = targetForOrder(order);
  if (!target || target.outstandingPence <= 0) {
    return NextResponse.redirect(paymentsUrl(teamid, { flexpay: "covered" }), 303);
  }

  const creditPolicy = await getTeamCreditPolicySnapshot({
    teamId: teamid,
    fixtureFeePence: target.amountPence,
  });
  const maximumPaymentPence = getMaximumAdditionalCollectionPence({
    outstandingFixturePence: target.outstandingPence,
    creditHeadroomPence: creditPolicy.creditHeadroomPence,
  });

  if (requestedAmountPence > maximumPaymentPence) {
    return NextResponse.redirect(
      paymentsUrl(teamid, {
        flexpay: "too_much",
        max: String(maximumPaymentPence),
      }),
      303,
    );
  }

  const charge = await prisma.paymentCharge.findUnique({
    where: { id: target.chargeId },
    select: {
      id: true,
      teamId: true,
      title: true,
      description: true,
      updatedAt: true,
      lastStripeCheckoutSessionId: true,
      team: {
        select: {
          name: true,
          contactEmail: true,
          secondaryContactEmail: true,
        },
      },
    },
  });
  if (!charge) {
    return NextResponse.redirect(paymentsUrl(teamid, { flexpay: "none" }), 303);
  }

  const stripe = getStripeServerClient();
  const reusable = await reusableTeamChargeCheckout({
    sessionId: charge.lastStripeCheckoutSessionId,
    chargeId: charge.id,
    amountPence: requestedAmountPence,
    stripe,
  });
  if (reusable.paymentPending) {
    return NextResponse.redirect(paymentsUrl(teamid, { flexpay: "pending" }), 303);
  }
  if (reusable.url) return NextResponse.redirect(reusable.url, 303);

  const successUrl = paymentsUrl(teamid, {
    flexpay: "success",
    flexAmount: String(requestedAmountPence),
  }).toString();
  const cancelUrl = paymentsUrl(teamid, { flexpay: "cancelled" }).toString();

  const session = await stripe.checkout.sessions.create(
    {
      mode: "payment",
      client_reference_id: charge.id,
      customer_email:
        charge.team.contactEmail?.trim() ||
        charge.team.secondaryContactEmail?.trim() ||
        undefined,
      success_url: successUrl,
      cancel_url: cancelUrl,
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: "gbp",
            unit_amount: requestedAmountPence,
            product_data: {
              name: `SIXFL team payment – ${charge.team.name}`,
              description: creditPolicy.enabled
                ? `Applied to the oldest outstanding balance first. Any permitted surplus becomes team credit.`
                : `Applied to the oldest outstanding team balance.`,
            },
          },
        },
      ],
      metadata: {
        type: "team_charge",
        paymentOrderPolicy: "oldest-first-v1",
        flexibleCaptainPayment: "1",
        chargeId: charge.id,
        teamId: charge.teamId,
        captainTeamId: teamid,
        requestedAmountPence: String(requestedAmountPence),
      },
      payment_intent_data: {
        metadata: {
          type: "team_charge",
          paymentOrderPolicy: "oldest-first-v1",
          flexibleCaptainPayment: "1",
          chargeId: charge.id,
          teamId: charge.teamId,
          captainTeamId: teamid,
          requestedAmountPence: String(requestedAmountPence),
        },
      },
    },
    {
      idempotencyKey: `sixfl-captain-flex-${charge.id}-${requestedAmountPence}-${charge.updatedAt.getTime()}`,
    },
  );

  if (!session.url) {
    return NextResponse.redirect(paymentsUrl(teamid, { flexpay: "stripe_error" }), 303);
  }

  await prisma.paymentCharge.update({
    where: { id: charge.id },
    data: {
      lastStripeCheckoutSessionId: session.id,
      lastStripeCheckoutUrl: session.url,
      lastStripeCheckoutCreatedAt: new Date(),
      lastStripeCheckoutAmountPence: requestedAmountPence,
    },
  });

  return NextResponse.redirect(session.url, 303);
}
