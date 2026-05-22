// ========================================
// File: src/app/(admin)/admin/queue/page.tsx
// ========================================

import { NotificationDispatchStatus } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/requireAdmin";
import { runQueueFromAdmin } from "./runner";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function formatDateTime(value: Date | null) {
  if (!value) return "—";

  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
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

export default async function AdminQueuePage({
  searchParams,
}: {
  searchParams?: Promise<{
    ran?: string;
    processed?: string;
    sent?: string;
    failed?: string;
    skipped?: string;
    message?: string;
  }>;
}) {
  await requireAdmin();
  const sp = (await searchParams) ?? {};
  const now = new Date();

  const [queued, dueNow, processing, failed, recent] = await Promise.all([
    prisma.notificationDispatch.count({
      where: { status: "QUEUED" },
    }),
    prisma.notificationDispatch.count({
      where: {
        status: "QUEUED",
        scheduledFor: {
          lte: now,
        },
      },
    }),
    prisma.notificationDispatch.count({
      where: { status: "PROCESSING" },
    }),
    prisma.notificationDispatch.count({
      where: { status: "FAILED" },
    }),
    prisma.notificationDispatch.findMany({
      orderBy: [{ createdAt: "desc" }],
      take: 30,
      select: {
        id: true,
        channel: true,
        status: true,
        audience: true,
        subject: true,
        bodyText: true,
        sourceType: true,
        sourceId: true,
        scheduledFor: true,
        sentAt: true,
        failedAt: true,
        failureReason: true,
        provider: true,
        providerMessageId: true,
        createdAt: true,
        recipient: {
          select: {
            displayName: true,
            phone: true,
            email: true,
          },
        },
      },
    }),
  ]);

  return (
    <div className="space-y-8">
      <section className="rounded-3xl border border-emerald-400/15 bg-[radial-gradient(circle_at_top_left,rgba(16,185,129,0.16),transparent_34%),linear-gradient(180deg,rgba(255,255,255,0.05),rgba(255,255,255,0.03))] p-6 shadow-[0_24px_80px_rgba(0,0,0,0.3)] lg:p-8">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-emerald-300/80">
              Operations
            </p>
            <h1 className="mt-3 text-3xl font-semibold tracking-tight text-white">
              Notification queue
            </h1>
            <p className="mt-3 max-w-3xl text-sm leading-6 text-white/65">
              Check whether queued email and SMS dispatches are waiting, sent, failed, or scheduled for later.
            </p>
          </div>
          <form action={runQueueFromAdmin}>
            <button
              type="submit"
              className="inline-flex items-center justify-center rounded-2xl border border-emerald-400/30 bg-emerald-500/15 px-5 py-3 text-sm font-semibold text-emerald-50 transition hover:bg-emerald-500/20"
            >
              Run notification queue now
            </button>
          </form>
        </div>
      </section>

      {sp.ran === "1" ? (
        <section className="rounded-2xl border border-emerald-400/20 bg-emerald-500/10 p-4 text-sm text-emerald-100">
          Manual run result: processed {sp.processed ?? "0"}, sent {sp.sent ?? "0"}, failed {sp.failed ?? "0"}, skipped {sp.skipped ?? "0"}.
          {sp.message ? <span className="mt-2 block text-amber-100">{sp.message}</span> : null}
        </section>
      ) : null}

      <section className="grid gap-4 md:grid-cols-5">
        <div className="rounded-3xl border border-amber-400/20 bg-amber-500/10 p-5">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-amber-100/70">Queued</p>
          <p className="mt-3 text-3xl font-semibold text-white">{queued}</p>
        </div>
        <div className="rounded-3xl border border-emerald-400/20 bg-emerald-500/10 p-5">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-emerald-100/70">Due now</p>
          <p className="mt-3 text-3xl font-semibold text-white">{dueNow}</p>
        </div>
        <div className="rounded-3xl border border-sky-400/20 bg-sky-500/10 p-5">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-sky-100/70">Processing</p>
          <p className="mt-3 text-3xl font-semibold text-white">{processing}</p>
        </div>
        <div className="rounded-3xl border border-red-400/20 bg-red-500/10 p-5">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-red-100/70">Failed</p>
          <p className="mt-3 text-3xl font-semibold text-white">{failed}</p>
        </div>
        <div className="rounded-3xl border border-white/10 bg-white/[0.04] p-5">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/45">Current time</p>
          <p className="mt-3 text-lg font-semibold text-white">{formatDateTime(now)}</p>
        </div>
      </section>

      <section className="rounded-3xl border border-white/10 bg-white/[0.04] p-5">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/45">Recent dispatches</p>
            <h2 className="mt-2 text-xl font-semibold text-white">Last 30 queue items</h2>
          </div>
          <a
            href="/api/cron/notifications"
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center justify-center rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-white/10"
          >
            Test cron endpoint
          </a>
        </div>

        <div className="mt-5 space-y-3">
          {recent.map((item) => {
            const preview = item.bodyText.trim().replace(/\s+/g, " ").slice(0, 160);
            const recipient = item.recipient.displayName || item.recipient.email || item.recipient.phone || "Unknown recipient";

            return (
              <div key={item.id} className="rounded-2xl border border-white/10 bg-black/20 p-4">
                <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="rounded-full border border-white/10 bg-white/[0.04] px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-white/60">
                        {item.channel}
                      </span>
                      <span className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] ${getStatusClasses(item.status)}`}>
                        {item.status}
                      </span>
                      <span className="rounded-full border border-white/10 bg-white/[0.04] px-2.5 py-1 text-[11px] text-white/55">
                        {item.audience}
                      </span>
                    </div>
                    <h3 className="mt-3 text-sm font-semibold text-white">{recipient}</h3>
                    <p className="mt-1 text-sm text-white/55">{item.subject || preview || "No body preview"}</p>
                  </div>
                  <div className="grid gap-2 text-xs text-white/45 sm:grid-cols-2 lg:w-[440px]">
                    <div>Created: {formatDateTime(item.createdAt)}</div>
                    <div>Scheduled: {formatDateTime(item.scheduledFor)}</div>
                    <div>Sent: {formatDateTime(item.sentAt)}</div>
                    <div>Failed: {formatDateTime(item.failedAt)}</div>
                    <div>Provider: {item.provider || "—"}</div>
                    <div>Provider ID: {item.providerMessageId || "—"}</div>
                    <div>Source: {item.sourceType || "—"}</div>
                    <div>ID: {item.id}</div>
                  </div>
                </div>
                {item.failureReason ? (
                  <div className="mt-3 rounded-xl border border-red-400/20 bg-red-500/10 px-3 py-2 text-xs text-red-100">
                    {item.failureReason}
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}
