import { randomUUID } from "node:crypto";
import { PaymentChargeStatus, PaymentMethod, Prisma } from "@prisma/client";

import { getTeamCreditLedger } from "@/lib/payments/team-credits";
import { getRelatedTeamIdsForPaymentLedger } from "@/lib/payments/team-payment-ledger";
import { prisma } from "@/lib/prisma";

type LedgerDb = Pick<typeof prisma, "$executeRaw" | "$queryRaw">;
type ChargeDb = LedgerDb &
  Pick<typeof prisma, "paymentCharge" | "paymentTransaction">;

export type KitFundLedgerEntryType =
  | "FUND_ADDED"
  | "FUND_USED"
  | "FUND_RESTORED";

export type KitFundLedgerEntry = {
  id: string;
  teamId: string;
  entryType: KitFundLedgerEntryType;
  amountPence: number;
  sourceType: string | null;
  sourceId: string | null;
  chargeId: string | null;
  description: string | null;
  createdAt: Date;
};

export type KitFundLedger = {
  teamIds: string[];
  balancePence: number;
  entries: KitFundLedgerEntry[];
};

function uniqueIds(ids: string[]) {
  return Array.from(new Set(ids.map((id) => id.trim()).filter(Boolean)));
}

function signedAmount(
  entry: Pick<KitFundLedgerEntry, "entryType" | "amountPence">,
) {
  return entry.entryType === "FUND_USED" ? -entry.amountPence : entry.amountPence;
}

async function lockKitFund(teamId: string, db: LedgerDb) {
  await db.$queryRaw(Prisma.sql`
    SELECT pg_advisory_xact_lock(hashtext(${`sixfl-kit-fund:${teamId}`}))
  `);
}

export async function getKitFundLedgerForTeamIds(
  teamIdsInput: string[],
  db: LedgerDb = prisma,
): Promise<KitFundLedger> {
  const teamIds = uniqueIds(teamIdsInput);
  if (teamIds.length === 0) {
    return { teamIds: [], balancePence: 0, entries: [] };
  }

  const entries = await db.$queryRaw<KitFundLedgerEntry[]>(Prisma.sql`
    SELECT
      entry."id",
      entry."teamId",
      entry."entryType"::text AS "entryType",
      entry."amountPence",
      entry."sourceType",
      entry."sourceId",
      entry."chargeId",
      entry."description",
      entry."createdAt"
    FROM "KitFundLedgerEntry" entry
    WHERE entry."teamId" IN (${Prisma.join(teamIds)})
    ORDER BY entry."createdAt" DESC, entry."id" DESC
    LIMIT 100
  `);

  return {
    teamIds,
    balancePence: entries.reduce(
      (sum, entry) => sum + signedAmount(entry),
      0,
    ),
    entries,
  };
}

export async function getKitFundLedger(teamId: string): Promise<KitFundLedger> {
  const identity = await getRelatedTeamIdsForPaymentLedger(teamId);
  if (!identity) return { teamIds: [], balancePence: 0, entries: [] };
  return getKitFundLedgerForTeamIds(identity.relatedTeamIds);
}

export async function getKitFundBalancePence(teamId: string) {
  const ledger = await getKitFundLedger(teamId);
  return Math.max(ledger.balancePence, 0);
}

export async function moveTeamCreditToKitFund(input: {
  teamId: string;
  amountPence: number;
  createdByUserId?: string | null;
}) {
  const amountPence = Math.round(input.amountPence);
  if (!input.teamId || !Number.isInteger(amountPence) || amountPence <= 0) {
    throw new Error("Choose an amount greater than £0.00.");
  }

  const identity = await getRelatedTeamIdsForPaymentLedger(input.teamId);
  if (!identity) throw new Error("Team not found.");

  return prisma.$transaction(async (tx) => {
    await lockKitFund(identity.team.id, tx);

    const creditLedger = await getTeamCreditLedger(identity.relatedTeamIds, tx);
    if (creditLedger.balancePence < amountPence) {
      throw new Error(
        "There is not enough team credit to move that amount to the kit fund.",
      );
    }

    const ledgerTeamId = creditLedger.teamIds.includes(input.teamId)
      ? input.teamId
      : creditLedger.teamIds[0];
    if (!ledgerTeamId) {
      throw new Error(
        "Only standard teams can move team credit to the kit fund.",
      );
    }

    const transferId = `kitfund_transfer_${randomUUID()}`;
    const teamCreditEntryId = `tcred_${randomUUID()}`;
    const description = `Moved £${(amountPence / 100).toFixed(
      2,
    )} from team credit to the kit fund. Transfer ${transferId}.`;

    await tx.$executeRaw(Prisma.sql`
      INSERT INTO "TeamCreditLedgerEntry" (
        "id",
        "teamId",
        "entryType",
        "amountPence",
        "description",
        "createdByUserId"
      )
      VALUES (
        ${teamCreditEntryId},
        ${ledgerTeamId},
        'CREDIT_USED'::"TeamCreditLedgerEntryType",
        ${amountPence},
        ${description},
        ${input.createdByUserId ?? null}
      )
    `);

    await tx.$executeRaw(Prisma.sql`
      INSERT INTO "KitFundLedgerEntry" (
        "id",
        "teamId",
        "entryType",
        "amountPence",
        "sourceType",
        "sourceId",
        "description",
        "createdByUserId"
      )
      VALUES (
        ${`kfund_${randomUUID()}`},
        ${ledgerTeamId},
        'FUND_ADDED'::"KitFundLedgerEntryType",
        ${amountPence},
        'TEAM_CREDIT_TRANSFER',
        ${transferId},
        ${description},
        ${input.createdByUserId ?? null}
      )
    `);

    const [remainingCredit, kitFund] = await Promise.all([
      getTeamCreditLedger(identity.relatedTeamIds, tx),
      getKitFundLedgerForTeamIds(identity.relatedTeamIds, tx),
    ]);

    return {
      amountMovedPence: amountPence,
      remainingTeamCreditPence: Math.max(remainingCredit.balancePence, 0),
      kitFundBalancePence: Math.max(kitFund.balancePence, 0),
    };
  });
}

