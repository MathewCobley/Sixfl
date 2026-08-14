// ========================================
// File: src/app/(admin)/admin/queue/page.tsx
// ========================================

import Link from "next/link";
import { NotificationDispatchStatus } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/requireAdmin";
import { cancelQueuedDispatchFromAdmin, runQueueFromAdmin } from "./runner";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const PAGE_SIZE = 50;

type QueueFilter = "all" | "queued" | "due" | "processing" | "sent" | "failed" | "skipped" | "cancelled";

function normaliseFilter(value?: string | null): QueueFilter {
  switch (value) {
    case "queued":
    case "due":
    case "processing":
    case "sent":
    case "failed":
    case "skipped":
    case "cancelled":
      return value;
    default:
      return "all";
  }
}

function normalisePage(value?: string | null) {
  const page = Number(value ?? "1");
  return Number.isInteger(page) && page > 0 ? page : 1;
}

function normaliseSearch(value?: string | null) {
  return String(value ?? "").trim().slice(0, 120);
}

function buildQueueHref(filter: QueueFilter, page = 1, searchTerm = "") {
  const params = new URLSearchParams();
  params.set("filter", filter);
  if (searchTerm.trim()) params.set("q", searchTerm.trim());
  if (page > 1) params.set("page", String(page));
  return `/admin/queue?${params.toString()}`;
}

function getFilteredWhere(filter: QueueFilter, now: Date) {
  switch (filter) {
    case "queued":
      return { status: "QUEUED" as const };
    case "due":
      return {
        status: "QUEUED" as const,
        scheduledFor: {
          lte: now,
        },
      };
    case "processing":
      return { status: "PROCESSING" as const };
    case "sent":
      return { status: "SENT" as const };
    case "failed":
      return { status: "FAILED" as const };
    case "skipped":
      return { status: "SKIPPED" as const };
    case "cancelled":
      return { status: "CANCELLED" as const };
    default:
      return {};
  }
}

function getSearchWhere(searchTerm: string) {
  if (!searchTerm) return {};

  const contains = {
    contains: searchTerm,
    mode: "insensitive" as const,
  };

  return {
    OR: [
      { id: contains },
      { subject: contains },
      { bodyText: contains },
      { failureReason: contains },
      { provider: contains },
      { providerMessageId: contains },
      { sourceType: contains },
      { sourceId: contains },
      {
        recipient: {
          is: {
            OR: [
              { displayName: contains },
              { email: contains },
              { phone: contains },
              { emailNormalized: contains },
              { phoneNormalized: contains },
            ],
          },
        },
      },
    ],
  };
}

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

function getMetadataString(metadata: unknown, key: string) {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) {
    return null;
  }

  const value = (metadata as Record<string, unknown>)[key];
  return typeof value === "string" && value.trim() ? value.trim() : null;
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

function getFilterTabClasses(active: boolean) {
  return [
    "inline-flex items-center gap-2 rounded-2xl border px-3 py-2 text-sm font-semibold transition",
    active
      ? "border-emerald-400/30 bg-emerald-400/12 text-white"
      : "border-white/10 bg-white/[0.03] text-white/70 hover:bg-white/[0.06] hover:text-white",
  ].join(" ");
}

function getPaginationLinkClasses(enabled: boolean) {
  return [
    "inline-flex h-11 items-center justify-center rounded-xl border px-4 text-sm font-semibold transition",
    enabled
      ? "border-emerald-400/25 bg-emerald-500/10 text-emerald-100 hover:bg-emerald-500/15"
      : "pointer-events-none border-white/10 bg-white/[0.03] text-white/30",
  ].join(" ");
}

