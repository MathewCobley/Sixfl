// ========================================
// File: src/app/pay/player-match-fee/[token]/start/route.ts
// ========================================

import { NextResponse } from "next/server";
import { PlayerMatchFeeStatus } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { getPublicSiteUrl, getStripeServerClient } from "@/lib/stripe/client";

export const dynamic = "force-dynamic";

function buildReturnUrl(input: {
  teamId: string;
  paymentToken: string;
  state: "success" | "cancelled" | "already_paid" | "not_available";
}) {
  const url = new URL(`/player/team/${input.teamId}`, `${getPublicSiteUrl()}/`);
  url.searchParams.set("payment", input.state);
  url.searchParams.set("playerFee", input.paymentToken);
  return url.toString();
}

export async function POST(
  _request: Request,
  context: { params: Promise<{ token: string }> },
) {
  const { token } = await context.params;

  const fee = await prisma.playerMatchFee.findUnique({
    where: { paymentToken: token },
    select: {
      id: true,
      amountPence: true,
      status: true,
      paymentToken: true,
      lastChasedAt: true,
      team: {
        select: {
          id: true,
          name: true,
        },
      },
      fixture: {
        select: {
          id: true,
          homeTeam: { select: { name: true } },
          awayTeam: { select: { name: true } },
          league: { select: { name: true } },
        },
      },
      teamMember: {
        select: {
          user: {
            select: {
              email: true,
              name: true,
            },
          },
        },
      },
      prospect: {
        select: {
          email: true,
          firstName: true,
          lastName: true,
        },
      },
    },
  });

  if (!fee?.paymentToken) {
    return NextResponse.redirect(new URL("/", `${getPublicSiteUrl()}/`), 303);
  }

  if (fee.status === PlayerMatchFeeStatus.PAID) {
    return NextResponse.redirect(
      buildReturnUrl({
        teamId: fee.team.id,
        paymentToken: token,
        state: "already_paid",
      }),
      303,
    );
  }

  if (fee.status !== PlayerMatchFeeStatus.OPEN || fee.amountPence <= 0) {
    return NextResponse.redirect(
      buildReturnUrl({
        teamId: fee.team.id,
        paymentToken: token,
        state: "not_available",
      }),
      303,
    );
  }

  const customerEmail =
    fee.teamMember?.user.email?.trim() || fee.prospect?.email?.trim() || undefined;
  const playerName =
    fee.teamMember?.user.name?.trim() ||
    [fee.prospect?.firstName, fee.prospect?.lastName].filter(Boolean).join(" ").trim() ||
    customerEmail ||
    "Player";
  const fixtureName = `${fee.fixture.homeTeam.name} vs ${fee.fixture.awayTeam.name}`;

  const stripe = getStripeServerClient();
  const session = await stripe.checkout.sessions.create({
    mode: "payment",
    client_reference_id: fee.id,
    customer_email: customerEmail,
    success_url: buildReturnUrl({
      teamId: fee.team.id,
      paymentToken: token,
      state: "success",
    }),
    cancel_url: buildReturnUrl({
      teamId: fee.team.id,
      paymentToken: token,
      state: "cancelled",
    }),
    line_items: [
      {
        quantity: 1,
        price_data: {
          currency: "gbp",
          unit_amount: fee.amountPence,
          product_data: {
            name: `SIXFL player match fee - ${playerName}`,
            description: `${fixtureName} · ${fee.fixture.league.name}`,
          },
        },
      },
    ],
    metadata: {
      playerMatchFeeId: fee.id,
      fixtureId: fee.fixture.id,
      teamId: fee.team.id,
      paymentToken: token,
      paymentType: "PLAYER_MATCH_FEE",
    },
    payment_intent_data: {
      metadata: {
        playerMatchFeeId: fee.id,
        fixtureId: fee.fixture.id,
        teamId: fee.team.id,
        paymentToken: token,
        paymentType: "PLAYER_MATCH_FEE",
      },
    },
  });

  if (!session.url) {
    throw new Error("Stripe checkout URL was not returned.");
  }

  return NextResponse.redirect(session.url, 303);
}
