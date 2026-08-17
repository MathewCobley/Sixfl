import {
  NotificationAudience,
  NotificationChannel,
  NotificationRecipientSourceType,
} from "@prisma/client";
import { prisma } from "@/lib/prisma";
import {
  getNotificationRecipientBySource,
  upsertNotificationRecipient,
} from "@/lib/notifications/recipients";
import { queueDirectNotification } from "@/lib/notifications/service";

const REFERRAL_RECORDED_SOURCE = "team-referral-recorded";
const RECOVERABLE_MISSING_EMAIL_REASON = "Recipient has no email address.";

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

async function getReferralNotificationRecipient(referral: ReferralNotificationRow) {
  const currentEmail = referral.referrerEmail?.trim() || null;
  if (!currentEmail) return null;

  const existingRecipient = await getNotificationRecipientBySource({
    sourceType: NotificationRecipientSourceType.USER,
    sourceId: referral.referrerUserId,
  });

  if (!existingRecipient) {
    return upsertNotificationRecipient({
      sourceType: NotificationRecipientSourceType.USER,
      sourceId: referral.referrerUserId,
      audience: NotificationAudience.USER,
      displayName: referral.referrerName,
      email: currentEmail,
      transactionalEmailOptIn: true,
      metadata: {
        referralId: referral.id,
      },
    });
  }

  const storedEmail = existingRecipient.email?.trim() || null;
  const storedName = existingRecipient.displayName?.trim() || null;
  const currentName = referral.referrerName?.trim() || null;
  const emailChanged = storedEmail?.toLowerCase() !== currentEmail.toLowerCase();
  const nameChanged = storedName !== currentName;

  if (!emailChanged && !nameChanged) return existingRecipient;

  // Keep suppression and notification preferences exactly as they are. Only
  // refresh identity fields from the current User record so transactional
  // messages are not sent to a stale or missing recipient email address.
  return prisma.notificationRecipient.update({
    where: { id: existingRecipient.id },
    data: {
      displayName: currentName,
      email: currentEmail,
      emailNormalized: currentEmail.toLowerCase(),
      lastSyncedAt: new Date(),
    },
    include: {
      preferences: true,
    },
  });
}

export async function queueReferralRecordedEmail(referralId: string) {
  const id = referralId.trim();
  if (!id) return { queued: false, reason: "missing_referral_id" as const };

  // Only a live/successful dispatch should make this referral permanently
  // idempotent. A FAILED dispatch or a recoverable SKIPPED dispatch must be
  // allowed to try again after the underlying problem has been corrected.
  const activeOrSentDispatch = await prisma.notificationDispatch.findFirst({
    where: {
      sourceType: REFERRAL_RECORDED_SOURCE,
      sourceId: id,
      status: { in: ["QUEUED", "PROCESSING", "SENT"] },
    },
    select: { id: true },
  });

  if (activeOrSentDispatch) {
    return { queued: false, reason: "already_queued" as const };
  }

  const latestSkippedDispatch = await prisma.notificationDispatch.findFirst({
    where: {
      sourceType: REFERRAL_RECORDED_SOURCE,
      sourceId: id,
      status: "SKIPPED",
    },
    orderBy: { createdAt: "desc" },
    select: { failureReason: true },
  });

  if (
    latestSkippedDispatch &&
    latestSkippedDispatch.failureReason !== RECOVERABLE_MISSING_EMAIL_REASON
  ) {
    return { queued: false, reason: "recipient_blocked" as const };
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

  const teamLabel =
    referral.leadTeamName?.trim() ||
    referral.leadName?.trim() ||
    "the team you referred";
  const reward = money(referral.rewardPence);
  const recipient = await getReferralNotificationRecipient(referral);

  if (!recipient) {
    return { queued: false, reason: "missing_email" as const };
  }

  const dispatch = await queueDirectNotification({
    recipientId: recipient.id,
    channel: NotificationChannel.EMAIL,
    audience: NotificationAudience.USER,
    subject: "Your SIXFL team referral has been recorded",
    body: [
      `Hi ${firstName(referral.referrerName)},`,
      "",
      `Thanks for referring ${teamLabel} to SIXFL. We have recorded your referral and SIXFL will track it automatically.`,
      "",
      "How the reward works:",
      "• The referred team needs to join a SIXFL league.",
      `• The ${reward} referral reward is payable after the team completes ${referral.requiredMatches} league matches.`,
      "• Cancelled or postponed fixtures do not count towards the total.",
      "",
      "You can see the team's current progress at any time from your SIXFL referral page.",
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

  if (dispatch.status !== "QUEUED") {
    return {
      queued: false,
      reason: dispatch.status === "SKIPPED" ? "recipient_blocked" : "not_queued",
    } as const;
  }

  return { queued: true, reason: null };
}

export async function queueMissingReferralRecordedEmails(limit = 100) {
  const safeLimit = Math.max(1, Math.min(Math.trunc(limit), 500));
  const rows = await prisma.$queryRaw<Array<{ id: string }>>`
    SELECT r."id"
    FROM "TeamReferral" r
    INNER JOIN "User" u ON u."id" = r."referrerUserId"
    WHERE r."paidAt" IS NULL
      AND u."email" IS NOT NULL
      AND BTRIM(u."email") <> ''
      AND NOT EXISTS (
        SELECT 1
        FROM "NotificationDispatch" dispatch
        WHERE dispatch."sourceType" = ${REFERRAL_RECORDED_SOURCE}
          AND dispatch."sourceId" = r."id"
          AND dispatch."status" IN ('QUEUED', 'PROCESSING', 'SENT')
      )
      AND NOT EXISTS (
        SELECT 1
        FROM "NotificationDispatch" dispatch
        WHERE dispatch."sourceType" = ${REFERRAL_RECORDED_SOURCE}
          AND dispatch."sourceId" = r."id"
          AND dispatch."status" = 'SKIPPED'
          AND COALESCE(dispatch."failureReason", '') <> ${RECOVERABLE_MISSING_EMAIL_REASON}
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
