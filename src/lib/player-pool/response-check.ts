import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { normalizePhoneNumber } from "@/lib/notifications/phone";
import { queueNotificationFromTemplate } from "@/lib/notifications/service";
import { logNotificationDispatchToThread } from "@/lib/communications/log-dispatch";
import { getPlayerPoolBaseUrl } from "@/lib/player-pool/storage";
import { getPlayerPoolContactHistory, playerPoolContactBlock, type PlayerPoolContactHistory } from "./contact-history";
import type { PlayerPoolProfileReminderTarget, QueuePlayerPoolProfileReminderResult } from "./profile-reminders";

export const RESPONSE_CHECK_TEMPLATE = "player-pool-response-check-email";
const SOURCE = "PLAYER_POOL_PROFILE_NUDGE";
export const RESPONSE_CHECK_GAP_MS = 48 * 60 * 60 * 1000;

export function responseCheckBlock(history: PlayerPoolContactHistory, asOf: Date) {
  const block = playerPoolContactBlock(history, "EMAIL");
  if (block) return block;
  if (history.pending) return "An existing message is queued or sending — no duplicate chase.";
  if (history.latestContactAt && history.latestContactAt.getTime() > asOf.getTime() - RESPONSE_CHECK_GAP_MS) return "Contacted within the last 48 hours — no duplicate chase.";
  return null;
}

export async function queuePlayerPoolResponseCheck(input: {
  profile: PlayerPoolProfileReminderTarget; createdByUserId?: string | null;
  origin: "player_pool_profile_nudge" | "player_pool_profile_bulk_reminder";
  originLabel: string; bulkRunId?: string | null; asOf?: Date;
}): Promise<QueuePlayerPoolProfileReminderResult> {
  const result = await prisma.$transaction(async (db) => {
    // Lock and reload: the caller's snapshot is never authoritative for a send.
    const rows = await db.$queryRaw<PlayerPoolProfileReminderTarget[]>(Prisma.sql`
      SELECT p.*, prospect."firstName", prospect."lastName", prospect.email, prospect.phone,
        league.name AS "leagueName"
      FROM "PlayerPoolProfile" p JOIN "TeamPlayerProspect" prospect ON prospect.id = p."prospectId"
      LEFT JOIN "League" league ON league.id = p."leagueId"
      WHERE p.id = ${input.profile.id} FOR UPDATE OF p
    `);
    const profile = rows[0];
    const skip = (message: string, reason: "not_awaiting" | "missing_email" | "missing_profile_link" = "not_awaiting") => ({ ok: false as const, reason, message });
    if (!profile) return skip("PlayerPool profile no longer exists.");
    const history = (await getPlayerPoolContactHistory([profile.id], db)).get(profile.id);
    if (!history) return skip("PlayerPool history could not be verified.");
    const block = responseCheckBlock(history, input.asOf ?? new Date());
    if (block) return skip(block);
    const email = profile.email?.trim().toLowerCase();
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return skip("No usable email address — review contact details.", "missing_email");
    if (!profile.profileToken?.trim()) return skip("No secure profile link is available.", "missing_profile_link");
    if (input.bulkRunId && await db.notificationDispatch.findFirst({
      where: { sourceType: SOURCE, sourceId: profile.id, metadata: { path: ["bulkRunId"], equals: input.bulkRunId } }, select: { id: true },
    })) return skip("Already processed in this reminder run; no automatic retry.");
    const template = await db.notificationTemplate.findUnique({ where: { key: RESPONSE_CHECK_TEMPLATE } });
    if (!template?.isActive || template.channel !== "EMAIL" || template.audience !== "PLAYER" || template.kind !== "TRANSACTIONAL") return skip("Response-check template is unavailable or disabled.");
    const displayName = [profile.firstName, profile.lastName].filter(Boolean).join(" ").trim() || email;
    const phone = normalizePhoneNumber(profile.phone);
    const contact = { displayName, email, emailNormalized: email, phone, phoneNormalized: phone, lastSyncedAt: new Date() };
    const recipient = await db.notificationRecipient.upsert({
      where: { sourceType_sourceId: { sourceType: "GENERAL", sourceId: `player-pool-profile:${profile.id}` } },
      // Existing preferences and opt-outs must never be reset by a chase.
      update: contact,
      create: { ...contact, sourceType: "GENERAL", sourceId: `player-pool-profile:${profile.id}`, audience: "PLAYER",
        transactionalEmailOptIn: true, transactionalSmsOptIn: true, marketingEmailOptIn: false, marketingSmsOptIn: false,
        metadata: { entityType: "PLAYER_POOL_PROFILE", profileId: profile.id, prospectId: profile.prospectId } },
    });
    await db.notificationPreference.upsert({ where: { recipientId: recipient.id }, update: {}, create: { recipientId: recipient.id } });
    const profileUrl = `${getPlayerPoolBaseUrl()}/player-pool/profile/${profile.profileToken}`;
    const dispatch = await queueNotificationFromTemplate({
      templateKey: RESPONSE_CHECK_TEMPLATE, recipientId: recipient.id,
      sourceType: SOURCE, sourceId: profile.id,
      variables: { firstName: profile.firstName.trim() || "there", fullName: displayName, profileUrl, publicCode: profile.publicCode },
      metadata: { responseCheck: true, origin: input.origin, originLabel: input.originLabel, profileId: profile.id,
        prospectId: profile.prospectId, publicCode: profile.publicCode, ctaUrl: profileUrl,
        ...(input.bulkRunId ? { bulkRunId: input.bulkRunId } : {}) },
      createdByUserId: input.createdByUserId ?? null,
    }, db);
    return { ok: true as const, dispatch, recipient, displayName };
  }, { maxWait: 5000, timeout: 20000 });
  if (!result.ok) return result;
  // A comms-log failure cannot turn a committed outbox entry into a resend.
  try { await logNotificationDispatchToThread(result); }
  catch (error) { console.error("[player-pool-response-check] Comms logging failed", result.dispatch.id, error); }
  return { ok: true, displayName: result.displayName, dispatchStatus: result.dispatch.status, recordedAt: result.dispatch.createdAt };
}

