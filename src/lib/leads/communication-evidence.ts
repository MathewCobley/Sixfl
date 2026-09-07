import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { normalizePhoneNumber } from "@/lib/messaging/phone";

export type LeadReply = {
  id: string; threadId: string; channel: string; occurredAt: Date;
  subject: string | null; body: string; htmlBody: string | null; from: string;
};
export type LeadCommunicationEvidence = {
  threadIds: string[];
  reviewThreadIds: string[];
  latestReply: LeadReply | null;
  reviewAt: Date | null;
  // A historical timestamp is a conservative hold, never proof of a reply.
  // Reading/fixing history must not restart a stopped chase.
  automationHoldAt: Date | null;
};
export type LeadCommunicationRow = {
  leadId: string; leadEmail: string | null; leadPhone: string | null;
  threadId: string; sourceType: string | null; sourceId: string | null; teamId: string | null;
  recipientSourceType: string | null; recipientSourceId: string | null;
  recipientEmail: string | null; recipientPhone: string | null;
  cachedInboundAt: Date | null;
  messageId: string | null; direction: string | null; participantRole: string | null;
  channel: string | null; receivedAt: Date | null; messageCreatedAt: Date | null;
  subject: string | null; body: string | null; htmlBody: string | null;
  fromEmail: string | null; fromNumber: string | null;
};
const genericSources = new Set(["", "GENERAL", "MESSAGE_THREAD", "INBOUND_SMS", "INBOUND_EMAIL"]);
const email = (value: string | null) => value?.trim().toLowerCase() || null;
const newer = (a: Date | null, b: Date | null) => !a ? b : !b ? a : a > b ? a : b;
export const emptyLeadEvidence = (): LeadCommunicationEvidence => ({
  threadIds: [], reviewThreadIds: [], latestReply: null, reviewAt: null, automationHoldAt: null,
});

/** Explicit lead/recipient ownership only; never join different people by a shared contact address. */
export function isLeadOwnedConversation(row: LeadCommunicationRow) {
  const source = row.sourceType || "";
  const recipientOwned = row.recipientSourceType === "LEAD" && row.recipientSourceId === row.leadId;
  const conflictingLead = row.recipientSourceType === "LEAD" && row.recipientSourceId !== row.leadId;
  if (row.teamId || conflictingLead) return false;
  if (row.sourceId === row.leadId && (source === "LEAD" || source.startsWith("LEAD_"))) return true;
  return recipientOwned && genericSources.has(source);
}

export function summariseLeadCommunications(leadIds: string[], rows: LeadCommunicationRow[]) {
  const result = new Map(leadIds.map((id) => [id, emptyLeadEvidence()]));
  for (const row of rows) {
    const evidence = result.get(row.leadId);
    if (!evidence) continue;
    const owned = isLeadOwnedConversation(row);
    if (owned && !evidence.threadIds.includes(row.threadId)) evidence.threadIds.push(row.threadId);
    const occurredAt = row.receivedAt ?? row.messageCreatedAt;
    const actualInbound = Boolean(row.messageId && row.direction === "INBOUND" && row.participantRole !== "SYSTEM");
    const recipientOwned = row.recipientSourceType === "LEAD" && row.recipientSourceId === row.leadId;
    const senderMatches = row.channel === "SMS"
      ? Boolean(normalizePhoneNumber(row.fromNumber) && [row.leadPhone, recipientOwned ? row.recipientPhone : null]
          .some((value) => value && normalizePhoneNumber(value) === normalizePhoneNumber(row.fromNumber)))
      : row.channel === "EMAIL" && Boolean(email(row.fromEmail) && [row.leadEmail, recipientOwned ? row.recipientEmail : null]
          .some((value) => value && email(value) === email(row.fromEmail)));
    const hasContent = Boolean(row.body?.trim() || row.htmlBody?.trim());
    const verified = owned && actualInbound && senderMatches && occurredAt && hasContent;
    evidence.automationHoldAt = newer(evidence.automationHoldAt, row.cachedInboundAt);
    if (actualInbound) evidence.automationHoldAt = newer(evidence.automationHoldAt, occurredAt);
    if (verified && (!evidence.latestReply || occurredAt > evidence.latestReply.occurredAt)) {
      evidence.latestReply = {
        id: row.messageId!, threadId: row.threadId, channel: row.channel!, occurredAt,
        subject: row.subject, body: row.body || "", htmlBody: row.htmlBody,
        from: (row.channel === "SMS" ? row.fromNumber : row.fromEmail) || "",
      };
    }
    // Small write-time differences are harmless; an unsupported newer timestamp is not.
    const unsupportedCache = row.cachedInboundAt && (!verified || row.cachedInboundAt.getTime() > occurredAt!.getTime() + 1000);
    const reviewAt = newer(unsupportedCache ? row.cachedInboundAt : null, actualInbound && !verified ? occurredAt : null);
    if (reviewAt) {
      evidence.reviewAt = newer(evidence.reviewAt, reviewAt);
      if (!evidence.reviewThreadIds.includes(row.threadId)) evidence.reviewThreadIds.push(row.threadId);
    }
  }
  return result;
}

