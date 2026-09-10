import { createHash } from "node:crypto";
import { Prisma, type MessageThread, type NotificationRecipient } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/requireAdmin";
import { normalizePhoneNumber } from "@/lib/messaging/phone";
import { getTeamMemberProfilesByTeamMemberIds } from "@/lib/teamMemberProfiles";
import { queueDirectNotification } from "@/lib/notifications/service";

export class SmsReplyError extends Error {
  constructor(message: string, public readonly status = 409) { super(message); }
}

type ReplyThread = Pick<MessageThread, "id" | "sourceType" | "sourceId" | "teamId" | "contactName" | "contactEmail" | "emailNormalized" | "phoneNormalized" | "contactPhone"> & {
  recipient: Pick<NotificationRecipient, "displayName" | "email" | "phone"> | null;
  team: { name: string } | null;
};

/** The displayed number and the actual send use this same identity boundary. */
export async function getAdminSmsReplyTarget(thread: ReplyThread) {
  const memberThread = thread.sourceType === "TEAM_MEMBER" && Boolean(thread.sourceId);
  let name = thread.contactName || thread.recipient?.displayName || thread.team?.name || null;
  let email = thread.contactEmail || thread.emailNormalized || thread.recipient?.email || null;
  let phone = normalizePhoneNumber(thread.phoneNormalized || thread.contactPhone || thread.recipient?.phone);
  if (memberThread && thread.sourceId) {
    const member = await prisma.teamMember.findUnique({
      where: { id: thread.sourceId },
      select: { id: true, teamId: true, user: { select: { name: true, email: true } } },
    });
    // A missing/moved member must never send to the team's captain instead.
    if (!member || (thread.teamId && member.teamId !== thread.teamId)) return { name, email, phone: null, memberThread };
    const profiles = await getTeamMemberProfilesByTeamMemberIds([member.id]);
    phone = normalizePhoneNumber(profiles.get(member.id)?.phone);
    name = member.user.name || name;
    email = member.user.email || email;
  }
  if (phone && !/^\+[1-9]\d{9,14}$/.test(phone)) phone = null;
  return { name, email, phone, memberThread };
}

export type SmsReplyInput = { threadId: string; requestId: string; body: string; expectedPhone: string };
export type SmsReplyReceipt = {
  createdAt?: string;
  messageId: string;
  dispatchId: string | null;
  status: string;
  providerStatus: string | null;
  failureReason: string | null;
  scheduledFor: string | null;
  sentAt: string | null;
  body: string;
  toNumber: string | null;
};

const hash = (value: string) => createHash("sha256").update(value).digest("hex");
function messageId(actorId: string, threadId: string, requestId: string) {
  return `smsreply_${hash(JSON.stringify([actorId, threadId, requestId]))}`;
}
function validateIdentity(input: { threadId: string; requestId: string }) {
  if (!input.threadId || input.threadId.length > 150 || !/^[a-zA-Z0-9_-]+$/.test(input.threadId)) throw new SmsReplyError("Choose a valid conversation.", 400);
  if (!/^[a-zA-Z0-9_-]{16,100}$/.test(input.requestId)) throw new SmsReplyError("Reload the conversation before sending. This page has an outdated reply form.", 400);
}
async function actorId() {
  const { user } = await requireAdmin();
  // Do not turn the development-mode auth bypass into an anonymous write API.
  if (!user?.id) throw new SmsReplyError("Please sign in again before sending a reply.", 401);
  return user.id;
}
const receiptInclude = { dispatch: true } as const;
type Entry = Prisma.MessageEntryGetPayload<{ include: typeof receiptInclude }>;
function receipt(entry: Entry): SmsReplyReceipt {
  return {
    createdAt: entry.createdAt.toISOString(),
    messageId: entry.id, dispatchId: entry.notificationDispatchId,
    status: entry.dispatch?.status ?? "UNKNOWN", providerStatus: entry.providerStatus,
    failureReason: entry.dispatch?.failureReason ?? null,
    scheduledFor: entry.dispatch?.scheduledFor.toISOString() ?? null,
    sentAt: entry.dispatch?.sentAt?.toISOString() ?? entry.sentAt?.toISOString() ?? null,
    body: entry.body, toNumber: entry.toNumber,
  };
}

/** Read-only recovery. Calling this cannot queue, retry, or send a message. */
export async function readAdminSmsReply(input: { threadId: string; requestId: string }) {
  const actor = await actorId();
  validateIdentity(input);
  const entry = await prisma.messageEntry.findUnique({
    where: { id: messageId(actor, input.threadId, input.requestId) }, include: receiptInclude,
  });
  return entry ? receipt(entry) : null;
}

/** Lost browser references are not a dead end. An administrator can read the
 * latest recorded manual SMS replies in this exact thread, including attempts
 * made by another administrator. No queue, repair or provider calls occur. */
export async function readRecentAdminSmsReplies(threadId: string): Promise<SmsReplyReceipt[]> {
  await actorId();
  validateIdentity({ threadId, requestId: "recent-sms-history" });
  const entries = await prisma.messageEntry.findMany({
    where: { threadId, channel: "SMS", direction: "OUTBOUND", participantRole: "ADMIN",
      createdAt: { gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) } },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: 10, include: receiptInclude,
  });
  return entries.map(receipt);
}

