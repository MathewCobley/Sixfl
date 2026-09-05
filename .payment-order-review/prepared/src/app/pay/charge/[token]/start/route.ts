// ========================================
// File: src/app/pay/charge/[token]/start/route.ts
// ========================================

import { PlayerMatchFeeStatus } from "@prisma/client";
import { NextResponse } from "next/server";

import { summariseChargesWithPlayerMatchFees } from "@/lib/payments/charge-summary";
import { prisma } from "@/lib/prisma";
import { applyExistingTeamCreditToChargeFirst } from "@/lib/payments/team-credit-policy";
import { getPublicSiteUrl, getStripeServerClient } from "@/lib/stripe/client";

export const dynamic = "force-dynamic";

function buildReturnPath(input: {
  leagueSlug: string | null;
  paymentToken: string;
  state: "success" | "cancelled" | "already_paid" | "not_available";
}) {
  const path = input.leagueSlug ? `/leagues/${input.leagueSlug}/fixtures` : "/";
  const url = new URL(path, `${getPublicSiteUrl()}/`);
  url.searchParams.set("payment", input.state);
  url.searchParams.set("charge", input.paymentToken);
  return url.toString();
}

export async function POST(
  _request: Request,
  context: { params: Promise<{ token: string }> },
) {
  const { token } = await context.params;

  const charge = await prisma.paymentCharge.findUnique({
    where: {
      paymentToken: token,
    },
    include: {
      transactions: {
        select: {
          amountPence: true,
          notes: true,
        },
      },
      team: {
        select: {
          id: true,
          name: true,
          contactEmail: true,
          secondaryContactEmail: true,
        },
      },
      fixture: {
        select: {
          id: true,
          status: true,
          league: {
            select: {
              slug: true,
              name: true,
            },
          },
        },
      },
    },
  });

  if (!charge) {
    return NextResponse.redirect(new URL("/", `${getPublicSiteUrl()}/`), 303);
  }

  const playerMatchFees = charge.fixtureId
    ? await prisma.playerMatchFee.findMany({
        where: {
          teamId: charge.teamId,
          fixtureId: charge.fixtureId,
          status: { in: [PlayerMatchFeeStatus.PAID, PlayerMatchFeeStatus.WAIVED] },
        },
        select: { fixtureId: true, amountPence: true, status: true, note: true },
      })
    : [];
  const chargeAmountPence = charge.amountPence;
  const chargeFixtureId = charge.fixtureId;
  const chargeStatus = charge.status;
  const chargeDescription = charge.description;

  function getWaiverAwareOutstandingPence(
    transactions: Array<{ amountPence: number; notes?: string | null }>,
  ) {
    const [summary] = summariseChargesWithPlayerMatchFees(
      [
        {
          amountPence: chargeAmountPence,
          fixtureId: chargeFixtureId,
          status: chargeStatus,
          description: chargeDescription,
          transactions,
        },
      ],
      playerMatchFees,
    );
    return summary?.outstandingPence ?? chargeAmountPence;
  }

  let outstandingPence = getWaiverAwareOutstandingPence(charge.transactions);

  if (charge.status === "VOID") {
    return NextResponse.redirect(
      buildReturnPath({
        leagueSlug: charge.fixture?.league?.slug ?? null,
        paymentToken: token,
        state: "not_available",
      }),
      303,
    );
  }

  if (charge.fixtureId) {
    const fixtureStillPayable = charge.fixture?.status === "SCHEDULED" || charge.fixture?.status === "COMPLETED";

    if (!fixtureStillPayable) {
      return NextResponse.redirect(
        buildReturnPath({
          leagueSlug: charge.fixture?.league?.slug ?? null,
          paymentToken: token,
          state: "not_available",
        }),
        303,
      );
    }
  }

  if (charge.fixtureId) {
    await applyExistingTeamCreditToChargeFirst({
      teamId: charge.teamId,
      chargeId: charge.id,
      fixtureFeePence: charge.amountPence,
      description: `Team credit automatically used against ${charge.title} before Stripe payment.`,
    });

    const refreshedTransactions = await prisma.paymentTransaction.findMany({
      where: { chargeId: charge.id },
      select: { amountPence: true, notes: true },
    });
    outstandingPence = getWaiverAwareOutstandingPence(refreshedTransactions);
  }

  if (outstandingPence <= 0) {
    return NextResponse.redirect(
      buildReturnPath({
        leagueSlug: charge.fixture?.league?.slug ?? null,
        paymentToken: token,
        state: "already_paid",
      }),
      303,
    );
  }

  const canReuseExistingSession =
    charge.lastStripeCheckoutUrl &&
    charge.lastStripeCheckoutCreatedAt &&
    charge.lastStripeCheckoutAmountPence === outstandingPence &&
    Date.now() - charge.lastStripeCheckoutCreatedAt.getTime() <
      20 * 60 * 60 * 1000;

  if (canReuseExistingSession) {
    return NextResponse.redirect(charge.lastStripeCheckoutUrl!, 303);
  }

  const stripe = getStripeServerClient();

  const session = await stripe.checkout.sessions.create({
    mode: "payment",
    client_reference_id: charge.id,
    customer_email:
      charge.team.contactEmail?.trim() ||
      charge.team.secondaryContactEmail?.trim() ||
      undefined,
    success_url: buildReturnPath({
      leagueSlug: charge.fixture?.league?.slug ?? null,
      paymentToken: token,
      state: "success",
    }),
    cancel_url: buildReturnPath({
      leagueSlug: charge.fixture?.league?.slug ?? null,
      paymentToken: token,
      state: "cancelled",
    }),
    line_items: [
      {
        quantity: 1,
        price_data: {
          currency: "gbp",
          unit_amount: outstandingPence,
          product_data: {
            name: charge.title,
            description: charge.description || undefined,
          },
        },
      },
    ],
    metadata: {
      chargeId: charge.id,
      fixtureId: charge.fixtureId ?? "",
      teamId: charge.teamId,
      paymentToken: token,
    },
    payment_intent_data: {
      metadata: {
        chargeId: charge.id,
        fixtureId: charge.fixtureId ?? "",
        teamId: charge.teamId,
        paymentToken: token,
      },
    },
  });

  if (!session.url) {
    throw new Error("Stripe checkout URL was not returned.");
  }

  await prisma.paymentCharge.update({
    where: {
      id: charge.id,
    },
    data: {
      lastStripeCheckoutSessionId: session.id,
      lastStripeCheckoutUrl: session.url,
      lastStripeCheckoutCreatedAt: new Date(),
      lastStripeCheckoutAmountPence: outstandingPence,
    },
  });

  return NextResponse.redirect(session.url, 303);
}
