import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { normalizePhoneNumber } from "@/lib/notifications/phone";
import { queueNotificationFromTemplate } from "@/lib/notifications/service";
import { logNotificationDispatchToThread } from "@/lib/communications/log-dispatch";
import { getPlayerPoolBaseUrl } from "@/lib/player-pool/storage";
import { getPlayerPoolContactHistory, playerPoolChaseBlock, PROFILE_CHASE_SOURCE, PROFILE_CHASE_SOURCES, RESPONSE_TEMPLATE_KEY } from "./contact-history";

export async function queuePlayerPoolResponseChase(input: {
  profileId: string; createdByUserId?: string | null; bulkRunId?: string | null;
  origin: string; originLabel: string;
}) {
  const outcome = await prisma.$transaction(async db => {
    // Serialise all individual/bulk follow-ups for a profile. Re-read live state,
    // not a stale target copied by the browser or by an earlier batch query.
    await db.$queryRaw(Prisma.sql`SELECT id FROM "PlayerPoolProfile" WHERE id=${input.profileId} FOR UPDATE`);
    const profile = (await getPlayerPoolContactHistory([input.profileId], db, { bulkRunId: input.bulkRunId ?? undefined })).get(input.profileId);
    const blocked = playerPoolChaseBlock(profile);
    if (blocked || !profile) return { ok: false as const, reason: "not_awaiting" as const, message: blocked || "Profile not found." };
    const template = await db.notificationTemplate.findUnique({ where: { key: RESPONSE_TEMPLATE_KEY } });
    if (!template?.isActive || template.channel !== "EMAIL" || template.kind !== "TRANSACTIONAL" || template.audience !== "PLAYER") {
      return { ok: false as const, reason: "not_awaiting" as const, message: "The PlayerPool response email template is unavailable or disabled." };
    }
    const email = profile.email!.trim().toLowerCase();
    // Also serialise by contact, so duplicate legacy profiles cannot be mailed
    // concurrently even when they have different profile identifiers.
    await db.$queryRaw(Prisma.sql`SELECT pg_advisory_xact_lock(hashtext('playerpool-response:' || ${email}))::text`);
    const fresh = (await getPlayerPoolContactHistory([profile.id], db, { bulkRunId: input.bulkRunId ?? undefined })).get(profile.id);
    const recheck = playerPoolChaseBlock(fresh);
    if (recheck) return { ok: false as const, reason: "not_awaiting" as const, message: recheck };
    const displayName = [profile.firstName, profile.lastName].filter(Boolean).join(" ");
    const phone = normalizePhoneNumber(profile.phone);
    const recipient = await db.notificationRecipient.upsert({
      where: { sourceType_sourceId: { sourceType: "GENERAL", sourceId: `player-pool-profile:${profile.id}` } },
      // Contact refresh must never reset an opt-out, suppression or preference.
      update: { displayName, email, emailNormalized: email, phone, phoneNormalized: phone, lastSyncedAt: new Date() },
      create: { sourceType: "GENERAL", sourceId: `player-pool-profile:${profile.id}`, audience: "PLAYER", displayName, email, emailNormalized: email,
        phone, phoneNormalized: phone, transactionalEmailOptIn: true, transactionalSmsOptIn: true,
        marketingEmailOptIn: false, marketingSmsOptIn: false,
        metadata: { entityType: "PLAYER_POOL_PROFILE", profileId: profile.id, prospectId: profile.prospectId, publicCode: profile.publicCode } },
    });
    await db.notificationPreference.upsert({ where: { recipientId: recipient.id }, update: {}, create: { recipientId: recipient.id } });
    const profileUrl = `${getPlayerPoolBaseUrl()}/player-pool/profile/${profile.profileToken}`;
    const dispatch = await queueNotificationFromTemplate({
      templateKey: RESPONSE_TEMPLATE_KEY, recipientId: recipient.id, sourceType: PROFILE_CHASE_SOURCE, sourceId: profile.id,
      variables: { firstName: profile.firstName.trim() || "there", profileUrl, responseUrl: `${profileUrl}/respond`, publicCode: profile.publicCode },
      metadata: { origin: input.origin, originLabel: input.originLabel, responseRequested: true,
        profileId: profile.id, prospectId: profile.prospectId, publicCode: profile.publicCode,
        ...(input.bulkRunId ? { bulkRunId: input.bulkRunId } : {}) },
      createdByUserId: input.createdByUserId ?? null,
    }, db);
    return { ok: true as const, displayName, dispatchStatus: String(dispatch.status), recordedAt: dispatch.createdAt, dispatch, recipient };
  }, { maxWait: 10000, timeout: 20000 });
  if (outcome.ok) {
    try { await logNotificationDispatchToThread(outcome); }
    catch (error) { console.error("PlayerPool reminder queued; conversation logging needs review", outcome.dispatch.id, error); }
  }
  return outcome;
}

