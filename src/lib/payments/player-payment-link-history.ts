import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";

/**
 * Records a real visit to a player match-fee link.
 * One history row exists per unique fee/token; repeat visits increment openCount.
 */
export async function recordPlayerPaymentLinkOpened(input: {
  feeId: string;
  paymentToken: string;
}) {
  const now = new Date();

  await prisma.$executeRaw(Prisma.sql`
    INSERT INTO "PlayerPaymentLinkHistory" (
      "feeId","teamId","fixtureId","teamMemberId","prospectId","userId","playerName",
      "fixtureLabel","amountPence","paymentToken","paymentUrl","source",
      "firstOpenedAt","lastOpenedAt","openCount","createdAt","updatedAt"
    )
    SELECT
      fee.id,
      fee."teamId",
      fee."fixtureId",
      state."teamMemberId",
      state."prospectId",
      state."userId",
      state."playerName",
      home.name || ' vs ' || away.name,
      fee."amountPence",
      fee."paymentToken",
      fee."paymentUrl",
      'OPENED_FALLBACK',
      ${now},
      ${now},
      1,
      ${now},
      ${now}
    FROM "PlayerMatchFee" fee
    LEFT JOIN "PlayerFeeLedgerState" state ON state."feeId"=fee.id
    JOIN "Fixture" fixture ON fixture.id=fee."fixtureId"
    JOIN "Team" home ON home.id=fixture."homeTeamId"
    JOIN "Team" away ON away.id=fixture."awayTeamId"
    WHERE fee.id=${input.feeId}
      AND fee."paymentToken"=${input.paymentToken}
      AND fee."paymentUrl" IS NOT NULL
    ON CONFLICT ("feeId","paymentToken") DO UPDATE SET
      "firstOpenedAt"=COALESCE("PlayerPaymentLinkHistory"."firstOpenedAt",EXCLUDED."firstOpenedAt"),
      "lastOpenedAt"=EXCLUDED."lastOpenedAt",
      "openCount"="PlayerPaymentLinkHistory"."openCount"+1,
      "updatedAt"=EXCLUDED."updatedAt"
  `);
}
