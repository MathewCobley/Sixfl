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

type CreditDb = Pick<typeof prisma, "$executeRaw" | "$queryRaw">;
type ChargeSummaryDb = CreditDb & Pick<typeof prisma, "paymentCharge" | "playerMatchFee">;

type StandardTeamRow = {
  id: string;
};

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

async function getStandardTeamIds(teamIdsInput: string[], db: CreditDb = prisma) {
  const teamIds = uniqueIds(teamIdsInput);
  if (teamIds.length === 0) return [];

  const rows = await db.$queryRaw<StandardTeamRow[]>(Prisma.sql`
    SELECT "id"
    FROM "Team"
    WHERE "id" IN (${Prisma.join(teamIds)})
      AND "teamMode"::text = 'STANDARD'
  `);

  return rows.map((row) => row.id);
}

function getEntrySignedAmount(entry: Pick<TeamCreditLedgerEntry, "entryType" | "amountPence">) {
  if (entry.entryType === "CREDIT_ADDED") return entry.amountPence;
  return -entry.amountPence;
}

export async function syncLegacyTeamCreditPotEntries(
  teamIdsInput: string[],
  db: CreditDb = prisma,
) {
  const teamIds = await getStandardTeamIds(teamIdsInput, db);
  if (teamIds.length === 0) return;

  // Player-match-fee overpayments are now calculated directly from PlayerMatchFee + PaymentCharge.
  // Remove old mirrored pot rows for the same source so the same overpayment is not counted twice.
  await db.$executeRaw(Prisma.sql`
    DELETE FROM "TeamCreditLedgerEntry"
    WHERE "teamId" IN (${Prisma.join(teamIds)})
      AND "id" LIKE 'tcred_pot_PLAYER_MATCH_FEE_OVERPAYMENT_%'
      AND "entryType" = 'CREDIT_ADDED'::"TeamCreditLedgerEntryType"
  `);

  await db.$executeRaw(Prisma.sql`
    INSERT INTO "TeamCreditLedgerEntry" (
      "id",
      "teamId",
      "sourceFixtureId",
      "chargeId",
      "entryType",
      "amountPence",
      "description",
      "createdAt"
    )
    SELECT
      CONCAT('tcred_pot_', pot."sourceType", '_', pot."sourceId") AS "id",
      pot."teamId",
      pot."fixtureId" AS "sourceFixtureId",
      pot."chargeId",
      'CREDIT_ADDED'::"TeamCreditLedgerEntryType" AS "entryType",
      pot."amountPence",
      pot."description",
      pot."createdAt"
    FROM "TeamCreditPotEntry" pot
    JOIN "Team" team ON team."id" = pot."teamId"
    WHERE pot."teamId" IN (${Prisma.join(teamIds)})
      AND team."teamMode"::text = 'STANDARD'
      AND pot."amountPence" > 0
      AND pot."sourceType" <> 'PLAYER_MATCH_FEE_OVERPAYMENT'
    ON CONFLICT ("id") DO UPDATE SET
      "teamId" = EXCLUDED."teamId",
      "sourceFixtureId" = EXCLUDED."sourceFixtureId",
      "chargeId" = EXCLUDED."chargeId",
      "amountPence" = EXCLUDED."amountPence",
      "description" = EXCLUDED."description"
  `);
}

