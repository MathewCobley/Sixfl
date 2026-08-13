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

async function cancelPendingCheckouts(teamId: string) {
  await ensureCaptainCollectedRemittanceTable();

  const ledger = await getTeamPaymentLedger(teamId);
  if (!ledger) return "not_available";

  const chargeIds = Array.from(
    new Set(ledger.entries.filter((entry) => Boolean(entry.fixtureId)).map((entry) => entry.chargeId)),
  );
  if (chargeIds.length === 0 || ledger.relatedTeamIds.length === 0) return "cancelled";

  const pendingRows = await prisma.$queryRaw<Array<{ checkoutSessionId: string }>>(Prisma.sql`
    SELECT remittance."checkoutSessionId"
    FROM "CaptainCollectedRemittanceCheckout" remittance
    LEFT JOIN "PaymentTransaction" payment
      ON payment."stripeCheckoutSessionId" = remittance."checkoutSessionId"
    WHERE remittance."chargeId" IN (${Prisma.join(chargeIds)})
      AND remittance."teamId" IN (${Prisma.join(ledger.relatedTeamIds)})
      AND payment."id" IS NULL
  `);

  if (pendingRows.length === 0) return "cancelled";

  const stripe = getStripeServerClient();
  let released = 0;

  for (const row of pendingRows) {
    try {
      const session = await stripe.checkout.sessions.retrieve(row.checkoutSessionId);

      if (session.payment_status === "paid" || session.status === "complete") {
        continue;
      }

      if (session.status === "open") {
        await stripe.checkout.sessions.expire(row.checkoutSessionId);
      }

      await prisma.$executeRaw(Prisma.sql`
        DELETE FROM "CaptainCollectedRemittanceCheckout"
        WHERE "checkoutSessionId" = ${row.checkoutSessionId}
          AND NOT EXISTS (
            SELECT 1
            FROM "PaymentTransaction" payment
            WHERE payment."stripeCheckoutSessionId" = ${row.checkoutSessionId}
          )
      `);
      released += 1;
    } catch (error) {
      console.error("Could not cancel captain collected remittance checkout", {
        teamId,
        checkoutSessionId: row.checkoutSessionId,
        error,
      });
    }
  }

  return released > 0 ? "cancelled" : "processing";
}

async function handleCancellation(teamId: string) {
  await requireCaptain(teamId);
  const state = await cancelPendingCheckouts(teamId);
  return NextResponse.redirect(paymentsUrl(teamId, state), 303);
}

export async function GET(
  _request: Request,
  context: { params: Promise<{ teamid: string }> },
) {
  const { teamid } = await context.params;
  return handleCancellation(teamid);
}

export async function POST(
  _request: Request,
  context: { params: Promise<{ teamid: string }> },
) {
  const { teamid } = await context.params;
  return handleCancellation(teamid);
}
