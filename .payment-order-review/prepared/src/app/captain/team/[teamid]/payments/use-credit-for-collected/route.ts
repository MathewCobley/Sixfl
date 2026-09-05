import { randomUUID } from "crypto";
import { PaymentChargeStatus, PaymentMethod, Prisma } from "@prisma/client";
import { NextResponse } from "next/server";

import { getDisplayChargeStatus } from "@/lib/payments/charge-summary";
import {
  CAPTAIN_COLLECTED_NOTE_MARKERS,
  ensureCaptainCollectedRemittanceTable,
} from "@/lib/payments/captain-collected-remittance";
import { getTeamCreditLedger } from "@/lib/payments/team-credits";
import { getTeamPaymentLedger } from "@/lib/payments/team-payment-ledger";
import { prisma } from "@/lib/prisma";
import { requireCaptain } from "@/lib/requireCaptain";
import { getPublicSiteUrl } from "@/lib/stripe/client";

export const dynamic = "force-dynamic";

function paymentsUrl(teamId: string, values?: Record<string, string>) {
  const url = new URL(`/captain/team/${teamId}/payments`, `${getPublicSiteUrl()}/`);
  for (const [key, value] of Object.entries(values ?? {})) {
    url.searchParams.set(key, value);
  }
  return url;
}

