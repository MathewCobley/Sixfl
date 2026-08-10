// ========================================
// File: src/app/captain/team/[teamid]/payments/manage-subscription/route.ts
// ========================================

import { NextResponse } from "next/server";

import {
  getTeamAutoPaySnapshot,
  isConfirmedTeamAutoPaySetup,
} from "@/lib/payments/team-autopay-snapshot";
import { requireCaptain } from "@/lib/requireCaptain";
import { getPublicSiteUrl, getStripeServerClient } from "@/lib/stripe/client";

export const dynamic = "force-dynamic";

function buildReturnUrl(
  teamId: string,
  state?: "missing_customer" | "incomplete",
) {
  const url = new URL(`/captain/team/${teamId}/payments`, `${getPublicSiteUrl()}/`);
  if (state) url.searchParams.set("autopay", state);
  return url.toString();
}

export async function POST(
  _request: Request,
  context: { params: Promise<{ teamid: string }> },
) {
  const { teamid } = await context.params;
  await requireCaptain(teamid);

  const autoPay = await getTeamAutoPaySnapshot(teamid);

  if (!autoPay?.stripeCustomerId) {
    return NextResponse.redirect(buildReturnUrl(teamid, "missing_customer"), 303);
  }

  if (!isConfirmedTeamAutoPaySetup(autoPay)) {
    return NextResponse.redirect(buildReturnUrl(teamid, "incomplete"), 303);
  }

  const stripe = getStripeServerClient();
  const portalSession = await stripe.billingPortal.sessions.create({
    customer: autoPay.stripeCustomerId,
    return_url: buildReturnUrl(teamid),
  });

  return NextResponse.redirect(portalSession.url, 303);
}
