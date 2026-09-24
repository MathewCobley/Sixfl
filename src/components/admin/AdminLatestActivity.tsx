"use client";

import Link from "next/link";
import { useState } from "react";

export type AdminActivityDisplayItem = {
  id: string;
  href: string;
  title: string;
  detail: string;
  kindLabel: string;
  tone: string;
  occurredAt: string;
  occurredAtLabel: string;
  relativeLabel: string;
};

const PAGE_SIZE = 10;
const HISTORY_LIMIT = 50;

/** Pages one server-authorised snapshot locally, without reloading the dashboard
 * or marking messages read. Only display fields cross this client boundary. */
export default function AdminLatestActivity({ items }: { items: AdminActivityDisplayItem[] }) {
  const [requestedPage, setPage] = useState(0);
  const history = items.slice(0, HISTORY_LIMIT);
  const pageCount = Math.max(1, Math.ceil(history.length / PAGE_SIZE));
  const page = Math.min(requestedPage, pageCount - 1);
  const start = page * PAGE_SIZE;
  const visibleItems = history.slice(start, start + PAGE_SIZE);
  const end = start + visibleItems.length;

  const controls = (
    <nav aria-label="Latest activity pages" className="flex flex-wrap items-center gap-2">
      <button
        type="button"
        disabled={page === 0}
        onClick={() => setPage(Math.max(0, page - 1))}
        aria-controls="admin-latest-activity-items"
        className="min-h-11 rounded-xl border border-white/15 px-3 text-sm font-semibold text-white/80 transition hover:bg-white/[0.06] focus-visible:outline-2 focus-visible:outline-emerald-300 disabled:cursor-not-allowed disabled:opacity-35"
      >
        ← Previous 10
      </button>
      <span className="px-1 text-xs text-white/50">Page {page + 1} of {pageCount}</span>
      <button
        type="button"
        disabled={page >= pageCount - 1}
        onClick={() => setPage(Math.min(pageCount - 1, page + 1))}
        aria-controls="admin-latest-activity-items"
        className="min-h-11 rounded-xl border border-emerald-400/25 bg-emerald-500/10 px-3 text-sm font-semibold text-emerald-100 transition hover:bg-emerald-500/20 focus-visible:outline-2 focus-visible:outline-emerald-300 disabled:cursor-not-allowed disabled:opacity-35"
      >
        Next 10 →
      </button>
    </nav>
  );

  return (
    <div>
      <div className="mb-4 flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
        <div>
          <p className="text-sm leading-6 text-white/55">
            The 50 most recent actions by captains, players, leads and payers, shown 10 at a time.
          </p>
          <p role="status" aria-live="polite" aria-atomic="true" className="mt-1 text-xs font-semibold text-white/40">
            {history.length ? `Showing ${start + 1}–${end} of ${history.length} · Newest first` : "No activity yet"}
          </p>
        </div>
        {history.length > PAGE_SIZE ? controls : null}
      </div>

      <div id="admin-latest-activity-items">
        {history.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-white/10 bg-black/20 p-6 text-sm text-white/55">
            No external activity has been recorded yet.
          </div>
        ) : (
          <div className="divide-y divide-white/10 overflow-hidden rounded-2xl border border-white/10 bg-black/20">
            {visibleItems.map((item) => (
              <Link
                key={item.id}
                href={item.href}
                data-activity-id={item.id}
                className="group flex flex-col gap-3 px-4 py-4 transition hover:bg-white/[0.04] sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={`rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] ${item.tone}`}>
                      {item.kindLabel}
                    </span>
                    <span className="text-xs font-semibold text-white/35">{item.relativeLabel}</span>
                  </div>
                  <div className="mt-2 text-sm font-semibold text-white sm:text-base">{item.title}</div>
                  <div className="mt-1 text-sm leading-5 text-white/50">{item.detail}</div>
                </div>
                <div className="flex shrink-0 items-center gap-3 text-xs text-white/35 sm:text-right">
                  <time dateTime={item.occurredAt}>{item.occurredAtLabel}</time>
                  <span className="font-semibold text-emerald-300 transition group-hover:text-emerald-200">Open →</span>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
      {history.length > PAGE_SIZE ? <div className="mt-4 flex justify-end">{controls}</div> : null}
    </div>
  );
}