export function leadReplyState(evidence: LeadCommunicationEvidence, since: Date | null): "none" | "received" | "review" {
  if (!since) return "none";
  if (evidence.reviewAt && evidence.reviewAt >= since &&
      (!evidence.latestReply || evidence.reviewAt.getTime() > evidence.latestReply.occurredAt.getTime() + 1000)) return "review";
  if (evidence.latestReply && evidence.latestReply.occurredAt >= since) return "received";
  return evidence.automationHoldAt && evidence.automationHoldAt >= since ? "review" : "none";
}
export function leadConversationHref(threadId: string) {
  return `/admin/messaging?filter=all&thread=${encodeURIComponent(threadId)}`;
}
export function leadReplyHref(leadId: string) {
  return `/admin/leads/${encodeURIComponent(leadId)}#lead-reply-evidence`;
}

/** Shared READ-ONLY resolver for the lead timeline, SMS status and reminder job.
 * Includes archived and legacy automation threads, regardless of the inbox's 100-row window.
 * Fetch the last real inbound entry independently of later outbound messages.
 * No historical thread is rewritten, requeued, reassigned or marked read here.
 */
export async function loadLeadCommunicationEvidence(
  leadIds: string[], db: Pick<Prisma.TransactionClient, "$queryRaw"> = prisma,
) {
  const ids = [...new Set(leadIds.filter(Boolean))];
  if (!ids.length) return new Map<string, LeadCommunicationEvidence>();
  const rows = await db.$queryRaw<LeadCommunicationRow[]>(Prisma.sql`
    SELECT lead."id" AS "leadId", lead."email" AS "leadEmail", lead."phone" AS "leadPhone",
      thread."id" AS "threadId", thread."sourceType", thread."sourceId", thread."teamId",
      recipient."sourceType"::text AS "recipientSourceType", recipient."sourceId" AS "recipientSourceId",
      recipient."email" AS "recipientEmail", recipient."phone" AS "recipientPhone",
      thread."latestInboundAt" AS "cachedInboundAt",
      inbound."id" AS "messageId", inbound."direction"::text, inbound."participantRole"::text,
      inbound."channel"::text, inbound."receivedAt", inbound."createdAt" AS "messageCreatedAt",
      inbound."subject", COALESCE(NULLIF(inbound."textBody", ''), inbound."body") AS "body",
      inbound."htmlBody", inbound."fromEmail", inbound."fromNumber"
    FROM "InterestLead" lead
    JOIN "MessageThread" thread ON (
      thread."sourceId" = lead."id" OR thread."recipientId" IN (
        SELECT r."id" FROM "NotificationRecipient" r
        WHERE r."sourceType"::text = 'LEAD' AND r."sourceId" = lead."id"
      )
    )
    LEFT JOIN "NotificationRecipient" recipient ON recipient."id" = thread."recipientId"
    LEFT JOIN LATERAL (
      SELECT message.* FROM "MessageEntry" message
      WHERE message."threadId" = thread."id" AND message."direction"::text = 'INBOUND'
      ORDER BY COALESCE(message."receivedAt", message."createdAt") DESC, message."id" DESC
      LIMIT 1
    ) inbound ON TRUE
    WHERE lead."id" IN (${Prisma.join(ids)})
    ORDER BY thread."id"
  `);
  return summariseLeadCommunications(ids, rows);
}
