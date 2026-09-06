import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

export const REPLACEMENT_REQUEST_SMS_ORIGIN = "night-board-last-minute-replacement";
export const REPLACEMENT_RESOLVED_SMS_ORIGIN = "night-board-last-minute-replacement-resolved";
// Internal audit text only; this is never sent to a customer.
export const REPLACEMENT_SMS_CANCEL_REASON = "Replacement request closed — unsent SMS cancelled.";

type SmsContext = { channel: string; metadata?: unknown };
type RawDb = Pick<Prisma.TransactionClient, "$queryRaw">;

function metadataText(metadata: unknown, key: string): string | null {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) return null;
  const value = (metadata as Record<string, unknown>)[key];
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

export function isReplacementSms(input: SmsContext): boolean {
  if (input.channel !== "SMS") return false;
  const origin = metadataText(input.metadata, "origin");
  return origin === REPLACEMENT_REQUEST_SMS_ORIGIN || origin === REPLACEMENT_RESOLVED_SMS_ORIGIN;
}

/** Queue-time and final pre-provider gate. Emails and unrelated SMS are untouched.
 * Resolution follow-ups (including selected-team/opponent SMS confirmations) are
 * not sent after the request closes. Their existing email confirmations remain.
 * Do not use recipient response, message wording, team name or scheduled time as
 * identity: only the exact fixture/drop-team request metadata is authoritative. */
export async function getReplacementSmsCancellationReason(input: SmsContext, db: RawDb = prisma): Promise<string | null> {
  if (!isReplacementSms(input)) return null;
  if (metadataText(input.metadata, "origin") === REPLACEMENT_RESOLVED_SMS_ORIGIN) {
    return REPLACEMENT_SMS_CANCEL_REASON;
  }
  const fixtureId = metadataText(input.metadata, "fixtureId");
  const droppedTeamId = metadataText(input.metadata, "droppedTeamId");
  const opponentTeamId = metadataText(input.metadata, "opponentTeamId");
  if (!fixtureId || !droppedTeamId || !opponentTeamId) {
    return "Replacement SMS is missing its fixture/request references.";
  }
  const [state] = await db.$queryRaw<Array<{ resolved: boolean; requestOpen: boolean }>>(Prisma.sql`
    SELECT EXISTS (
      SELECT 1 FROM "LastMinuteReplacementResolution" r
      WHERE r."fixtureId" = ${fixtureId} AND r."droppedTeamId" = ${droppedTeamId}
    ) AS "resolved", EXISTS (
      SELECT 1 FROM "Fixture" f WHERE f."id" = ${fixtureId}
        AND f."publishedAt" IS NOT NULL AND f."status"::text = 'SCHEDULED'
        AND f."kickoffAt" > CURRENT_TIMESTAMP
        AND ${droppedTeamId} IN (f."homeTeamId", f."awayTeamId")
        AND ${opponentTeamId} IN (f."homeTeamId", f."awayTeamId")
    ) AS "requestOpen"
  `);
  // A failed read throws: the caller must not hand an unverified SMS to Twilio.
  return state?.requestOpen && !state.resolved ? null : REPLACEMENT_SMS_CANCEL_REASON;
}

function closedRequestPredicate() {
  return Prisma.sql`(
    d."metadata"->>'origin' = ${REPLACEMENT_RESOLVED_SMS_ORIGIN}
    OR EXISTS (
      SELECT 1 FROM "LastMinuteReplacementResolution" r
      WHERE r."fixtureId" = d."metadata"->>'fixtureId'
        AND r."droppedTeamId" = d."metadata"->>'droppedTeamId'
    )
    OR NOT EXISTS (
      SELECT 1 FROM "Fixture" f WHERE f."id" = d."metadata"->>'fixtureId'
        AND f."publishedAt" IS NOT NULL AND f."status"::text = 'SCHEDULED'
        AND f."kickoffAt" > CURRENT_TIMESTAMP
        AND d."metadata"->>'droppedTeamId' IN (f."homeTeamId", f."awayTeamId")
        AND d."metadata"->>'opponentTeamId' IN (f."homeTeamId", f."awayTeamId")
    )
  )`;
}

