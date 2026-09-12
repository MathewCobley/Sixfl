import { Prisma } from "@prisma/client";
import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { normalizePhoneNumber } from "@/lib/notifications/phone";
import { queueNotificationFromTemplate } from "@/lib/notifications/service";
import { logNotificationDispatchToThread } from "@/lib/communications/log-dispatch";
import { getPlayerPoolBaseUrl } from "./storage";
import { getPlayerPoolContactHistory, readPlayerPoolContactTargets } from "./contact-history";
import { PLAYER_POOL_CONTACT_SOURCES, PLAYER_POOL_RESPONSE_TEMPLATE_KEY, PLAYER_POOL_REMINDER_SOURCE, playerPoolChaseBlock } from "./response-policy";

export type ResponseReminderResult =
  | { ok: true; displayName: string; dispatchStatus: string; recordedAt: Date; dispatchId: string }
  | { ok: false; reason: string; message: string };

export async function queuePlayerPoolResponseReminder(input: {
  profileId: string; createdByUserId?: string | null; origin: string;
  originLabel: string; bulkRunId?: string | null; now?: Date;
}): Promise<ResponseReminderResult> {
  const now = input.now ?? new Date();
  const result = await prisma.$transaction(async db => {
    const profile = (await readPlayerPoolContactTargets([input.profileId], db, true))[0];
    if (!profile) return { ok: false as const, reason: "not_found", message: "PlayerPool profile not found." };
    // Contact lock also protects against two profile records sharing a changed email.
    const email = profile.email?.trim().toLowerCase() || "";
    await db.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${"playerpool-chase:" + email}, 0))`;
    const history = (await getPlayerPoolContactHistory([profile], db)).get(profile.id)!;
    const blocked = playerPoolChaseBlock(profile, history, now);
    if (blocked) return { ok: false as const, reason: "not_eligible", message: blocked };
    const shared = await db.$queryRaw<Array<{ count: number }>>`
      SELECT COUNT(*)::int AS count FROM "PlayerPoolProfile" pp
      JOIN "TeamPlayerProspect" p ON p.id=pp."prospectId"
      WHERE LOWER(TRIM(p.email))=${email}
    `;
    if (shared[0]?.count !== 1) return { ok: false as const, reason: "ambiguous_contact", message: "Email is shared by multiple PlayerPool records; review identity before chasing." };
    if (input.bulkRunId) {
      const previous = await db.notificationDispatch.findFirst({ where: {
        sourceType: PLAYER_POOL_REMINDER_SOURCE, sourceId: profile.id,
        metadata: { path: ["bulkRunId"], equals: input.bulkRunId },
      }, select: { id: true } });
      if (previous) return { ok: false as const, reason: "already_recorded", message: "This chase run already has a recorded attempt; it will not be sent twice." };
    }
    const template = await db.notificationTemplate.findUnique({ where: { key: PLAYER_POOL_RESPONSE_TEMPLATE_KEY } });
    if (!template?.isActive || template.channel !== "EMAIL" || template.kind !== "TRANSACTIONAL" || template.audience !== "PLAYER") {
      return { ok: false as const, reason: "template_unavailable", message: "The PlayerPool response email template is missing, disabled or incorrectly configured." };
    }
    const displayName = [profile.firstName,profile.lastName].filter(Boolean).join(" ").trim() || email;
    const contact = { displayName, email, emailNormalized: email,
      phone: normalizePhoneNumber(profile.phone), phoneNormalized: normalizePhoneNumber(profile.phone), lastSyncedAt: now };
    const recipient = await db.notificationRecipient.upsert({
      where: { sourceType_sourceId: { sourceType: "GENERAL", sourceId: `player-pool-profile:${profile.id}` } },
      update: contact, // Never reset preferences, suppression or either channel's opt-in.
      create: { ...contact, sourceType: "GENERAL", sourceId: `player-pool-profile:${profile.id}`, audience: "PLAYER",
        transactionalEmailOptIn: true, transactionalSmsOptIn: true, marketingEmailOptIn: false, marketingSmsOptIn: false,
        metadata: { entityType: "PLAYER_POOL_PROFILE", profileId: profile.id, prospectId: profile.prospectId, publicCode: profile.publicCode } },
    });
    await db.notificationPreference.upsert({ where: { recipientId: recipient.id }, update: {}, create: { recipientId: recipient.id } });
    const profileUrl = `${getPlayerPoolBaseUrl()}/player-pool/profile/${profile.profileToken}`;
    const dispatch = await queueNotificationFromTemplate({
      templateKey: PLAYER_POOL_RESPONSE_TEMPLATE_KEY, recipientId: recipient.id,
      sourceType: PLAYER_POOL_REMINDER_SOURCE, sourceId: profile.id,
      variables: { firstName: profile.firstName.trim() || "there", fullName: displayName, publicCode: profile.publicCode,
        profileUrl, notLookingUrl: `${profileUrl}/respond`, leagueName: profile.leagueName || "SIXFL PlayerPool", area: profile.area || "" },
      createdByUserId: input.createdByUserId || null,
      metadata: { origin: input.origin, originLabel: input.originLabel, profileId: profile.id,
        prospectId: profile.prospectId, publicCode: profile.publicCode, ctaUrl: profileUrl,
        ...(input.bulkRunId ? { bulkRunId: input.bulkRunId } : {}) },
    }, db);
    if (dispatch.status === "QUEUED") await db.teamPlayerProspect.update({ where: { id: profile.prospectId }, data: { lastContactedAt: now } });
    return { ok: true as const, dispatch, recipient, displayName };
  }, { maxWait: 5000, timeout: 20000 });
  if (!result.ok) return result;
  // The outbox commit is authoritative. A timeline failure must not imply that
  // nothing queued or cause a caller to queue the message a second time.
  try { await logNotificationDispatchToThread(result); }
  catch (error) { console.error("[playerpool-response] queued; conversation logging needs retry", result.dispatch.id, error); }
  return { ok: true, displayName: result.displayName, dispatchStatus: result.dispatch.status,
    recordedAt: result.dispatch.sentAt ?? result.dispatch.createdAt, dispatchId: result.dispatch.id };
}

/** Re-check before provider submission, including old messages and manual retries. */
export async function getPlayerPoolContactDeliveryBlock(dispatch: {
  id: string; sourceType: string | null; sourceId: string | null; channel: string;
  recipient: { email: string | null; phone: string | null }; variables: unknown;
}): Promise<string | null> {
  if (!PLAYER_POOL_CONTACT_SOURCES.includes(dispatch.sourceType || "")) return null;
  if (!dispatch.sourceId) return "PlayerPool message has no profile reference.";
  const profile = (await readPlayerPoolContactTargets([dispatch.sourceId]))[0];
  if (!profile) return "PlayerPool profile no longer exists.";
  const history = (await getPlayerPoolContactHistory([profile], prisma, dispatch.id)).get(profile.id)!;
  const reason = playerPoolChaseBlock(profile, history, new Date(), dispatch.channel === "SMS" ? "SMS" : "EMAIL", true);
  if (reason) return reason;
  if (dispatch.channel === "EMAIL" && profile.email?.trim().toLowerCase() !== dispatch.recipient.email?.trim().toLowerCase()) return "Player email has changed; review the recipient before resending.";
  if (dispatch.channel === "SMS" && normalizePhoneNumber(profile.phone) !== normalizePhoneNumber(dispatch.recipient.phone)) return "Player phone has changed; review the recipient before resending.";
  const variables = dispatch.variables && typeof dispatch.variables === "object" ? dispatch.variables as Record<string, unknown> : {};
  try {
    if (typeof variables.profileUrl !== "string" || new URL(variables.profileUrl).pathname !== `/player-pool/profile/${profile.profileToken}`) return "PlayerPool profile link has changed; stale message cancelled.";
  } catch { return "Invalid PlayerPool profile link."; }
  return null;
}

/** The secure form's explicit POST changes only this incomplete PlayerPool
 * enquiry. GETs/link scanners do not change state. Silence is never a decline. */
export async function declineAwaitingPlayerPoolProfile(token: string) {
  if (!token || token.length > 256) return false;
  return prisma.$transaction(async db => {
    const profiles = await db.$queryRaw<Array<{ id: string; status: string; profileSubmittedAt: Date | null }>>`
      SELECT id,status,"profileSubmittedAt" FROM "PlayerPoolProfile" WHERE "profileToken"=${token} FOR UPDATE
    `;
    const profile = profiles[0];
    if (!profile) return false;
    if (profile.status === "NOT_LOOKING") return true;
    if (profile.status !== "INVITED" || profile.profileSubmittedAt) return false;
    await db.$executeRaw`INSERT INTO "PlayerPoolResponseEvent" (id,"profileId",response,"previousStatus","actorType")
      VALUES (${randomUUID()},${profile.id},'NOT_LOOKING',${profile.status},'PROFILE_LINK_HOLDER')`;
    await db.$executeRaw`UPDATE "PlayerPoolProfile" SET status='NOT_LOOKING', "consentContact"=false, "updatedAt"=NOW() WHERE id=${profile.id}`;
    await db.notificationDispatch.updateMany({ where: {
      sourceId: profile.id, sourceType: { in: PLAYER_POOL_CONTACT_SOURCES }, status: "QUEUED",
    }, data: { status: "CANCELLED", cancelledAt: new Date(), failureReason: "Player confirmed they are no longer looking through their secure PlayerPool form." } });
    return true;
  });
}
