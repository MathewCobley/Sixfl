import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/requireAdmin";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const FIRST_SMS_DELAY_MS = 48 * 60 * 60 * 1000;
const FINAL_SMS_DELAY_MS = 5 * 24 * 60 * 60 * 1000;

const FIRST_SMS_SOURCE_TYPE = "LEAD_TEAM_CONFIRMATION_SMS_NUDGE_1";
const FINAL_SMS_SOURCE_TYPE = "LEAD_TEAM_CONFIRMATION_SMS_NUDGE_FINAL";

const RELEVANT_EMAIL_SOURCE_TYPES = [
  "LEAD_REASSURANCE_EMAIL",
  "LEAD_LIVE_LEAGUE_REASSURANCE_EMAIL",
  "LEAD_TEAM_CONFIRMATION",
  "LEAD_TEAM_CONFIRMATION_CHASE",
] as const;

type StatusTone = "muted" | "info" | "success" | "warning" | "danger";

type StatusLine = {
  text: string;
  tone: StatusTone;
  title?: string | null;
};

type TeamLeadSmsStatus = {
  lines: StatusLine[];
};

type TeamLeadSmsStatusRow = {
  leadId: string;
  phone: string | null;
  leadStatus: string;
  convertedTeamId: string | null;
  confirmationStatus: string;
  latestRelevantEmailSentAt: Date | null;
  latestInboundAt: Date | null;
  firstStatus: string | null;
  firstCreatedAt: Date | null;
  firstScheduledFor: Date | null;
  firstProcessingAt: Date | null;
  firstProcessedAt: Date | null;
  firstSentAt: Date | null;
  firstFailedAt: Date | null;
  firstCancelledAt: Date | null;
  firstErrorMessage: string | null;
  finalStatus: string | null;
  finalCreatedAt: Date | null;
  finalScheduledFor: Date | null;
  finalProcessingAt: Date | null;
  finalProcessedAt: Date | null;
  finalSentAt: Date | null;
  finalFailedAt: Date | null;
  finalCancelledAt: Date | null;
  finalErrorMessage: string | null;
};

type DispatchSnapshot = {
  status: string | null;
  createdAt: Date | null;
  scheduledFor: Date | null;
  processingAt: Date | null;
  processedAt: Date | null;
  sentAt: Date | null;
  failedAt: Date | null;
  cancelledAt: Date | null;
  errorMessage: string | null;
};

function formatDateTime(value: Date) {
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
    timeZone: "Europe/London",
  }).format(value);
}

function addMilliseconds(value: Date, milliseconds: number) {
  return new Date(value.getTime() + milliseconds);
}

function latestDate(first: Date, second: Date | null) {
  if (!second) return first;
  return second.getTime() > first.getTime() ? second : first;
}

function dispatchStatusLine(
  label: "First SMS" | "Final SMS",
  dispatch: DispatchSnapshot,
  now: Date,
): StatusLine | null {
  if (!dispatch.status) return null;

  if (dispatch.status === "SENT") {
    const sentAt = dispatch.sentAt ?? dispatch.processedAt ?? dispatch.createdAt;
    return {
      text: sentAt ? `${label} sent ${formatDateTime(sentAt)}` : `${label} sent`,
      tone: "success",
    };
  }

  if (dispatch.status === "FAILED") {
    const failedAt = dispatch.failedAt ?? dispatch.processedAt ?? dispatch.createdAt;
    return {
      text: failedAt ? `${label} failed ${formatDateTime(failedAt)}` : `${label} failed`,
      tone: "danger",
      title: dispatch.errorMessage,
    };
  }

  if (dispatch.status === "PROCESSING") {
    const processingAt = dispatch.processingAt ?? dispatch.createdAt;
    return {
      text: processingAt
        ? `${label} sending ${formatDateTime(processingAt)}`
        : `${label} sending`,
      tone: "info",
    };
  }

  if (dispatch.status === "QUEUED") {
    const scheduledFor = dispatch.scheduledFor ?? dispatch.createdAt;
    const isFuture = Boolean(scheduledFor && scheduledFor.getTime() > now.getTime() + 60_000);
    return {
      text: scheduledFor
        ? `${label} queued${isFuture ? " for" : ""} ${formatDateTime(scheduledFor)}`
        : `${label} queued`,
      tone: "info",
    };
  }

  if (dispatch.status === "CANCELLED") {
    const cancelledAt = dispatch.cancelledAt ?? dispatch.processedAt ?? dispatch.createdAt;
    return {
      text: cancelledAt
        ? `${label} not sent ${formatDateTime(cancelledAt)}`
        : `${label} not sent`,
      tone: "warning",
      title: dispatch.errorMessage,
    };
  }

  return {
    text: `${label}: ${dispatch.status.toLowerCase()}`,
    tone: "muted",
  };
}

