import {
  NotificationAudience,
  NotificationChannel,
  NotificationRecipientSourceType,
  Prisma,
} from "@prisma/client";

import { logNotificationDispatchToThread } from "@/lib/communications/log-dispatch";
import { upsertNotificationRecipient } from "@/lib/notifications/recipients";
import { queueDirectNotification } from "@/lib/notifications/service";
import {
  PLAYER_POOL_PROFILE_STATUSES,
  getPlayerPoolBaseUrl,
} from "@/lib/player-pool/storage";
import { prisma } from "@/lib/prisma";
import { PLAYER_POOL_PROFILE_REMINDER_SOURCE_TYPE } from "./profile-reminders";

export const PLAYER_POOL_PROFILE_SMS_FIRST_SOURCE_TYPE =
  "PLAYER_POOL_PROFILE_SMS_NUDGE_1";
export const PLAYER_POOL_PROFILE_SMS_FINAL_SOURCE_TYPE =
  "PLAYER_POOL_PROFILE_SMS_NUDGE_FINAL";

const FIRST_SMS_DELAY_MS = 48 * 60 * 60 * 1000;
const FINAL_SMS_DELAY_MS = 5 * 24 * 60 * 60 * 1000;

type AwaitingProfileRow = {
  id: string;
  prospectId: string;
  profileToken: string;
  publicCode: string;
  status: string;
  profileSubmittedAt: Date | null;
  leagueId: string | null;
  firstName: string;
  lastName: string | null;
  email: string | null;
  phone: string | null;
  emailSentAt: Date | null;
  firstSmsCreatedAt: Date | null;
  firstSmsSentAt: Date | null;
  finalSmsCreatedAt: Date | null;
};

export type PlayerPoolProfileSmsReminderSummary = {
  scanned: number;
  firstSmsQueued: number;
  finalSmsQueued: number;
  skippedNoPhone: number;
  skippedNotDue: number;
  errors: string[];
};

function fullName(firstName: string, lastName: string | null) {
  return [firstName, lastName].filter(Boolean).join(" ").trim();
}

function isDue(reference: Date | null, delayMs: number, now: Date) {
  return Boolean(reference && now.getTime() >= reference.getTime() + delayMs);
}

async function getAwaitingProfiles() {
  return prisma.$queryRaw<AwaitingProfileRow[]>(Prisma.sql`
    SELECT
      profile."id",
      profile."prospectId",
      profile."profileToken",
      profile."publicCode",
      profile."status",
      profile."profileSubmittedAt",
      profile."leagueId",
      prospect."firstName",
      prospect."lastName",
      prospect."email",
      prospect."phone",
      (
        SELECT MAX(dispatch."sentAt")
        FROM "NotificationDispatch" dispatch
        WHERE dispatch."sourceType" = ${PLAYER_POOL_PROFILE_REMINDER_SOURCE_TYPE}
          AND dispatch."sourceId" = profile."id"
          AND dispatch."channel" = 'EMAIL'::"NotificationChannel"
          AND dispatch."status" = 'SENT'::"NotificationDispatchStatus"
      ) AS "emailSentAt",
      (
        SELECT MAX(dispatch."createdAt")
        FROM "NotificationDispatch" dispatch
        WHERE dispatch."sourceType" = ${PLAYER_POOL_PROFILE_SMS_FIRST_SOURCE_TYPE}
          AND dispatch."sourceId" = profile."id"
          AND dispatch."channel" = 'SMS'::"NotificationChannel"
          AND dispatch."status" <> 'CANCELLED'::"NotificationDispatchStatus"
      ) AS "firstSmsCreatedAt",
      (
        SELECT MAX(dispatch."sentAt")
        FROM "NotificationDispatch" dispatch
        WHERE dispatch."sourceType" = ${PLAYER_POOL_PROFILE_SMS_FIRST_SOURCE_TYPE}
          AND dispatch."sourceId" = profile."id"
          AND dispatch."channel" = 'SMS'::"NotificationChannel"
          AND dispatch."status" = 'SENT'::"NotificationDispatchStatus"
      ) AS "firstSmsSentAt",
      (
        SELECT MAX(dispatch."createdAt")
        FROM "NotificationDispatch" dispatch
        WHERE dispatch."sourceType" = ${PLAYER_POOL_PROFILE_SMS_FINAL_SOURCE_TYPE}
          AND dispatch."sourceId" = profile."id"
          AND dispatch."channel" = 'SMS'::"NotificationChannel"
          AND dispatch."status" <> 'CANCELLED'::"NotificationDispatchStatus"
      ) AS "finalSmsCreatedAt"
    FROM "PlayerPoolProfile" profile
    JOIN "TeamPlayerProspect" prospect ON prospect."id" = profile."prospectId"
    WHERE profile."status" = ${PLAYER_POOL_PROFILE_STATUSES.INVITED}
      AND profile."profileSubmittedAt" IS NULL
      AND profile."profileToken" IS NOT NULL
      AND TRIM(profile."profileToken") <> ''
    ORDER BY profile."invitedAt" ASC NULLS LAST
  `);
}