export async function POST(
  request: Request,
  context: { params: Promise<{ teamid: string }> },
) {
  const { teamid } = await context.params;
  await requireCaptain(teamid);

  const formData = await request.formData();
  const chargeId = String(formData.get("chargeId") ?? "").trim();

  if (!chargeId) {
    return NextResponse.redirect(
      paymentsUrl(teamid, { collectedCredit: "invalid" }),
      303,
    );
  }

  const ledger = await getTeamPaymentLedger(teamid);
  const entry = ledger?.entries.find((candidate) => candidate.chargeId === chargeId) ?? null;

  if (!ledger || !entry || !entry.fixtureId || entry.displayStatus === "PAID" || entry.displayStatus === "VOID") {
    return NextResponse.redirect(
      paymentsUrl(teamid, { collectedCredit: "not_available" }),
      303,
    );
  }

  await ensureCaptainCollectedRemittanceTable();

  try {
    const result = await prisma.$transaction(async (tx) => {
      await tx.$queryRaw(Prisma.sql`
        SELECT pg_advisory_xact_lock(hashtext(${`captain-collected-credit:${chargeId}`}))
      `);

      const chargeRows = await tx.$queryRaw<
        Array<{
          id: string;
          teamId: string;
          fixtureId: string;
          amountPence: number;
          status: PaymentChargeStatus;
        }>
      >(Prisma.sql`
        SELECT
          pc."id",
          pc."teamId",
          pc."fixtureId",
          pc."amountPence",
          pc."status"
        FROM "PaymentCharge" pc
        JOIN "Team" team ON team."id" = pc."teamId"
        LEFT JOIN "Fixture" fixture ON fixture."id" = pc."fixtureId"
        WHERE pc."id" = ${chargeId}
          AND pc."fixtureId" IS NOT NULL
          AND pc."status" <> 'VOID'::"PaymentChargeStatus"
          AND team."teamMode"::text = 'STANDARD'
          AND (
            team."standardCreditStartedAt" IS NULL
            OR COALESCE(fixture."kickoffAt", pc."dueDate", pc."createdAt") >= team."standardCreditStartedAt"
          )
        FOR UPDATE OF pc
      `);

      const charge = chargeRows[0];
      if (!charge || !ledger.relatedTeamIds.includes(charge.teamId)) {
        return { amountUsedPence: 0, reason: "not_available" as const };
      }

      const creditLedger = await getTeamCreditLedger(ledger.relatedTeamIds, tx);
      const creditBalancePence = Math.max(creditLedger.balancePence, 0);

      if (!creditLedger.teamIds.includes(charge.teamId) || creditBalancePence <= 0) {
        return { amountUsedPence: 0, reason: "no_credit" as const };
      }

      const [directPaid, playerPaid, collected] = await Promise.all([
        tx.paymentTransaction.aggregate({
          where: { chargeId: charge.id },
          _sum: { amountPence: true },
        }),
        tx.playerMatchFee.aggregate({
          where: {
            teamId: charge.teamId,
            fixtureId: charge.fixtureId,
            status: "PAID",
          },
          _sum: { amountPence: true },
        }),
        tx.playerMatchFee.aggregate({
          where: {
            teamId: charge.teamId,
            fixtureId: charge.fixtureId,
            status: "WAIVED",
            OR: CAPTAIN_COLLECTED_NOTE_MARKERS.map((marker) => ({
              note: { contains: marker, mode: "insensitive" as const },
            })),
          },
          _sum: { amountPence: true },
        }),
      ]);

      const [remittanceTotals] = await tx.$queryRaw<
        Array<{ settledPence: number; pendingPence: number }>
      >(Prisma.sql`
        SELECT
          COALESCE(SUM(
            CASE WHEN payment."id" IS NOT NULL THEN remittance."amountPence" ELSE 0 END
          ), 0)::int AS "settledPence",
          COALESCE(SUM(
            CASE
              WHEN payment."id" IS NULL
                AND remittance."createdAt" >= CURRENT_TIMESTAMP - INTERVAL '24 hours'
              THEN remittance."amountPence"
              ELSE 0
            END
          ), 0)::int AS "pendingPence"
        FROM "CaptainCollectedRemittanceCheckout" remittance
        LEFT JOIN "PaymentTransaction" payment
          ON payment."stripeCheckoutSessionId" = remittance."checkoutSessionId"
        WHERE remittance."chargeId" = ${charge.id}
      `);

      const paidPence = Number(directPaid._sum.amountPence ?? 0);
      const playerPaidPence = Number(playerPaid._sum.amountPence ?? 0);
      const collectedPence = Number(collected._sum.amountPence ?? 0);
      const settledPence = Number(remittanceTotals?.settledPence ?? 0);
      const pendingPence = Number(remittanceTotals?.pendingPence ?? 0);
      const currentOutstandingPence = Math.max(
        charge.amountPence - paidPence - playerPaidPence,
        0,
      );
      const availableCollectedPence = Math.max(
        collectedPence - settledPence - pendingPence,
        0,
      );
      const amountUsedPence = Math.min(
        creditBalancePence,
        currentOutstandingPence,
        availableCollectedPence,
      );

      if (amountUsedPence <= 0) {
        return {
          amountUsedPence: 0,
          reason: pendingPence > 0 ? ("pending_checkout" as const) : ("not_available" as const),
        };
      }

      const creditEntryId = `tcred_${randomUUID()}`;
      const settlementId = `team_credit:${randomUUID()}`;
      const description = `Team credit used instead of asking the captain to pass on collected player money for ${entry.title}.`;

      await tx.$executeRaw(Prisma.sql`
        INSERT INTO "TeamCreditLedgerEntry" (
          "id",
          "teamId",
          "fixtureId",
          "chargeId",
          "entryType",
          "amountPence",
          "description"
        ) VALUES (
          ${creditEntryId},
          ${charge.teamId},
          ${charge.fixtureId},
          ${charge.id},
          'CREDIT_USED'::"TeamCreditLedgerEntryType",
          ${amountUsedPence},
          ${description}
        )
      `);

      await tx.paymentTransaction.create({
        data: {
          teamId: charge.teamId,
          chargeId: charge.id,
          amountPence: amountUsedPence,
          method: PaymentMethod.OTHER,
          reference: "TEAM_CREDIT",
          notes: `Team credit used. Credit ledger entry: ${creditEntryId}. Captain-collected player money retained by the team instead of being remitted as new cash.`,
          paidAt: new Date(),
          stripeCheckoutSessionId: settlementId,
        },
      });

      await tx.$executeRaw(Prisma.sql`
        INSERT INTO "CaptainCollectedRemittanceCheckout" (
          "checkoutSessionId",
          "teamId",
          "chargeId",
          "fixtureId",
          "amountPence"
        ) VALUES (
          ${settlementId},
          ${charge.teamId},
          ${charge.id},
          ${charge.fixtureId},
          ${amountUsedPence}
        )
      `);

      const paidPenceAfterCredit = paidPence + playerPaidPence + amountUsedPence;
      const nextStatus = getDisplayChargeStatus({
        storedStatus: charge.status,
        amountPence: charge.amountPence,
        paidPence: paidPenceAfterCredit,
      }) as PaymentChargeStatus;

      await tx.paymentCharge.update({
        where: { id: charge.id },
        data: { status: nextStatus },
      });

      return {
        amountUsedPence,
        remainingCreditPence: creditBalancePence - amountUsedPence,
        reason: "used" as const,
      };
    });

    return NextResponse.redirect(
      paymentsUrl(teamid, {
        collectedCredit: result.reason,
        ...(result.amountUsedPence > 0 ? { amount: String(result.amountUsedPence) } : {}),
      }),
      303,
    );
  } catch (error) {
    console.error("Could not use team credit for captain-collected money", error);
    return NextResponse.redirect(
      paymentsUrl(teamid, { collectedCredit: "error" }),
      303,
    );
  }
}
