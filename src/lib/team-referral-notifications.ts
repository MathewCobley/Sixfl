import {
  NotificationAudience,
  NotificationChannel,
  NotificationRecipientSourceType,
} from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { upsertNotificationRecipient } from "@/lib/notifications/recipients";
import { queueDirectNotification } from "@/lib/notifications/service";

const REFERRAL_RECORDED_SOURCE = "team-referral-recorded";

type ReferralNotificationRow = {
  id: string;
  referrerUserId: string;
  referrerName: string | null;
  referrerEmail: string | null;
  leadName: string;
  leadTeamName: string | null;
  rewardPence: number;
  requiredMatches: number;
};

function firstName(value?: string | null) {
  return value?.trim().split(/\s+/)[0] || "there";
}

function money(pence: number) {
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: "GBP",
    maximumFractionDigits: 0,
  }).format(pence / 100);
}

export async function queueReferralRecordedEmail(referralId: string) {
  const id = referralId.trim();
  if (!id) return { queued: false, reason: "missing_referral_id" as const };

  const alreadyQueued = await prisma.notificationDispatch.findFirst({
    where: {
      sourceType: REFERRAL_RECORDED_SOURCE,
      sourceId: id,
    },
    select: { id: true },
  });

  if (alreadyQueued) {
    return { queued: false, reason: "already_queued" as const };
  }

  const rows = await prisma.$queryRaw<ReferralNotificationRow[]>`
    SELECT
      r."id",
      r."referrerUserId",
      u."name" AS "referrerName",
      u."email" AS "referrerEmail",
      l."contactName" AS "leadName",
      l."teamName" AS "leadTeamName",
      r."rewardPence",
      r."requiredMatches"
    FROM "TeamReferral" r
    INNER JOIN "User" u ON u."id" = r."referrerUserId"
    INNER JOIN "InterestLead" l ON l."id" = r."interestLeadId"
    WHERE r."id" = ${id}
    LIMIT 1
  `;

  const referral = rows[0];
  if (!referral) return { queued: false, reason: "not_found" as const };
  if (!referral.referrerEmail?.trim()) {
    return { queued: false, reason: "missing_email" as const };
  }

  const teamLabel = referral.leadTeamName?.trim() || referral.leadName?.trim() || "the team you referred";
  const reward = money(referral.rewardPence);

  const recipient = await upsertNotificationRecipient({
    sourceType: NotificationRecipientSourceType.USER,
    sourceId: referral.referrerUserId,
    audience: NotificationAudience.USER,
    displayName: referral.referrerName,
    email: referral.referrerEmail,
    transactionalEmailOptIn: true,
    metadata: {
      referralId: referral.id,
    },
  });

  await queueDirectNotification({
    recipientId: recipient.id,
    channel: NotificationChannel.EMAIL,
    audience: NotificationAudience.USER,
    subject: "Your SIXFL team referral is being tracked",
    body: [
      `Hi ${firstName(referral.referrerName)},`,
      "",
      `Thanks for referring ${teamLabel} to SIXFL. We have recorded your referral and you do not need to do anything else right now.`,
      "",
      "What happens next:",
      `• The referred team needs to join a SIXFL league.`,
      `• Once they complete ${referral.requiredMatches} league matches, your ${reward} referral reward becomes payable.`,
      "• Cancelled or postponed fixtures do not count towards the total.",
      "",
      "You can follow the team's progress at any time from your SIXFL referral page.",
      "",
      "{{cta}}",
      "",
      "Referral terms and conditions apply.",
    ].join("\n"),
    isTransactional: true,
    sourceType: REFERRAL_RECORDED_SOURCE,
    sourceId: referral.id,
    metadata: {
      event: "team_referral.recorded.email",
      referralId: referral.id,
      referredTeam: teamLabel,
    },
    emailCta: {
      label: "Track my referral",
      url: "https://www.sixfl.co.uk/player/referrals",
    },
  });

  return { queued: true, reason: null };
}

export async function queueMissingReferralRecordedEmails(limit = 100) {
  const safeLimit = Math.max(1, Math.min(Math.trunc(limit), 500));
  const rows = await prisma.$queryRaw<Array<{ id: string }>>`
    SELECT r."id"
    FROM "TeamReferral" r
    INNER JOIN "User" u ON u."id" = r."referrerUserId"
    WHERE u."email" IS NOT NULL
      AND BTRIM(u."email") <> ''
      AND NOT EXISTS (
        SELECT 1
        FROM "NotificationDispatch" dispatch
        WHERE dispatch."sourceType" = ${REFERRAL_RECORDED_SOURCE}
          AND dispatch."sourceId" = r."id"
      )
    ORDER BY r."createdAt" ASC
    LIMIT ${safeLimit}
  `;

  let queued = 0;
  let skipped = 0;

  for (const row of rows) {
    try {
      const result = await queueReferralRecordedEmail(row.id);
      if (result.queued) queued += 1;
      else skipped += 1;
    } catch (error) {
      skipped += 1;
      console.error(`Referral recorded email queue failed for ${row.id}:`, error);
    }
  }

  return {
    checked: rows.length,
    queued,
    skipped,
  };
}