export async function moveKitFundBackToTeamCreditByAdmin(input: {
  teamId: string;
  amountPence: number;
  createdByUserId: string;
  reason?: string | null;
}) {
  const amountPence = Math.round(input.amountPence);
  if (!input.teamId || !Number.isInteger(amountPence) || amountPence <= 0) {
    throw new Error("Choose an amount greater than £0.00.");
  }
  if (!input.createdByUserId) {
    throw new Error("An admin user is required to correct a kit fund transfer.");
  }

  const identity = await getRelatedTeamIdsForPaymentLedger(input.teamId);
  if (!identity) throw new Error("Team not found.");

  return prisma.$transaction(async (tx) => {
    await lockKitFund(identity.team.id, tx);

    const [kitFund, creditLedger] = await Promise.all([
      getKitFundLedgerForTeamIds(identity.relatedTeamIds, tx),
      getTeamCreditLedger(identity.relatedTeamIds, tx),
    ]);

    if (kitFund.balancePence < amountPence) {
      throw new Error(
        "There is not enough money in the kit fund to move that amount back.",
      );
    }

    const ledgerTeamId = creditLedger.teamIds.includes(input.teamId)
      ? input.teamId
      : creditLedger.teamIds[0];
    if (!ledgerTeamId) {
      throw new Error("The active standard-team credit identity could not be found.");
    }

    const correctionId = `kitfund_admin_return_${randomUUID()}`;
    const reason = input.reason?.trim() || "Admin correction";
    const description = `Admin moved £${(amountPence / 100).toFixed(
      2,
    )} from the kit fund back to team credit. ${reason}. Correction ${correctionId}.`;

    await tx.$executeRaw(Prisma.sql`
      INSERT INTO "KitFundLedgerEntry" (
        "id",
        "teamId",
        "entryType",
        "amountPence",
        "sourceType",
        "sourceId",
        "description",
        "createdByUserId"
      )
      VALUES (
        ${`kfund_${randomUUID()}`},
        ${ledgerTeamId},
        'FUND_USED'::"KitFundLedgerEntryType",
        ${amountPence},
        'ADMIN_RETURN_TO_TEAM_CREDIT',
        ${correctionId},
        ${description},
        ${input.createdByUserId}
      )
    `);

    await tx.$executeRaw(Prisma.sql`
      INSERT INTO "TeamCreditLedgerEntry" (
        "id",
        "teamId",
        "entryType",
        "amountPence",
        "description",
        "createdByUserId"
      )
      VALUES (
        ${`tcred_${randomUUID()}`},
        ${ledgerTeamId},
        'CREDIT_ADDED'::"TeamCreditLedgerEntryType",
        ${amountPence},
        ${description},
        ${input.createdByUserId}
      )
    `);

    const [remainingFund, updatedCredit] = await Promise.all([
      getKitFundLedgerForTeamIds(identity.relatedTeamIds, tx),
      getTeamCreditLedger(identity.relatedTeamIds, tx),
    ]);

    return {
      amountMovedPence: amountPence,
      kitFundBalancePence: Math.max(remainingFund.balancePence, 0),
      teamCreditBalancePence: Math.max(updatedCredit.balancePence, 0),
    };
  });
}

