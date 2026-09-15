import { Prisma, UserRole } from "@prisma/client";
import { prisma } from "@/lib/prisma";

export type AbandonmentFeeDecision = "STANDARD" | "UNCHANGED";

/** Default remains the existing rule. Invalid inputs never fall back to charging. */
export async function resolveAbandonmentFeeDecision(input: {
  feeDecision?: string;
  feeOverrideReason?: string | null;
  recordedByUserId: string;
}, db: Pick<typeof prisma, "user"> = prisma) {
  const decision = input.feeDecision ?? "STANDARD";
  if (decision !== "STANDARD" && decision !== "UNCHANGED") {
    throw new Error("Choose a valid abandonment fee decision.");
  }
  if (decision === "STANDARD") return { decision, reason: null } as const;

  // Do not trust an admin flag or actor role supplied by a browser/caller.
  const actor = await db.user.findUnique({ where: { id: input.recordedByUserId }, select: { role: true } });
  if (actor?.role !== UserRole.ADMIN) throw new Error("Only SIXFL admin can override abandoned-match fees.");
  const reason = input.feeOverrideReason?.trim() ?? "";
  if (reason.length < 3 || reason.length > 500) {
    throw new Error("Give a reason for leaving match fees unchanged (3–500 characters).");
  }
  return { decision, reason } as const;
}

/** Read-only exception used by existing charge sync and player collection paths.
 * Ordinary cancellations, postponements, waivers and default abandonments are
 * never made collectible by this helper. No amounts or statuses are repaired. */
export async function getFeePreservedAbandonmentIds(
  fixtureIds: string[],
  db: Pick<typeof prisma, "$queryRaw"> = prisma,
) {
  const ids = [...new Set(fixtureIds.filter(Boolean))];
  if (!ids.length) return new Set<string>();
  const rows = await db.$queryRaw<Array<{ fixtureId: string }>>(Prisma.sql`
    SELECT "fixtureId" FROM "FixtureAbandonment"
    WHERE "fixtureId" IN (${Prisma.join(ids)}) AND "feeDecision" = 'UNCHANGED'
  `);
  return new Set(rows.map(row => row.fixtureId));
}
