// ========================================
// File: src/app/(admin)/admin/queue/[id]/page.tsx
// ========================================

import Link from "next/link";
import { notFound } from "next/navigation";
import { NotificationDispatchStatus } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/requireAdmin";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export const metadata = {
  title: "Queue Item | SIXFL Admin",
};

function formatDateTime(value: Date | null) {
  if (!value) return "—";

  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).format(value);
}

function getStatusClasses(status: NotificationDispatchStatus) {
  switch (status) {
    case "SENT":
      return "border-emerald-400/25 bg-emerald-500/10 text-emerald-100";
    case "FAILED":
      return "border-red-400/25 bg-red-500/10 text-red-100";
    case "PROCESSING":
      return "border-sky-400/25 bg-sky-500/10 text-sky-100";
    case "CANCELLED":
    case "SKIPPED":
      return "border-white/10 bg-white/5 text-white/60";
    default:
      return "border-amber-400/25 bg-amber-500/10 text-amber-100";
  }
}

function DetailRow({
  label,
  value,
}: {
  label: string;
  value: string | number | null | undefined;
}) {
  return (
    <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
      <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-white/35">
        {label}
      </div>
      <div className="mt-2 break-words text-sm text-white/75">
        {value ? String(value) : "—"}
      </div>
    </div>
  );
}

function getPreviewHtml(html: string | null | undefined) {
  const value = html?.trim();
  if (!value) return "";

  const baseTag = '<base target="_blank" />';

  if (/<head[\s>]/i.test(value)) {
    return value.replace(/<head([^>]*)>/i, `<head$1>${baseTag}`);
  }

  return `${baseTag}${value}`;
}

function MessagePreview({
  html,
  text,
}: {
  html: string | null | undefined;
  text: string | null | undefined;
}) {
  const hasHtml = Boolean(html?.trim());
  const hasText = Boolean(text?.trim());
  const previewHtml = hasHtml ? getPreviewHtml(html) : "";

  if (!hasHtml && !hasText) return null;

  return (
    <section className="rounded-3xl border border-white/10 bg-white/[0.04] p-5">
      <h2 className="text-lg font-semibold text-white">
        {hasHtml ? "Email preview" : "Message preview"}
      </h2>
      <p className="mt-1 text-sm text-white/45">
        {hasHtml
          ? "Rendered from the exact HTML saved on this dispatch. Links open safely in a new tab."
          : "Preview of the exact text saved on this dispatch."}
      </p>

      {hasHtml ? (
        <div className="mt-4 overflow-hidden rounded-2xl border border-white/10 bg-white">
          <iframe
            title="Rendered email preview"
            srcDoc={previewHtml}
            sandbox="allow-popups allow-popups-to-escape-sandbox"
            referrerPolicy="no-referrer"
            loading="lazy"
            className="h-[48rem] w-full bg-white"
          />
        </div>
      ) : (
        <pre className="mt-4 max-h-[32rem] overflow-auto whitespace-pre-wrap rounded-2xl border border-white/10 bg-black/35 p-4 text-sm leading-6 text-white/75 sixfl-mobile-scroll">
          {text}
        </pre>
      )}
    </section>
  );
}

function SourceDetails({
  title,
  value,
}: {
  title: string;
  value: string | null | undefined;
}) {
  if (!value?.trim()) return null;

  return (
    <details className="rounded-2xl border border-white/10 bg-black/20">
      <summary className="cursor-pointer px-4 py-3 text-sm font-semibold text-white/70 transition hover:text-white">
        {title}
      </summary>
      <pre className="max-h-[32rem] overflow-auto whitespace-pre-wrap border-t border-white/10 p-4 text-sm leading-6 text-white/65 sixfl-mobile-scroll">
        {value}
      </pre>
    </details>
  );
}

