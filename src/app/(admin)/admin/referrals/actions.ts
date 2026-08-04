"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/requireAdmin";
import { getTeamReferrals } from "@/lib/team-referrals";

export async function markReferralPaidAction(formData: FormData) {
  const { user } = await requireAdmin();
  const referralId = String(formData.get("referralId") ?? "").trim();
  if (!referralId) return;

  const referrals = await getTeamReferrals();
  const referral = referrals.find((item) => item.id === referralId);

  if (!referral || referral.paidAt || referral.completedMatches < referral.requiredMatches) {
    return;
  }

  await prisma.$executeRaw`
    UPDATE "TeamReferral"
    SET
      "paidAt" = CURRENT_TIMESTAMP,
      "paidByUserId" = ${user?.id ?? null},
      "updatedAt" = CURRENT_TIMESTAMP
    WHERE "id" = ${referralId}
      AND "paidAt" IS NULL
  `;

  revalidatePath("/admin/referrals");
  revalidatePath("/player/referrals");
}