/** Recheck just before provider submission, also covering old queued reminders. */
export async function getPlayerPoolResponseDeliveryBlock(dispatch: {
  id: string; sourceType: string | null; sourceId: string | null; channel: string;
  createdAt: Date; recipient: { email?: string | null; phone?: string | null }; variables: unknown;
}) {
  if (dispatch.sourceType !== SOURCE && !dispatch.sourceType?.startsWith("PLAYER_POOL_PROFILE_SMS_NUDGE")) return null;
  if (!dispatch.sourceId) return "Missing PlayerPool profile; chase cancelled.";
  const history = (await getPlayerPoolContactHistory([dispatch.sourceId], prisma, dispatch.id)).get(dispatch.sourceId);
  if (!history) return "PlayerPool profile no longer exists; chase cancelled.";
  const block = playerPoolContactBlock(history, dispatch.channel === "SMS" ? "SMS" : "EMAIL");
  if (block) return block;
  if (dispatch.channel === "EMAIL") {
    const rows = await prisma.$queryRaw<Array<{ email: string | null; profileToken: string }>>(Prisma.sql`
      SELECT prospect.email, p."profileToken" FROM "PlayerPoolProfile" p
      JOIN "TeamPlayerProspect" prospect ON prospect.id = p."prospectId" WHERE p.id = ${dispatch.sourceId}
    `);
    const current = rows[0];
    if (!current?.email || current.email.trim().toLowerCase() !== dispatch.recipient.email?.trim().toLowerCase()) return "Email address has changed; review before resending.";
    const vars = dispatch.variables as Record<string, unknown> | null;
    if (vars?.profileUrl !== `${getPlayerPoolBaseUrl()}/player-pool/profile/${current.profileToken}`) return "Profile link has changed; stale chase cancelled.";
    const duplicate = await prisma.notificationDispatch.findFirst({ where: {
      sourceId: dispatch.sourceId, sourceType: SOURCE, id: { not: dispatch.id }, OR: [
        { sentAt: { gte: new Date(dispatch.createdAt.getTime() - RESPONSE_CHECK_GAP_MS) } },
        { providerMessageId: { not: null }, createdAt: { gte: new Date(dispatch.createdAt.getTime() - RESPONSE_CHECK_GAP_MS) } },
        { status: { in: ["QUEUED", "PROCESSING"] }, OR: [{ createdAt: { lt: dispatch.createdAt } }, { createdAt: dispatch.createdAt, id: { lt: dispatch.id } }] },
      ],
    }, select: { id: true } });
    if (duplicate) return "A recent or earlier pending profile reminder exists; duplicate cancelled.";
  }
  return null;
}