export default async function AdminQueueItemPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireAdmin();
  const { id } = await params;

  const dispatch = await prisma.notificationDispatch.findUnique({
    where: { id },
    include: {
      recipient: true,
      template: {
        select: {
          id: true,
          key: true,
          name: true,
          channel: true,
          audience: true,
        },
      },
      attempts: {
        orderBy: [{ attemptedAt: "desc" }],
        select: {
          id: true,
          provider: true,
          status: true,
          errorMessage: true,
          attemptedAt: true,
        },
      },
      messageEntries: {
        orderBy: [{ createdAt: "desc" }],
        select: {
          id: true,
          channel: true,
          direction: true,
          participantRole: true,
          subject: true,
          body: true,
          textBody: true,
          htmlBody: true,
          fromEmail: true,
          toEmail: true,
          fromNumber: true,
          toNumber: true,
          provider: true,
          providerMessageId: true,
          sentAt: true,
          receivedAt: true,
          createdAt: true,
        },
      },
    },
  });

  if (!dispatch) {
    notFound();
  }

  const recipientName = dispatch.recipient.displayName || "Unknown recipient";
  const recipientContact = dispatch.recipient.email || dispatch.recipient.phone || "No email or phone saved";
  const latestMessage = dispatch.messageEntries[0] ?? null;
  const hasMessageSource = Boolean(dispatch.bodyText?.trim() || dispatch.bodyHtml?.trim());

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <section className="overflow-hidden rounded-3xl border border-emerald-400/15 bg-[radial-gradient(circle_at_top_left,rgba(16,185,129,0.16),transparent_34%),linear-gradient(180deg,rgba(255,255,255,0.05),rgba(255,255,255,0.03))] shadow-[0_24px_80px_rgba(0,0,0,0.3)]">
        <div className="px-6 py-6 lg:px-8 lg:py-8">
          <Link href="/admin/queue" className="text-sm font-medium text-emerald-300 transition hover:text-emerald-200">
            ← Back to queue
          </Link>

          <div className="mt-6 flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-emerald-300/80">
                Queue item
              </p>
              <h1 className="mt-3 text-3xl font-semibold tracking-tight text-white">
                {dispatch.subject || "Notification dispatch"}
              </h1>
              <p className="mt-3 max-w-3xl text-sm leading-6 text-white/65">
                Full dispatch record showing who it went to, what was sent, provider details and delivery status.
              </p>
            </div>

            <div className="flex flex-wrap gap-2">
              <span className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-white/60">
                {dispatch.channel}
              </span>
              <span className={`rounded-full border px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] ${getStatusClasses(dispatch.status)}`}>
                {dispatch.status}
              </span>
              <span className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-white/60">
                {dispatch.audience}
              </span>
            </div>
          </div>
        </div>
      </section>

      <section className="grid gap-4 lg:grid-cols-3">
        <div className="rounded-3xl border border-emerald-400/20 bg-emerald-500/10 p-5">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-emerald-100/70">Recipient</p>
          <p className="mt-3 text-xl font-semibold text-white">{recipientName}</p>
          <p className="mt-2 break-words text-sm text-emerald-100/70">{recipientContact}</p>
        </div>

        <div className="rounded-3xl border border-white/10 bg-white/[0.04] p-5">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/45">Sent to</p>
          <p className="mt-3 break-words text-sm text-white/75">
            {latestMessage?.toEmail || dispatch.recipient.email || latestMessage?.toNumber || dispatch.recipient.phone || "—"}
          </p>
          <p className="mt-2 text-xs text-white/40">
            From: {latestMessage?.fromEmail || latestMessage?.fromNumber || "system/provider default"}
          </p>
        </div>

        <div className="rounded-3xl border border-white/10 bg-white/[0.04] p-5">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/45">Provider</p>
          <p className="mt-3 text-xl font-semibold text-white">{dispatch.provider || latestMessage?.provider || "—"}</p>
          <p className="mt-2 break-words text-xs text-white/45">
            {dispatch.providerMessageId || latestMessage?.providerMessageId || "No provider message ID recorded"}
          </p>
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <DetailRow label="Created" value={formatDateTime(dispatch.createdAt)} />
        <DetailRow label="Scheduled" value={formatDateTime(dispatch.scheduledFor)} />
        <DetailRow label="Processed" value={formatDateTime(dispatch.processedAt)} />
        <DetailRow label="Sent" value={formatDateTime(dispatch.sentAt)} />
        <DetailRow label="Failed" value={formatDateTime(dispatch.failedAt)} />
        <DetailRow label="Cancelled" value={formatDateTime(dispatch.cancelledAt)} />
        <DetailRow label="Source" value={dispatch.sourceType} />
        <DetailRow label="Source ID" value={dispatch.sourceId} />
      </section>

      {dispatch.failureReason ? (
        <section className="rounded-3xl border border-red-400/20 bg-red-500/10 p-5 text-red-100">
          <h2 className="text-lg font-semibold">Failure reason</h2>
          <p className="mt-3 whitespace-pre-wrap text-sm leading-6">{dispatch.failureReason}</p>
        </section>
      ) : null}

      <section className="rounded-3xl border border-white/10 bg-white/[0.04] p-5">
        <h2 className="text-lg font-semibold text-white">Dispatch details</h2>
        <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          <DetailRow label="Dispatch ID" value={dispatch.id} />
          <DetailRow label="Template" value={dispatch.template?.name || dispatch.template?.key} />
          <DetailRow label="Template ID" value={dispatch.template?.id} />
          <DetailRow label="Recipient ID" value={dispatch.recipientId} />
          <DetailRow label="Recipient source" value={`${dispatch.recipient.sourceType}${dispatch.recipient.sourceId ? ` · ${dispatch.recipient.sourceId}` : ""}`} />
          <DetailRow label="Suppressed" value={dispatch.recipient.isSuppressed ? dispatch.recipient.suppressionReason || "Yes" : "No"} />
        </div>
      </section>

      <MessagePreview html={dispatch.bodyHtml} text={dispatch.bodyText} />

      {hasMessageSource ? (
        <section className="rounded-3xl border border-white/10 bg-white/[0.04] p-5">
          <h2 className="text-lg font-semibold text-white">Message source</h2>
          <p className="mt-1 text-sm text-white/45">
            Raw source is kept here for troubleshooting and stays collapsed by default.
          </p>
          <div className="mt-4 space-y-3">
            <SourceDetails title="Plain text" value={dispatch.bodyText} />
            <SourceDetails title="HTML source" value={dispatch.bodyHtml} />
          </div>
        </section>
      ) : null}

      {dispatch.attempts.length > 0 ? (
        <section className="rounded-3xl border border-white/10 bg-white/[0.04] p-5">
          <h2 className="text-lg font-semibold text-white">Provider attempts</h2>
          <div className="mt-4 space-y-3">
            {dispatch.attempts.map((attempt) => (
              <div key={attempt.id} className="rounded-2xl border border-white/10 bg-black/20 p-4">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="rounded-full border border-white/10 bg-white/[0.04] px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-white/60">
                    {attempt.provider}
                  </span>
                  <span className="rounded-full border border-white/10 bg-white/[0.04] px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-white/60">
                    {attempt.status}
                  </span>
                  <span className="text-xs text-white/40">{formatDateTime(attempt.attemptedAt)}</span>
                </div>
                {attempt.errorMessage ? (
                  <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-red-100">{attempt.errorMessage}</p>
                ) : null}
              </div>
            ))}
          </div>
        </section>
      ) : null}

      {dispatch.messageEntries.length > 0 ? (
        <section className="rounded-3xl border border-white/10 bg-white/[0.04] p-5">
          <h2 className="text-lg font-semibold text-white">Linked message records</h2>
          <div className="mt-4 space-y-3">
            {dispatch.messageEntries.map((entry) => (
              <div key={entry.id} className="rounded-2xl border border-white/10 bg-black/20 p-4">
                <div className="grid gap-3 text-sm text-white/60 md:grid-cols-2">
                  <div>ID: {entry.id}</div>
                  <div>Channel: {entry.channel}</div>
                  <div>Direction: {entry.direction}</div>
                  <div>Role: {entry.participantRole}</div>
                  <div>From: {entry.fromEmail || entry.fromNumber || "—"}</div>
                  <div>To: {entry.toEmail || entry.toNumber || "—"}</div>
                  <div>Created: {formatDateTime(entry.createdAt)}</div>
                  <div>Sent: {formatDateTime(entry.sentAt)}</div>
                  <div>Provider: {entry.provider || "—"}</div>
                  <div>Provider ID: {entry.providerMessageId || "—"}</div>
                </div>
                <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-white/70">
                  {entry.textBody || entry.body || entry.subject || "No message body saved."}
                </p>
              </div>
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}
