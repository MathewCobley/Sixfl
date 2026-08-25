import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";

type AssignedShareDb = Pick<typeof prisma, "$queryRaw">;

type AssignedShareRow = {
  id: string;
  captainAssignedAmountPence: number | null;
};

type PlayerFeeWithIdentity = {
  id: string;
  amountPence: number;
  note?: string | null;
};

const CAP_NOTE_PATTERN =
  /Player fee cap applied: captain share £([0-9,.]+); player charged £([0-9,.]+)\./i;

function parsePoundsToPence(value: string) {
  const amount = Number(value.replace(/,/g, ""));
  if (!Number.isFinite(amount) || amount < 0) return null;
  return Math.round(amount * 100);
}

export function getLegacyCaptainAssignedSharePence(input: {
  amountPence: number;
  note?: string | null;
}) {
  const match = CAP_NOTE_PATTERN.exec(input.note ?? "");
  if (!match) return input.amountPence;
  return parsePoundsToPence(match[1]) ?? input.amountPence;
}

export async function hydrateCaptainAssignedPlayerFees<
  T extends PlayerFeeWithIdentity,
>(fees: T[], db: AssignedShareDb = prisma) {
  if (fees.length === 0) {
    return [] as Array<T & { captainAssignedAmountPence: number }>;
  }

  const ids = Array.from(new Set(fees.map((fee) => fee.id).filter(Boolean)));
  let rows: AssignedShareRow[] = [];

  try {
    rows = await db.$queryRaw<AssignedShareRow[]>(Prisma.sql`
      SELECT "id", "captainAssignedAmountPence"
      FROM "PlayerMatchFee"
      WHERE "id" IN (${Prisma.join(ids)})
    `);
  } catch {
    // During a rolling deployment an app instance can briefly run before the
    // migration is visible. Fall back to the structured legacy cap note rather
    // than breaking a captain/payment page.
    rows = [];
  }

  const assignedById = new Map(
    rows.map((row) => [row.id, row.captainAssignedAmountPence] as const),
  );

  return fees.map((fee) => {
    const stored = assignedById.get(fee.id);
    const captainAssignedAmountPence =
      typeof stored === "number" && Number.isFinite(stored) && stored >= 0
        ? stored
        : getLegacyCaptainAssignedSharePence(fee);

    return { ...fee, captainAssignedAmountPence };
  });
}
