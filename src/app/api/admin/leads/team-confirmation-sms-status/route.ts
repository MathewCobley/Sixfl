import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/requireAdmin";
import { emptyLeadEvidence, leadReplyHref, leadReplyState, loadLeadCommunicationEvidence } from "@/lib/leads/communication-evidence";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const FIRST_SMS_DELAY_MS = 48 * 60 * 60 * 1000;
const FINAL_SMS_DELAY_MS = 5 * 24 * 60 * 60 * 1000;
const FIRST_SMS_SOURCE_TYPE = "LEAD_TEAM_CONFIRMATION_SMS_NUDGE_1";
const FINAL_SMS_SOURCE_TYPE = "LEAD_TEAM_CONFIRMATION_SMS_NUDGE_FINAL";
const RELEVANT_EMAIL_SOURCE_TYPES = [
  "LEAD_REASSURANCE_EMAIL", "LEAD_LIVE_LEAGUE_REASSURANCE_EMAIL",
  "LEAD_TEAM_CONFIRMATION", "LEAD_TEAM_CONFIRMATION_CHASE",
] as const;

type StatusTone = "muted" | "info" | "success" | "warning" | "danger";
type StatusLine = { text: string; tone: StatusTone; title?: string | null; href?: string; linkText?: string };
type TeamLeadSmsStatus = { lines: StatusLine[] };
type TeamLeadSmsStatusRow = {
  leadId: string; phone: string | null; leadStatus: string; convertedTeamId: string | null;
  confirmationStatus: string; latestRelevantEmailSentAt: Date | null;
  latestInboundAt: Date | null; replyReviewRequired?: boolean;
  firstStatus: string | null; firstCreatedAt: Date | null; firstUpdatedAt: Date | null;
  firstScheduledFor: Date | null; firstProcessedAt: Date | null; firstSentAt: Date | null;
  firstFailedAt: Date | null; firstCancelledAt: Date | null; firstFailureReason: string | null;
  finalStatus: string | null; finalCreatedAt: Date | null; finalUpdatedAt: Date | null;
  finalScheduledFor: Date | null; finalProcessedAt: Date | null; finalSentAt: Date | null;
  finalFailedAt: Date | null; finalCancelledAt: Date | null; finalFailureReason: string | null;
};
type DispatchSnapshot = {
  status: string | null; createdAt: Date | null; updatedAt: Date | null; scheduledFor: Date | null;
  processedAt: Date | null; sentAt: Date | null; failedAt: Date | null;
  cancelledAt: Date | null; failureReason: string | null;
};
function formatDateTime(value: Date) {
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit", hourCycle: "h23", timeZone: "Europe/London",
  }).format(value);
}
function addMilliseconds(value: Date, milliseconds: number) { return new Date(value.getTime() + milliseconds); }
function latestDate(first: Date, second: Date | null) { return second && second > first ? second : first; }
function dispatchStatusLine(label: "First SMS" | "Final SMS", dispatch: DispatchSnapshot, now: Date): StatusLine | null {
  if (!dispatch.status) return null;
  if (dispatch.status === "SENT") {
    const at = dispatch.sentAt ?? dispatch.processedAt ?? dispatch.createdAt;
    return { text: at ? `${label} sent ${formatDateTime(at)}` : `${label} sent`, tone: "success" };
  }
  if (dispatch.status === "FAILED") {
    const at = dispatch.failedAt ?? dispatch.processedAt ?? dispatch.updatedAt ?? dispatch.createdAt;
    return { text: at ? `${label} failed ${formatDateTime(at)}` : `${label} failed`, tone: "danger", title: dispatch.failureReason };
  }
  if (dispatch.status === "PROCESSING") {
    const at = dispatch.updatedAt ?? dispatch.createdAt;
    return { text: at ? `${label} sending ${formatDateTime(at)}` : `${label} sending`, tone: "info" };
  }
  if (dispatch.status === "QUEUED") {
    const at = dispatch.scheduledFor ?? dispatch.createdAt;
    const future = Boolean(at && at.getTime() > now.getTime() + 60_000);
    return { text: at ? `${label} queued${future ? " for" : ""} ${formatDateTime(at)}` : `${label} queued`, tone: "info" };
  }
  if (dispatch.status === "CANCELLED") {
    const at = dispatch.cancelledAt ?? dispatch.processedAt ?? dispatch.updatedAt ?? dispatch.createdAt;
    return { text: at ? `${label} not sent ${formatDateTime(at)}` : `${label} not sent`, tone: "warning", title: dispatch.failureReason };
  }
  return { text: `${label}: ${dispatch.status.toLowerCase()}`, tone: "muted" };
}
function stopReason(row: TeamLeadSmsStatusRow) {
  if (row.confirmationStatus === "CONFIRMED") return "team place confirmed";
  if (row.confirmationStatus === "DECLINED") return "not interested — chases stopped";
  if (row.convertedTeamId) return "team created";
  if (row.leadStatus === "QUALIFIED") return "lead qualified";
  if (row.leadStatus === "CLOSED") return "lead closed";
  if (row.latestInboundAt && row.latestRelevantEmailSentAt && row.latestInboundAt >= row.latestRelevantEmailSentAt) {
    return row.replyReviewRequired ? "reply record needs checking" : "reply received";
  }
  return null;
}
function buildStatus(row: TeamLeadSmsStatusRow, now: Date): TeamLeadSmsStatus {
  const firstDispatch: DispatchSnapshot = {
    status: row.firstStatus, createdAt: row.firstCreatedAt, updatedAt: row.firstUpdatedAt,
    scheduledFor: row.firstScheduledFor, processedAt: row.firstProcessedAt, sentAt: row.firstSentAt,
    failedAt: row.firstFailedAt, cancelledAt: row.firstCancelledAt, failureReason: row.firstFailureReason,
  };
  const finalDispatch: DispatchSnapshot = {
    status: row.finalStatus, createdAt: row.finalCreatedAt, updatedAt: row.finalUpdatedAt,
    scheduledFor: row.finalScheduledFor, processedAt: row.finalProcessedAt, sentAt: row.finalSentAt,
    failedAt: row.finalFailedAt, cancelledAt: row.finalCancelledAt, failureReason: row.finalFailureReason,
  };
  const firstLine = dispatchStatusLine("First SMS", firstDispatch, now);
  const finalLine = dispatchStatusLine("Final SMS", finalDispatch, now);
  const stopped = stopReason(row);
  if (!firstLine && !finalLine && stopped) return { lines: [{ text: `Automatic SMS stopped — ${stopped}`, tone: "muted" }] };
  if (!firstLine && !finalLine && !row.phone?.trim()) return { lines: [{ text: "Automatic SMS unavailable — no phone number", tone: "warning" }] };
  if (!firstLine && !finalLine && !row.latestRelevantEmailSentAt) return { lines: [{ text: "Automatic SMS waiting for email delivery", tone: "muted" }] };
  const lines: StatusLine[] = [];
  if (firstLine) lines.push(firstLine);
  else if (stopped) lines.push({ text: `First SMS stopped — ${stopped}`, tone: "muted" });
  else if (row.latestRelevantEmailSentAt) {
    const at = addMilliseconds(row.latestRelevantEmailSentAt, FIRST_SMS_DELAY_MS);
    lines.push({ text: at <= now ? "First SMS due now" : `First SMS due ${formatDateTime(at)}`, tone: at <= now ? "warning" : "info" });
  }
  if (finalLine) lines.push(finalLine);
  else if (stopped) lines.push({ text: `Final SMS stopped — ${stopped}`, tone: "muted" });
  else if (row.firstSentAt) {
    const at = latestDate(addMilliseconds(row.firstSentAt, FINAL_SMS_DELAY_MS), row.latestRelevantEmailSentAt ? addMilliseconds(row.latestRelevantEmailSentAt, FIRST_SMS_DELAY_MS) : null);
    lines.push({ text: at <= now ? "Final SMS due now" : `Final SMS due ${formatDateTime(at)}`, tone: at <= now ? "warning" : "info" });
  } else if (row.firstStatus === "FAILED" || row.firstStatus === "CANCELLED") lines.push({ text: "Final SMS stopped — first SMS was not sent", tone: "muted" });
  else lines.push({ text: "Final SMS not due yet", tone: "muted" });
  return { lines };
}