export default async function AdminQueuePage({
  searchParams,
}: {
  searchParams?: Promise<{
    filter?: string;
    page?: string;
    q?: string;
    ran?: string;
    processed?: string;
    sent?: string;
    failed?: string;
    skipped?: string;
    message?: string;
    cancelled?: string;
    queueMessage?: string;
  }>;
}) {
  await requireAdmin();
  const sp = (await searchParams) ?? {};
  const activeFilter = normaliseFilter(sp.filter);
  const currentPage = normalisePage(sp.page);
  const searchTerm = normaliseSearch(sp.q);
  const skip = (currentPage - 1) * PAGE_SIZE;
  const now = new Date();
  const filteredWhere = getFilteredWhere(activeFilter, now);
  const searchWhere = getSearchWhere(searchTerm);
  const queueWhere = searchTerm
    ? { AND: [filteredWhere, searchWhere] }
    : filteredWhere;

  const [all, queued, dueNow, processing, sent, failed, skipped, cancelled, matchingTotal, recent] = await Promise.all([
    prisma.notificationDispatch.count(),
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
      where: { status: "SENT" },
    }),
    prisma.notificationDispatch.count({
      where: { status: "FAILED" },
    }),
    prisma.notificationDispatch.count({
      where: { status: "SKIPPED" },
    }),
    prisma.notificationDispatch.count({
      where: { status: "CANCELLED" },
    }),
    prisma.notificationDispatch.count({
      where: queueWhere,
    }),
    prisma.notificationDispatch.findMany({
      where: queueWhere,
      orderBy: [{ createdAt: "desc" }],
      skip,
      take: PAGE_SIZE,
      select: {
        id: true,
        channel: true,
        status: true,
        audience: true,
        subject: true,
        bodyText: true,
        sourceType: true,
        sourceId: true,
        metadata: true,
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
            metadata: true,
          },
        },
      },
    }),
  ]);

  const teamIds = Array.from(
    new Set(
      recent
        .map(
          (item) =>
            getMetadataString(item.metadata, "teamId") ||
            getMetadataString(item.recipient.metadata, "teamId"),
        )
        .filter((value): value is string => Boolean(value)),
    ),
  );
  const teamRows = teamIds.length
    ? await prisma.team.findMany({
        where: { id: { in: teamIds } },
        select: { id: true, name: true },
      })
    : [];
  const teamNameById = new Map(teamRows.map((team) => [team.id, team.name]));

  const filterTabs: Array<{ key: QueueFilter; label: string; count: number }> = [
    { key: "all", label: "All", count: all },
    { key: "queued", label: "Queued", count: queued },
    { key: "due", label: "Due now", count: dueNow },
    { key: "processing", label: "Processing", count: processing },
    { key: "sent", label: "Sent", count: sent },
    { key: "failed", label: "Failed", count: failed },
    { key: "skipped", label: "Skipped", count: skipped },
    { key: "cancelled", label: "Cancelled", count: cancelled },
  ];

  const activeTab = filterTabs.find((tab) => tab.key === activeFilter) ?? filterTabs[0];
  const activeTotal = matchingTotal;
  const pageStart = activeTotal === 0 ? 0 : skip + 1;
  const pageEnd = activeTotal === 0 ? 0 : Math.min(skip + recent.length, activeTotal);
  const hasPreviousPage = currentPage > 1;
  const hasNextPage = skip + PAGE_SIZE < activeTotal;

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

      {sp.queueMessage ? (
        <section
          className={[
            "rounded-2xl border p-4 text-sm",
            sp.cancelled === "1"
              ? "border-emerald-400/20 bg-emerald-500/10 text-emerald-100"
              : "border-amber-400/20 bg-amber-500/10 text-amber-100",
          ].join(" ")}
        >
          {sp.queueMessage}
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
        <div className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/45">Dispatches</p>
            <h2 className="mt-2 text-xl font-semibold text-white">
              {activeFilter === "all" ? "Queue items" : `${activeTab.label} queue items`}
            </h2>
            <p className="mt-2 text-sm text-white/50">
              {searchTerm ? `Matching “${searchTerm}” · ` : ""}Showing {pageStart}–{pageEnd} of {activeTotal} dispatch{activeTotal === 1 ? "" : "es"} · Page {currentPage}
            </p>
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

        <form action="/admin/queue" method="get" className="mt-5 rounded-2xl border border-white/10 bg-black/20 p-4">
          <input type="hidden" name="filter" value={activeFilter} />
          <div className="flex flex-col gap-3 lg:flex-row lg:items-end">
            <div className="min-w-0 flex-1">
              <label htmlFor="queue-search" className="text-sm font-medium text-white/70">
                Search queue items
              </label>
              <input
                id="queue-search"
                name="q"
                type="search"
                defaultValue={searchTerm}
                placeholder="Search recipient, email, phone, subject, message, provider ID, source or dispatch ID"
                className="mt-2 w-full rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-sm text-white outline-none transition placeholder:text-white/30 focus:border-emerald-400/50 focus:bg-black/40"
              />
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="submit"
                className="inline-flex h-11 items-center justify-center rounded-xl border border-emerald-400/30 bg-emerald-500/15 px-4 text-sm font-semibold text-emerald-50 transition hover:bg-emerald-500/20"
              >
                Search
              </button>
              {searchTerm ? (
                <Link
                  href={buildQueueHref(activeFilter)}
                  className="inline-flex h-11 items-center justify-center rounded-xl border border-white/10 bg-white/5 px-4 text-sm font-semibold text-white/75 transition hover:bg-white/10 hover:text-white"
                >
                  Clear
                </Link>
              ) : null}
            </div>
          </div>
        </form>

        <div className="mt-5 flex flex-wrap gap-2">
          {filterTabs.map((tab) => (
            <Link
              key={tab.key}
              href={buildQueueHref(tab.key, 1, searchTerm)}
              className={getFilterTabClasses(activeFilter === tab.key)}
            >
              <span>{tab.label}</span>
              <span className={`inline-flex min-w-6 items-center justify-center rounded-full px-1.5 py-0.5 text-[11px] ${activeFilter === tab.key ? "bg-emerald-400/20 text-emerald-200" : "bg-white/10 text-white/60"}`}>
                {tab.count > 999 ? "999+" : tab.count}
              </span>
            </Link>
          ))}
        </div>

        <div className="mt-5 flex flex-col gap-3 rounded-2xl border border-white/10 bg-black/20 p-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-white/55">
            {searchTerm ? "Search is applied to the selected filter. " : ""}Use the buttons to move through older dispatches. Each page shows {PAGE_SIZE} items.
          </p>
          <div className="flex flex-wrap gap-2">
            <Link
              href={buildQueueHref(activeFilter, Math.max(1, currentPage - 1), searchTerm)}
              className={getPaginationLinkClasses(hasPreviousPage)}
              aria-disabled={!hasPreviousPage}
            >
              ← Previous 50
            </Link>
            <Link
              href={buildQueueHref(activeFilter, currentPage + 1, searchTerm)}
              className={getPaginationLinkClasses(hasNextPage)}
              aria-disabled={!hasNextPage}
            >
              Next 50 →
            </Link>
          </div>
        </div>

        <div className="mt-5 space-y-3">
          {recent.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-white/10 bg-black/20 p-6 text-sm text-white/55">
              {searchTerm ? "No dispatches match this search and filter." : "No dispatches match this filter."}
            </div>
          ) : null}

          {recent.map((item) => {
            const preview = item.bodyText.trim().replace(/\s+/g, " ").slice(0, 160);
            const recipient = item.recipient.displayName || item.recipient.email || item.recipient.phone || "Unknown recipient";
            const teamId =
              getMetadataString(item.metadata, "teamId") ||
              getMetadataString(item.recipient.metadata, "teamId");
            const teamName = teamId ? teamNameById.get(teamId) ?? null : null;

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
                    {teamName && teamId ? (
                      <div className="mt-1 text-xs text-white/50">
                        Team:{" "}
                        <Link
                          href={`/admin/teams/${teamId}`}
                          className="font-semibold text-emerald-200 hover:text-emerald-100"
                        >
                          {teamName}
                        </Link>
                      </div>
                    ) : null}
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
                {item.status === "QUEUED" ? (
                  <div className="mt-4 flex justify-end">
                    <form action={cancelQueuedDispatchFromAdmin}>
                      <input type="hidden" name="dispatchId" value={item.id} />
                      <input type="hidden" name="filter" value={activeFilter} />
                      <input type="hidden" name="page" value={currentPage} />
                      <input type="hidden" name="q" value={searchTerm} />

                      <button
                        type="submit"
                        className="inline-flex items-center justify-center rounded-xl border border-red-400/25 bg-red-500/10 px-3 py-2 text-xs font-semibold text-red-100 transition hover:bg-red-500/20"
                      >
                        Delete before sending
                      </button>
                    </form>
                  </div>
                ) : null}
                {item.failureReason ? (
                  <div className="mt-3 rounded-xl border border-red-400/20 bg-red-500/10 px-3 py-2 text-xs text-red-100">
                    {item.failureReason}
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>

        {activeTotal > PAGE_SIZE ? (
          <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-white/10 pt-5">
            <p className="text-sm text-white/50">
              Showing {pageStart}–{pageEnd} of {activeTotal}.
            </p>
            <div className="flex flex-wrap gap-2">
              <Link
                href={buildQueueHref(activeFilter, Math.max(1, currentPage - 1), searchTerm)}
                className={getPaginationLinkClasses(hasPreviousPage)}
                aria-disabled={!hasPreviousPage}
              >
                ← Previous 50
              </Link>
              <Link
                href={buildQueueHref(activeFilter, currentPage + 1, searchTerm)}
                className={getPaginationLinkClasses(hasNextPage)}
                aria-disabled={!hasNextPage}
              >
                Next 50 →
              </Link>
            </div>
          </div>
        ) : null}
      </section>
    </div>
  );
}