/** Cancel future-dated queued SMS now, not just those due in the current batch.
 * FAILED rows without any successful provider evidence cannot be retried later.
 * Sweeps deliberately never relabel PROCESSING: a provider request may already
 * be in flight. Its owning worker instead uses the final delivery gate below. */
export async function cancelClosedReplacementSms(fixtureId?: string, db: RawDb = prisma): Promise<number> {
  const rows = await db.$queryRaw<Array<{ count: number }>>(Prisma.sql`
    WITH cancelled AS (
      UPDATE "NotificationDispatch" d SET "status" = 'CANCELLED',
        "cancelledAt" = CURRENT_TIMESTAMP, "updatedAt" = CURRENT_TIMESTAMP,
        "failureReason" = ${REPLACEMENT_SMS_CANCEL_REASON}
      WHERE d."channel"::text = 'SMS' AND d."status"::text IN ('QUEUED', 'FAILED')
        AND d."sentAt" IS NULL AND d."providerMessageId" IS NULL
        AND d."metadata"->>'origin' IN (${REPLACEMENT_REQUEST_SMS_ORIGIN}, ${REPLACEMENT_RESOLVED_SMS_ORIGIN})
        ${fixtureId ? Prisma.sql`AND d."metadata"->>'fixtureId' = ${fixtureId}` : Prisma.empty}
        AND NOT EXISTS (SELECT 1 FROM "NotificationAttempt" a WHERE a."dispatchId" = d."id" AND a."status"::text = 'SUCCESS')
        AND ${closedRequestPredicate()}
      RETURNING d."id"
    ), history AS (
      UPDATE "MessageEntry" m SET "providerStatus" = ${`CANCELLED: ${REPLACEMENT_SMS_CANCEL_REASON}`}, "updatedAt" = CURRENT_TIMESTAMP
      FROM cancelled c WHERE m."notificationDispatchId" = c."id"
        AND m."channel"::text = 'SMS' AND m."sentAt" IS NULL
        AND m."providerMessageId" IS NULL AND m."twilioMessageSid" IS NULL
      RETURNING m."id"
    ) SELECT COUNT(*)::int AS "count" FROM cancelled
  `);
  return rows[0]?.count ?? 0;
}

/** Only call from the worker that owns this PROCESSING row, before provider
 * submission. Preserve sent/accepted records and update linked audit history. */
export async function cancelOwnedReplacementSms(dispatchId: string, reason: string, db: RawDb = prisma): Promise<void> {
  await db.$queryRaw(Prisma.sql`
    WITH cancelled AS (
      UPDATE "NotificationDispatch" d SET "status" = 'CANCELLED',
        "cancelledAt" = CURRENT_TIMESTAMP, "updatedAt" = CURRENT_TIMESTAMP, "failureReason" = ${reason}
      WHERE d."id" = ${dispatchId} AND d."channel"::text = 'SMS'
        AND d."status"::text = 'PROCESSING' AND d."sentAt" IS NULL AND d."providerMessageId" IS NULL
        AND d."metadata"->>'origin' IN (${REPLACEMENT_REQUEST_SMS_ORIGIN}, ${REPLACEMENT_RESOLVED_SMS_ORIGIN})
        AND NOT EXISTS (SELECT 1 FROM "NotificationAttempt" a WHERE a."dispatchId" = d."id" AND a."status"::text = 'SUCCESS')
      RETURNING d."id"
    ) UPDATE "MessageEntry" m SET "providerStatus" = ${`CANCELLED: ${reason}`}, "updatedAt" = CURRENT_TIMESTAMP
      FROM cancelled c WHERE m."notificationDispatchId" = c."id"
        AND m."channel"::text = 'SMS' AND m."sentAt" IS NULL
        AND m."providerMessageId" IS NULL AND m."twilioMessageSid" IS NULL
      RETURNING m."id"
  `);
}
