"use client";

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { usePathname } from "next/navigation";

type EmptyDraftNight = {
  id: string;
  refereeName: string | null;
  refereeEmail: string | null;
  leagueName: string;
  leagueSeason: string | null;
  nightDate: string;
  feePence: number;
  dueToRefereePence: number;
};

function formatMoney(pence: number) {
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: "GBP",
  }).format(pence / 100);
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-GB", {
    weekday: "short",
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: "Europe/London",
  }).format(new Date(`${value}T12:00:00.000Z`));
}

function findCleanupCard() {
  const headings = Array.from(document.querySelectorAll<HTMLElement>("h1, h2, h3, p"));
  const heading = headings.find((node) => node.textContent?.trim() === "Needs cleanup");
  return heading?.closest<HTMLElement>("div.rounded-3xl") ?? null;
}

export default function RefereeNightCleanupBridge() {
  const pathname = usePathname();
  const [target, setTarget] = useState<HTMLElement | null>(null);
  const [nights, setNights] = useState<EmptyDraftNight[]>([]);

  useEffect(() => {
    if (pathname !== "/admin/referee-nights") return;

    let stopped = false;
    const controller = new AbortController();

    const locate = () => {
      if (stopped) return;
      const card = findCleanupCard();
      if (card) setTarget(card);
      else window.setTimeout(locate, 150);
    };
    locate();

    void fetch("/api/admin/referee-nights/empty-drafts", {
      cache: "no-store",
      signal: controller.signal,
    })
      .then(async (response) => (response.ok ? await response.json() : null))
      .then((payload) => {
        if (stopped || !payload) return;
        setNights(Array.isArray(payload.nights) ? payload.nights : []);
      })
      .catch((error) => {
        if (!controller.signal.aborted) {
          console.error("Failed to load referee nights needing cleanup", error);
        }
      });

    return () => {
      stopped = true;
      controller.abort();
    };
  }, [pathname]);

  const rows = useMemo(() => nights, [nights]);
  if (pathname !== "/admin/referee-nights" || !target || rows.length === 0) return null;

  return createPortal(
    <div data-referee-night-cleanup-list className="mt-5 space-y-3 border-t border-white/10 pt-4">
      <div className="rounded-xl border border-amber-400/20 bg-amber-500/10 px-3 py-2 text-xs leading-5 text-amber-100">
        These are referee-night records with no fixtures. They were previously hidden here even though an old fee could still appear on the referee dashboard. Open one to correct or cancel it.
      </div>
      {rows.map((night) => (
        <a
          key={night.id}
          href={`/admin/referee-nights/${night.id}`}
          className="block rounded-xl border border-white/10 bg-black/20 px-3 py-3 transition hover:border-amber-400/25 hover:bg-white/[0.04]"
        >
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="font-semibold text-white">
                {night.refereeName || night.refereeEmail || "Unnamed referee"}
              </div>
              <div className="mt-1 text-xs text-white/50">
                {formatDate(night.nightDate)} · {night.leagueName}
                {night.leagueSeason ? ` · ${night.leagueSeason}` : ""}
              </div>
              <div className="mt-1 text-xs text-amber-100/70">0 fixtures — review this record</div>
            </div>
            <div className="shrink-0 text-right">
              <div className="font-semibold text-white">{formatMoney(night.feePence)}</div>
              <div className="mt-1 text-[11px] text-white/40">
                {night.dueToRefereePence > 0 ? `${formatMoney(night.dueToRefereePence)} showing due` : "No balance"}
              </div>
            </div>
          </div>
        </a>
      ))}
    </div>,
    target,
  );
}
