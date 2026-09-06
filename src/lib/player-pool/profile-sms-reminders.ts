import { Prisma } from "@prisma/client";
import { logNotificationDispatchToThread } from "@/lib/communications/log-dispatch";
import { normalizePhoneNumber } from "@/lib/notifications/phone";
import { queueNotificationFromTemplate } from "@/lib/notifications/service";
import { getPlayerPoolBaseUrl } from "@/lib/player-pool/storage";
import { prisma } from "@/lib/prisma";
import { PLAYER_POOL_PROFILE_REMINDER_SOURCE_TYPE } from "./profile-reminders";
import {
  FINAL_SMS_DELAY_MS, PLAYER_POOL_PROFILE_SMS_FIRST_SOURCE_TYPE,
  PLAYER_POOL_PROFILE_SMS_FINAL_SOURCE_TYPE, PLAYER_POOL_PROFILE_SMS_SOURCES,
  PLAYER_POOL_PROFILE_SMS_TEMPLATE_KEYS, emptyProfileSmsHistory, isPlayerPoolProfileSms,
  preferredProfileSmsDispatch, profileSmsPlan, type ProfileSmsHistory,
} from "./profile-sms-policy";
export { PLAYER_POOL_PROFILE_SMS_FIRST_SOURCE_TYPE, PLAYER_POOL_PROFILE_SMS_FINAL_SOURCE_TYPE } from "./profile-sms-policy";

// Preserve extended Prisma delegates for both root and interactive transactions.
type Db = Pick<typeof prisma, "$queryRaw" | "notificationDispatch" | "notificationRecipient" | "notificationPreference" | "notificationTemplate">;
type AwaitingProfileRow = {
  id: string; prospectId: string; profileToken: string; publicCode: string;
  status: string; profileSubmittedAt: Date | null; leagueId: string | null;
  firstName: string; lastName: string | null; email: string | null; phone: string | null;
};
export type PlayerPoolProfileSmsReminderSummary = {
  scanned: number; firstSmsQueued: number; finalSmsQueued: number;
  skippedNoPhone: number; skippedNotDue: number; errors: string[];
};

/** One batched read for the cards; the worker uses exactly the same dispatch history. */
export async function getPlayerPoolProfileSmsHistory(profileIds: string[], db: Db = prisma) {
  const ids = [...new Set(profileIds)];
  const histories = new Map<string, ProfileSmsHistory>(ids.map((id) => [id, emptyProfileSmsHistory()]));
  if (!ids.length) return histories;
  const [dispatches, recipients] = await Promise.all([
    db.notificationDispatch.findMany({
      where: { sourceId: { in: ids }, OR: [
        { channel: "SMS", sourceType: { in: PLAYER_POOL_PROFILE_SMS_SOURCES } },
        { channel: "EMAIL", sourceType: PLAYER_POOL_PROFILE_REMINDER_SOURCE_TYPE, status: "SENT" },
      ] },
      select: { id: true, sourceId: true, sourceType: true, channel: true, status: true,
        sentAt: true, createdAt: true, scheduledFor: true, failedAt: true, failureReason: true },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    }),
    db.notificationRecipient.findMany({
      where: { sourceType: "GENERAL", sourceId: { in: ids.map((id) => `player-pool-profile:${id}`) } },
      select: { sourceId: true, isSuppressed: true, transactionalSmsOptIn: true, preferences: { select: { smsEnabled: true } } },
    }),
  ]);
  for (const dispatch of dispatches) {
    const history = histories.get(dispatch.sourceId!);
    if (!history) continue;
    if (dispatch.channel === "EMAIL") {
      if (dispatch.sentAt && (!history.emailSentAt || dispatch.sentAt > history.emailSentAt)) history.emailSentAt = dispatch.sentAt;
    } else {
      const stage = dispatch.sourceType === PLAYER_POOL_PROFILE_SMS_FIRST_SOURCE_TYPE ? "first" : "final";
      history[stage] = preferredProfileSmsDispatch(history[stage], dispatch);
    }
  }
  for (const recipient of recipients) {
    const history = histories.get(recipient.sourceId!.replace(/^player-pool-profile:/, ""));
    if (history && (recipient.isSuppressed || !recipient.transactionalSmsOptIn || recipient.preferences?.smsEnabled === false)) {
      history.blockedReason = "SMS disabled or contact opted out — automatic SMS chases stopped.";
    }
  }
  return histories;
}