function stopReason(row: TeamLeadSmsStatusRow) {
  if (row.confirmationStatus === "CONFIRMED") return "team place confirmed";
  if (row.confirmationStatus === "DECLINED") return "place released";
  if (row.convertedTeamId) return "team created";
  if (row.leadStatus === "QUALIFIED") return "lead qualified";
  if (row.leadStatus === "CLOSED") return "lead closed";

  if (
    row.latestInboundAt &&
    row.latestRelevantEmailSentAt &&
    row.latestInboundAt.getTime() >= row.latestRelevantEmailSentAt.getTime()
  ) {
    return "reply received";
  }

  return null;
}

function buildStatus(row: TeamLeadSmsStatusRow, now: Date): TeamLeadSmsStatus {
  const firstDispatch: DispatchSnapshot = {
    status: row.firstStatus,
    createdAt: row.firstCreatedAt,
    scheduledFor: row.firstScheduledFor,
    processingAt: row.firstProcessingAt,
    processedAt: row.firstProcessedAt,
    sentAt: row.firstSentAt,
    failedAt: row.firstFailedAt,
    cancelledAt: row.firstCancelledAt,
    errorMessage: row.firstErrorMessage,
  };
  const finalDispatch: DispatchSnapshot = {
    status: row.finalStatus,
    createdAt: row.finalCreatedAt,
    scheduledFor: row.finalScheduledFor,
    processingAt: row.finalProcessingAt,
    processedAt: row.finalProcessedAt,
    sentAt: row.finalSentAt,
    failedAt: row.finalFailedAt,
    cancelledAt: row.finalCancelledAt,
    errorMessage: row.finalErrorMessage,
  };

  const firstLine = dispatchStatusLine("First SMS", firstDispatch, now);
  const finalLine = dispatchStatusLine("Final SMS", finalDispatch, now);
  const stopped = stopReason(row);

  if (!firstLine && !finalLine && stopped) {
    return {
      lines: [{ text: `Automatic SMS stopped — ${stopped}`, tone: "muted" }],
    };
  }

  if (!firstLine && !finalLine && !row.phone?.trim()) {
    return {
      lines: [{ text: "Automatic SMS unavailable — no phone number", tone: "warning" }],
    };
  }

  if (!firstLine && !finalLine && !row.latestRelevantEmailSentAt) {
    return {
      lines: [{ text: "Automatic SMS waiting for email delivery", tone: "muted" }],
    };
  }

  const lines: StatusLine[] = [];

  if (firstLine) {
    lines.push(firstLine);
  } else if (stopped) {
    lines.push({ text: `First SMS stopped — ${stopped}`, tone: "muted" });
  } else if (row.latestRelevantEmailSentAt) {
    const firstDueAt = addMilliseconds(
      row.latestRelevantEmailSentAt,
      FIRST_SMS_DELAY_MS,
    );
    lines.push({
      text:
        firstDueAt.getTime() <= now.getTime()
          ? "First SMS due now"
          : `First SMS due ${formatDateTime(firstDueAt)}`,
      tone: firstDueAt.getTime() <= now.getTime() ? "warning" : "info",
    });
  }

  if (finalLine) {
    lines.push(finalLine);
  } else if (stopped) {
    lines.push({ text: `Final SMS stopped — ${stopped}`, tone: "muted" });
  } else if (row.firstSentAt) {
    const fiveDaysAfterFirst = addMilliseconds(row.firstSentAt, FINAL_SMS_DELAY_MS);
    const fortyEightHoursAfterLatestEmail = row.latestRelevantEmailSentAt
      ? addMilliseconds(row.latestRelevantEmailSentAt, FIRST_SMS_DELAY_MS)
      : null;
    const finalDueAt = latestDate(
      fiveDaysAfterFirst,
      fortyEightHoursAfterLatestEmail,
    );

    lines.push({
      text:
        finalDueAt.getTime() <= now.getTime()
          ? "Final SMS due now"
          : `Final SMS due ${formatDateTime(finalDueAt)}`,
      tone: finalDueAt.getTime() <= now.getTime() ? "warning" : "info",
    });
  } else if (row.firstStatus === "FAILED" || row.firstStatus === "CANCELLED") {
    lines.push({
      text: "Final SMS stopped — first SMS was not sent",
      tone: "muted",
    });
  } else {
    lines.push({ text: "Final SMS not due yet", tone: "muted" });
  }

  return { lines };
}

