import {
  NotificationAudience,
  NotificationChannel,
  NotificationRecipientSourceType,
} from "@prisma/client";
import {
  appendSIXFLTextSignature,
  buildSIXFLEmailHtml,
} from "@/lib/email/buildEmail";
import {
  getNotificationRecipientBySource,
  upsertNotificationRecipient,
} from "@/lib/notifications/recipients";
import { prisma } from "@/lib/prisma";
import { getEmailReplyDomain } from "@/lib/resend/client";

const REFERRAL_RECORDED_SOURCE = "team-referral-recorded";
const REFERRAL_PAYOUT_READY_SOURCE = "team-referral-payout-ready";
const RECOVERABLE_MISSING_EMAIL_REASON = "Recipient has no email address.";
const RECOVERABLE_CHANNEL_DISABLED_REASON = "Recipient email notifications are disabled.";

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

type ReferralPayoutReadyRow = ReferralNotificationRow & {
  completedMatches: number;
  payoutDetailsSubmittedAt: Date | null;
  paidAt: Date | null;
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

function isRecoverableRecordedSkip(reason?: string | null) {
  return (
    reason === RECOVERABLE_MISSING_EMAIL_REASON ||
    reason === RECOVERABLE_CHANNEL_DISABLED_REASON
  );
}

async function getReferralNotificationRecipient(referral: ReferralNotificationRow) {
  const currentEmail = referral.referrerEmail?.trim() || null;
  if (!currentEmail) return null;

  const existingRecipient = await getNotificationRecipientBySource({
    sourceType: NotificationRecipientSourceType.USER,
    sourceId: referral.referrerUserId,
  });

  if (!existingRecipient) {
    await upsertNotificationRecipient({
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

    return getNotificationRecipientBySource({
      sourceType: NotificationRecipientSourceType.USER,
      sourceId: referral.referrerUserId,
    });
  }

  const storedEmail = existingRecipient.email?.trim() || null;
  const storedName = existingRecipient.displayName?.trim() || null;
  const currentName = referral.referrerName?.trim() || null;
  const emailChanged = storedEmail?.toLowerCase() !== currentEmail.toLowerCase();
  const nameChanged = storedName !== currentName;

  if (!emailChanged && !nameChanged) return existingRecipient;

  // Keep suppression and explicit transactional opt-in exactly as they are.
  // Referral reward emails are essential account/payment messages, so the
  // generic emailEnabled preference is deliberately not used as a blocker.
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

async function queueEssentialReferralEmail(input: {
  referral: ReferralNotificationRow;
  sourceType: string;
  subject: string;
  body: string;
  cta: { label: string; url: string };
  metadata: Record<string, string>;
}) {
  const activeOrSentDispatch = await prisma.notificationDispatch.findFirst({
    where: {
      sourceType: input.sourceType,
      sourceId: input.referral.id,
      status: { in: ["QUEUED", "PROCESSING", "SENT"] },
    },
    select: { id: true },
  });

  if (activeOrSentDispatch) {
    return { queued: false, reason: "already_queued" as const };
  }

  const recipient = await getReferralNotificationRecipient(input.referral);
  if (!recipient?.email?.trim()) {
    return { queued: false, reason: "missing_email" as const };
  }

  let blockedReason: string | null = null;
  if (recipient.isSuppressed) blockedReason = "Recipient is suppressed.";
  else if (!recipient.transactionalEmailOptIn) {
    blockedReason = "Transactional email is disabled for recipient.";
  }

  const ctaText = `${input.cta.label}: ${input.cta.url}`;
  const plainBody = input.body.includes("{{cta}}")
    ? input.body.replace(/\{\{\s*cta\s*\}\}/gi, ctaText)
    : `${input.body}\n\n${ctaText}`;
  const bodyText = appendSIXFLTextSignature(
    plainBody.replace(/\n{3,}/g, "\n\n").trim(),
  );
  const bodyHtml = buildSIXFLEmailHtml({ body: input.body, cta: input.cta });

  if (blockedReason) {
    await prisma.notificationDispatch.create({
      data: {
        recipientId: recipient.id,
        channel: NotificationChannel.EMAIL,
        audience: NotificationAudience.USER,
        status: "SKIPPED",
        isTransactional: true,
        subject: input.subject,
        bodyText,
        bodyHtml,
        sourceType: input.sourceType,
        sourceId: input.referral.id,
        metadata: input.metadata,
        scheduledFor: new Date(),
        failureReason: blockedReason,
      },
    });
    return { queued: false, reason: "recipient_blocked" as const };
  }

  // Match the normal notification service's configuration check while allowing
  // this essential transactional email to bypass only the generic channel toggle.
  getEmailReplyDomain();

  await prisma.notificationDispatch.create({
    data: {
      recipientId: recipient.id,
      channel: NotificationChannel.EMAIL,
      audience: NotificationAudience.USER,
      status: "QUEUED",
      isTransactional: true,
      subject: input.subject,
      bodyText,
      bodyHtml,
      sourceType: input.sourceType,
      sourceId: input.referral.id,
      metadata: input.metadata,
      scheduledFor: new Date(),
    },
  });

  return { queued: true, reason: null };
}

async function getReferralNotificationRow(referralId: string) {
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
    WHERE r."id" = ${referralId}
    LIMIT 1
  `;
  return rows[0] ?? null;
}

export async function queueReferralRecordedEmail(referralId: string) {
  const id = referralId.trim();
  if (!id) return { queued: false, reason: "missing_referral_id" as const };

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
    !isRecoverableRecordedSkip(latestSkippedDispatch.failureReason)
  ) {
    return { queued: false, reason: "recipient_blocked" as const };
  }

  const referral = await getReferralNotificationRow(id);
  if (!referral) return { queued: false, reason: "not_found" as const };
  if (!referral.referrerEmail?.trim()) {
    return { queued: false, reason: "missing_email" as const };
  }

  const teamLabel =
    referral.leadTeamName?.trim() ||
    referral.leadName?.trim() ||
    "the team you referred";
  const reward = money(referral.rewardPence);

  return queueEssentialReferralEmail({
    referral,
    sourceType: REFERRAL_RECORDED_SOURCE,
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
    cta: {
      label: "Track my referral",
      url: "https://www.sixfl.co.uk/player/referrals",
    },
    metadata: {
      event: "team_referral.recorded.email",
      referralId: referral.id,
      referredTeam: teamLabel,
    },
  });
}

export async function queueReferralPayoutReadyEmail(referralId: string) {
  const id = referralId.trim();
  if (!id) return { queued: false, reason: "missing_referral_id" as const };

  const rows = await prisma.$queryRaw<ReferralPayoutReadyRow[]>`
    SELECT
      r."id",
      r."referrerUserId",
      u."name" AS "referrerName",
      u."email" AS "referrerEmail",
      l."contactName" AS "leadName",
      l."teamName" AS "leadTeamName",
      r."rewardPence",
      r."requiredMatches",
      COUNT(DISTINCT f."id")::int AS "completedMatches",
      r."payoutDetailsSubmittedAt",
      r."paidAt"
    FROM "TeamReferral" r
    INNER JOIN "User" u ON u."id" = r."referrerUserId"
    INNER JOIN "InterestLead" l ON l."id" = r."interestLeadId"
    LEFT JOIN "Team" t ON t."id" = l."convertedTeamId"
    LEFT JOIN "Fixture" f
      ON (f."homeTeamId" = t."id" OR f."awayTeamId" = t."id")
      AND f."status" = 'COMPLETED'
      AND NOT EXISTS (
        SELECT 1
        FROM "FixtureAbandonment" abandonment
        WHERE abandonment."fixtureId" = f."id"
      )
    WHERE r."id" = ${id}
    GROUP BY
      r."id", r."referrerUserId", u."name", u."email", l."contactName",
      l."teamName", r."rewardPence", r."requiredMatches",
      r."payoutDetailsSubmittedAt", r."paidAt"
    LIMIT 1
  `;

  const referral = rows[0];
  if (!referral) return { queued: false, reason: "not_found" as const };
  if (referral.paidAt) return { queued: false, reason: "already_paid" as const };
  if (referral.payoutDetailsSubmittedAt) {
    return { queued: false, reason: "details_already_received" as const };
  }
  if (referral.completedMatches < referral.requiredMatches) {
    return { queued: false, reason: "not_ready" as const };
  }

  const teamLabel =
    referral.leadTeamName?.trim() ||
    referral.leadName?.trim() ||
    "the team you referred";
  const reward = money(referral.rewardPence);

  return queueEssentialReferralEmail({
    referral,
    sourceType: REFERRAL_PAYOUT_READY_SOURCE,
    subject: `Your ${reward} SIXFL referral reward is ready`,
    body: [
      `Hi ${firstName(referral.referrerName)},`,
      "",
      `Great news — ${teamLabel} have now completed ${referral.requiredMatches} qualifying SIXFL league matches, so your ${reward} referral reward is ready to be paid.`,
      "",
      "Please use the secure SIXFL page below to provide the UK bank details you would like us to pay.",
      "",
      "For security, please do not send bank details by email or text message.",
      "",
      "{{cta}}",
      "",
      "Once your payment details are received, SIXFL can arrange the reward payment.",
    ].join("\n"),
    cta: {
      label: "Provide payment details",
      url: `https://www.sixfl.co.uk/player/referrals/payout/${encodeURIComponent(referral.id)}`,
    },
    metadata: {
      event: "team_referral.payout_ready.email",
      referralId: referral.id,
      referredTeam: teamLabel,
      reward,
    },
  });
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
          AND COALESCE(dispatch."failureReason", '') NOT IN (
            ${RECOVERABLE_MISSING_EMAIL_REASON},
            ${RECOVERABLE_CHANNEL_DISABLED_REASON}
          )
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

export async function queueReadyReferralPayoutEmails(limit = 100) {
  const safeLimit = Math.max(1, Math.min(Math.trunc(limit), 500));
  const rows = await prisma.$queryRaw<Array<{ id: string }>>`
    SELECT r."id"
    FROM "TeamReferral" r
    INNER JOIN "User" u ON u."id" = r."referrerUserId"
    INNER JOIN "InterestLead" l ON l."id" = r."interestLeadId"
    LEFT JOIN "Team" t ON t."id" = l."convertedTeamId"
    WHERE r."paidAt" IS NULL
      AND r."payoutDetailsSubmittedAt" IS NULL
      AND u."email" IS NOT NULL
      AND BTRIM(u."email") <> ''
      AND (
        SELECT COUNT(DISTINCT f."id")
        FROM "Fixture" f
        WHERE (f."homeTeamId" = t."id" OR f."awayTeamId" = t."id")
          AND f."status" = 'COMPLETED'
          AND NOT EXISTS (
            SELECT 1
            FROM "FixtureAbandonment" abandonment
            WHERE abandonment."fixtureId" = f."id"
          )
      ) >= r."requiredMatches"
      AND NOT EXISTS (
        SELECT 1
        FROM "NotificationDispatch" dispatch
        WHERE dispatch."sourceType" = ${REFERRAL_PAYOUT_READY_SOURCE}
          AND dispatch."sourceId" = r."id"
          AND dispatch."status" IN ('QUEUED', 'PROCESSING', 'SENT')
      )
      AND NOT EXISTS (
        SELECT 1
        FROM "NotificationDispatch" dispatch
        WHERE dispatch."sourceType" = ${REFERRAL_PAYOUT_READY_SOURCE}
          AND dispatch."sourceId" = r."id"
          AND dispatch."status" = 'SKIPPED'
      )
    ORDER BY r."createdAt" ASC
    LIMIT ${safeLimit}
  `;

  let queued = 0;
  let skipped = 0;

  for (const row of rows) {
    try {
      const result = await queueReferralPayoutReadyEmail(row.id);
      if (result.queued) queued += 1;
      else skipped += 1;
    } catch (error) {
      skipped += 1;
      console.error(`Referral payout-ready email queue failed for ${row.id}:`, error);
    }
  }

  return {
    checked: rows.length,
    queued,
    skipped,
  };
}