export async function GET() {
  await requireAdmin();
  const rows = await prisma.$queryRaw<TeamLeadSmsStatusRow[]>(Prisma.sql`
    SELECT lead."id" AS "leadId", lead."phone", lead."status"::text AS "leadStatus", lead."convertedTeamId",
      confirmation."status"::text AS "confirmationStatus", latest_email."sentAt" AS "latestRelevantEmailSentAt",
      NULL::timestamp AS "latestInboundAt",
      first_sms."status"::text AS "firstStatus", first_sms."createdAt" AS "firstCreatedAt",
      first_sms."updatedAt" AS "firstUpdatedAt", first_sms."scheduledFor" AS "firstScheduledFor",
      first_sms."processedAt" AS "firstProcessedAt", first_sms."sentAt" AS "firstSentAt",
      first_sms."failedAt" AS "firstFailedAt", first_sms."cancelledAt" AS "firstCancelledAt",
      first_sms."failureReason" AS "firstFailureReason",
      final_sms."status"::text AS "finalStatus", final_sms."createdAt" AS "finalCreatedAt",
      final_sms."updatedAt" AS "finalUpdatedAt", final_sms."scheduledFor" AS "finalScheduledFor",
      final_sms."processedAt" AS "finalProcessedAt", final_sms."sentAt" AS "finalSentAt",
      final_sms."failedAt" AS "finalFailedAt", final_sms."cancelledAt" AS "finalCancelledAt",
      final_sms."failureReason" AS "finalFailureReason"
    FROM "InterestLead" lead
    JOIN "LeadTeamConfirmation" confirmation ON confirmation."leadId" = lead."id"
    LEFT JOIN LATERAL (
      SELECT dispatch."sentAt" FROM "NotificationDispatch" dispatch
      WHERE dispatch."sourceId" = lead."id" AND dispatch."channel"::text = 'EMAIL'
        AND dispatch."status"::text = 'SENT' AND dispatch."sourceType" IN (${Prisma.join(RELEVANT_EMAIL_SOURCE_TYPES)})
        AND dispatch."createdAt" >= COALESCE(confirmation."sentAt", confirmation."createdAt") - INTERVAL '5 minutes'
      ORDER BY dispatch."sentAt" DESC NULLS LAST, dispatch."createdAt" DESC LIMIT 1
    ) latest_email ON TRUE
    LEFT JOIN LATERAL (
      SELECT dispatch.* FROM "NotificationDispatch" dispatch
      WHERE dispatch."sourceId" = lead."id" AND dispatch."sourceType" = ${FIRST_SMS_SOURCE_TYPE}
        AND dispatch."channel"::text = 'SMS'
      ORDER BY (dispatch."status"::text = 'CANCELLED') ASC, dispatch."createdAt" DESC LIMIT 1
    ) first_sms ON TRUE
    LEFT JOIN LATERAL (
      SELECT dispatch.* FROM "NotificationDispatch" dispatch
      WHERE dispatch."sourceId" = lead."id" AND dispatch."sourceType" = ${FINAL_SMS_SOURCE_TYPE}
        AND dispatch."channel"::text = 'SMS'
      ORDER BY (dispatch."status"::text = 'CANCELLED') ASC, dispatch."createdAt" DESC LIMIT 1
    ) final_sms ON TRUE
    WHERE lead."interestType"::text = 'TEAM'
    ORDER BY lead."createdAt" DESC LIMIT 1000
  `);
  const evidenceByLead = await loadLeadCommunicationEvidence(rows.map((row) => row.leadId));
  const now = new Date();
  const statuses: Record<string, TeamLeadSmsStatus> = {};
  for (const row of rows) {
    const evidence = evidenceByLead.get(row.leadId) ?? emptyLeadEvidence();
    const state = leadReplyState(evidence, row.latestRelevantEmailSentAt);
    const status = buildStatus({ ...row, latestInboundAt: evidence.automationHoldAt, replyReviewRequired: state === "review" }, now);
    if (row.confirmationStatus === "DECLINED") status.lines.unshift({ text: "Not interested — registration chases stopped", tone: "muted" });
    if (state === "received" && evidence.latestReply) status.lines.push({
      text: `Incoming ${evidence.latestReply.channel} · ${formatDateTime(evidence.latestReply.occurredAt)} (UK) — view reply on lead`,
      tone: "success", title: evidence.latestReply.body.slice(0, 300), href: leadReplyHref(row.leadId), linkText: "View reply",
    });
    if (state === "review") status.lines.push({
      text: "Reply record needs checking — chase remains paused; open lead to review",
      tone: "warning", href: leadReplyHref(row.leadId), linkText: "Review reply record",
    });
    statuses[row.leadId] = status;
  }
  return NextResponse.json({ ok: true, statuses }, { headers: { "Cache-Control": "private, no-store, max-age=0" } });
}
