// ========================================
// File: src/components/layout/PublicLeagueSeasonSwitcherBridge.tsx
// ========================================

"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";

type SeasonPayload = {
  leagueId?: string;
  competition?: {
    id: string;
    name: string | null;
    slug: string | null;
    currentLeagueId: string | null;
  };
  seasons?: Array<{
    id: string;
    name: string;
    slug: string;
    season: string | null;
    isActive: boolean;
    teamCount: number;
    fixtureCount: number;
    completedFixtureCount: number;
    isCurrent: boolean;
  }>;
};

function getLeagueSlugFromPathname(pathname: string | null) {
  const match = pathname?.match(/^\/leagues\/([^/]+)/);
  return match?.[1] ?? null;
}

function isLeagueLandingPath(pathname: string | null, slug: string) {
  return pathname === `/leagues/${slug}` || pathname === `/leagues/${slug}/`;
}

function removeExistingSwitcher() {
  document.querySelector("[data-public-league-season-switcher]")?.remove();
}

function getInsertionTarget() {
  return (
    document.getElementById("details") ||
    document.querySelector("main div.min-h-screen > section + section") ||
    document.querySelector("main")
  );
}

function createSwitcher(payload: SeasonPayload, slug: string) {
  if (!payload.seasons || payload.seasons.length <= 1) return null;

  const wrapper = document.createElement("section");
  wrapper.dataset.publicLeagueSeasonSwitcher = "true";
  wrapper.dataset.slug = slug;
  wrapper.className = "mx-auto mb-8 max-w-[1400px] px-6 pt-8 sm:px-10";

  const card = document.createElement("div");
  card.className = "rounded-3xl border border-white/10 bg-white/[0.04] p-5 sm:p-6";

  const header = document.createElement("div");
  header.className = "flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between";

  const left = document.createElement("div");
  const eyebrow = document.createElement("p");
  eyebrow.className = "text-xs font-semibold uppercase tracking-[0.2em] text-emerald-400";
  eyebrow.textContent = "Season archive";

  const title = document.createElement("h2");
  title.className = "mt-2 text-xl font-bold text-white";
  title.textContent = payload.competition?.name || "Choose season";

  const copy = document.createElement("p");
  copy.className = "mt-2 text-sm text-white/60";
  copy.textContent = "Switch between current and previous seasons without losing old tables, fixtures or results.";

  left.append(eyebrow, title, copy);
  header.appendChild(left);
  card.appendChild(header);

  const links = document.createElement("div");
  links.className = "mt-5 flex flex-wrap gap-3";

  for (const season of payload.seasons) {
    const link = document.createElement("a");
    link.href = season.isCurrent
      ? `/leagues/${season.slug}`
      : `/leagues/${season.slug}?archive=1`;
    link.className = [
      "inline-flex items-center gap-2 rounded-full border px-4 py-2 text-sm font-semibold transition",
      season.slug === slug
        ? "border-emerald-400/40 bg-emerald-500/15 text-emerald-100"
        : "border-white/10 bg-black/25 text-white/70 hover:border-white/20 hover:text-white",
    ].join(" ");

    const label = document.createElement("span");
    label.textContent = season.season || season.name;

    const meta = document.createElement("span");
    meta.className = "text-xs font-medium text-white/45";
    meta.textContent = season.isCurrent ? "Current" : `${season.completedFixtureCount} results`;

    link.append(label, meta);
    links.appendChild(link);
  }

  card.appendChild(links);
  wrapper.appendChild(card);
  return wrapper;
}

async function injectSeasonSwitcher(pathname: string | null) {
  const slug = getLeagueSlugFromPathname(pathname);
  if (!slug) {
    removeExistingSwitcher();
    return;
  }

  const existing = document.querySelector("[data-public-league-season-switcher]");
  if (existing?.getAttribute("data-slug") === slug) return;

  try {
    const response = await fetch(`/api/public/leagues/${encodeURIComponent(slug)}/seasons`, {
      cache: "no-store",
    });
    if (!response.ok) return;

    const payload = (await response.json()) as SeasonPayload;
    const currentLeagueId = payload.competition?.currentLeagueId ?? null;
    const isArchiveRequest =
      new URLSearchParams(window.location.search).get("archive") === "1";

    if (
      isLeagueLandingPath(pathname, slug) &&
      !isArchiveRequest &&
      payload.leagueId &&
      currentLeagueId &&
      payload.leagueId !== currentLeagueId
    ) {
      const currentSeason = payload.seasons?.find(
        (season) => season.id === currentLeagueId || season.isCurrent,
      );

      if (currentSeason) {
        window.location.replace(`/leagues/${currentSeason.slug}${window.location.hash}`);
        return;
      }
    }

    const switcher = createSwitcher(payload, slug);
    if (!switcher) return;

    removeExistingSwitcher();
    const target = getInsertionTarget();
    if (!target) return;

    target.insertAdjacentElement("beforebegin", switcher);
  } catch {
    // The season switcher is progressive enhancement.
  }
}

export default function PublicLeagueSeasonSwitcherBridge() {
  const pathname = usePathname();

  useEffect(() => {
    if (!pathname?.startsWith("/leagues/")) return;

    let cancelled = false;
    const run = () => {
      if (!cancelled) void injectSeasonSwitcher(pathname);
    };

    const frame = window.requestAnimationFrame(run);
    const timer = window.setTimeout(run, 450);

    return () => {
      cancelled = true;
      window.cancelAnimationFrame(frame);
      window.clearTimeout(timer);
      removeExistingSwitcher();
    };
  }, [pathname]);

  return null;
}
