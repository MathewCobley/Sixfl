// ========================================
// File: src/lib/payments/team-credit-pot.ts
// ========================================

import { randomUUID } from "node:crypto";

import { prisma } from "@/lib/prisma";

export const TEAM_CREDIT_SOURCE_PLAYER_OVERPAYMENT = "PLAYER_MATCH_FEE_OVERPAYMENT";

function formatMoney(amountPence: number) {
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: "GBP",
  }).format(amountPence / 100);
}

export async function syncFixtureOverpaymentCredit(input: {
  teamId: string;
  fixtureId: string;
  chargeId: string;
  paidTotalPence: number;
  chargeAmountPence: number;
}) {
  const surplusPence = Math.max(input.paidTotalPence - input.chargeAmountPence, 0);
  const sourceId = `${input.teamId}:${input.fixtureId}`;

  if (surplusPence <= 0) {
    await prisma.$executeRaw`
      DELETE FROM "TeamCreditPotEntry"
      WHERE "sourceType" = ${TEAM_CREDIT_SOURCE_PLAYER_OVERPAYMENT}
        AND "sourceId" = ${sourceId}
    `;

    return { surplusPence: 0 };
  }

  const description = [
    "Squad payment overpayment added to team pot.",
    `Players paid ${formatMoney(input.paidTotalPence)} against a ${formatMoney(input.chargeAmountPence)} team fee.`,
  ].join(" ");

  await prisma.$executeRaw`
    INSERT INTO "TeamCreditPotEntry" (
      "id",
      "teamId",
      "amountPence",
      "sourceType",
      "sourceId",
      "fixtureId",
      "chargeId",
      "description",
      "createdAt",
      "updatedAt"
    )
    VALUES (
      ${randomUUID()},
      ${input.teamId},
      ${surplusPence},
      ${TEAM_CREDIT_SOURCE_PLAYER_OVERPAYMENT},
      ${sourceId},
      ${input.fixtureId},
      ${input.chargeId},
      ${description},
      NOW(),
      NOW()
    )
    ON CONFLICT ("sourceType", "sourceId") DO UPDATE SET
      "teamId" = EXCLUDED."teamId",
      "amountPence" = EXCLUDED."amountPence",
      "fixtureId" = EXCLUDED."fixtureId",
      "chargeId" = EXCLUDED."chargeId",
      "description" = EXCLUDED."description",
      "updatedAt" = NOW()
  `;

  return { surplusPence };
}