export type ResponseCheckRun = { id: string; mode: "audit" | "send"; asOf: string; publicCodes?: string[] };
export function parseResponseCheckRun(value: string | undefined, now = new Date()): ResponseCheckRun | null {
  if (!value?.trim()) return null;
  const run = JSON.parse(value) as ResponseCheckRun;
  const at = Date.parse(run.asOf);
  if (!/^[A-Za-z0-9_-]{8,80}$/.test(run.id) || !["audit", "send"].includes(run.mode) || !Number.isFinite(at)
    || at > now.getTime()) throw new Error("Invalid or expired PlayerPool response-check run.");
  if (now.getTime() - at > 24 * 3600000) return null;
  if (run.mode === "send" && (!Array.isArray(run.publicCodes) || !run.publicCodes.length || run.publicCodes.length > 1000
    || run.publicCodes.some((code) => !/^PP-[A-Z0-9]+$/.test(code)))) throw new Error("Send requires the exact public-code list from the read-only audit.");
  return run;
}

/** Disabled by default. Explicit operational request, bounded snapshot, no recurring campaign.
 * Uses only the ordinary outbox; never calls a provider or alters player status. */
export async function runConfiguredPlayerPoolResponseCheck() {
  const run = parseResponseCheckRun(process.env.PLAYER_POOL_RESPONSE_CHECK);
  if (!run) return { enabled: false };
  if (!process.env.CRON_SECRET?.trim()) throw new Error("Response-check execution requires authenticated cron configuration.");
  const asOf = new Date(run.asOf);
  const targets = await prisma.$queryRaw<PlayerPoolProfileReminderTarget[]>(Prisma.sql`
    SELECT p.*, prospect."firstName", prospect."lastName", prospect.email, prospect.phone, league.name AS "leagueName"
    FROM "PlayerPoolProfile" p JOIN "TeamPlayerProspect" prospect ON prospect.id = p."prospectId"
    LEFT JOIN "League" league ON league.id = p."leagueId"
    WHERE p.status = 'INVITED' AND p."profileSubmittedAt" IS NULL AND p."createdAt" <= ${asOf}
      AND (p."invitedAt" IS NULL OR p."invitedAt" <= ${asOf})
    ORDER BY p."createdAt", p.id LIMIT 1001
  `);
  if (targets.length > 1000) throw new Error("Over 1000 awaiting profiles; review in smaller batches.");
  const histories = await getPlayerPoolContactHistory(targets.map((target) => target.id));
  const items: Array<{ publicCode: string; status: string; reason?: string }> = [];
  for (const profile of targets) {
    if (run.mode === "send" && !run.publicCodes!.includes(profile.publicCode)) continue;
    try {
      const h = histories.get(profile.id);
      const reason = !h ? "History unavailable" : responseCheckBlock(h, asOf);
      if (reason || !profile.email?.trim() || !profile.profileToken?.trim()) {
        items.push({ publicCode: profile.publicCode, status: "skipped", reason: reason || "Missing contact or profile link" }); continue;
      }
      if (run.mode === "audit") { items.push({ publicCode: profile.publicCode, status: "eligible" }); continue; }
      const result = await queuePlayerPoolResponseCheck({ profile, asOf, bulkRunId: run.id,
        origin: "player_pool_profile_bulk_reminder", originLabel: "User-authorised one-off PlayerPool response check" });
      items.push({ publicCode: profile.publicCode, status: result.ok ? result.dispatchStatus : "skipped", ...(!result.ok ? { reason: result.message } : {}) });
    } catch (error) {
      items.push({ publicCode: profile.publicCode, status: "error", reason: error instanceof Error ? error.message : "Reminder failed" });
    }
  }
  const summary = { enabled: true, runId: run.id, mode: run.mode, targeted: targets.length, items };
  console.info("[player-pool-response-check]", JSON.stringify(summary));
  return summary;
}

export async function logConfiguredPlayerPoolResponseDelivery() {
  const run = parseResponseCheckRun(process.env.PLAYER_POOL_RESPONSE_CHECK);
  if (!run || run.mode !== "send") return;
  const rows = await prisma.notificationDispatch.findMany({ where: { sourceType: SOURCE, metadata: { path: ["bulkRunId"], equals: run.id } },
    select: { id: true, status: true, sentAt: true, failureReason: true, providerMessageId: true, metadata: true } });
  console.info("[player-pool-response-delivery]", JSON.stringify({ runId: run.id, items: rows.map((row) => ({
    id: row.id, publicCode: (row.metadata as Record<string, unknown> | null)?.publicCode, status: row.status,
    sentAt: row.sentAt, providerAccepted: Boolean(row.providerMessageId), failureReason: row.failureReason,
  })) }));
}
