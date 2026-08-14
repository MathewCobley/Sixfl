import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";

import { ensureCaptainCollectedRemittanceTable } from "@/lib/payments/captain-collected-remittance";
import { getTeamPaymentLedger } from "@/lib/payments/team-payment-ledger";
import { prisma } from "@/lib/prisma";
import { requireCaptain } from "@/lib/requireCaptain";
import { getPublicSiteUrl, getStripeServerClient } from "@/lib/stripe/client";

export const dynamic = "force-dynamic";

function paymentsUrl(teamId: string, state: string) {
  const url = new URL(`/captain/team/${teamId}/payments`, `${getPublicSiteUrl()}/`);
  url.searchParams.set("remit", state);
  return url;
}

async function cancelPendingCheckouts(teamId: string, requestedChargeId?: string | null) {
  await ensureCaptainCollectedRemittanceTable();

  const ledger = await getTeamPaymentLedger(teamId);
  if (!ledger) return "not_available";

  const eligibleChargeIds = Array.from(
    new Set(
      ledger.entries
        .filter((entry) => Boolean(entry.fixtureId))
        .map((entry) => entry.chargeId),
    ),
  );

  if (eligibleChargeIds.length === 0 || ledger.relatedTeamIds.length === 0) {
    return "released";
  }

  const chargeId = requestedChargeId?.trim() || null;
  if (chargeId && !eligibleChargeIds.includes(chargeId)) {
    return "not_available";
  }

  const targetChargeIds = chargeId ? [chargeId] : eligibleChargeIds;
  const pendingRows = await prisma.$queryRaw<
    Array<{ checkoutSessionId: string; chargeId: string }>
  >(Prisma.sql`
    SELECT
      remittance."checkoutSessionId",
      remittance."chargeId"
    FROM "CaptainCollectedRemittanceCheckout" remittance
    LEFT JOIN "PaymentTransaction" payment
      ON payment."stripeCheckoutSessionId" = remittance."checkoutSessionId"
    WHERE remittance."chargeId" IN (${Prisma.join(targetChargeIds)})
      AND remittance."teamId" IN (${Prisma.join(ledger.relatedTeamIds)})
      AND payment."id" IS NULL
    ORDER BY remittance."createdAt" DESC
  `);

  if (pendingRows.length === 0) return "released";

  const stripe = getStripeServerClient();
  let releasedAny = false;
  let stillProcessing = false;

  for (const pending of pendingRows) {
    try {
      const session = await stripe.checkout.sessions.retrieve(
        pending.checkoutSessionId,
      );

      if (session.payment_status === "paid" || session.status === "complete") {
        stillProcessing = true;
        continue;
      }

      if (session.status === "open") {
        await stripe.checkout.sessions.expire(pending.checkoutSessionId);
      }

      await prisma.$executeRaw(Prisma.sql`
        DELETE FROM "CaptainCollectedRemittanceCheckout"
        WHERE "checkoutSessionId" = ${pending.checkoutSessionId}
          AND NOT EXISTS (
            SELECT 1
            FROM "PaymentTransaction" payment
            WHERE payment."stripeCheckoutSessionId" = ${pending.checkoutSessionId}
          )
      `);

      releasedAny = true;
    } catch (error) {
      console.error("Could not cancel captain collected remittance checkout", {
        teamId,
        chargeId: pending.chargeId,
        checkoutSessionId: pending.checkoutSessionId,
        error,
      });
      stillProcessing = true;
    }
  }

  if (stillProcessing) return "processing";
  return releasedAny ? "released" : "processing";
}

async function getRequestedChargeId(request: Request) {
  if (request.method === "POST") {
    const formData = await request.formData();
    return String(formData.get("chargeId") ?? "").trim() || null;
  }

  return new URL(request.url).searchParams.get("chargeId")?.trim() || null;
}

async function handleCancellation(teamId: string, request: Request) {
  await requireCaptain(teamId);
  const chargeId = await getRequestedChargeId(request);
  const state = await cancelPendingCheckouts(teamId, chargeId);
  return NextResponse.redirect(paymentsUrl(teamId, state), 303);
}

export async function GET(
  request: Request,
  context: { params: Promise<{ teamid: string }> },
) {
  const { teamid } = await context.params;
  return handleCancellation(teamid, request);
}

export async function POST(
  request: Request,
  context: { params: Promise<{ teamid: string }> },
) {
  const { teamid } = await context.params;
  return handleCancellation(teamid, request);
}