async function readProfile(id: string, db: Db = prisma, lock = false) {
  const rows = await db.$queryRaw<AwaitingProfileRow[]>(Prisma.sql`
    SELECT profile."id", profile."prospectId", profile."profileToken", profile."publicCode",
      profile."status", profile."profileSubmittedAt", profile."leagueId",
      prospect."firstName", prospect."lastName", prospect."email", prospect."phone"
    FROM "PlayerPoolProfile" profile
    JOIN "TeamPlayerProspect" prospect ON prospect."id" = profile."prospectId"
    WHERE profile."id" = ${id}
    ${lock ? Prisma.sql`FOR UPDATE OF profile` : Prisma.empty}
  `);
  return rows[0] ?? null;
}

/** Lock the profile and re-read stage history before creating the outbox entry.
 * Overlapping cron runs cannot queue the same chase twice; no provider call occurs here. */
export async function queueDuePlayerPoolProfileSms(profileId: string, now = new Date()) {
  return prisma.$transaction(async (db) => {
    const profile = await readProfile(profileId, db, true);
    if (!profile?.profileToken?.trim()) return null;
    const history = (await getPlayerPoolProfileSmsHistory([profile.id], db)).get(profile.id)!;
    const plan = profileSmsPlan(profile, history);
    if (!plan.stage || !plan.dueAt || now < plan.dueAt) return null;
    const templateKey = PLAYER_POOL_PROFILE_SMS_TEMPLATE_KEYS[plan.stage];
    const template = await db.notificationTemplate.findUnique({ where: { key: templateKey } });
    if (!template?.isActive) return null;
    if (template.channel !== "SMS" || template.kind !== "TRANSACTIONAL" || template.audience !== "PLAYER") {
      throw new Error("Profile chase template must remain a transactional PLAYER SMS.");
    }
    const phone = normalizePhoneNumber(profile.phone);
    const email = profile.email?.trim() || null;
    const profileUrl = `${getPlayerPoolBaseUrl()}/player-pool/profile/${profile.profileToken}`;
    const contact = {
      displayName: [profile.firstName, profile.lastName].filter(Boolean).join(" ").trim() || email || "Player",
      email, emailNormalized: email?.toLowerCase() || null, phone, phoneNormalized: phone,
      lastSyncedAt: now,
    };
    const recipient = await db.notificationRecipient.upsert({
      where: { sourceType_sourceId: { sourceType: "GENERAL", sourceId: `player-pool-profile:${profile.id}` } },
      // Never reset suppression, opt-outs or notification preferences when chasing.
      update: contact,
      create: { ...contact, sourceType: "GENERAL", sourceId: `player-pool-profile:${profile.id}`, audience: "PLAYER",
        transactionalEmailOptIn: true, transactionalSmsOptIn: true, marketingEmailOptIn: false, marketingSmsOptIn: false,
        metadata: { entityType: "PLAYER_POOL_PROFILE", profileId: profile.id, prospectId: profile.prospectId, publicCode: profile.publicCode } },
    });
    await db.notificationPreference.upsert({ where: { recipientId: recipient.id }, update: {}, create: { recipientId: recipient.id } });
    const dispatch = await queueNotificationFromTemplate({
      templateKey, recipientId: recipient.id,
      sourceType: plan.stage === "first" ? PLAYER_POOL_PROFILE_SMS_FIRST_SOURCE_TYPE : PLAYER_POOL_PROFILE_SMS_FINAL_SOURCE_TYPE,
      sourceId: profile.id,
      variables: { firstName: profile.firstName.trim() || "there", profileUrl, publicCode: profile.publicCode },
      metadata: { type: "player_pool_profile_sms_reminder", stage: plan.stage, profileId: profile.id,
        prospectId: profile.prospectId, publicCode: profile.publicCode, ctaUrl: profileUrl, automatic: true },
    }, db);
    return { dispatch, recipient, stage: plan.stage };
  }, { maxWait: 5000, timeout: 15000 });
}

