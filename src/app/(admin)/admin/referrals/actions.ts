"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/requireAdmin";
import { clearTeamReferralPayoutSecrets } from "@/lib/team-referral-payout";
import { queueReferralRecordedEmail } from "@/lib/team-referral-notifications";
import {
  attachReferralToLead,
  getOrCreateReferralCode,
  getTeamReferrals,
} from "@/lib/team-referrals";

function referralRedirect(params: Record<string, string>) {
  const searchParams = new URLSearchParams(params);
  redirect(`/admin/referrals?${searchParams.toString()}`);
}

export async function attachExistingLeadReferralAction(formData: FormData) {
  await requireAdmin();

  const leadId = String(formData.get("leadId") ?? "").trim();
  const referrerUserId = String(formData.get("referrerUserId") ?? "").trim();

  if (!leadId || !referrerUserId) {
    referralRedirect({ error: "missing" });
  }

  const leadRows = await prisma.$queryRaw<
    Array<{ id: string; email: string; interestType: string }>
  >`
    SELECT "id", "email", "interestType"::text AS "interestType"
    FROM "InterestLead"
    WHERE "id" = ${leadId}
    LIMIT 1
  `;
  const lead = leadRows[0];

  if (!lead || lead.interestType !== "TEAM") {
    referralRedirect({ error: "lead_not_found" });
  }

  const playerRows = await prisma.$queryRaw<
    Array<{ id: string; email: string; name: string | null }>
  >`
    SELECT u."id", u."email", u."name"
    FROM "User" u
    WHERE u."id" = ${referrerUserId}
      AND u."email" IS NOT NULL
      AND BTRIM(u."email") <> ''
      AND EXISTS (
        SELECT 1
        FROM "TeamMember" member
        WHERE member."userId" = u."id"
      )
    LIMIT 1
  `;
  const player = playerRows[0];

  if (!player) {
    referralRedirect({ error: "player_not_found" });
  }

  const existingRows = await prisma.$queryRaw<Array<{ referrerUserId: string }>>`
    SELECT "referrerUserId"
    FROM "TeamReferral"
    WHERE "interestLeadId" = ${lead.id}
    LIMIT 1
  `;

  if (existingRows[0]) {
    referralRedirect({ error: "already_referred" });
  }

  if (lead.email.trim().toLowerCase() === player.email.trim().toLowerCase()) {
    referralRedirect({ error: "same_email" });
  }

  const referralCode = await getOrCreateReferralCode(player.id);
  const attached = await attachReferralToLead({
    interestLeadId: lead.id,
    referralCode,
    leadEmail: lead.email,
  });

  if (!attached) {
    referralRedirect({ error: "attach_failed" });
  }

  const linkedRows = await prisma.$queryRaw<Array<{ referrerUserId: string }>>`
    SELECT "referrerUserId"
    FROM "TeamReferral"
    WHERE "interestLeadId" = ${lead.id}
    LIMIT 1
  `;

  if (linkedRows[0]?.referrerUserId !== player.id) {
    referralRedirect({ error: "already_referred" });
  }

  revalidatePath("/admin/referrals");
  revalidatePath("/player/referrals");
  referralRedirect({ added: "1" });
}

export async function retryReferralRecordedEmailAction(formData: FormData) {
  await requireAdmin();

  const referralId = String(formData.get("referralId") ?? "").trim();
  if (!referralId) {
    referralRedirect({ email: "missing" });
  }

  const result = await queueReferralRecordedEmail(referralId);

  revalidatePath("/admin/referrals");

  if (result.queued) {
    referralRedirect({ email: "queued" });
  }

  switch (result.reason) {
    case "already_queued":
      referralRedirect({ email: "already" });
    case "recipient_blocked":
      referralRedirect({ email: "blocked" });
    case "missing_email":
      referralRedirect({ email: "no_email" });
    case "not_found":
      referralRedirect({ email: "not_found" });
    default:
      referralRedirect({ email: "failed" });
  }
}

export async function markReferralPaidAction(formData: FormData) {
  const { user } = await requireAdmin();
  const referralId = String(formData.get("referralId") ?? "").trim();
  if (!referralId) return;

  const referrals = await getTeamReferrals();
  const referral = referrals.find((item) => item.id === referralId);

  if (
    !referral ||
    referral.paidAt ||
    referral.completedMatches < referral.requiredMatches ||
    !referral.payoutDetailsSubmittedAt
  ) {
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
      AND "payoutDetailsSubmittedAt" IS NOT NULL
  `;

  // Keep the audit timestamps, but remove the bank account number, sort code and
  // encryption material once SIXFL records the reward as paid.
  await clearTeamReferralPayoutSecrets(referralId);

  revalidatePath("/admin/referrals");
  revalidatePath(`/admin/referrals/payout/${encodeURIComponent(referralId)}`);
  revalidatePath("/player/referrals");
  revalidatePath(`/player/referrals/payout/${encodeURIComponent(referralId)}`);
}