async function queueSms(input: {
  profile: AwaitingProfileRow;
  stage: "first" | "final";
}) {
  const { profile } = input;
  const profileUrl = `${getPlayerPoolBaseUrl()}/player-pool/profile/${profile.profileToken}`;
  const displayName =
    fullName(profile.firstName, profile.lastName) || profile.email || "Player";
  const firstName = profile.firstName.trim() || "there";

  const recipient = await upsertNotificationRecipient({
    sourceType: NotificationRecipientSourceType.GENERAL,
    sourceId: `player-pool-profile:${profile.id}`,
    audience: NotificationAudience.PLAYER,
    displayName,
    email: profile.email,
    phone: profile.phone,
    transactionalEmailOptIn: true,
    transactionalSmsOptIn: true,
    marketingEmailOptIn: false,
    marketingSmsOptIn: false,
    metadata: {
      entityType: "PLAYER_POOL_PROFILE",
      profileId: profile.id,
      prospectId: profile.prospectId,
      publicCode: profile.publicCode,
      leagueId: profile.leagueId,
    },
  });

  const isFinal = input.stage === "final";
  const body = isFinal
    ? `Hi ${firstName}, just a final reminder from SIXFL about your PlayerPool profile. If you'd still like us to help find you a team, please complete it here: ${profileUrl} If you're no longer looking, you can ignore this message.`
    : `Hi ${firstName}, it's SIXFL. We emailed you your PlayerPool profile link but it looks like you haven't completed it yet. It only takes a couple of minutes and helps us match you with the right local teams: ${profileUrl}`;

  const dispatch = await queueDirectNotification({
    recipientId: recipient.id,
    channel: NotificationChannel.SMS,
    audience: NotificationAudience.PLAYER,
    body,
    isTransactional: true,
    sourceType: isFinal
      ? PLAYER_POOL_PROFILE_SMS_FINAL_SOURCE_TYPE
      : PLAYER_POOL_PROFILE_SMS_FIRST_SOURCE_TYPE,
    sourceId: profile.id,
    variables: {
      firstName,
      profileUrl,
      publicCode: profile.publicCode,
    },
    metadata: {
      type: "player_pool_profile_sms_reminder",
      stage: input.stage,
      profileId: profile.id,
      prospectId: profile.prospectId,
      publicCode: profile.publicCode,
      ctaUrl: profileUrl,
      automatic: true,
    },
  });

  await logNotificationDispatchToThread({ dispatch, recipient });
  return dispatch;
}

export async function runPlayerPoolProfileSmsReminderJob(): Promise<PlayerPoolProfileSmsReminderSummary> {
  const summary: PlayerPoolProfileSmsReminderSummary = {
    scanned: 0,
    firstSmsQueued: 0,
    finalSmsQueued: 0,
    skippedNoPhone: 0,
    skippedNotDue: 0,
    errors: [],
  };

  const profiles = await getAwaitingProfiles();
  summary.scanned = profiles.length;
  const now = new Date();

  for (const profile of profiles) {
    if (!profile.phone?.trim()) {
      summary.skippedNoPhone += 1;
      continue;
    }

    try {
      // We deliberately wait for the email to be SENT, not merely queued.
      // This prevents an SMS overtaking a delayed or failed email.
      if (
        !profile.firstSmsCreatedAt &&
        isDue(profile.emailSentAt, FIRST_SMS_DELAY_MS, now)
      ) {
        await queueSms({ profile, stage: "first" });
        summary.firstSmsQueued += 1;
        continue;
      }

      // The final reminder is only queued after the first SMS itself has been
      // successfully sent, and only once. There are never more than two SMS nudges.
      if (
        profile.firstSmsSentAt &&
        !profile.finalSmsCreatedAt &&
        isDue(profile.firstSmsSentAt, FINAL_SMS_DELAY_MS, now)
      ) {
        await queueSms({ profile, stage: "final" });
        summary.finalSmsQueued += 1;
        continue;
      }

      summary.skippedNotDue += 1;
    } catch (error) {
      if (summary.errors.length < 20) {
        summary.errors.push(
          `${profile.id}:${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }
  }

  return summary;
}