/** Called immediately before the shared SMS provider, including manual retries and old queued chases. */
export async function getPlayerPoolProfileSmsDeliveryBlock(dispatch: {
  id: string; sourceType: string | null; sourceId: string | null; channel: string;
  createdAt: Date; recipientId: string; recipient: { phone: string | null }; variables: unknown;
}, now = new Date()): Promise<string | null> {
  if (!isPlayerPoolProfileSms(dispatch.sourceType)) return null;
  if (dispatch.channel !== "SMS" || !dispatch.sourceId) return "Invalid PlayerPool SMS chase.";
  const profile = await readProfile(dispatch.sourceId);
  if (!profile || profile.status !== "INVITED" || profile.profileSubmittedAt) return "Player is no longer awaiting a profile; SMS chase cancelled.";
  const phone = normalizePhoneNumber(profile.phone);
  if (!phone || phone !== normalizePhoneNumber(dispatch.recipient.phone)) return "Player contact number is missing or has changed; review before resending.";
  const recipient = await prisma.notificationRecipient.findUnique({ where: { id: dispatch.recipientId }, include: { preferences: true } });
  if (!recipient || recipient.isSuppressed || !recipient.transactionalSmsOptIn || !recipient.preferences?.smsEnabled) return "SMS disabled or contact opted out; chase cancelled.";
  if (phone !== normalizePhoneNumber(recipient.phone)) return "SMS recipient has changed; review before resending.";
  const variables = dispatch.variables && typeof dispatch.variables === "object" ? dispatch.variables as Record<string, unknown> : {};
  try {
    if (typeof variables.profileUrl !== "string" || new URL(variables.profileUrl).pathname !== `/player-pool/profile/${profile.profileToken}`) return "Profile link has changed; stale SMS chase cancelled.";
  } catch { return "Invalid profile link; SMS chase cancelled."; }
  const duplicate = await prisma.notificationDispatch.findFirst({
    where: { sourceType: dispatch.sourceType, sourceId: profile.id, channel: "SMS", id: { not: dispatch.id }, OR: [
      { sentAt: { not: null } },
      { status: { in: ["QUEUED", "PROCESSING"] }, OR: [
        { createdAt: { lt: dispatch.createdAt } }, { createdAt: dispatch.createdAt, id: { lt: dispatch.id } },
      ] },
    ] }, select: { id: true },
  });
  if (duplicate) return "This SMS chase already has a sent or earlier pending entry; duplicate cancelled.";
  if (dispatch.sourceType === PLAYER_POOL_PROFILE_SMS_FINAL_SOURCE_TYPE) {
    const first = await prisma.notificationDispatch.findFirst({
      where: { sourceType: PLAYER_POOL_PROFILE_SMS_FIRST_SOURCE_TYPE, sourceId: profile.id, channel: "SMS", status: "SENT", sentAt: { not: null } },
      orderBy: { sentAt: "desc" }, select: { sentAt: true },
    });
    if (!first?.sentAt || now.getTime() < first.sentAt.getTime() + FINAL_SMS_DELAY_MS) return "Final chase requires a successfully sent first SMS at least 48 hours earlier.";
  }
  return null;
}

export async function runPlayerPoolProfileSmsReminderJob(): Promise<PlayerPoolProfileSmsReminderSummary> {
  const summary: PlayerPoolProfileSmsReminderSummary = { scanned: 0, firstSmsQueued: 0, finalSmsQueued: 0, skippedNoPhone: 0, skippedNotDue: 0, errors: [] };
  const profiles = await prisma.$queryRaw<Array<{ id: string; phone: string | null }>>`
    SELECT profile."id", prospect."phone" FROM "PlayerPoolProfile" profile
    JOIN "TeamPlayerProspect" prospect ON prospect."id" = profile."prospectId"
    WHERE profile."status" = 'INVITED' AND profile."profileSubmittedAt" IS NULL
      AND profile."profileToken" IS NOT NULL AND TRIM(profile."profileToken") <> ''
    ORDER BY profile."invitedAt" ASC NULLS LAST
  `;
  summary.scanned = profiles.length;
  for (const profile of profiles) {
    if (!normalizePhoneNumber(profile.phone)) { summary.skippedNoPhone++; continue; }
    try {
      const result = await queueDuePlayerPoolProfileSms(profile.id);
      if (!result || result.dispatch.status !== "QUEUED") { summary.skippedNotDue++; continue; }
      if (result.stage === "first") summary.firstSmsQueued++; else summary.finalSmsQueued++;
      // Logging is after the atomic outbox commit. A logging failure cannot cause a resend.
      await logNotificationDispatchToThread(result);
    } catch (error) {
      if (summary.errors.length < 20) summary.errors.push(`${profile.id}:${error instanceof Error ? error.message : "SMS chase failed"}`);
    }
  }
  return summary;
}