/** Final shared gate for existing and new email/SMS chases, including retries.
 * Never change SENT history; cancellations remain visible as such on the cards.
 */
export async function getPlayerPoolResponseDeliveryBlock(dispatch: {
  id: string; sourceType: string | null; sourceId: string | null; channel: string;
  createdAt: Date; recipient: { email: string | null; phone: string | null }; variables: unknown;
}): Promise<string | null> {
  if (!dispatch.sourceType || !PROFILE_CHASE_SOURCES.includes(dispatch.sourceType)) return null;
  const state = (await getPlayerPoolContactHistory([dispatch.sourceId || ""], prisma, { excludeDispatchId: dispatch.id })).get(dispatch.sourceId || "");
  // SMS can exist without an email, but replies/completion/opt-outs still stop it.
  if (!state || state.status !== "INVITED" || state.profileSubmittedAt) return "No longer awaiting a PlayerPool profile.";
  if (state.hasSquadRecord) return "Existing squad record; review before chasing.";
  if (state.lastReplyAt && (!state.invitedAt || state.lastReplyAt >= state.invitedAt)) return "Reply received; PlayerPool chase cancelled for review.";
  if (dispatch.channel === "SMS") return state.smsBlocked ? "PlayerPool SMS opted out or disabled." : null;
  if (state.emailBlocked) return "PlayerPool email opted out or disabled.";
  if (!state.email || state.email.trim().toLowerCase() !== dispatch.recipient.email?.trim().toLowerCase()) return "PlayerPool email address has changed.";
  const earlier = await prisma.notificationDispatch.findFirst({ where: {
    sourceType: PROFILE_CHASE_SOURCE, sourceId: state.id, channel: "EMAIL", id: { not: dispatch.id },
    OR: [
      { sentAt: { gte: new Date(Date.now() - 48 * 60 * 60 * 1000) } },
      { status: { in: ["QUEUED", "PROCESSING"] }, OR: [
        { createdAt: { lt: dispatch.createdAt } }, { createdAt: dispatch.createdAt, id: { lt: dispatch.id } },
      ] },
    ],
  }, select: { id: true } });
  if (earlier) return "Another PlayerPool email was recently sent or has an earlier pending entry.";
  const variables = dispatch.variables && typeof dispatch.variables === "object" ? dispatch.variables as Record<string, unknown> : {};
  try {
    const url = new URL(String(variables.profileUrl || ""));
    if (url.origin !== new URL(getPlayerPoolBaseUrl()).origin || url.pathname !== `/player-pool/profile/${state.profileToken}`) return "PlayerPool secure link has changed.";
  } catch { return "Invalid PlayerPool secure link."; }
  return null;
}

export async function closeAwaitingPlayerPoolProfile(token: string) {
  if (!/^[a-zA-Z0-9-]{20,100}$/.test(token)) throw new Error("Invalid response link.");
  await prisma.$transaction(async db => {
    const rows = await db.$queryRaw<Array<{ id: string; publicCode: string; status: string; profileSubmittedAt: Date | null }>>(Prisma.sql`
      SELECT id,"publicCode",status,"profileSubmittedAt" FROM "PlayerPoolProfile" WHERE "profileToken"=${token} FOR UPDATE
    `);
    const profile = rows[0];
    if (!profile) throw new Error("Response link not found.");
    if (profile.status !== "INVITED" || profile.profileSubmittedAt) return;
    await db.$executeRaw(Prisma.sql`INSERT INTO "PlayerPoolResponseDecision" (id,"profileId","publicCode",decision,"respondedAt")
      VALUES (${crypto.randomUUID()},${profile.id},${profile.publicCode},'NOT_LOOKING',NOW()) ON CONFLICT ("profileId") DO NOTHING`);
    await db.$executeRaw(Prisma.sql`UPDATE "PlayerPoolProfile" SET status='NOT_LOOKING',"updatedAt"=NOW() WHERE id=${profile.id}`);
    await db.notificationDispatch.updateMany({ where: { sourceId: profile.id, sourceType: { in: PROFILE_CHASE_SOURCES }, status: "QUEUED" },
      data: { status: "CANCELLED", cancelledAt: new Date(), failureReason: "Player chose No — no longer looking through PlayerPool." } });
  });
}
