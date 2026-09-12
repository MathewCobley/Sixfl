import { prisma } from "@/lib/prisma";
import { REFERRAL_INELIGIBILITY_REASONS, REFERRAL_REWARD_EMAIL_SOURCES } from "./team-referral-eligibility-policy";

export class ReferralEligibilityError extends Error {}

export async function referralRewardEmailBlock(input: { sourceType?: string | null; sourceId?: string | null }) {
  if (!input.sourceType || !REFERRAL_REWARD_EMAIL_SOURCES.includes(input.sourceType)) return null;
  if (!input.sourceId) return "Referral record unavailable; reward email blocked.";
  const rows = await prisma.$queryRaw<Array<{ ineligibleAt: Date | null }>>`
    SELECT "ineligibleAt" FROM "TeamReferral" WHERE id=${input.sourceId}
  `;
  if (!rows.length) return "Referral record unavailable; reward email blocked.";
  return rows[0].ineligibleAt ? "Referral marked not eligible; reward email cancelled." : null;
}

export async function markReferralIneligible(input: {
  referralId: string; actorUserId: string; reasonCode: string; note: string; confirmed: boolean;
}) {
  const note = input.note.trim();
  if (!input.confirmed) throw new ReferralEligibilityError("Confirm the eligibility decision before saving.");
  if (!REFERRAL_INELIGIBILITY_REASONS.some(reason => reason.value === input.reasonCode)) {
    throw new ReferralEligibilityError("Choose a reason for this referral being ineligible.");
  }
  if (note.length < 10 || note.length > 1000) throw new ReferralEligibilityError("Add an admin note of 10–1,000 characters.");

  return prisma.$transaction(async tx => {
    const actor = input.actorUserId ? await tx.user.findUnique({
      where: { id: input.actorUserId }, select: { role: true, name: true, email: true },
    }) : null;
    if (actor?.role !== "ADMIN") throw new ReferralEligibilityError("Administrator access is required.");
    const rows = await tx.$queryRaw<Array<{ id: string; paidAt: Date | null; ineligibleAt: Date | null }>>`
      SELECT id, "paidAt", "ineligibleAt" FROM "TeamReferral" WHERE id=${input.referralId} FOR UPDATE
    `;
    const referral = rows[0];
    if (!referral) throw new ReferralEligibilityError("Referral not found.");
    if (referral.paidAt) throw new ReferralEligibilityError("This referral has already been paid. It cannot be marked ineligible here.");
    if (referral.ineligibleAt) return { unchanged: true, cancelled: 0 };
    const sending = await tx.notificationDispatch.count({ where: {
      sourceId: referral.id, sourceType: { in: REFERRAL_REWARD_EMAIL_SOURCES }, status: "PROCESSING",
    } });
    if (sending) throw new ReferralEligibilityError("A referral email is currently sending. Check the message queue and retry once it has finished.");
    await tx.$executeRaw`
      UPDATE "TeamReferral" SET "ineligibleAt"=CURRENT_TIMESTAMP,
        "ineligibleByUserId"=${input.actorUserId}, "ineligibleByName"=${actor.name?.trim() || actor.email || "SIXFL administrator"},
        "ineligibleReasonCode"=${input.reasonCode}, "ineligibleNote"=${note},
        "payoutDetailsCiphertext"=NULL, "payoutDetailsIv"=NULL, "payoutDetailsAuthTag"=NULL,
        "updatedAt"=CURRENT_TIMESTAMP
      WHERE id=${referral.id} AND "paidAt" IS NULL AND "ineligibleAt" IS NULL
    `;
    const cancelled = await tx.notificationDispatch.updateMany({ where: {
      sourceId: referral.id, sourceType: { in: REFERRAL_REWARD_EMAIL_SOURCES }, status: { in: ["QUEUED", "FAILED"] },
    }, data: { status: "CANCELLED", cancelledAt: new Date(), failureReason: "Referral marked not eligible; reward email cancelled." } });
    return { unchanged: false, cancelled: cancelled.count };
  }, { maxWait: 5000, timeout: 15000 });
}

/** Private notes are fetched only for the authenticated administrator view. */
export async function getReferralEligibilityAudit(actorUserId: string) {
  const actor = actorUserId ? await prisma.user.findUnique({ where: { id: actorUserId }, select: { role: true } }) : null;
  if (actor?.role !== "ADMIN") throw new ReferralEligibilityError("Administrator access is required.");
  return prisma.$queryRaw<Array<{ id: string; ineligibleByName: string; ineligibleNote: string }>>`
    SELECT id, "ineligibleByName", "ineligibleNote" FROM "TeamReferral" WHERE "ineligibleAt" IS NOT NULL
  `;
}
