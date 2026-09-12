import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { PROFILE_CONTACT_SOURCES, type FollowupState } from "./followup-policy";
type Db = Pick<typeof prisma, "$queryRaw">;

/** Read-only, batched evidence. Includes the original invitation, reminder
 * outbox, legacy PlayerPool messages and actual inbound contact. No timestamp
 * backfill: queued, sent and replies are distinct facts. Tokens stay server-side. */
export async function getPlayerPoolFollowupStates(ids?: string[], db: Db = prisma): Promise<FollowupState[]> {
  if (ids && !ids.length) return [];
  return db.$queryRaw<FollowupState[]>(Prisma.sql`
    WITH profiles AS (
      SELECT pp.*, p."firstName", p.email, p.phone,
        LOWER(TRIM(COALESCE(p.email, ''))) AS email_key,
        CASE WHEN REGEXP_REPLACE(COALESCE(p.phone, ''), '[^0-9]', '', 'g') LIKE '00%'
          THEN SUBSTRING(REGEXP_REPLACE(p.phone, '[^0-9]', '', 'g') FROM 3)
          WHEN REGEXP_REPLACE(COALESCE(p.phone, ''), '[^0-9]', '', 'g') LIKE '0%'
          THEN '44' || SUBSTRING(REGEXP_REPLACE(p.phone, '[^0-9]', '', 'g') FROM 2)
          ELSE REGEXP_REPLACE(COALESCE(p.phone, ''), '[^0-9]', '', 'g') END AS phone_key
      FROM "PlayerPoolProfile" pp
      JOIN "TeamPlayerProspect" p ON p.id = pp."prospectId"
      WHERE ${ids ? Prisma.sql`pp.id IN (${Prisma.join([...new Set(ids)])})` : Prisma.sql`pp.status = 'INVITED' AND pp."profileSubmittedAt" IS NULL`}
    )
    SELECT pp.id, pp."prospectId", pp."profileToken", pp."publicCode", pp.status,
      pp."profileSubmittedAt", pp."invitedAt", pp."createdAt", pp."firstName", pp.email, pp.phone,
      (pp.email_key <> '' AND pp.email_key = LOWER(TRIM(pp."emailNormalized"))) AS "emailMatches",
      EXISTS (SELECT 1 FROM "TeamMember" tm JOIN "User" u ON u.id = tm."userId"
        WHERE pp.email_key <> '' AND LOWER(TRIM(u.email)) = pp.email_key) AS "hasSquadRecord",
      EXISTS (SELECT 1 FROM "PlayerPoolIntroductionRequest" ir WHERE ir."profileId" = pp.id
        AND ir.status IN ('REQUESTED', 'INTRODUCED', 'JOINED')) AS "hasIntroduction",
      COALESCE(blocks.email_blocked, false) AS "emailBlocked",
      COALESCE(blocks.sms_blocked, false) AS "smsBlocked",
      inbound.at AS "latestReplyAt", inbound."threadId" AS "replyThreadId",
      decision."createdAt" AS "declinedAt", COALESCE(history.events, '[]'::json) AS events
    FROM profiles pp
    LEFT JOIN "PlayerPoolResponseDecision" decision ON decision."profileId" = pp.id
    LEFT JOIN LATERAL (
      SELECT BOOL_OR(r."isSuppressed" OR NOT r."transactionalEmailOptIn" OR pref."emailEnabled" = false) AS email_blocked,
        BOOL_OR(r."isSuppressed" OR NOT r."transactionalSmsOptIn" OR pref."smsEnabled" = false) AS sms_blocked
      FROM "NotificationRecipient" r LEFT JOIN "NotificationPreference" pref ON pref."recipientId" = r.id
      WHERE r."sourceId" = 'player-pool-profile:' || pp.id
        OR r."sourceId" IN (pp.id, pp."prospectId", pp."leadId")
        OR (pp.email_key <> '' AND r."emailNormalized" = pp.email_key)
        OR (LENGTH(pp.phone_key) >= 10 AND REGEXP_REPLACE(r."phoneNormalized", '[^0-9]', '', 'g') = pp.phone_key)
    ) blocks ON TRUE
    LEFT JOIN LATERAL (
      SELECT COALESCE(m."receivedAt", m."createdAt") AS at, m."threadId"
      FROM "MessageEntry" m JOIN "MessageThread" t ON t.id = m."threadId"
      WHERE m.direction = 'INBOUND' AND COALESCE(m."receivedAt", m."createdAt") >= pp."createdAt"
        AND (t."sourceId" IN (pp.id, pp."prospectId", pp."leadId", 'player-pool-profile:' || pp.id)
          OR (pp.email_key <> '' AND (LOWER(TRIM(m."fromEmail")) = pp.email_key OR t."emailNormalized" = pp.email_key))
          OR (LENGTH(pp.phone_key) >= 10 AND REGEXP_REPLACE(t."phoneNormalized", '[^0-9]', '', 'g') = pp.phone_key))
      ORDER BY COALESCE(m."receivedAt", m."createdAt") DESC, m.id DESC LIMIT 1
    ) inbound ON TRUE
    LEFT JOIN LATERAL (
      SELECT JSON_AGG(e.item ORDER BY e.at DESC, e.id DESC) AS events FROM (
        SELECT d.id, COALESCE(d."sentAt", d."failedAt", d."createdAt") AS at,
          JSON_BUILD_OBJECT('id', d.id, 'kind', d."sourceType", 'channel', d.channel,
            'status', d.status, 'at', COALESCE(d."sentAt", d."failedAt", d."createdAt") AT TIME ZONE 'UTC',
            'sentAt', d."sentAt" AT TIME ZONE 'UTC', 'scheduledFor', d."scheduledFor" AT TIME ZONE 'UTC',
            'by', COALESCE(u.name, u.email, d.metadata->>'originLabel', 'Automatic / system')) AS item
        FROM "NotificationDispatch" d JOIN "NotificationRecipient" r ON r.id = d."recipientId"
        LEFT JOIN "NotificationTemplate" template ON template.id = d."templateId"
        LEFT JOIN "User" u ON u.id = d."createdByUserId"
        WHERE (d."sourceType" IN (${Prisma.join(PROFILE_CONTACT_SOURCES)}) OR template.key LIKE 'player-pool-profile-%')
          AND (d."sourceId" IN (pp.id, pp."prospectId", pp."leadId") OR d.metadata->>'profileId' = pp.id
            OR r."sourceId" = 'player-pool-profile:' || pp.id
            OR (pp.email_key <> '' AND r."emailNormalized" = pp.email_key))
        UNION ALL
        SELECT m.id, m."sentAt", JSON_BUILD_OBJECT('id', m.id, 'kind', 'LEGACY_PLAYERPOOL_MESSAGE',
          'channel', m.channel, 'status', 'SENT', 'at', m."sentAt" AT TIME ZONE 'UTC',
          'sentAt', m."sentAt" AT TIME ZONE 'UTC', 'scheduledFor', NULL,
          'by', 'Earlier communication record', 'threadId', m."threadId")
        FROM "MessageEntry" m JOIN "MessageThread" t ON t.id = m."threadId"
        WHERE m.direction = 'OUTBOUND' AND m."notificationDispatchId" IS NULL AND m."sentAt" IS NOT NULL
          AND (COALESCE(m.subject, '') || ' ' || COALESCE(m."textBody", m.body, '')) ILIKE '%PlayerPool%'
          AND (t."sourceId" IN (pp.id, pp."prospectId", pp."leadId", 'player-pool-profile:' || pp.id)
            OR (pp.email_key <> '' AND LOWER(TRIM(m."toEmail")) = pp.email_key))
      ) e
    ) history ON TRUE
    ORDER BY pp."createdAt", pp.id
  `);
}
