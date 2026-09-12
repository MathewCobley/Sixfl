import { Prisma } from "@prisma/client";
import { normalizePhoneNumber } from "@/lib/notifications/phone";
import { prisma } from "@/lib/prisma";
import { emptyContactHistory, type ContactEvent, type ContactHistory } from "./response-policy";

export type ContactDb = Pick<typeof prisma, "$queryRaw">;
export type PlayerPoolContactTarget = {
  id: string; prospectId: string; leadId: string | null; publicCode: string;
  profileToken: string; status: string; profileSubmittedAt: Date | null;
  invitedAt: Date | null; createdAt: Date; area: string | null; leagueId: string | null;
  firstName: string; lastName: string | null; email: string | null; phone: string | null;
  leagueName: string | null; prospectStatus: string; hasSquadRecord: boolean;
};

export async function readPlayerPoolContactTargets(ids?: string[], db: ContactDb = prisma, lock = false) {
  if (ids && !ids.length) return [];
  return db.$queryRaw<PlayerPoolContactTarget[]>(Prisma.sql`
    SELECT pp.id, pp."prospectId", pp."leadId", pp."publicCode", pp."profileToken", pp.status,
      pp."profileSubmittedAt", pp."invitedAt", pp."createdAt", pp.area, pp."leagueId",
      p."firstName", p."lastName", p.email, p.phone, l.name AS "leagueName", p.status AS "prospectStatus",
      EXISTS (SELECT 1 FROM "TeamMember" tm JOIN "User" u ON u.id = tm."userId"
        WHERE NULLIF(LOWER(TRIM(p.email)), '') = LOWER(TRIM(u.email))) AS "hasSquadRecord"
    FROM "PlayerPoolProfile" pp JOIN "TeamPlayerProspect" p ON p.id = pp."prospectId"
    LEFT JOIN "League" l ON l.id = pp."leagueId"
    WHERE ${ids ? Prisma.sql`pp.id IN (${Prisma.join(ids)})` : Prisma.sql`pp.status = 'INVITED' AND pp."profileSubmittedAt" IS NULL`}
    ORDER BY pp."createdAt", pp.id ${lock ? Prisma.sql`FOR UPDATE OF pp` : Prisma.empty}
  `);
}

type Row = ContactEvent & { profileId: string; latestReplyAt: Date | null; latestSentAt: Date | null; pendingCount: number; emailBlocked: boolean; smsBlocked: boolean };

/** One batched source for the cards and eligibility checks. No timestamp backfill
 * and no inferred delivery: queued, sent, failed and inbound evidence stay distinct.
 * Contact-level matches are conservative evidence, never permission to merge people. */
