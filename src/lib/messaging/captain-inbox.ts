import {
  NotificationDispatchStatus,
  NotificationRecipientSourceType,
  Prisma,
} from "@prisma/client";

import { prisma } from "@/lib/prisma";

/**
 * Historical outbound messages pre-date the captain inbox and must not all
 * appear as newly unread when the feature launches.
 */
export const CAPTAIN_INBOX_UNREAD_SINCE = new Date(
  "2026-08-09T17:00:00.000Z",
);

const CAPTAIN_VISIBLE_DISPATCH_STATUSES = new Set<string>([
  NotificationDispatchStatus.QUEUED,
  NotificationDispatchStatus.PROCESSING,
  NotificationDispatchStatus.SENT,
]);

const PRIVATE_PLAYER_THREAD_SOURCE_TYPES = [
  "TEAM_MEMBER",
  "TEAM_PLAYER_PROSPECT",
] as const;

export function getCaptainTeamThreadWhere(
  teamId: string,
): Prisma.MessageThreadWhereInput {
  return {
    AND: [
      {
        OR: [
          { teamId },
          {
            recipient: {
              is: {
                sourceType: NotificationRecipientSourceType.TEAM,
                sourceId: teamId,
              },
            },
          },
        ],
      },
      {
        OR: [
          { sourceType: null },
          {
            AND: [
              {
                sourceType: {
                  notIn: [...PRIVATE_PLAYER_THREAD_SOURCE_TYPES],
                },
              },
              {
                NOT: {
                  sourceType: {
                    startsWith: "PLAYER_MATCH_FEE",
                  },
                },
              },
            ],
          },
        ],
      },
    ],
  };
}

type CaptainUnreadCandidate = {
  direction: string;
  readAt: Date | null;
  createdAt: Date;
  notificationDispatchId: string | null;
  sentAt: Date | null;
  providerStatus: string | null;
  dispatch?: {
    status: string;
  } | null;
};

export function isCaptainUnreadMessage(input: CaptainUnreadCandidate) {
  if (input.direction !== "OUTBOUND" || input.readAt) return false;
  if (input.createdAt < CAPTAIN_INBOX_UNREAD_SINCE) return false;

  if (input.notificationDispatchId) {
    return Boolean(
      input.dispatch &&
        CAPTAIN_VISIBLE_DISPATCH_STATUSES.has(input.dispatch.status),
    );
  }

  if (input.sentAt) return true;

  const providerStatus = input.providerStatus?.trim().toLowerCase() ?? "";
  return ["queued", "processing", "sent", "delivered"].includes(
    providerStatus,
  );
}

export async function getCaptainUnreadMessageCount(teamId: string) {
  const rows = await prisma.$queryRaw<Array<{ count: bigint }>>(Prisma.sql`
    SELECT COUNT(*)::BIGINT AS "count"
    FROM "MessageEntry" message
    INNER JOIN "MessageThread" thread
      ON thread."id" = message."threadId"
    LEFT JOIN "NotificationRecipient" recipient
      ON recipient."id" = thread."recipientId"
    LEFT JOIN "NotificationDispatch" dispatch
      ON dispatch."id" = message."notificationDispatchId"
    WHERE (
      thread."teamId" = ${teamId}
      OR (
        recipient."sourceType" = 'TEAM'::"NotificationRecipientSourceType"
        AND recipient."sourceId" = ${teamId}
      )
    )
      AND (
        thread."sourceType" IS NULL
        OR (
          thread."sourceType" NOT IN ('TEAM_MEMBER', 'TEAM_PLAYER_PROSPECT')
          AND thread."sourceType" NOT LIKE 'PLAYER_MATCH_FEE%'
        )
      )
      AND message."direction" = 'OUTBOUND'::"MessageDirection"
      AND message."readAt" IS NULL
      AND message."createdAt" >= ${CAPTAIN_INBOX_UNREAD_SINCE}
      AND (
        (
          message."notificationDispatchId" IS NOT NULL
          AND dispatch."status" IN (
            'QUEUED'::"NotificationDispatchStatus",
            'PROCESSING'::"NotificationDispatchStatus",
            'SENT'::"NotificationDispatchStatus"
          )
        )
        OR (
          message."notificationDispatchId" IS NULL
          AND (
            message."sentAt" IS NOT NULL
            OR LOWER(COALESCE(message."providerStatus", '')) IN (
              'queued',
              'processing',
              'sent',
              'delivered'
            )
          )
        )
      )
  `);

  return Number(rows[0]?.count ?? 0);
}

