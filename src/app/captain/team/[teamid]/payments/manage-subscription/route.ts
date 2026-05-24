// ========================================
// File: src/app/captain/team/[teamid]/payments/manage-subscription/route.ts
// ========================================

import { NextResponse } from "next/server";

import { getTeamSubscriptionSnapshot } from "@/lib/payments/team-subscriptions";
import { requireCaptain } from "@/lib/requireCaptain";
import { getPublicSiteUrl, getStripeServerClient } from "@/lib/stripe/client";

export const dynamic = "force-dynamic";

function buildReturnUrl(teamId: string, state?: "missing_customer") {
  const url = new URL(`/captain/team/${teamId}/payments`, `${getPublicSiteUrl()}/`);
  if (state) url.searchParams.set("subscription", state);
  return url.toString();
}

export async function POST(
  _request: Request,
  context: { params: Promise<{ teamid: string }> },
) {
  const { teamid } = await context.params;
  await requireCaptain(teamid);

  const subscription = await getTeamSubscriptionSnapshot(teamid);

  if (!subscription?.stripeCustomerId) {
    return NextResponse.redirect(buildReturnUrl(teamid, "missing_customer"), 303);
  }

  const stripe = getStripeServerClient();
  const portalSession = await stripe.billingPortal.sessions.create({
    customer: subscription.stripeCustomerId,
    return_url: buildReturnUrl(teamid),
  });

  return NextResponse.redirect(portalSession.url, 303);
}
