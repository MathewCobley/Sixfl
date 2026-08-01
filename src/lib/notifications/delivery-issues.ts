import { NotificationChannel, NotificationDispatchStatus } from "@prisma/client";

import { prisma } from "@/lib/prisma";

const RECENT_FAILURE_WINDOW_DAYS = 30;
const DELAY_WINDOW_HOURS = 72;

export type UnresolvedEmailDelay = {
  dispatchId: string;
  recipientId: string;
  displayName: string | null;
  email: string | null;
  phone: string | null;
  subject: string | null;
  sourceType: string | null;
  sourceId: string | null;
  attemptedAt: Date;
  reason: string | null;
};

export type EmailDeliveryIssueSummary = {
  affectedRecipientCount: number;
  suppressedRecipientCount: number;
  recentFailedDispatchCount: number;
  unresolvedDelayedCount: number;
};

function recentFailureCutoff() {
  return new Date(
    Date.now() - RECENT_FAILURE_WINDOW_DAYS * 24 * 60 * 60 * 1000,
  );
}

export async function listUnresolvedEmailDelays(
  limit = 50,
): Promise<UnresolvedEmailDelay[]> {
  const safeLimit = Math.min(Math.max(Math.trunc(limit), 1), 250);

  return prisma.$queryRaw<UnresolvedEmailDelay[]>`
    SELECT DISTINCT ON (attempt."dispatchId")
      dispatch."id" AS "dispatchId",
      recipient."id" AS "recipientId",
      recipient."displayName" AS "displayName",
      recipient."email" AS "email",
      recipient."phone" AS "phone",
      dispatch."subject" AS "subject",
      dispatch."sourceType" AS "sourceType",
      dispatch."sourceId" AS "sourceId",
      attempt."attemptedAt" AS "attemptedAt",
      COALESCE(attempt."errorMessage", 'Delivery temporarily delayed') AS "reason"
    FROM "NotificationAttempt" attempt
    JOIN "NotificationDispatch" dispatch
      ON dispatch."id" = attempt."dispatchId"
    JOIN "NotificationRecipient" recipient
      ON recipient."id" = dispatch."recipientId"
    WHERE attempt."provider" = 'resend'
      AND attempt."status" = 'PENDING'
      AND attempt."attemptedAt" >= NOW() - (${DELAY_WINDOW_HOURS} * INTERVAL '1 hour')
      AND COALESCE(attempt."responsePayload"->>'type', '') = 'email.delivery_delayed'
      AND NOT EXISTS (
        SELECT 1
        FROM "NotificationAttempt" later
        WHERE later."dispatchId" = attempt."dispatchId"
          AND COALESCE(later."responsePayload"->>'type', '') IN (
            'email.delivered',
            'email.bounced',
            'email.failed',
            'email.suppressed'
          )
          AND COALESCE(
            NULLIF(later."responsePayload"->>'created_at', '')::timestamptz,
            later."attemptedAt"
          ) >= COALESCE(
            NULLIF(attempt."responsePayload"->>'created_at', '')::timestamptz,
            attempt."attemptedAt"
          )
      )
    ORDER BY attempt."dispatchId", attempt."attemptedAt" DESC
    LIMIT ${safeLimit}
  `;
}

export async function getEmailDeliveryIssueSummary(): Promise<EmailDeliveryIssueSummary> {
  const cutoff = recentFailureCutoff();

  const [
    affectedRecipientCount,
    suppressedRecipientCount,
    recentFailedDispatchCount,
    delayedRows,
  ] = await Promise.all([
    prisma.notificationRecipient.count({
      where: {
        OR: [
          { isSuppressed: true },
          {
            dispatches: {
              some: {
                channel: NotificationChannel.EMAIL,
                status: NotificationDispatchStatus.FAILED,
                failedAt: { gte: cutoff },
              },
            },
          },
        ],
      },
    }),
    prisma.notificationRecipient.count({
      where: { isSuppressed: true },
    }),
    prisma.notificationDispatch.count({
      where: {
        channel: NotificationChannel.EMAIL,
        status: NotificationDispatchStatus.FAILED,
        failedAt: { gte: cutoff },
      },
    }),
    listUnresolvedEmailDelays(250),
  ]);

  return {
    affectedRecipientCount,
    suppressedRecipientCount,
    recentFailedDispatchCount,
    unresolvedDelayedCount: delayedRows.length,
  };
}
