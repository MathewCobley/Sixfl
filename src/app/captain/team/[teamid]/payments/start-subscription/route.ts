// ========================================
// File: src/app/captain/team/[teamid]/payments/start-subscription/route.ts
// ========================================

import { NextResponse } from "next/server";

import {
  getTeamSubscriptionPriceId,
  getTeamSubscriptionSnapshot,
} from "@/lib/payments/team-subscriptions";
import { prisma } from "@/lib/prisma";
import { requireCaptain } from "@/lib/requireCaptain";
import { getPublicSiteUrl, getStripeServerClient } from "@/lib/stripe/client";

export const dynamic = "force-dynamic";

function buildReturnUrl(teamId: string, state: "success" | "cancelled" | "active" | "missing_price") {
  const url = new URL(`/captain/team/${teamId}/payments`, `${getPublicSiteUrl()}/`);
  url.searchParams.set("subscription", state);
  return url.toString();
}

function isSubscriptionActive(status: string | null | undefined) {
  return ["active", "trialing", "past_due", "unpaid", "incomplete"].includes(status ?? "");
}

export async function POST(
  _request: Request,
  context: { params: Promise<{ teamid: string }> },
) {
  const { teamid } = await context.params;
  await requireCaptain(teamid);

  let priceId: string;

  try {
    priceId = getTeamSubscriptionPriceId();
  } catch {
    return NextResponse.redirect(buildReturnUrl(teamid, "missing_price"), 303);
  }

  const [team, subscription] = await Promise.all([
    prisma.team.findUnique({
      where: { id: teamid },
      select: {
        id: true,
        name: true,
        contactEmail: true,
        secondaryContactEmail: true,
        leagueId: true,
        league: {
          select: {
            name: true,
            season: true,
          },
        },
      },
    }),
    getTeamSubscriptionSnapshot(teamid),
  ]);

  if (!team) {
    return NextResponse.redirect(new URL("/captain", `${getPublicSiteUrl()}/`), 303);
  }

  if (subscription?.stripeSubscriptionId && isSubscriptionActive(subscription.subscriptionStatus)) {
    return NextResponse.redirect(buildReturnUrl(teamid, "active"), 303);
  }

  const stripe = getStripeServerClient();
  const returnUrl = buildReturnUrl(teamid, "success");
  const cancelUrl = buildReturnUrl(teamid, "cancelled");
  const customerEmail =
    team.contactEmail?.trim() || team.secondaryContactEmail?.trim() || undefined;
  const description = team.league?.name
    ? `${team.name} · ${team.league.name}${team.league.season ? ` ${team.league.season}` : ""}`
    : team.name;

  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    client_reference_id: team.id,
    customer: subscription?.stripeCustomerId || undefined,
    customer_email: subscription?.stripeCustomerId ? undefined : customerEmail,
    success_url: returnUrl,
    cancel_url: cancelUrl,
    line_items: [
      {
        price: priceId,
        quantity: 1,
      },
    ],
    metadata: {
      type: "team_subscription",
      teamId: team.id,
      leagueId: team.leagueId ?? "",
    },
    subscription_data: {
      metadata: {
        type: "team_subscription",
        teamId: team.id,
        leagueId: team.leagueId ?? "",
        teamName: team.name,
      },
      description,
    },
  });

  if (!session.url) {
    throw new Error("Stripe subscription checkout URL was not returned.");
  }

  return NextResponse.redirect(session.url, 303);
}
