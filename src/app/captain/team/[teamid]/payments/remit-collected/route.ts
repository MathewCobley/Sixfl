import { NextResponse } from "next/server";

import { getCaptainCollectedRemittanceSnapshot } from "@/lib/payments/captain-collected-remittance";
import { getTeamPaymentLedger } from "@/lib/payments/team-payment-ledger";
import { prisma } from "@/lib/prisma";
import { requireCaptain } from "@/lib/requireCaptain";
import { getPublicSiteUrl, getStripeServerClient } from "@/lib/stripe/client";

export const dynamic = "force-dynamic";

function paymentsUrl(teamId: string, values?: Record<string, string>) {
  const url = new URL(`/captain/team/${teamId}/payments`, `${getPublicSiteUrl()}/`);
  for (const [key, value] of Object.entries(values ?? {})) {
    url.searchParams.set(key, value);
  }
  return url;
}

function remittanceCancelUrl(teamId: string, chargeId: string) {
  const url = new URL(
    `/captain/team/${teamId}/payments/remit-collected/cancel`,
    `${getPublicSiteUrl()}/`,
  );
  url.searchParams.set("chargeId", chargeId);
  return url.toString();
}

function parsePounds(value: FormDataEntryValue | null) {
  const raw = String(value ?? "").replace(/[£,\s]/g, "").trim();
  const amount = Number(raw);
  if (!Number.isFinite(amount) || amount <= 0) return null;
  return Math.round(amount * 100);
}

export async function POST(
  request: Request,
  context: { params: Promise<{ teamid: string }> },
) {
  const { teamid } = await context.params;
  await requireCaptain(teamid);

  const formData = await request.formData();
  const chargeId = String(formData.get("chargeId") ?? "").trim();
  const requestedAmountPence = parsePounds(formData.get("amount"));

  if (!chargeId || !requestedAmountPence) {
    return NextResponse.redirect(
      paymentsUrl(teamid, { remit: "invalid_amount" }),
      303,
    );
  }

  const ledger = await getTeamPaymentLedger(teamid);
  const entry = ledger?.entries.find((candidate) => candidate.chargeId === chargeId) ?? null;

  if (
    !ledger ||
    !entry ||
    !entry.fixtureId ||
    entry.displayStatus === "PAID" ||
    entry.displayStatus === "VOID" ||
    entry.outstandingPence <= 0
  ) {
    return NextResponse.redirect(
      paymentsUrl(teamid, { remit: "not_available" }),
      303,
    );
  }

  const snapshot = await getCaptainCollectedRemittanceSnapshot({
    chargeId: entry.chargeId,
    teamId: entry.teamId,
    fixtureId: entry.fixtureId,
  });
  const maximumRemittancePence = Math.min(
    snapshot.availablePence,
    entry.outstandingPence,
  );

  if (
    maximumRemittancePence <= 0 ||
    requestedAmountPence > maximumRemittancePence
  ) {
    return NextResponse.redirect(
      paymentsUrl(teamid, {
        remit: "too_much",
        max: String(maximumRemittancePence),
      }),
      303,
    );
  }

  const payingTeam = await prisma.team.findUnique({
    where: { id: entry.teamId },
    select: {
      contactEmail: true,
      secondaryContactEmail: true,
    },
  });

  const stripe = getStripeServerClient();
  const successUrl = paymentsUrl(teamid, {
    remit: "success",
    amount: String(requestedAmountPence),
  }).toString();
  const cancelUrl = remittanceCancelUrl(teamid, entry.chargeId);

  const session = await stripe.checkout.sessions.create({
    mode: "payment",
    client_reference_id: entry.chargeId,
    customer_email:
      payingTeam?.contactEmail?.trim() ||
      payingTeam?.secondaryContactEmail?.trim() ||
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
            name: "Player money collected by captain",
            description: `${entry.fixtureLabel} — partial payment towards the SIXFL fixture charge`,
          },
        },
      },
    ],
    metadata: {
      type: "captain_collected_remittance",
      chargeId: entry.chargeId,
      fixtureId: entry.fixtureId,
      teamId: entry.teamId,
      dashboardTeamId: teamid,
      remittanceAmountPence: String(requestedAmountPence),
    },
    payment_intent_data: {
      metadata: {
        type: "captain_collected_remittance",
        chargeId: entry.chargeId,
        fixtureId: entry.fixtureId,
        teamId: entry.teamId,
        dashboardTeamId: teamid,
        remittanceAmountPence: String(requestedAmountPence),
      },
    },
  });

  if (!session.url) {
    return NextResponse.redirect(
      paymentsUrl(teamid, { remit: "stripe_error" }),
      303,
    );
  }

  await prisma.$executeRaw`
    INSERT INTO "CaptainCollectedRemittanceCheckout" (
      "checkoutSessionId",
      "teamId",
      "chargeId",
      "fixtureId",
      "amountPence"
    ) VALUES (
      ${session.id},
      ${entry.teamId},
      ${entry.chargeId},
      ${entry.fixtureId},
      ${requestedAmountPence}
    )
    ON CONFLICT ("checkoutSessionId") DO NOTHING
  `;

  return NextResponse.redirect(session.url, 303);
}