export async function applyKitFundToCharges(input: {
  teamId: string;
  batchReference: string;
  charges: Array<{ id: string; amountPence: number }>;
  createdByUserId?: string | null;
}) {
  if (input.charges.length === 0) {
    return {
      amountUsedPence: 0,
      remainingKitFundPence: await getKitFundBalancePence(input.teamId),
      charges: [] as Array<{
        id: string;
        kitFundAppliedPence: number;
        outstandingPence: number;
      }>,
    };
  }

  const identity = await getRelatedTeamIdsForPaymentLedger(input.teamId);
  if (!identity) throw new Error("Team not found.");

  return prisma.$transaction(async (tx) => {
    await lockKitFund(identity.team.id, tx);
    const fund = await getKitFundLedgerForTeamIds(identity.relatedTeamIds, tx);
    let remainingToApply = Math.min(
      Math.max(fund.balancePence, 0),
      input.charges.reduce(
        (sum, charge) => sum + Math.max(charge.amountPence, 0),
        0,
      ),
    );

    if (remainingToApply <= 0) {
      return {
        amountUsedPence: 0,
        remainingKitFundPence: Math.max(fund.balancePence, 0),
        charges: input.charges.map((charge) => ({
          id: charge.id,
          kitFundAppliedPence: 0,
          outstandingPence: charge.amountPence,
        })),
      };
    }

    const usageEntryId = `kfund_${randomUUID()}`;
    const totalUsedPence = remainingToApply;

    await tx.$executeRaw(Prisma.sql`
      INSERT INTO "KitFundLedgerEntry" (
        "id",
        "teamId",
        "entryType",
        "amountPence",
        "sourceType",
        "sourceId",
        "description",
        "createdByUserId"
      )
      VALUES (
        ${usageEntryId},
        ${input.teamId},
        'FUND_USED'::"KitFundLedgerEntryType",
        ${totalUsedPence},
        'KIT_PURCHASE_BATCH',
        ${input.batchReference},
        ${`Kit fund used toward kit payment batch ${input.batchReference}.`},
        ${input.createdByUserId ?? null}
      )
    `);

    const result: Array<{
      id: string;
      kitFundAppliedPence: number;
      outstandingPence: number;
    }> = [];

    for (const charge of input.charges) {
      const appliedPence = Math.min(remainingToApply, charge.amountPence);
      const outstandingPence = Math.max(charge.amountPence - appliedPence, 0);

      if (appliedPence > 0) {
        await tx.paymentTransaction.create({
          data: {
            teamId: input.teamId,
            chargeId: charge.id,
            amountPence: appliedPence,
            method: PaymentMethod.OTHER,
            reference: "KIT_FUND",
            notes: `Kit fund used. Kit fund ledger entry: ${usageEntryId}`,
            paidAt: new Date(),
          },
        });

        await tx.paymentCharge.update({
          where: { id: charge.id },
          data: {
            status:
              outstandingPence <= 0
                ? PaymentChargeStatus.PAID
                : PaymentChargeStatus.PART_PAID,
          },
        });
      }

      remainingToApply -= appliedPence;
      result.push({
        id: charge.id,
        kitFundAppliedPence: appliedPence,
        outstandingPence,
      });
    }

    return {
      amountUsedPence: totalUsedPence,
      remainingKitFundPence: Math.max(fund.balancePence - totalUsedPence, 0),
      charges: result,
    };
  });
}

export async function restoreKitFundForCancelledCharge(input: {
  teamId: string;
  chargeId: string;
  createdByUserId?: string | null;
  db?: ChargeDb;
}) {
  const db = input.db ?? prisma;
  const transactions = await db.paymentTransaction.findMany({
    where: { chargeId: input.chargeId, reference: "KIT_FUND" },
    select: { id: true, amountPence: true },
  });
  const amountPence = transactions.reduce(
    (sum, transaction) => sum + transaction.amountPence,
    0,
  );
  if (amountPence <= 0) return { restoredPence: 0 };

  await db.$executeRaw(Prisma.sql`
    INSERT INTO "KitFundLedgerEntry" (
      "id",
      "teamId",
      "entryType",
      "amountPence",
      "sourceType",
      "sourceId",
      "chargeId",
      "description",
      "createdByUserId"
    )
    VALUES (
      ${`kfund_${randomUUID()}`},
      ${input.teamId},
      'FUND_RESTORED'::"KitFundLedgerEntryType",
      ${amountPence},
      'KIT_CHARGE_CANCELLED',
      ${input.chargeId},
      ${input.chargeId},
      ${`Kit fund restored after kit payment charge ${input.chargeId} was cancelled.`},
      ${input.createdByUserId ?? null}
    )
    ON CONFLICT ("sourceType", "sourceId", "entryType") WHERE "sourceId" IS NOT NULL DO NOTHING
  `);

  await db.paymentTransaction.deleteMany({
    where: { chargeId: input.chargeId, reference: "KIT_FUND" },
  });

  return { restoredPence: amountPence };
}
