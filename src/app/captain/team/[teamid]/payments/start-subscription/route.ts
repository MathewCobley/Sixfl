// ========================================
// File: src/app/captain/team/[teamid]/payments/start-subscription/route.ts
// ========================================

import { NextResponse } from "next/server";

import { requireCaptain } from "@/lib/requireCaptain";
import { getPublicSiteUrl } from "@/lib/stripe/client";

export const dynamic = "force-dynamic";

function buildReturnUrl(teamId: string) {
  const url = new URL(`/captain/team/${teamId}/payments`, `${getPublicSiteUrl()}/`);
  url.searchParams.set("subscription", "matchday_only");
  return url.toString();
}

export async function POST(
  _request: Request,
  context: { params: Promise<{ teamid: string }> },
) {
  const { teamid } = await context.params;
  await requireCaptain(teamid);

  // Recurring Stripe subscriptions are not safe for match-fee collection because
  // Stripe renews on its own schedule. SIXFL match fees must only be collected
  // on the actual matchday, so new/replacement subscription setup is disabled.
  return NextResponse.redirect(buildReturnUrl(teamid), 303);
}
