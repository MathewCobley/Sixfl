import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

export const PROFILE_CHASE_SOURCE = "PLAYER_POOL_PROFILE_NUDGE";
export const PROFILE_CHASE_SOURCES = [PROFILE_CHASE_SOURCE, "PLAYER_POOL_PROFILE_SMS_NUDGE_1", "PLAYER_POOL_PROFILE_SMS_NUDGE_FINAL"];
export const RESPONSE_TEMPLATE_KEY = "player-pool-response-request-email";
export const CONTACT_COOLDOWN_MS = 48 * 60 * 60 * 1000;
export type ContactEvent = {
  id: string; kind: string; channel: string; status: string; at: string;
  sentAt: string | null; by: string | null; threadId: string | null;
};
export type PoolContactState = {
  id: string; prospectId: string; publicCode: string; profileToken: string;
  status: string; profileSubmittedAt: Date | null; invitedAt: Date | null;
  firstName: string; lastName: string | null; email: string | null; phone: string | null;
  leagueId: string | null; lastSentAt: Date | null; lastReplyAt: Date | null;
  pendingCount: number; emailBlocked: boolean; smsBlocked: boolean;
  hasSquadRecord: boolean; alreadyInRun: boolean; events: ContactEvent[];
};
type Db = Pick<typeof prisma, "$queryRaw">;

/** Shared read-only evidence for the cards, preflight, queue and delivery gate.
 * Contact-matched replies are flagged for review, not interpreted as a yes/no.
 * Invitations and follow-ups keep their original identity, status and timestamps.
 */