export async function queueAdminSmsReply(input: SmsReplyInput): Promise<SmsReplyReceipt> {
  const actor = await actorId();
  validateIdentity(input);
  if (typeof input.body !== "string" || !input.body.trim()) throw new SmsReplyError("Type your SMS reply before sending.", 400);
  if (input.body.length > 1500) throw new SmsReplyError("Please shorten the reply to 1,500 characters or fewer.", 400);
  const expectedPhone = normalizePhoneNumber(input.expectedPhone);
  if (!expectedPhone) throw new SmsReplyError("This conversation has no valid SMS number.", 400);
  const id = messageId(actor, input.threadId, input.requestId);
  const requestHash = hash(JSON.stringify([input.body.trim(), expectedPhone]));

  // Trace identifiers only, after authentication/validation. Never log the
  // message body, phone number, session, or provider credentials.
  console.info("[admin-sms-reply]", { event: "request_received", threadId: input.threadId, requestId: input.requestId });
  const saved = await prisma.$transaction(async (tx) => {
    // Serialize both different drafts and simultaneous retries on this thread.
    await tx.$queryRaw(Prisma.sql`SELECT "id" FROM "MessageThread" WHERE "id" = ${input.threadId} FOR UPDATE`);
    const existing = await tx.messageEntry.findUnique({ where: { id }, include: receiptInclude });
    if (existing) {
      const metadata = existing.dispatch?.metadata as Record<string, unknown> | null;
      if (metadata?.smsReplyRequestHash !== requestHash) throw new SmsReplyError("This reply reference was already used. Check its saved message before starting a new reply.");
      return receipt(existing);
    }
    const thread = await tx.messageThread.findUnique({ where: { id: input.threadId }, include: { recipient: { include: { preferences: true } }, team: { select: { name: true } } } });
    if (!thread) throw new SmsReplyError("That conversation could not be found.", 404);
    if (thread.status !== "OPEN") throw new SmsReplyError("Reopen this conversation before sending a reply.");
    const target = await getAdminSmsReplyTarget(thread);
    if (!target.phone) throw new SmsReplyError("This contact does not have a valid SMS number. No email was sent instead.");
    if (target.phone !== expectedPhone) throw new SmsReplyError("The contact number has changed. Refresh the conversation and check the recipient before sending.");

    let recipient = target.memberThread ? null : thread.recipient;
    if (!recipient) {
      recipient = await tx.notificationRecipient.upsert({
        where: { sourceType_sourceId: { sourceType: "GENERAL", sourceId: thread.id } },
        update: {}, // Never reset existing opt-outs or suppression when replying.
        create: {
          sourceType: "GENERAL", sourceId: thread.id, audience: "GENERAL",
          displayName: target.name, email: target.email, emailNormalized: target.email?.trim().toLowerCase(),
          phone: target.phone, phoneNormalized: target.phone,
          preferences: { create: {} }, metadata: { manualReplyRecipient: true, threadId: thread.id },
        },
        include: { preferences: true },
      });
    }
    if (normalizePhoneNumber(recipient.phoneNormalized || recipient.phone) !== target.phone) {
      throw new SmsReplyError("The conversation and its saved SMS contact have different numbers. Correct the contact details before sending.");
    }
    // Legacy records can lack the preference row; create defaults only, never
    // change a saved preference or convert an opted-out contact to opted-in.
    await tx.notificationPreference.upsert({ where: { recipientId: recipient.id }, update: {}, create: { recipientId: recipient.id } });
    const suppressed = await tx.notificationRecipient.findFirst({ where: { phoneNormalized: target.phone, isSuppressed: true }, select: { id: true } });
    if (suppressed) throw new SmsReplyError("SMS is suppressed for this number. Review the contact's messaging permissions; no reply was queued.");

    // This is the administrator's individually typed reply, not reusable system
    // copy. Reuse the existing free-form queue with its quiet-hours and safety
    // checks. No provider call is made here. All writes share this transaction.
    const dispatch = await queueDirectNotification({
      recipientId: recipient.id, channel: "SMS", audience: "GENERAL", body: input.body,
      sourceType: "MESSAGE_THREAD", sourceId: thread.id, createdByUserId: actor,
      metadata: { threadId: thread.id, teamId: thread.teamId, leagueId: thread.leagueId,
        originalSourceType: thread.sourceType, originalSourceId: thread.sourceId,
        teamMemberId: target.memberThread ? thread.sourceId : null, contactName: target.name,
        manualSmsReply: true, smsReplyRequestHash: requestHash, smsReplyRequestId: input.requestId },
    }, tx);
    const entry = await tx.messageEntry.create({
      data: { id, threadId: thread.id, channel: "SMS", direction: "OUTBOUND", participantRole: "ADMIN",
        body: dispatch.bodyText, textBody: dispatch.bodyText, toNumber: target.phone,
        provider: "twilio", providerStatus: dispatch.status.toLowerCase(),
        notificationDispatchId: dispatch.id, createdByUserId: actor, sentAt: null },
      include: receiptInclude,
    });
    await tx.messageThread.update({ where: { id: thread.id }, data: {
      recipientId: recipient.id, latestMessageAt: entry.createdAt, latestOutboundAt: entry.createdAt,
      lastOutboundMessageId: entry.id, lastMessagePreview: entry.body.replace(/\s+/g, " ").slice(0, 140),
    } });
    return receipt(entry);
  }, { maxWait: 10000, timeout: 15000 });
  console.info("[admin-sms-reply]", { event: "reply_recorded", threadId: input.threadId, requestId: input.requestId,
    messageId: saved.messageId, dispatchId: saved.dispatchId, status: saved.status });
  return saved;
}