export async function markCaptainMessageRead(input: {
  teamId: string;
  messageId: string;
}) {
  const rows = await prisma.$queryRaw<Array<{ id: string }>>(Prisma.sql`
    WITH visible_message AS (
      SELECT message."id"
      FROM "MessageEntry" message
      INNER JOIN "MessageThread" thread
        ON thread."id" = message."threadId"
      LEFT JOIN "NotificationRecipient" recipient
        ON recipient."id" = thread."recipientId"
      WHERE message."id" = ${input.messageId}
        AND (
          thread."teamId" = ${input.teamId}
          OR (
            recipient."sourceType" = 'TEAM'::"NotificationRecipientSourceType"
            AND recipient."sourceId" = ${input.teamId}
          )
        )
        AND (
          thread."sourceType" IS NULL
          OR (
            thread."sourceType" NOT IN ('TEAM_MEMBER', 'TEAM_PLAYER_PROSPECT')
            AND thread."sourceType" NOT LIKE 'PLAYER_MATCH_FEE%'
          )
        )
        AND message."direction" = 'OUTBOUND'::"MessageDirection"
    )
    UPDATE "MessageEntry"
    SET "readAt" = COALESCE("readAt", NOW()),
        "updatedAt" = NOW()
    WHERE "id" IN (SELECT "id" FROM visible_message)
    RETURNING "id"
  `);

  return rows.length > 0;
}

export async function markAllCaptainMessagesRead(teamId: string) {
  const rows = await prisma.$queryRaw<Array<{ id: string }>>(Prisma.sql`
    WITH visible_messages AS (
      SELECT message."id"
      FROM "MessageEntry" message
      INNER JOIN "MessageThread" thread
        ON thread."id" = message."threadId"
      LEFT JOIN "NotificationRecipient" recipient
        ON recipient."id" = thread."recipientId"
      LEFT JOIN "NotificationDispatch" dispatch
        ON dispatch."id" = message."notificationDispatchId"
      WHERE (
        thread."teamId" = ${teamId}
        OR (
          recipient."sourceType" = 'TEAM'::"NotificationRecipientSourceType"
          AND recipient."sourceId" = ${teamId}
        )
      )
        AND (
          thread."sourceType" IS NULL
          OR (
            thread."sourceType" NOT IN ('TEAM_MEMBER', 'TEAM_PLAYER_PROSPECT')
            AND thread."sourceType" NOT LIKE 'PLAYER_MATCH_FEE%'
          )
        )
        AND message."direction" = 'OUTBOUND'::"MessageDirection"
        AND message."readAt" IS NULL
        AND message."createdAt" >= ${CAPTAIN_INBOX_UNREAD_SINCE}
        AND (
          (
            message."notificationDispatchId" IS NOT NULL
            AND dispatch."status" IN (
              'QUEUED'::"NotificationDispatchStatus",
              'PROCESSING'::"NotificationDispatchStatus",
              'SENT'::"NotificationDispatchStatus"
            )
          )
          OR (
            message."notificationDispatchId" IS NULL
            AND (
              message."sentAt" IS NOT NULL
              OR LOWER(COALESCE(message."providerStatus", '')) IN (
                'queued',
                'processing',
                'sent',
                'delivered'
              )
            )
          )
        )
    )
    UPDATE "MessageEntry"
    SET "readAt" = NOW(),
        "updatedAt" = NOW()
    WHERE "id" IN (SELECT "id" FROM visible_messages)
    RETURNING "id"
  `);

  return rows.length;
}