export async function syncPlayerOverpaymentCreditsForTeams(
  teamIdsInput: string[],
  db: CreditDb = prisma,
) {
  const teamIds = await getStandardTeamIds(teamIdsInput, db);
  if (teamIds.length === 0) return;

  // Credit is the genuine cash/card surplus on a STANDARD team's fixture charge.
  // Managed squads collect individual player fees and must never turn player-fee
  // surplus into standard team credit.
  await db.$executeRaw(Prisma.sql`
    WITH player_totals AS (
      SELECT
        pmf."teamId",
        pmf."fixtureId",
        SUM(pmf."amountPence")::int AS "playerPaidPence"
      FROM "PlayerMatchFee" pmf
      WHERE pmf."teamId" IN (${Prisma.join(teamIds)})
        AND pmf."status" = 'PAID'
      GROUP BY pmf."teamId", pmf."fixtureId"
    ),
    direct_totals AS (
      SELECT
        transaction."chargeId",
        SUM(transaction."amountPence")::int AS "teamPaidPence"
      FROM "PaymentTransaction" transaction
      WHERE transaction."teamId" IN (${Prisma.join(teamIds)})
        AND transaction."chargeId" IS NOT NULL
        AND COALESCE(transaction."reference", '') <> 'TEAM_CREDIT'
        AND LOWER(COALESCE(transaction."notes", '')) NOT LIKE '%team credit used%'
        AND LOWER(COALESCE(transaction."notes", '')) NOT LIKE '%player match fee paid online%'
        AND LOWER(COALESCE(transaction."notes", '')) NOT LIKE '%player fee id:%'
      GROUP BY transaction."chargeId"
    ),
    overpaid_charges AS (
      SELECT
        CONCAT('tcred_player_overpay_', pc."teamId", '_', pc."fixtureId") AS "id",
        pc."teamId",
        pc."fixtureId",
        pc."id" AS "chargeId",
        pc."amountPence" AS "chargeAmountPence",
        COALESCE(pt."playerPaidPence", 0)::int AS "playerPaidPence",
        COALESCE(dt."teamPaidPence", 0)::int AS "teamPaidPence",
        (
          COALESCE(pt."playerPaidPence", 0) +
          COALESCE(dt."teamPaidPence", 0) -
          pc."amountPence"
        )::int AS "surplusPence"
      FROM "PaymentCharge" pc
      JOIN "Team" team ON team."id" = pc."teamId"
      LEFT JOIN player_totals pt
        ON pt."teamId" = pc."teamId"
       AND pt."fixtureId" = pc."fixtureId"
      LEFT JOIN direct_totals dt
        ON dt."chargeId" = pc."id"
      WHERE pc."teamId" IN (${Prisma.join(teamIds)})
        AND team."teamMode"::text = 'STANDARD'
        AND pc."fixtureId" IS NOT NULL
        AND pc."status" <> 'VOID'
        AND (
          COALESCE(pt."playerPaidPence", 0) +
          COALESCE(dt."teamPaidPence", 0)
        ) > pc."amountPence"
    )
    INSERT INTO "TeamCreditLedgerEntry" (
      "id",
      "teamId",
      "sourceFixtureId",
      "chargeId",
      "entryType",
      "amountPence",
      "description"
    )
    SELECT
      oc."id",
      oc."teamId",
      oc."fixtureId",
      oc."chargeId",
      'CREDIT_ADDED'::"TeamCreditLedgerEntryType",
      oc."surplusPence",
      CONCAT(
        'Fixture overpayment added to team credit. Players paid £',
        TO_CHAR((oc."playerPaidPence"::numeric / 100), 'FM999999990.00'),
        ' and the team paid £',
        TO_CHAR((oc."teamPaidPence"::numeric / 100), 'FM999999990.00'),
        ' against a £',
        TO_CHAR((oc."chargeAmountPence"::numeric / 100), 'FM999999990.00'),
        ' fixture charge.'
      )
    FROM overpaid_charges oc
    ON CONFLICT ("id") DO UPDATE SET
      "teamId" = EXCLUDED."teamId",
      "sourceFixtureId" = EXCLUDED."sourceFixtureId",
      "chargeId" = EXCLUDED."chargeId",
      "amountPence" = EXCLUDED."amountPence",
      "description" = EXCLUDED."description"
  `);

  await db.$executeRaw(Prisma.sql`
    WITH player_totals AS (
      SELECT
        pmf."teamId",
        pmf."fixtureId",
        SUM(pmf."amountPence")::int AS "playerPaidPence"
      FROM "PlayerMatchFee" pmf
      WHERE pmf."teamId" IN (${Prisma.join(teamIds)})
        AND pmf."status" = 'PAID'
      GROUP BY pmf."teamId", pmf."fixtureId"
    ),
    direct_totals AS (
      SELECT
        transaction."chargeId",
        SUM(transaction."amountPence")::int AS "teamPaidPence"
      FROM "PaymentTransaction" transaction
      WHERE transaction."teamId" IN (${Prisma.join(teamIds)})
        AND transaction."chargeId" IS NOT NULL
        AND COALESCE(transaction."reference", '') <> 'TEAM_CREDIT'
        AND LOWER(COALESCE(transaction."notes", '')) NOT LIKE '%team credit used%'
        AND LOWER(COALESCE(transaction."notes", '')) NOT LIKE '%player match fee paid online%'
        AND LOWER(COALESCE(transaction."notes", '')) NOT LIKE '%player fee id:%'
      GROUP BY transaction."chargeId"
    ),
    current_overpay_ids AS (
      SELECT CONCAT('tcred_player_overpay_', pc."teamId", '_', pc."fixtureId") AS "id"
      FROM "PaymentCharge" pc
      JOIN "Team" team ON team."id" = pc."teamId"
      LEFT JOIN player_totals pt
        ON pt."teamId" = pc."teamId"
       AND pt."fixtureId" = pc."fixtureId"
      LEFT JOIN direct_totals dt
        ON dt."chargeId" = pc."id"
      WHERE pc."teamId" IN (${Prisma.join(teamIds)})
        AND team."teamMode"::text = 'STANDARD'
        AND pc."fixtureId" IS NOT NULL
        AND pc."status" <> 'VOID'
        AND (
          COALESCE(pt."playerPaidPence", 0) +
          COALESCE(dt."teamPaidPence", 0)
        ) > pc."amountPence"
    )
    DELETE FROM "TeamCreditLedgerEntry" entry
    WHERE entry."teamId" IN (${Prisma.join(teamIds)})
      AND entry."id" LIKE 'tcred_player_overpay_%'
      AND NOT EXISTS (
        SELECT 1 FROM current_overpay_ids current_ids WHERE current_ids."id" = entry."id"
      )
  `);
}

