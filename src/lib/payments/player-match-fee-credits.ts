// ========================================
// File: src/lib/payments/player-match-fee-credits.ts
// ========================================

import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";

export type PlayerCreditDb = {
  $executeRawUnsafe: typeof prisma.$executeRawUnsafe;
  $queryRaw: typeof prisma.$queryRaw;
  playerMatchFee: Pick<
    typeof prisma.playerMatchFee,
    "findUnique" | "update"
  >;
};

function getDb(db?: PlayerCreditDb) {
  return db ?? prisma;
}

function appendNote(input: { existingNote: string | null; note: string }) {
  const existingNote = input.existingNote?.trim();
  if (!existingNote) return input.note;
  if (existingNote.includes(input.note)) return existingNote;
  return `${existingNote}\n${input.note}`;
}

async function ensurePlayerMatchFeeCreditTable(db: PlayerCreditDb) {
  await db.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "PlayerMatchFeeCreditLedgerEntry" (
      "id" TEXT NOT NULL,
      "teamId" TEXT NOT NULL,
      "teamMemberId" TEXT,
      "prospectId" TEXT,
      "sourceFeeId" TEXT,
      "appliedFeeId" TEXT,
      "entryType" TEXT NOT NULL,
      "amountPence" INTEGER NOT NULL,
      "description" TEXT,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "PlayerMatchFeeCreditLedgerEntry_pkey" PRIMARY KEY ("id")
    );
  `);

  await db.$executeRawUnsafe(`
    CREATE UNIQUE INDEX IF NOT EXISTS "PlayerMatchFeeCreditLedgerEntry_sourceFeeId_credit_key"
    ON "PlayerMatchFeeCreditLedgerEntry"("sourceFeeId")
    WHERE "entryType" = 'CREDIT_ADDED' AND "sourceFeeId" IS NOT NULL;
  `);

  await db.$executeRawUnsafe(`
    CREATE UNIQUE INDEX IF NOT EXISTS "PlayerMatchFeeCreditLedgerEntry_appliedFeeId_used_key"
    ON "PlayerMatchFeeCreditLedgerEntry"("appliedFeeId")
    WHERE "entryType" = 'CREDIT_USED' AND "appliedFeeId" IS NOT NULL;
  `);

  await db.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS "PlayerMatchFeeCreditLedgerEntry_player_idx"
    ON "PlayerMatchFeeCreditLedgerEntry"("teamId", "teamMemberId", "prospectId");
  `);
}

async function getCreditBalanceForPlayer(input: {
  db: PlayerCreditDb;
  teamId: string;
  teamMemberId: string | null;
  prospectId: string | null;
}) {
  await ensurePlayerMatchFeeCreditTable(input.db);

  const rows = await input.db.$queryRaw<Array<{ balancePence: number | null }>>(Prisma.sql`
    SELECT COALESCE(SUM(
      CASE
        WHEN "entryType" = 'CREDIT_ADDED' THEN "amountPence"
        WHEN "entryType" = 'CREDIT_USED' THEN -"amountPence"
        WHEN "entryType" = 'CREDIT_REFUNDED' THEN -"amountPence"
        ELSE 0
      END
    ), 0)::int AS "balancePence"
    FROM "PlayerMatchFeeCreditLedgerEntry"
    WHERE "teamId" = ${input.teamId}
      AND "teamMemberId" IS NOT DISTINCT FROM ${input.teamMemberId}
      AND "prospectId" IS NOT DISTINCT FROM ${input.prospectId}
  `);

  return Number(rows[0]?.balancePence ?? 0);
}