export async function GET() {
  await requireAdmin();

  const rows = await prisma.$queryRaw<TeamLeadSmsStatusRow[]>(Prisma.sql`
    SELECT
      lead."id" AS "leadId",
      lead."phone",
      lead."status"::text AS "leadStatus",
      lead."convertedTeamId",
      confirmation."status"::text AS "confirmationStatus",
      latest_email."sentAt" AS "latestRelevantEmailSentAt",
      (
        SELECT MAX(thread."latestInboundAt")
        FROM "MessageThread" thread
        WHERE thread."latestInboundAt" IS NOT NULL
          AND (
            thread."sourceId" = lead."id"
            OR thread."recipientId" IN (
              SELECT recipient."id"
              FROM "NotificationRecipient" recipient
              WHERE recipient."sourceType"::text = 'LEAD'
                AND recipient."sourceId" = lead."id"
            )
          )
      ) AS "latestInboundAt",
      first_sms."status"::text AS "firstStatus",
      first_sms."createdAt" AS "firstCreatedAt",
      first_sms."scheduledFor" AS "firstScheduledFor",
      first_sms."processingAt" AS "firstProcessingAt",
      first_sms."processedAt" AS "firstProcessedAt",
      first_sms."sentAt" AS "firstSentAt",
      first_sms."failedAt" AS "firstFailedAt",
      first_sms."cancelledAt" AS "firstCancelledAt",
      first_sms."errorMessage" AS "firstErrorMessage",
      final_sms."status"::text AS "finalStatus",
      final_sms."createdAt" AS "finalCreatedAt",
      final_sms."scheduledFor" AS "finalScheduledFor",
      final_sms."processingAt" AS "finalProcessingAt",
      final_sms."processedAt" AS "finalProcessedAt",
      final_sms."sentAt" AS "finalSentAt",
      final_sms."failedAt" AS "finalFailedAt",
      final_sms."cancelledAt" AS "finalCancelledAt",
      final_sms."errorMessage" AS "finalErrorMessage"
    FROM "InterestLead" lead
    JOIN "LeadTeamConfirmation" confirmation
      ON confirmation."leadId" = lead."id"
    LEFT JOIN LATERAL (
      SELECT dispatch."sentAt"
      FROM "NotificationDispatch" dispatch
      WHERE dispatch."sourceId" = lead."id"
        AND dispatch."channel"::text = 'EMAIL'
        AND dispatch."status"::text = 'SENT'
        AND dispatch."sourceType" IN (${Prisma.join(RELEVANT_EMAIL_SOURCE_TYPES)})
        AND dispatch."createdAt" >=
          COALESCE(confirmation."sentAt", confirmation."createdAt") - INTERVAL '5 minutes'
      ORDER BY dispatch."sentAt" DESC NULLS LAST, dispatch."createdAt" DESC
      LIMIT 1
    ) latest_email ON TRUE
    LEFT JOIN LATERAL (
      SELECT
        dispatch."status",
        dispatch."createdAt",
        dispatch."scheduledFor",
        dispatch."processingAt",
        dispatch."processedAt",
        dispatch."sentAt",
        dispatch."failedAt",
        dispatch."cancelledAt",
        dispatch."errorMessage"
      FROM "NotificationDispatch" dispatch
      WHERE dispatch."sourceId" = lead."id"
        AND dispatch."sourceType" = ${FIRST_SMS_SOURCE_TYPE}
        AND dispatch."channel"::text = 'SMS'
      ORDER BY
        (dispatch."status"::text = 'CANCELLED') ASC,
        dispatch."createdAt" DESC
      LIMIT 1
    ) first_sms ON TRUE
    LEFT JOIN LATERAL (
      SELECT
        dispatch."status",
        dispatch."createdAt",
        dispatch."scheduledFor",
        dispatch."processingAt",
        dispatch."processedAt",
        dispatch."sentAt",
        dispatch."failedAt",
        dispatch."cancelledAt",
        dispatch."errorMessage"
      FROM "NotificationDispatch" dispatch
      WHERE dispatch."sourceId" = lead."id"
        AND dispatch."sourceType" = ${FINAL_SMS_SOURCE_TYPE}
        AND dispatch."channel"::text = 'SMS'
      ORDER BY
        (dispatch."status"::text = 'CANCELLED') ASC,
        dispatch."createdAt" DESC
      LIMIT 1
    ) final_sms ON TRUE
    WHERE lead."interestType"::text = 'TEAM'
    ORDER BY lead."createdAt" DESC
    LIMIT 1000
  `);

  const now = new Date();
  const statuses: Record<string, TeamLeadSmsStatus> = {};

  for (const row of rows) {
    statuses[row.leadId] = buildStatus(row, now);
  }

  return NextResponse.json(
    { ok: true, statuses },
    {
      headers: {
        "Cache-Control": "private, no-store, max-age=0",
      },
    },
  );
}
