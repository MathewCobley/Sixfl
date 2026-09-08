import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { formatDateTimeInLondon } from "@/lib/datetime/london";
import { PLAYER_PAYMENT_WARNING_SOURCE } from "./player-payment-warning-policy";

// Read the actual outbox, never lastChasedAt; ordinary chases and individual
// warnings are separate actions. Existing warnings need no backfill or resend.
const historySelect = {
  id: true, sourceId: true, channel: true, status: true, metadata: true,
  createdAt: true, scheduledFor: true, sentAt: true, failedAt: true,
  cancelledAt: true, failureReason: true, providerMessageId: true,
} satisfies Prisma.NotificationDispatchSelect;
type HistoryRow = Prisma.NotificationDispatchGetPayload<{ select: typeof historySelect }>;
type HistoryDb = Pick<typeof prisma, "notificationDispatch">;
export type PaymentWarningHistoryItem = {
  id: string;
  channel: string;
  label: string;
  tone: "pending" | "sent" | "problem" | "neutral";
  timestamp: string;
  detail: string | null;
  deadline: string | null;
  failureReason: string | null;
};
function dateLabel(date: Date | null) {
  if (!date || !Number.isFinite(date.getTime())) return "time not recorded";
  return formatDateTimeInLondon(date, {
    day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", timeZoneName: "short",
  });
}
export function describePlayerPaymentWarning(row: HistoryRow): PaymentWarningHistoryItem {
  const metadata = row.metadata && typeof row.metadata === "object" && !Array.isArray(row.metadata) ? row.metadata : {};
  const rawDeadline = typeof metadata.warningDeadline === "string" ? new Date(metadata.warningDeadline) : null;
  const item: PaymentWarningHistoryItem = {
    id: row.id, channel: row.channel === "EMAIL" ? "Email" : row.channel,
    label: "Warning status needs review", tone: "neutral",
    timestamp: `Requested: ${dateLabel(row.createdAt)}`, detail: null,
    deadline: rawDeadline && Number.isFinite(rawDeadline.getTime()) ? dateLabel(rawDeadline) : null,
    failureReason: row.failureReason,
  };
  // A later provider failure must remain visible even when sentAt is populated.
  if (row.status === "FAILED") return { ...item, label: "Warning failed", tone: "problem", timestamp: `Failed: ${dateLabel(row.failedAt)}` };
  if (row.status === "CANCELLED") return { ...item, label: "Warning cancelled", tone: "problem", timestamp: `Cancelled: ${dateLabel(row.cancelledAt)}` };
  if (row.status === "SKIPPED") return { ...item, label: "Warning skipped", tone: "problem" };
  if (row.status === "SENT") return {
    ...item, label: "Warning sent", tone: "sent", timestamp: `Sent: ${dateLabel(row.sentAt)}`,
    detail: "Accepted for sending; receipt by the player is not confirmed here.",
  };
  if (row.sentAt || row.providerMessageId) return {
    ...item, label: "Warning delivery needs review", tone: "problem",
    detail: "Provider submission is recorded. Check this warning in the delivery queue before sending another.",
  };
  if (row.status === "QUEUED") return {
    ...item, label: "Warning queued", tone: "pending", timestamp: `Queued: ${dateLabel(row.createdAt)}`,
    detail: `Not yet sent. Scheduled: ${dateLabel(row.scheduledFor)}`,
  };
  if (row.status === "PROCESSING") return { ...item, label: "Warning sending", tone: "pending", detail: "Sending is in progress; not yet confirmed sent." };
  return item;
}

/** One batched read for visible fees, keyed by exact fee ID (not player/name). */
export async function getLatestPlayerPaymentWarnings(feeIds: readonly string[], db: HistoryDb = prisma) {
  const ids = [...new Set(feeIds.filter(id => typeof id === "string" && id.trim()))];
  const result = new Map<string, PaymentWarningHistoryItem>();
  if (!ids.length) return result;
  const rows = await db.notificationDispatch.findMany({
    where: { sourceType: PLAYER_PAYMENT_WARNING_SOURCE, sourceId: { in: ids } },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }], distinct: ["sourceId"], select: historySelect,
  });
  for (const row of rows) if (row.sourceId && ids.includes(row.sourceId) && !result.has(row.sourceId)) {
    result.set(row.sourceId, describePlayerPaymentWarning(row));
  }
  return result;
}

/** Same selection and status semantics for the detailed, admin-only history. */
export async function getPlayerPaymentWarningHistory(feeId: string, db: HistoryDb = prisma) {
  if (!feeId.trim()) return [];
  const rows = await db.notificationDispatch.findMany({
    where: { sourceType: PLAYER_PAYMENT_WARNING_SOURCE, sourceId: feeId },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: 10, select: historySelect,
  });
  return rows.map(describePlayerPaymentWarning);
}