export async function addPlayerMatchFeeCreditFromFee(input: {
  feeId: string;
  description?: string;
  db?: PlayerCreditDb;
}) {
  const db = getDb(input.db);
  await ensurePlayerMatchFeeCreditTable(db);

  const fee = await db.playerMatchFee.findUnique({
    where: { id: input.feeId },
    select: {
      id: true,
      teamId: true,
      teamMemberId: true,
      prospectId: true,
      amountPence: true,
      status: true,
    },
  });

  if (!fee || fee.status !== "PAID" || fee.amountPence <= 0) {
    return { credited: false, amountPence: 0 };
  }

  if (!fee.teamMemberId && !fee.prospectId) {
    return { credited: false, amountPence: 0 };
  }

  const id = `pmfcred_${fee.id}`;
  await db.$executeRawUnsafe(
    `
      INSERT INTO "PlayerMatchFeeCreditLedgerEntry" (
        "id",
        "teamId",
        "teamMemberId",
        "prospectId",
        "sourceFeeId",
        "entryType",
        "amountPence",
        "description"
      ) VALUES ($1, $2, $3, $4, $5, 'CREDIT_ADDED', $6, $7)
      ON CONFLICT ("sourceFeeId") WHERE "entryType" = 'CREDIT_ADDED' AND "sourceFeeId" IS NOT NULL
      DO UPDATE SET
        "amountPence" = EXCLUDED."amountPence",
        "description" = EXCLUDED."description"
    `,
    id,
    fee.teamId,
    fee.teamMemberId,
    fee.prospectId,
    fee.id,
    fee.amountPence,
    input.description ?? "Credit from paid player match fee removed from current selection.",
  );

  return { credited: true, amountPence: fee.amountPence };
}

export async function applyAvailablePlayerMatchFeeCreditToFee(input: {
  feeId: string;
  db?: PlayerCreditDb;
}) {
  const db = getDb(input.db);
  await ensurePlayerMatchFeeCreditTable(db);

  const fee = await db.playerMatchFee.findUnique({
    where: { id: input.feeId },
    select: {
      id: true,
      teamId: true,
      teamMemberId: true,
      prospectId: true,
      amountPence: true,
      status: true,
      note: true,
    },
  });

  if (!fee || fee.status !== "OPEN" || fee.amountPence <= 0) {
    return { applied: false, amountPence: 0, remainingAmountPence: fee?.amountPence ?? 0 };
  }

  if (!fee.teamMemberId && !fee.prospectId) {
    return { applied: false, amountPence: 0, remainingAmountPence: fee.amountPence };
  }

  const balancePence = await getCreditBalanceForPlayer({
    db,
    teamId: fee.teamId,
    teamMemberId: fee.teamMemberId,
    prospectId: fee.prospectId,
  });

  const amountToApply = Math.min(balancePence, fee.amountPence);
  if (amountToApply <= 0) {
    return { applied: false, amountPence: 0, remainingAmountPence: fee.amountPence };
  }

  const creditUseId = `pmfcred_used_${fee.id}`;
  await db.$executeRawUnsafe(
    `
      INSERT INTO "PlayerMatchFeeCreditLedgerEntry" (
        "id",
        "teamId",
        "teamMemberId",
        "prospectId",
        "appliedFeeId",
        "entryType",
        "amountPence",
        "description"
      ) VALUES ($1, $2, $3, $4, $5, 'CREDIT_USED', $6, $7)
      ON CONFLICT ("appliedFeeId") WHERE "entryType" = 'CREDIT_USED' AND "appliedFeeId" IS NOT NULL
      DO NOTHING
    `,
    creditUseId,
    fee.teamId,
    fee.teamMemberId,
    fee.prospectId,
    fee.id,
    amountToApply,
    "Player credit applied to match fee.",
  );

  const remainingAmountPence = fee.amountPence - amountToApply;
  const creditNote = `Player credit applied: £${(amountToApply / 100).toFixed(2)}.`;

  await db.playerMatchFee.update({
    where: { id: fee.id },
    data:
      remainingAmountPence <= 0
        ? {
            status: "PAID",
            paidAt: new Date(),
            amountPence: fee.amountPence,
            paymentUrl: null,
            paymentToken: null,
            note: appendNote({ existingNote: fee.note, note: creditNote }),
          }
        : {
            amountPence: remainingAmountPence,
            note: appendNote({ existingNote: fee.note, note: creditNote }),
          },
  });

  return { applied: true, amountPence: amountToApply, remainingAmountPence };
}
