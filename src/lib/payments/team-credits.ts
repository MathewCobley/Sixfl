// ========================================
// File: src/lib/payments/team-credits.ts
// ========================================

import { randomUUID } from "crypto";
import { PaymentChargeStatus, PaymentMethod, Prisma } from "@prisma/client";

import {
  getDisplayChargeStatus,
  summariseChargesWithPlayerMatchFees,
} from "@/lib/payments/charge-summary";
import { prisma } from "@/lib/prisma";

type CreditDb = typeof prisma | Prisma.TransactionClient;

export type TeamCreditLedgerEntryType = "CREDIT_ADDED" | "CREDIT_USED" | "CREDIT_REVERSED";

export type TeamCreditLedgerEntry = {
  id: string;
  teamId: string;
  teamName: string;
  fixtureId: string | null;
  sourceFixtureId: string | null;
  chargeId: string | null;
  chargeTitle: string | null;
  entryType: TeamCreditLedgerEntryType;
  amountPence: number;
  description: string | null;
  createdAt: Date;
};

export type TeamCreditLedger = {
  teamIds: string[];
  balancePence: number;
  entries: TeamCreditLedgerEntry[];
};

function uniqueIds(ids: string[]) {
  return Array.from(new Set(ids.map((id) => id.trim()).filter(Boolean)));
}

function getEntrySignedAmount(entry: Pick<TeamCreditLedgerEntry, "entryType" | "amountPence">) {
  if (entry.entryType === "CREDIT_ADDED") return entry.amountPence;
  return -entry.amountPence;
}

export async function getTeamCreditLedger(
  teamIdsInput: string[],
  db: CreditDb = prisma,
): Promise<TeamCreditLedger> {
  const teamIds = uniqueIds(teamIdsInput);

  if (teamIds.length === 0) {
    return { teamIds: [], balancePence: 0, entries: [] };
  }

  const entries = await db.$queryRaw<TeamCreditLedgerEntry[]>(Prisma.sql`
    SELECT
      c."id",
      c."teamId",
      t."name" AS "teamName",
      c."fixtureId",
      c."sourceFixtureId",
      c."chargeId",
      pc."title" AS "chargeTitle",
      c."entryType"::text AS "entryType",
      c."amountPence",
      c."description",
      c."createdAt"
    FROM "TeamCreditLedgerEntry" c
    JOIN "Team" t ON t."id" = c."teamId"
    LEFT JOIN "PaymentCharge" pc ON pc."id" = c."chargeId"
    WHERE c."teamId" IN (${Prisma.join(teamIds)})
    ORDER BY c."createdAt" DESC, c."id" DESC
    LIMIT 100
  `);

  return {
    teamIds,
    balancePence: entries.reduce((sum, entry) => sum + getEntrySignedAmount(entry), 0),
    entries,
  };
}

export async function getTeamCreditBalancePence(teamIdsInput: string[], db: CreditDb = prisma) {
  const ledger = await getTeamCreditLedger(teamIdsInput, db);
  return ledger.balancePence;
}

export async function addTeamCredit(input: {
  teamId: string;
  amountPence: number;
  description: string;
  sourceFixtureId?: string | null;
  createdByUserId?: string | null;
  db?: CreditDb;
}) {
  const db = input.db ?? prisma;
  const amountPence = Math.round(input.amountPence);

  if (!input.teamId || !Number.isInteger(amountPence) || amountPence <= 0) {
    throw new Error("Credit amount must be more than zero.");
  }

  const id = `tcred_${randomUUID()}`;

  await db.$executeRaw(Prisma.sql`
    INSERT INTO "TeamCreditLedgerEntry" (
      "id",
      "teamId",
      "sourceFixtureId",
      "entryType",
      "amountPence",
      "description",
      "createdByUserId"
    )
    VALUES (
      ${id},
      ${input.teamId},
      ${input.sourceFixtureId ?? null},
      'CREDIT_ADDED'::"TeamCreditLedgerEntryType",
      ${amountPence},
      ${input.description.trim() || "Team credit added."},
      ${input.createdByUserId ?? null}
    )
  `);

  return { id, amountPence };
}

async function getChargeSummary(chargeId: string, db: CreditDb) {
  const charge = await db.paymentCharge.findUnique({
    where: { id: chargeId },
    include: {
      transactions: { select: { amountPence: true, notes: true } },
    },
  });

  if (!charge) return null;

  const paidPlayerMatchFees = charge.fixtureId
    ? await db.playerMatchFee.findMany({
        where: {
          teamId: charge.teamId,
          fixtureId: charge.fixtureId,
          status: "PAID",
        },
        select: { fixtureId: true, amountPence: true },
      })
    : [];

  const [summary] = summariseChargesWithPlayerMatchFees([charge], paidPlayerMatchFees);
  if (!summary) return null;

  return { charge, summary };
}

export async function applyAvailableTeamCreditToCharge(input: {
  chargeId: string;
  teamIds: string[];
  description?: string | null;
}) {
  const teamIds = uniqueIds(input.teamIds);

  if (!input.chargeId || teamIds.length === 0) {
    throw new Error("A charge and team are required to use team credit.");
  }

  return prisma.$transaction(async (tx) => {
    const current = await getChargeSummary(input.chargeId, tx);

    if (!current || !teamIds.includes(current.charge.teamId)) {
      throw new Error("Charge was not found for this team.");
    }

    if (current.summary.displayStatus === "PAID" || current.summary.displayStatus === "VOID") {
      return { amountUsedPence: 0, remainingCreditPence: await getTeamCreditBalancePence(teamIds, tx) };
    }

    const creditLedger = await getTeamCreditLedger(teamIds, tx);
    const amountUsedPence = Math.min(creditLedger.balancePence, current.summary.outstandingPence);

    if (amountUsedPence <= 0) {
      return { amountUsedPence: 0, remainingCreditPence: creditLedger.balancePence };
    }

    const creditEntryId = `tcred_${randomUUID()}`;
    const description = input.description?.trim() || `Team credit used against ${current.charge.title}.`;

    await tx.$executeRaw(Prisma.sql`
      INSERT INTO "TeamCreditLedgerEntry" (
        "id",
        "teamId",
        "fixtureId",
        "chargeId",
        "entryType",
        "amountPence",
        "description"
      )
      VALUES (
        ${creditEntryId},
        ${current.charge.teamId},
        ${current.charge.fixtureId ?? null},
        ${current.charge.id},
        'CREDIT_USED'::"TeamCreditLedgerEntryType",
        ${amountUsedPence},
        ${description}
      )
    `);

    await tx.paymentTransaction.create({
      data: {
        teamId: current.charge.teamId,
        chargeId: current.charge.id,
        amountPence: amountUsedPence,
        method: PaymentMethod.OTHER,
        reference: "TEAM_CREDIT",
        notes: `Team credit used. Credit ledger entry: ${creditEntryId}`,
        paidAt: new Date(),
      },
    });

    const paidPenceAfterCredit = current.summary.paidPence + amountUsedPence;
    const nextStatus = getDisplayChargeStatus({
      storedStatus: current.charge.status,
      amountPence: current.charge.amountPence,
      paidPence: paidPenceAfterCredit,
    }) as PaymentChargeStatus;

    await tx.paymentCharge.update({
      where: { id: current.charge.id },
      data: { status: nextStatus },
    });

    return {
      amountUsedPence,
      remainingCreditPence: creditLedger.balancePence - amountUsedPence,
    };
  });
}
