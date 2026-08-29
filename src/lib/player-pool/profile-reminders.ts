// ========================================
// File: src/lib/player-pool/profile-reminders.ts
// ========================================

import {
  NotificationAudience,
  NotificationChannel,
  NotificationRecipientSourceType,
  NotificationTemplateKind,
} from "@prisma/client";

import { logNotificationDispatchToThread } from "@/lib/communications/log-dispatch";
import { upsertNotificationRecipient } from "@/lib/notifications/recipients";
import { queueNotificationFromTemplate } from "@/lib/notifications/service";
import {
  PLAYER_POOL_PROFILE_STATUSES,
  getPlayerPoolBaseUrl,
  normalizePlayerPoolEmail,
} from "@/lib/player-pool/storage";
import { prisma } from "@/lib/prisma";

export const PLAYER_POOL_PROFILE_REMINDER_TEMPLATE_KEY =
  "player-pool-profile-reminder-email";
export const PLAYER_POOL_PROFILE_REMINDER_SOURCE_TYPE =
  "PLAYER_POOL_PROFILE_NUDGE";

const PLAYER_POOL_PROFILE_REMINDER_SUBJECT =
  "Complete your SIXFL PlayerPool profile, {{firstName}} ⚽";

const PLAYER_POOL_PROFILE_REMINDER_BODY = [
  "Hi {{firstName}},",
  "",
  "Thanks again for your interest in joining **SIXFL PlayerPool** ⚽",
  "",
  "You are already on our PlayerPool list. We just need a few details from you so we can show the right information to suitable local teams and help you find regular football.",
  "",
  "{{matchingContext}}",
  "",
  "## ⚽ What is SIXFL PlayerPool?",
  "",
  "PlayerPool is for players who want regular local 6-a-side football but do not already have a full team ready to enter.",
  "",
  "Instead of trying to find five or six other people yourself, you can create a short player profile and let SIXFL match you with teams that are looking to strengthen their squad.",
  "",
  "## 👤 What do I need to add?",
  "",
  "The form asks for the practical details a captain needs to know:",
  "",
  "✅ Your usual positions",
  "✅ Your football experience",
  "✅ Your local area",
  "✅ The evenings you can normally play",
  "✅ A little information about your availability",
  "",
  "It only takes a few minutes, and you can update your details later if anything changes.",
  "",
  "## 🚀 How PlayerPool works",
  "",
  "### 1️⃣ Complete your profile",
  "",
  "Tell us where, when and how you like to play.",
  "",
  "### 2️⃣ Suitable captains can find you",
  "",
  "We show your football profile to captains in relevant SIXFL leagues and on suitable playing nights.",
  "",
  "### 3️⃣ SIXFL manages the introduction",
  "",
  "A captain asks SIXFL for an introduction. Your private contact details are not made public and are not released simply because somebody views your profile.",
  "",
  "### 4️⃣ You decide whether it is right",
  "",
  "Once an introduction is approved, you and the captain can discuss a game or trial. There is no obligation to join a team if it does not feel like the right fit.",
  "",
  "## 🏆 What is a SIXFL league like?",
  "",
  "SIXFL is organised weekly 6-a-side football, designed to feel like a proper local league rather than an informal kickabout.",
  "",
  "✅ Regular organised fixtures",
  "✅ Referees and match-night management",
  "✅ Live fixtures, results and league tables",
  "✅ Team and player accounts",
  "✅ Team statistics and match information",
  "✅ SIXFL AI match predictions",
  "",
  "Matches are 6-a-side and a team can use up to 9 players on a match night — 6 players plus up to 3 rolling substitutes.",
  "",
  "The match fee is a team fee, and each team decides how its players share it. **Completing your PlayerPool profile does not charge you anything and does not commit you to a team.**",
  "",
  "## 🔒 Your details stay controlled",
  "",
  "Your profile is shown only within the relevant SIXFL captain areas. Your email address and phone number are not public, SIXFL controls introductions, and you can ask us to pause or remove your profile whenever you are no longer looking.",
  "",
  "## ⚽ Finish your profile",
  "",
  "Use your secure link below to complete the details we need:",
  "",
  "{{cta}}",
  "",
  "## Got a question?",
  "",
  "Just reply to this email. We are happy to help, and you do not need to have everything worked out before joining PlayerPool.",
  "",
  "See you on the pitch,",
  "",
  "**SIXFL**",
  "",
  "*6-a-side football. Done properly.*",
].join("\n");

export type PlayerPoolProfileReminderTarget = {
  id: string;
  prospectId: string;
  profileToken: string;
  publicCode: string;
  status: string;
  profileSubmittedAt: Date | null;
  area: string | null;
  leagueId: string | null;
  firstName: string;
  lastName: string | null;
  email: string | null;
  phone: string | null;
  leagueName: string | null;
};

export type QueuePlayerPoolProfileReminderResult =
  | {
      ok: true;
      displayName: string;
      dispatchStatus: string;
      recordedAt: Date;
    }
  | {
      ok: false;
      reason: "not_awaiting" | "missing_email" | "missing_profile_link";
      message: string;
    };

let templateEnsurePromise: ReturnType<
  typeof prisma.notificationTemplate.upsert
> | null = null;