export async function syncTeamCreditLedgerSources(
  teamIdsInput: string[],
  db: CreditDb = prisma,
) {
  const teamIds = await getStandardTeamIds(teamIdsInput, db);
  if (teamIds.length === 0) return;

  await syncLegacyTeamCreditPotEntries(teamIds, db);
  await syncPlayerOverpaymentCreditsForTeams(teamIds, db);
}

export async function getTeamCreditLedger(
  teamIdsInput: string[],
  db: CreditDb = prisma,
): Promise<TeamCreditLedger> {
  const teamIds = await getStandardTeamIds(teamIdsInput, db);

  if (teamIds.length === 0) {
    return { teamIds: [], balancePence: 0, entries: [] };
  }

  await syncTeamCreditLedgerSources(teamIds, db);

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
      AND t."teamMode"::text = 'STANDARD'
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

  const standardTeamIds = await getStandardTeamIds([input.teamId], db);
  if (!standardTeamIds.includes(input.teamId)) {
    throw new Error("Managed teams do not use the team credit ledger.");
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

async function getChargeSummary(chargeId: string, db: ChargeSummaryDb) {
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
    const standardTeamIds = await getStandardTeamIds(teamIds, tx);

    if (!current || !standardTeamIds.includes(current.charge.teamId)) {
      throw new Error("Team credit is only available to standard teams.");
    }

    if (current.summary.displayStatus === "PAID" || current.summary.displayStatus === "VOID") {
      return {
        amountUsedPence: 0,
        remainingCreditPence: await getTeamCreditBalancePence(standardTeamIds, tx),
      };
    }

    const creditLedger = await getTeamCreditLedger(standardTeamIds, tx);
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