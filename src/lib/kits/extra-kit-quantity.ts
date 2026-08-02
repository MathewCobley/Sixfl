import { Prisma } from "@prisma/client";

import {
  TEAM_KIT_MAX_QUANTITY,
  TEAM_KIT_QUANTITY,
} from "@/lib/kits/constants";
import { prisma } from "@/lib/prisma";

export const EXTRA_KIT_PRICE_PENCE = 2000;
export const EXTRA_KIT_TITLE_PREFIX = "Additional kit contribution •";

const EXTRA_KIT_DESCRIPTION_PATTERN =
  /^(\d+)\s+additional complete kits?\s+for\s+.+?\s+at\s+£20\s+each\.\s+Payment batch\s+([a-z0-9-]+)\.?$/i;

type ExtraKitChargeRow = {
  id: string;
  description: string | null;
  amountPence: number;
  status: string;
  paidPence: bigint | number;
};

type ParsedBatch = {
  batchReference: string;
  quantity: number;
};

type BatchAccumulator = {
  quantity: number;
  invalid: boolean;
  voided: boolean;
  chargeCount: number;
  chargedPence: number;
  paidPence: number;
  everyChargePaid: boolean;
};

export type TeamExtraKitPaymentSummary = {
  includedKitQuantity: number;
  paidExtraKitQuantity: number;
  pendingExtraKitQuantity: number;
  totalKitQuantity: number;
  completedBatchCount: number;
};

function parseBatch(description: string | null): ParsedBatch | null {
  const match = description?.trim().match(EXTRA_KIT_DESCRIPTION_PATTERN);
  if (!match) return null;

  const quantity = Number(match[1]);
  const batchReference = match[2]?.trim().toLowerCase() ?? "";

  if (!Number.isInteger(quantity) || quantity < 1 || !batchReference) {
    return null;
  }

  return { batchReference, quantity };
}

function emptySummary(): TeamExtraKitPaymentSummary {
  return {
    includedKitQuantity: TEAM_KIT_QUANTITY,
    paidExtraKitQuantity: 0,
    pendingExtraKitQuantity: 0,
    totalKitQuantity: TEAM_KIT_QUANTITY,
    completedBatchCount: 0,
  };
}

export async function getTeamExtraKitPaymentSummary(
  teamId: string,
): Promise<TeamExtraKitPaymentSummary> {
  const cleanTeamId = teamId.trim();
  if (!cleanTeamId) return emptySummary();

  const rows = await prisma.$queryRaw<ExtraKitChargeRow[]>(Prisma.sql`
    SELECT
      charge."id",
      charge."description",
      charge."amountPence",
      charge."status"::text AS "status",
      COALESCE(SUM(transaction."amountPence"), 0)::bigint AS "paidPence"
    FROM "PaymentCharge" AS charge
    LEFT JOIN "PaymentTransaction" AS transaction
      ON transaction."chargeId" = charge."id"
    WHERE charge."teamId" = ${cleanTeamId}
      AND charge."title" LIKE ${`${EXTRA_KIT_TITLE_PREFIX}%`}
    GROUP BY
      charge."id",
      charge."description",
      charge."amountPence",
      charge."status"
    ORDER BY charge."createdAt" ASC
  `);

  const batches = new Map<string, BatchAccumulator>();

  for (const row of rows) {
    const parsed = parseBatch(row.description);
    if (!parsed) continue;

    const paidPence = Number(row.paidPence);
    const current = batches.get(parsed.batchReference) ?? {
      quantity: parsed.quantity,
      invalid: false,
      voided: false,
      chargeCount: 0,
      chargedPence: 0,
      paidPence: 0,
      everyChargePaid: true,
    };

    if (current.quantity !== parsed.quantity) {
      current.invalid = true;
    }

    current.chargeCount += 1;
    current.chargedPence += row.amountPence;
    current.paidPence += Math.max(0, paidPence);
    current.voided ||= row.status === "VOID";
    current.everyChargePaid &&= paidPence >= row.amountPence;
    batches.set(parsed.batchReference, current);
  }

  let paidExtraKitQuantity = 0;
  let pendingExtraKitQuantity = 0;
  let completedBatchCount = 0;

  for (const batch of batches.values()) {
    if (batch.invalid || batch.voided || batch.chargeCount < 1) continue;

    const expectedPence = batch.quantity * EXTRA_KIT_PRICE_PENCE;
    const fullyPaid =
      batch.chargedPence === expectedPence &&
      batch.paidPence >= expectedPence &&
      batch.everyChargePaid;

    if (fullyPaid) {
      paidExtraKitQuantity += batch.quantity;
      completedBatchCount += 1;
    } else {
      pendingExtraKitQuantity += batch.quantity;
    }
  }

  const maximumExtraKitQuantity = Math.max(
    0,
    TEAM_KIT_MAX_QUANTITY - TEAM_KIT_QUANTITY,
  );
  paidExtraKitQuantity = Math.min(
    paidExtraKitQuantity,
    maximumExtraKitQuantity,
  );
  pendingExtraKitQuantity = Math.min(
    pendingExtraKitQuantity,
    Math.max(0, maximumExtraKitQuantity - paidExtraKitQuantity),
  );

  return {
    includedKitQuantity: TEAM_KIT_QUANTITY,
    paidExtraKitQuantity,
    pendingExtraKitQuantity,
    totalKitQuantity: TEAM_KIT_QUANTITY + paidExtraKitQuantity,
    completedBatchCount,
  };
}