export async function getPlayerPoolContactHistory(ids: string[], db: Db = prisma, options: { excludeDispatchId?: string; bulkRunId?: string } = {}) {
  if (!ids.length) return new Map<string, PoolContactState>();
  const rows = await db.$queryRaw<PoolContactState[]>(Prisma.sql`
    WITH profiles AS (
      SELECT p.*, prospect."firstName", prospect."lastName", prospect.email, prospect.phone,
        LOWER(TRIM(prospect.email)) AS contact_email,
        CASE WHEN REGEXP_REPLACE(COALESCE(prospect.phone,''),'[^0-9]','','g') LIKE '00%'
          THEN SUBSTRING(REGEXP_REPLACE(prospect.phone,'[^0-9]','','g') FROM 3)
          WHEN REGEXP_REPLACE(COALESCE(prospect.phone,''),'[^0-9]','','g') LIKE '0%'
          THEN '44' || SUBSTRING(REGEXP_REPLACE(prospect.phone,'[^0-9]','','g') FROM 2)
          ELSE REGEXP_REPLACE(COALESCE(prospect.phone,''),'[^0-9]','','g') END AS contact_phone
      FROM "PlayerPoolProfile" p JOIN "TeamPlayerProspect" prospect ON prospect.id=p."prospectId"
      WHERE p.id IN (${Prisma.join([...new Set(ids)])})
    )
    SELECT p.id,p."prospectId",p."publicCode",p."profileToken",p.status,p."profileSubmittedAt",p."invitedAt",
      p."firstName",p."lastName",p.email,p.phone,p."leagueId",
      GREATEST(d.last_sent,m.last_sent) AS "lastSentAt",GREATEST(m.last_reply,decision."respondedAt") AS "lastReplyAt",
      COALESCE(d.pending,0)::int AS "pendingCount", COALESCE(d.in_run,false) AS "alreadyInRun",
      EXISTS (SELECT 1 FROM "User" u JOIN "TeamMember" member ON member."userId"=u.id
        WHERE LOWER(TRIM(u.email))=p.contact_email AND member.role::text IN ('PLAYER','CAPTAIN','BACKUP_PLAYER','VICE_CAPTAIN')) AS "hasSquadRecord",
      COALESCE(o.email_blocked,false) AS "emailBlocked",COALESCE(o.sms_blocked,false) AS "smsBlocked",
      COALESCE(d.events,'[]'::jsonb) || COALESCE(m.events,'[]'::jsonb) ||
        CASE WHEN decision.id IS NOT NULL THEN JSONB_BUILD_ARRAY(JSONB_BUILD_OBJECT('id',decision.id,'kind','No — no longer looking',
          'channel','WEB','status','RECORDED','at',decision."respondedAt",'sentAt',NULL,'by','Player','threadId',NULL)) ELSE '[]'::jsonb END AS events
    FROM profiles p
    LEFT JOIN "PlayerPoolResponseDecision" decision ON decision."profileId"=p.id
    LEFT JOIN LATERAL (
      SELECT MAX(x."sentAt") AS last_sent,
        COUNT(*) FILTER (WHERE x.status::text IN ('QUEUED','PROCESSING')) AS pending,
        BOOL_OR(x.metadata->>'bulkRunId' = ${options.bulkRunId ?? ''}) AS in_run,
        JSONB_AGG(JSONB_BUILD_OBJECT('id',x.id,'kind',CASE WHEN x."sourceType"='PLAYER_POOL_PROFILE_INVITE' THEN 'Invitation' ELSE 'Follow-up' END,
          'channel',x.channel::text,'status',x.status::text,
          'at',COALESCE(x."sentAt",x."failedAt",x."createdAt"),'sentAt',x."sentAt",
          'by',COALESCE(u.name,u.email,'SIXFL'),'threadId',NULL) ORDER BY x."createdAt" DESC) AS events
      FROM "NotificationDispatch" x JOIN "NotificationRecipient" r ON r.id=x."recipientId"
      LEFT JOIN "NotificationTemplate" t ON t.id=x."templateId"
      LEFT JOIN "User" u ON u.id=x."createdByUserId"
      WHERE (x."sourceType" LIKE 'PLAYER_POOL_PROFILE%' OR t.key LIKE 'player-pool-profile-%' OR t.key=${RESPONSE_TEMPLATE_KEY})
        AND (x."sourceId" IN (p.id,p."prospectId",p."leadId") OR x.metadata->>'profileId'=p.id
          OR x.metadata->>'prospectId'=p."prospectId" OR r."emailNormalized"=p.contact_email)
        AND x.id <> ${options.excludeDispatchId ?? ''}
    ) d ON true
    LEFT JOIN LATERAL (
      SELECT MAX(COALESCE(e."receivedAt",e."createdAt")) FILTER (WHERE e.direction::text='INBOUND') AS last_reply,
        MAX(e."sentAt") FILTER (WHERE e.direction::text='OUTBOUND') AS last_sent,
        JSONB_AGG(JSONB_BUILD_OBJECT('id',e.id,'kind',CASE WHEN e.direction::text='INBOUND' THEN 'Reply from linked contact' ELSE 'Other contact message' END,
          'channel',e.channel::text,'status',CASE WHEN e.direction::text='INBOUND' THEN 'RECEIVED' WHEN e."sentAt" IS NOT NULL THEN 'SENT' ELSE 'RECORDED' END,
          'at',COALESCE(e."receivedAt",e."sentAt",e."createdAt"),'sentAt',e."sentAt",'by',NULL,'threadId',e."threadId") ORDER BY e."createdAt" DESC) AS events
      FROM "MessageEntry" e JOIN "MessageThread" mt ON mt.id=e."threadId"
      WHERE (mt."sourceId" IN (p.id,p."prospectId",p."leadId",'player-pool-profile:'||p.id)
        OR mt."emailNormalized"=p.contact_email
        OR (LENGTH(p.contact_phone)>=8 AND REGEXP_REPLACE(COALESCE(mt."phoneNormalized",''),'[^0-9]','','g')=p.contact_phone))
        AND (e.direction::text='INBOUND' OR e."notificationDispatchId" IS NULL)
    ) m ON true
    LEFT JOIN LATERAL (
      SELECT BOOL_OR(r."isSuppressed" OR NOT r."transactionalEmailOptIn" OR pref."emailEnabled"=false) AS email_blocked,
        BOOL_OR(r."isSuppressed" OR NOT r."transactionalSmsOptIn" OR pref."smsEnabled"=false) AS sms_blocked
      FROM "NotificationRecipient" r LEFT JOIN "NotificationPreference" pref ON pref."recipientId"=r.id
      WHERE r."sourceId" IN (p.id,p."prospectId",p."leadId",'player-pool-profile:'||p.id)
        OR r."emailNormalized"=p.contact_email
    ) o ON true
    ORDER BY p.id
  `);
  return new Map(rows.map(row => [row.id, row]));
}

export function playerPoolChaseBlock(state: PoolContactState | undefined, now = new Date(), delivery = false): string | null {
  if (!state || state.status !== "INVITED" || state.profileSubmittedAt) return "Not awaiting a profile.";
  if (!state.profileToken?.trim()) return "No secure profile link.";
  if (!state.email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(state.email.trim())) return "No usable email address.";
  if (state.emailBlocked) return "Email disabled or contact opted out.";
  if (state.hasSquadRecord) return "Existing squad record — review before chasing.";
  if (state.lastReplyAt && (!state.invitedAt || state.lastReplyAt >= state.invitedAt)) return "Reply received — review the conversation before chasing.";
  if (!delivery && state.alreadyInRun) return "Already processed in this reminder run.";
  if (!delivery && state.pendingCount > 0) return "An invitation or chase is already queued or sending.";
  if (!delivery && (state.lastSentAt ?? state.invitedAt) && now.getTime() - (state.lastSentAt ?? state.invitedAt)!.getTime() < CONTACT_COOLDOWN_MS) return "Contacted within the last 48 hours.";
  return null;
}
