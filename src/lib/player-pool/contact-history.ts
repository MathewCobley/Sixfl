import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

export type PlayerPoolContactEvent = {
  id: string; channel: string; direction: string; kind: string; status: string;
  at: string; sentAt: string | null; subject: string | null; preview: string | null;
  by: string | null; dispatchId: string | null; threadId: string | null;
};
export type PlayerPoolContactHistory = {
  id: string; publicCode: string; invitedAt: Date | null; createdAt: Date;
  status: string; profileSubmittedAt: Date | null; prospectStatus: string;
  emailBlocked: boolean; smsBlocked: boolean; hasMembership: boolean;
  latestReplyAt: Date | null; latestContactAt: Date | null; pending: boolean;
  events: PlayerPoolContactEvent[];
};
type Db = Pick<typeof prisma, "$queryRaw">;

/** Read real dispatches and contact threads, not invitation/lastContacted timestamps.
 * Explicit entity links recover old source IDs; contact matches recover manual replies.
 * A contact match is evidence to REVIEW, never evidence to merge player identities. */
export async function getPlayerPoolContactHistory(ids: string[], db: Db = prisma, excludeDispatchId = "") {
  const unique = [...new Set(ids)];
  if (!unique.length) return new Map<string, PlayerPoolContactHistory>();
  const rows = await db.$queryRaw<PlayerPoolContactHistory[]>(Prisma.sql`
    SELECT p.id, p."publicCode", p."invitedAt", p."createdAt", p.status,
      p."profileSubmittedAt", prospect.status AS "prospectStatus",
      COALESCE(contacts."emailBlocked", false) AS "emailBlocked",
      COALESCE(contacts."smsBlocked", false) AS "smsBlocked",
      EXISTS (SELECT 1 FROM "TeamMember" member JOIN "User" u ON u.id = member."userId"
        WHERE NULLIF(LOWER(TRIM(prospect.email)), '') IS NOT NULL
          AND LOWER(TRIM(u.email)) = LOWER(TRIM(prospect.email))) AS "hasMembership",
      history."latestReplyAt", history."latestContactAt", COALESCE(history.pending, false) AS pending,
      COALESCE(history.events, '[]'::jsonb) AS events
    FROM "PlayerPoolProfile" p
    JOIN "TeamPlayerProspect" prospect ON prospect.id = p."prospectId"
    CROSS JOIN LATERAL (SELECT REGEXP_REPLACE(COALESCE(prospect.phone, ''), '[^0-9]', '', 'g') AS digits) digits
    CROSS JOIN LATERAL (SELECT CASE WHEN digits.digits LIKE '0%' THEN '44' || SUBSTRING(digits.digits FROM 2) ELSE digits.digits END AS phone) phone
    LEFT JOIN LATERAL (
      SELECT ARRAY_AGG(r.id) AS ids,
        BOOL_OR(r."isSuppressed" OR NOT r."transactionalEmailOptIn" OR pref."emailEnabled" = false) AS "emailBlocked",
        BOOL_OR(r."isSuppressed" OR NOT r."transactionalSmsOptIn" OR pref."smsEnabled" = false) AS "smsBlocked"
      FROM "NotificationRecipient" r LEFT JOIN "NotificationPreference" pref ON pref."recipientId" = r.id
      WHERE r."sourceId" IN (p.id, p."prospectId", p."leadId", 'player-pool-profile:' || p.id)
        OR (NULLIF(LOWER(TRIM(prospect.email)), '') IS NOT NULL AND r."emailNormalized" = LOWER(TRIM(prospect.email)))
        OR (phone.phone <> '' AND REGEXP_REPLACE(COALESCE(r."phoneNormalized", ''), '[^0-9]', '', 'g') = phone.phone)
    ) contacts ON true
    LEFT JOIN LATERAL (
      SELECT ARRAY_AGG(t.id) AS ids FROM "MessageThread" t
      WHERE t."sourceId" IN (p.id, p."prospectId", p."leadId", 'player-pool-profile:' || p.id)
        OR t."recipientId" = ANY(contacts.ids)
        OR (NULLIF(LOWER(TRIM(prospect.email)), '') IS NOT NULL AND t."emailNormalized" = LOWER(TRIM(prospect.email)))
        OR (phone.phone <> '' AND REGEXP_REPLACE(COALESCE(t."phoneNormalized", ''), '[^0-9]', '', 'g') = phone.phone)
    ) threads ON true
    LEFT JOIN LATERAL (
        WITH events AS (
          SELECT 'dispatch:' || d.id AS id, d.channel::text, 'OUTBOUND'::text AS direction,
            CASE WHEN d."sourceType" = 'PLAYER_POOL_PROFILE_INVITE' THEN 'Profile invitation'
              WHEN d."sourceType" = 'PLAYER_POOL_PROFILE_NUDGE' THEN 'Profile reminder'
              WHEN d."sourceType" LIKE 'PLAYER_POOL_PROFILE_SMS_%' THEN 'SMS profile chase'
              ELSE 'Linked contact message' END AS kind,
            d.status::text, COALESCE(d."sentAt", d."failedAt", d."createdAt") AS at,
            d."sentAt", d."sentAt" IS NOT NULL OR d."providerMessageId" IS NOT NULL AS sent,
            d.subject, LEFT(d."failureReason", 200) AS preview,
            COALESCE(creator.name, creator.email, 'System') AS actor, d.id AS "dispatchId", NULL::text AS "threadId"
          FROM "NotificationDispatch" d LEFT JOIN "User" creator ON creator.id = d."createdByUserId"
          WHERE d.id <> ${excludeDispatchId}
            AND (d."sourceId" IN (p.id, p."prospectId", p."leadId")
              OR d.metadata->>'profileId' = p.id OR d."recipientId" = ANY(contacts.ids))
          UNION ALL
          SELECT 'message:' || m.id, m.channel::text, m.direction::text,
            CASE WHEN m.direction = 'INBOUND' THEN 'Reply received' ELSE 'Linked contact message' END,
            CASE WHEN m.direction = 'INBOUND' THEN 'RECEIVED' ELSE COALESCE(m."providerStatus", 'RECORDED') END,
            COALESCE(m."receivedAt", m."sentAt", m."createdAt"), m."sentAt",
            m.direction = 'OUTBOUND' AND m."sentAt" IS NOT NULL,
            m.subject, CASE WHEN m.direction = 'INBOUND' THEN LEFT(COALESCE(m."textBody", m.body), 200) ELSE NULL END,
            COALESCE(creator.name, creator.email), NULL::text, m."threadId"
          FROM "MessageEntry" m LEFT JOIN "User" creator ON creator.id = m."createdByUserId"
          WHERE m."threadId" = ANY(threads.ids)
            AND m."notificationDispatchId" IS DISTINCT FROM ${excludeDispatchId}
            AND (m.direction = 'INBOUND' OR m."notificationDispatchId" IS NULL)
          UNION ALL
          SELECT 'legacy:' || l.id, 'EMAIL', 'OUTBOUND', 'Legacy email record', 'RECORDED', l."sentAt", l."sentAt", true,
            l.subject, NULL::text, NULL::text, NULL::text, NULL::text
          FROM "InterestLeadEmail" l WHERE l."interestLeadId" = p."leadId"
            AND NOT EXISTS (SELECT 1 FROM "NotificationDispatch" d WHERE d.subject = l.subject
              AND d."sourceId" = p."leadId" AND d."recipientId" = ANY(contacts.ids))
        )
      SELECT MAX(event.at) FILTER (WHERE event.direction = 'INBOUND' AND event.at >= p."createdAt") AS "latestReplyAt",
        MAX(event.at) FILTER (WHERE event.direction = 'OUTBOUND' AND event.sent) AS "latestContactAt",
        BOOL_OR(event.status IN ('QUEUED', 'PROCESSING')) AS pending,
        (SELECT JSONB_AGG(item ORDER BY item->>'at' DESC) FROM (
          SELECT JSONB_BUILD_OBJECT('id', e.id, 'channel', e.channel, 'direction', e.direction,
            'kind', e.kind, 'status', e.status, 'at', e.at AT TIME ZONE 'UTC', 'sentAt', e."sentAt" AT TIME ZONE 'UTC', 'subject', e.subject,
            'preview', e.preview, 'by', e.actor, 'dispatchId', e."dispatchId", 'threadId', e."threadId") AS item
          FROM (SELECT * FROM events ORDER BY at DESC, id DESC LIMIT 20) e
        ) latest) AS events
      FROM events event
    ) history ON true
    WHERE p.id IN (${Prisma.join(unique)})
  `);
  return new Map(rows.map((row) => [row.id, row]));
}

export function playerPoolContactBlock(history: PlayerPoolContactHistory, channel: "EMAIL" | "SMS") {
  if (history.status !== "INVITED" || history.profileSubmittedAt) return "No longer awaiting a profile.";
  if (["DECLINED", "DUPLICATE", "JOINED", "NOT_LOOKING", "NOT_INTERESTED"].includes(history.prospectStatus)) return "Prospect is no longer awaiting a team; review its status.";
  if (history.latestReplyAt) return "Reply received — review Player comms before sending another chase.";
  if (history.hasMembership) return "This contact is already linked to a squad — review before chasing.";
  if (channel === "EMAIL" ? history.emailBlocked : history.smsBlocked) return "Contact opted out or delivery disabled — no chase sent.";
  return null;
}
