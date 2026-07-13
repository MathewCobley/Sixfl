// ========================================
// File: src/app/captain/team/[teamid]/payments/start-subscription/route.ts
// ========================================

import { NextResponse } from "next/server";

import { TEAM_AUTOPAY_MANDATE_TEXT } from "@/lib/payments/team-autopay";
import { prisma } from "@/lib/prisma";
import { requireCaptain } from "@/lib/requireCaptain";
import { getPublicSiteUrl, getStripeServerClient } from "@/lib/stripe/client";

export const dynamic = "force-dynamic";

function buildReturnUrl(teamId: string, state: "success" | "cancelled" | "missing_team") {
  const url = new URL(`/captain/team/${teamId}/payments`, `${getPublicSiteUrl()}/`);
  url.searchParams.set("autopay", state);
  return url.toString();
}

function getStripeId(value: unknown) {
  if (typeof value === "string") return value;
  if (value && typeof value === "object" && "id" in value) {
    const id = (value as { id?: unknown }).id;
    return typeof id === "string" ? id : null;
  }
  return null;
}

export async function POST(
  _request: Request,
  context: { params: Promise<{ teamid: string }> },
) {
  const { teamid } = await context.params;
  await requireCaptain(teamid);

  const team = await prisma.team.findUnique({
    where: { id: teamid },
    select: {
      id: true,
      name: true,
      contactEmail: true,
      secondaryContactEmail: true,
      stripeCustomerId: true,
    },
  });

  if (!team) {
    return NextResponse.redirect(buildReturnUrl(teamid, "missing_team"), 303);
  }

  const stripe = getStripeServerClient();
  const successUrl = buildReturnUrl(team.id, "success");
  const cancelUrl = buildReturnUrl(team.id, "cancelled");
  const customerEmail = team.contactEmail?.trim() || team.secondaryContactEmail?.trim() || undefined;
  let stripeCustomerId = team.stripeCustomerId?.trim() || null;

  if (!stripeCustomerId) {
    const customer = await stripe.customers.create({
      email: customerEmail,
      name: team.name,
      metadata: {
        type: "team",
        teamId: team.id,
      },
    });
    stripeCustomerId = customer.id;

    await prisma.$executeRaw`
      UPDATE "Team"
      SET "stripeCustomerId" = ${stripeCustomerId}
      WHERE "id" = ${team.id}
    `;
  }

  const session = await stripe.checkout.sessions.create({
    mode: "setup",
    client_reference_id: team.id,
    customer: stripeCustomerId,
    success_url: successUrl,
    cancel_url: cancelUrl,
    payment_method_types: ["card"],
    metadata: {
      type: "team_autopay_setup",
      teamId: team.id,
      mandateText: TEAM_AUTOPAY_MANDATE_TEXT,
    },
    setup_intent_data: {
      metadata: {
        type: "team_autopay_setup",
        teamId: team.id,
        teamName: team.name,
        mandateText: TEAM_AUTOPAY_MANDATE_TEXT,
      },
    },
    custom_text: {
      submit: {
        message: TEAM_AUTOPAY_MANDATE_TEXT,
      },
    },
  });

  if (!session.url) {
    throw new Error("Stripe saved-card setup URL was not returned.");
  }

  await prisma.$executeRaw`
    UPDATE "Team"
    SET "autoPaySetupCheckoutSessionId" = ${session.id}
    WHERE "id" = ${team.id}
  `;

  return NextResponse.redirect(session.url, 303);
}
