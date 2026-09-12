import { randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { queueNotificationFromTemplate } from "@/lib/notifications/service";
import { logNotificationDispatchToThread } from "@/lib/communications/log-dispatch";
import { getPlayerPoolBaseUrl } from "@/lib/player-pool/storage";
import { normalizePhoneNumber } from "@/lib/notifications/phone";
import { getPlayerPoolFollowupStates } from "./followup-history";
import { followupBlock, PROFILE_CONTACT_SOURCES, RESPONSE_CHASE_SOURCE, RESPONSE_CHASE_TEMPLATE } from "./followup-policy";

export async function queuePlayerPoolResponseChase(profileId: string, actorUserId: string | null = null): Promise<{ queued: boolean; reason: string | null; dispatchId?: string }> {
  const result = await prisma.$transaction(async db => {
    await db.$queryRaw(Prisma.sql`SELECT id FROM "PlayerPoolProfile" WHERE id = ${profileId} FOR UPDATE`);
    const [state] = await getPlayerPoolFollowupStates([profileId], db);
    if (!state) return { queued: false as const, reason: "Profile no longer exists" };
    const reason = followupBlock(state);
    if (reason) return { queued: false as const, reason };
    const template = await db.notificationTemplate.findUnique({ where: { key: RESPONSE_CHASE_TEMPLATE } });
    if (!template?.isActive || template.channel !== "EMAIL" || template.audience !== "PLAYER" || template.kind !== "TRANSACTIONAL") {
      return { queued: false as const, reason: "Response-request template is unavailable or disabled" };
    }
    const contact = { displayName: state.firstName, email: state.email!.trim(),
      emailNormalized: state.email!.trim().toLowerCase(), phone: normalizePhoneNumber(state.phone),
      phoneNormalized: normalizePhoneNumber(state.phone), lastSyncedAt: new Date() };
    const recipient = await db.notificationRecipient.upsert({
      where: { sourceType_sourceId: { sourceType: "GENERAL", sourceId: `player-pool-profile:${state.id}` } },
      // Never reset suppression, opt-ins or preferences on existing contacts.
      update: contact,
      create: { ...contact, sourceType: "GENERAL", sourceId: `player-pool-profile:${state.id}`, audience: "PLAYER",
        transactionalEmailOptIn: true, transactionalSmsOptIn: true, marketingEmailOptIn: false, marketingSmsOptIn: false },
    });
    await db.notificationPreference.upsert({ where: { recipientId: recipient.id }, update: {}, create: { recipientId: recipient.id } });
    const responseUrl = `${getPlayerPoolBaseUrl()}/player-pool/profile/${state.profileToken}/respond`;
    const dispatch = await queueNotificationFromTemplate({ templateKey: RESPONSE_CHASE_TEMPLATE, recipientId: recipient.id,
      sourceType: RESPONSE_CHASE_SOURCE, sourceId: state.id, createdByUserId: actorUserId,
      variables: { firstName: state.firstName.trim() || "there", responseUrl, publicCode: state.publicCode },
      metadata: { profileId: state.id, prospectId: state.prospectId, publicCode: state.publicCode,
        origin: "player_pool_response_request", originLabel: actorUserId ? "Admin response request" : "Owner-requested PlayerPool follow-up",
        ctaUrl: responseUrl },
    }, db);
    return { queued: dispatch.status === "QUEUED", reason: dispatch.status === "QUEUED" ? null : `Dispatch ${dispatch.status.toLowerCase()}`,
      dispatch, recipient };
  }, { maxWait: 5000, timeout: 15000 });
  if (result.dispatch && result.recipient) {
    // The durable outbox is authoritative. A display-log failure must not cause
    // a second email; the unique source key and profile lock remain in force.
    try { await logNotificationDispatchToThread({ dispatch: result.dispatch, recipient: result.recipient }); }
    catch { console.error("PlayerPool response request saved; communications projection needs refresh."); }
    return { queued: result.queued, reason: result.reason, dispatchId: result.dispatch.id };
  }
  return result;
}

/** Used by the normal authenticated admin route and the explicit one-off job.
 * No provider is called here; the existing notification worker sends the outbox. */
export async function runPlayerPoolResponseChases(ids: string[], actorUserId: string | null = null) {
  const unique = [...new Set(ids)];
  if (unique.length > 500) throw new Error("Review smaller batches of at most 500 profiles.");
  const result = { targeted: unique.length, queued: 0, skipped: 0, failed: 0, items: [] as Array<{ profileId: string; queued: boolean; reason: string | null; dispatchId?: string }> };
  for (const id of unique) {
    try {
      const item = await queuePlayerPoolResponseChase(id, actorUserId);
      if (item.queued) result.queued++; else result.skipped++;
      result.items.push({ profileId: id, ...item });
    } catch {
      result.failed++;
      result.items.push({ profileId: id, queued: false, reason: "Queue failed — check saved history before retrying" });
    }
  }
  return result;
}

/** Recheck just before the shared EMAIL/SMS provider. Applies to existing
 * queued profile chases too, without changing unrelated messages or payments. */
export async function getPlayerPoolFollowupDeliveryBlock(dispatch: {
  id: string; sourceType: string | null; sourceId: string | null; channel: string;
  recipient: { email: string | null; phone: string | null }; variables: unknown;
}): Promise<string | null> {
  if (!dispatch.sourceType || !PROFILE_CONTACT_SOURCES.includes(dispatch.sourceType)) return null;
  if (!dispatch.sourceId) return "PlayerPool message has no profile reference.";
  const [state] = await getPlayerPoolFollowupStates([dispatch.sourceId]);
  if (!state || state.status !== "INVITED" || state.profileSubmittedAt || state.declinedAt) return "Player is no longer awaiting a profile; chase stopped.";
  if (state.latestReplyAt) return "Player has replied; review the conversation instead of chasing.";
  if (state.hasSquadRecord || state.hasIntroduction) return "Player already has a squad or introduction record; review first.";
  if (dispatch.channel === "EMAIL" && (state.emailBlocked || !state.emailMatches || !state.email || state.email.trim().toLowerCase() !== dispatch.recipient.email?.trim().toLowerCase())) return "Email disabled, opted out or identity changed; chase stopped.";
  if (dispatch.channel === "SMS" && (state.smsBlocked || !normalizePhoneNumber(state.phone) || normalizePhoneNumber(state.phone) !== normalizePhoneNumber(dispatch.recipient.phone))) return "SMS disabled, opted out or phone changed; chase stopped.";
  const responseRequest = state.events.find(e => e.kind === RESPONSE_CHASE_SOURCE && e.id !== dispatch.id);
  if (responseRequest) return "Response request already recorded; old profile chase sequence stopped.";
  if (dispatch.sourceType === RESPONSE_CHASE_SOURCE) {
    const vars = dispatch.variables && typeof dispatch.variables === "object" ? dispatch.variables as Record<string, unknown> : {};
    const expected = `${getPlayerPoolBaseUrl()}/player-pool/profile/${state.profileToken}/respond`;
    if (vars.responseUrl !== expected) return "Response link changed; stale chase stopped.";
  }
  return null;
}

/** GET only shows the choice. A deliberate form POST records an explicit NO.
 * Silence and ambiguous free-text replies are never interpreted as a refusal. */
export async function declinePlayerPoolResponse(token: string) {
  if (!token || token.length > 200) return false;
  return prisma.$transaction(async db => {
    const rows = await db.$queryRaw<Array<{ id: string; publicCode: string; status: string; profileSubmittedAt: Date | null }>>(Prisma.sql`
      SELECT id, "publicCode", status, "profileSubmittedAt" FROM "PlayerPoolProfile" WHERE "profileToken" = ${token} FOR UPDATE
    `);
    const p = rows[0];
    if (!p) return false;
    if (p.status === "NOT_LOOKING") return true;
    if (p.status !== "INVITED" || p.profileSubmittedAt) return false;
    await db.$executeRaw(Prisma.sql`INSERT INTO "PlayerPoolResponseDecision" (id, "profileId", "publicCode", answer, "createdAt")
      VALUES (${randomUUID()}, ${p.id}, ${p.publicCode}, 'NOT_LOOKING', NOW()) ON CONFLICT ("profileId") DO NOTHING`);
    await db.$executeRaw(Prisma.sql`UPDATE "PlayerPoolProfile" SET status = 'NOT_LOOKING', "updatedAt" = NOW() WHERE id = ${p.id}`);
    await db.notificationDispatch.updateMany({ where: { sourceId: p.id, sourceType: { in: PROFILE_CONTACT_SOURCES },
      status: "QUEUED", sentAt: null, providerMessageId: null },
      data: { status: "CANCELLED", cancelledAt: new Date(), failureReason: "Player explicitly said they are no longer looking." } });
    return true;
  });
}