export async function getPlayerPoolContactHistory(
  targets: PlayerPoolContactTarget[], db: ContactDb = prisma, excludeDispatchId: string | null = null, includeFormResponses = false,
): Promise<Map<string, ContactHistory>> {
  const histories = new Map(targets.map(p => [p.id, emptyContactHistory()]));
  if (!targets.length) return histories;
  const values = targets.map(p => Prisma.sql`(${p.id}, ${p.prospectId}, ${p.leadId}, ${p.email?.trim().toLowerCase() || null}, ${normalizePhoneNumber(p.phone)}, ${p.createdAt}::timestamp)`);
  const rows = await db.$queryRaw<Row[]>(Prisma.sql`
    WITH targets(id, prospect_id, lead_id, email, phone, since) AS (VALUES ${Prisma.join(values)})
    SELECT t.id AS "profileId", e.*,
      EXISTS (SELECT 1 FROM "NotificationRecipient" r LEFT JOIN "NotificationPreference" pref ON pref."recipientId" = r.id
        WHERE (r."sourceId" = 'player-pool-profile:' || t.id OR (t.email IS NOT NULL AND LOWER(TRIM(r.email)) = t.email))
        AND (r."isSuppressed" OR NOT r."transactionalEmailOptIn" OR pref."emailEnabled" = false)) AS "emailBlocked",
      EXISTS (SELECT 1 FROM "NotificationRecipient" r LEFT JOIN "NotificationPreference" pref ON pref."recipientId" = r.id
        WHERE (r."sourceId" = 'player-pool-profile:' || t.id OR (t.phone IS NOT NULL AND r."phoneNormalized" = t.phone))
        AND (r."isSuppressed" OR NOT r."transactionalSmsOptIn" OR pref."smsEnabled" = false)) AS "smsBlocked"
    FROM targets t LEFT JOIN LATERAL (
      SELECT all_events.*,
        MAX(at) FILTER (WHERE kind = 'REPLY' AND at >= t.since) OVER () AS "latestReplyAt",
        MAX("sentAt") OVER () AS "latestSentAt",
        (COUNT(*) FILTER (WHERE status IN ('QUEUED','PROCESSING')) OVER ())::int AS "pendingCount"
      FROM (
        SELECT d.id,
          CASE WHEN d."sourceType" = 'PLAYER_POOL_PROFILE_INVITE' THEN 'INVITATION'
            WHEN d."sourceType" = 'PLAYER_POOL_PROFILE_NUDGE' THEN 'REMINDER'
            WHEN d."sourceType" IN ('PLAYER_POOL_PROFILE_SMS_NUDGE_1','PLAYER_POOL_PROFILE_SMS_NUDGE_FINAL') THEN 'SMS_CHASE'
            ELSE 'OTHER_CONTACT' END AS kind,
          d.channel::text, d.status::text,
          COALESCE(d."sentAt",d."failedAt",d."createdAt") AS at, d."sentAt", d."scheduledFor",
          COALESCE(u.name,u.email,d.metadata->>'originLabel','SIXFL system') AS author,
          '/admin/queue/' || d.id AS href,
          (SELECT m."providerStatus" FROM "MessageEntry" m WHERE m."notificationDispatchId"=d.id ORDER BY m."updatedAt" DESC LIMIT 1) AS "deliveryStatus"
        FROM "NotificationDispatch" d JOIN "NotificationRecipient" r ON r.id=d."recipientId"
        LEFT JOIN "User" u ON u.id=d."createdByUserId"
        WHERE (${excludeDispatchId}::text IS NULL OR d.id <> ${excludeDispatchId})
          AND (d."sourceId" IN (t.id,t.prospect_id,t.lead_id) OR d.metadata->>'profileId'=t.id
            OR r."sourceId"='player-pool-profile:' || t.id
            OR (t.email IS NOT NULL AND LOWER(TRIM(r.email))=t.email)
            OR (t.phone IS NOT NULL AND r."phoneNormalized"=t.phone))
        UNION ALL
        SELECT m.id, CASE WHEN m.direction='INBOUND' THEN 'REPLY' ELSE 'OTHER_CONTACT' END,
          m.channel::text, CASE WHEN m.direction='INBOUND' THEN 'RECEIVED'
            WHEN m."sentAt" IS NOT NULL THEN 'SENT' ELSE COALESCE(UPPER(m."providerStatus"),'RECORDED') END,
          COALESCE(m."receivedAt",m."sentAt",m."createdAt"), m."sentAt", NULL::timestamp,
          CASE WHEN m.direction='INBOUND' THEN 'Contact response' ELSE COALESCE(u.name,u.email,'SIXFL') END,
          '/admin/player-prospects/' || t.prospect_id || '/communications', m."providerStatus"
        FROM "MessageEntry" m JOIN "MessageThread" thread ON thread.id=m."threadId"
        LEFT JOIN "User" u ON u.id=m."createdByUserId"
        WHERE (m.direction='INBOUND' OR m."notificationDispatchId" IS NULL)
          AND (thread."sourceId" IN (t.id,t.prospect_id,t.lead_id)
            OR (t.email IS NOT NULL AND (LOWER(TRIM(m."fromEmail"))=t.email OR LOWER(TRIM(m."toEmail"))=t.email OR thread."emailNormalized"=t.email))
            OR (t.phone IS NOT NULL AND (thread."phoneNormalized"=t.phone OR m."fromNumber"=t.phone OR m."toNumber"=t.phone)))
        UNION ALL
        SELECT old.id, CASE WHEN old.body LIKE '%/player-pool/%' THEN 'INVITATION' ELSE 'OTHER_CONTACT' END,
          'EMAIL', 'SENT', old."sentAt", old."sentAt", NULL::timestamp, 'Legacy lead email',
          '/admin/player-prospects/' || t.prospect_id || '/communications', NULL::text
        FROM "InterestLeadEmail" old WHERE old."interestLeadId"=t.lead_id
          AND NOT EXISTS (SELECT 1 FROM "MessageEntry" m WHERE m.subject=old.subject AND m."toEmail"=old."sentTo" AND m."sentAt" BETWEEN old."sentAt" - interval '5 seconds' AND old."sentAt" + interval '5 seconds')
          AND NOT EXISTS (SELECT 1 FROM "NotificationDispatch" d JOIN "NotificationRecipient" r ON r.id=d."recipientId" WHERE d.subject=old.subject AND LOWER(TRIM(r.email))=LOWER(TRIM(old."sentTo")) AND d."sentAt" BETWEEN old."sentAt" - interval '5 seconds' AND old."sentAt" + interval '5 seconds')
      ) all_events ORDER BY at DESC, id DESC LIMIT 30
    ) e ON TRUE
  `);
  for (const row of rows) {
    const h = histories.get(row.profileId)!;
    h.emailBlocked = row.emailBlocked; h.smsBlocked = row.smsBlocked;
    h.latestReplyAt = row.latestReplyAt; h.latestSentAt = row.latestSentAt;
    h.pendingCount = row.pendingCount || 0;
    if (row.id) h.events.push({ id: row.id, kind: row.kind, channel: row.channel, status: row.status,
      at: row.at, sentAt: row.sentAt, scheduledFor: row.scheduledFor, author: row.author,
      href: row.href, deliveryStatus: row.deliveryStatus });
  }
  if (includeFormResponses) {
    const responses = await db.$queryRaw<Array<{ id: string; profileId: string; createdAt: Date }>>(Prisma.sql`
      SELECT id,"profileId","createdAt" FROM "PlayerPoolResponseEvent"
      WHERE "profileId" IN (${Prisma.join(targets.map(p => p.id))}) ORDER BY "createdAt" DESC
    `);
    for (const response of responses) histories.get(response.profileId)!.events.push({
      id: response.id, kind: "NOT_LOOKING", channel: "FORM", status: "CONFIRMED", at: response.createdAt,
      sentAt: null, scheduledFor: null, author: "Confirmed through secure player form", href: null, deliveryStatus: null,
    });
    for (const h of histories.values()) h.events.sort((a,b) => b.at.getTime() - a.at.getTime());
  }
  return histories;
}