export async function ensurePlayerPoolProfileReminderTemplate() {
  if (!templateEnsurePromise) {
    templateEnsurePromise = prisma.notificationTemplate.upsert({
      where: { key: PLAYER_POOL_PROFILE_REMINDER_TEMPLATE_KEY },
      update: {},
      create: {
        key: PLAYER_POOL_PROFILE_REMINDER_TEMPLATE_KEY,
        name: "PlayerPool profile completion reminder email",
        description:
          "A friendly explanation of PlayerPool and SIXFL leagues, with the player's secure profile-completion link.",
        kind: NotificationTemplateKind.TRANSACTIONAL,
        channel: NotificationChannel.EMAIL,
        audience: NotificationAudience.PLAYER,
        subject: PLAYER_POOL_PROFILE_REMINDER_SUBJECT,
        body: PLAYER_POOL_PROFILE_REMINDER_BODY,
        ctaLabel: "Complete my PlayerPool profile",
        ctaUrlKey: "profileUrl",
        isActive: true,
      },
    });
  }

  try {
    return await templateEnsurePromise;
  } catch (error) {
    templateEnsurePromise = null;
    throw error;
  }
}

function fullName(firstName: string, lastName: string | null) {
  return [firstName, lastName].filter(Boolean).join(" ").trim();
}

function buildMatchingContext(profile: PlayerPoolProfileReminderTarget) {
  const leagueName = profile.leagueName?.trim();
  const area = profile.area?.trim();

  if (leagueName && area) {
    return `We currently have you linked with **${leagueName}** in **${area}**. Completing your profile helps us match you accurately within that area and playing night.`;
  }

  if (leagueName) {
    return `We currently have you linked with **${leagueName}**. Completing your profile helps us understand your position, experience and usual availability.`;
  }

  if (area) {
    return `We currently have your area as **${area}**. Completing your profile helps us find the most suitable nearby league and team.`;
  }

  return "Completing your profile helps us match you by area, preferred playing nights, position and availability.";
}

export async function queuePlayerPoolProfileReminder(input: {
  profile: PlayerPoolProfileReminderTarget;
  createdByUserId?: string | null;
  origin: "player_pool_profile_nudge" | "player_pool_profile_bulk_reminder";
  originLabel: string;
  bulkRunId?: string | null;
}): Promise<QueuePlayerPoolProfileReminderResult> {
  const { profile } = input;

  if (
    profile.status !== PLAYER_POOL_PROFILE_STATUSES.INVITED ||
    profile.profileSubmittedAt
  ) {
    return {
      ok: false,
      reason: "not_awaiting",
      message: "Only players still awaiting their profile can receive this reminder.",
    };
  }

  if (!profile.email?.trim()) {
    return {
      ok: false,
      reason: "missing_email",
      message: "Add an email address before sending this reminder.",
    };
  }

  if (!profile.profileToken?.trim()) {
    return {
      ok: false,
      reason: "missing_profile_link",
      message: "This player does not have an active secure profile link.",
    };
  }

  await ensurePlayerPoolProfileReminderTemplate();

  const email = normalizePlayerPoolEmail(profile.email);
  const displayName = fullName(profile.firstName, profile.lastName) || email;
  const profileUrl = `${getPlayerPoolBaseUrl()}/player-pool/profile/${profile.profileToken}`;

  const recipient = await upsertNotificationRecipient({
    sourceType: NotificationRecipientSourceType.GENERAL,
    sourceId: `player-pool-profile:${profile.id}`,
    audience: NotificationAudience.PLAYER,
    displayName,
    email,
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

  const dispatch = await queueNotificationFromTemplate({
    templateKey: PLAYER_POOL_PROFILE_REMINDER_TEMPLATE_KEY,
    recipientId: recipient.id,
    variables: {
      firstName: profile.firstName.trim() || "there",
      fullName: displayName,
      profileUrl,
      publicCode: profile.publicCode,
      area: profile.area || "",
      leagueName: profile.leagueName || "SIXFL PlayerPool",
      matchingContext: buildMatchingContext(profile),
    },
    sourceType: PLAYER_POOL_PROFILE_REMINDER_SOURCE_TYPE,
    sourceId: profile.id,
    metadata: {
      origin: input.origin,
      originLabel: input.originLabel,
      profileId: profile.id,
      prospectId: profile.prospectId,
      publicCode: profile.publicCode,
      leagueId: profile.leagueId,
      ctaUrl: profileUrl,
      ...(input.bulkRunId ? { bulkRunId: input.bulkRunId } : {}),
    },
    createdByUserId: input.createdByUserId?.trim() || null,
  });

  await logNotificationDispatchToThread({ dispatch, recipient });

  const recordedAt = dispatch.sentAt ?? dispatch.createdAt ?? new Date();

  try {
    await prisma.$transaction([
      prisma.$executeRaw`
        UPDATE "PlayerPoolProfile"
        SET "updatedAt" = ${recordedAt}
        WHERE "id" = ${profile.id}
      `,
      prisma.teamPlayerProspect.update({
        where: { id: profile.prospectId },
        data: { lastContactedAt: recordedAt },
      }),
    ]);
  } catch (error) {
    console.error(
      `PlayerPool reminder queued but contact timestamps could not be updated for ${profile.id}`,
      error,
    );
  }

  return {
    ok: true,
    displayName,
    dispatchStatus: String(dispatch.status),
    recordedAt,
  };
}
