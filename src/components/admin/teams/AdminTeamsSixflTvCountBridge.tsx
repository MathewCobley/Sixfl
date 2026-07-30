"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";

type TvFixture = {
  sixflTvRecorded?: boolean;
  sixflTvUrl?: string | null;
  homeTeamId?: string;
  awayTeamId?: string;
  publishedAt?: string | null;
};

type TvFixtureResponse = {
  fixtures?: TvFixture[];
};

function getTeamIdFromEditHref(href: string) {
  return href.match(/^\/admin\/teams\/([^/?#]+)$/)?.[1] ?? null;
}

function countFixtureLinks(value: string | null | undefined) {
  return new Set(
    String(value ?? "")
      .split(/[\n,]+/)
      .map((part) => part.trim())
      .filter(Boolean),
  ).size;
}

function buildCounts(fixtures: TvFixture[]) {
  const counts: Record<string, number> = {};

  for (const fixture of fixtures) {
    if (!fixture.publishedAt || !fixture.sixflTvRecorded) continue;
    const linkCount = countFixtureLinks(fixture.sixflTvUrl);
    if (linkCount === 0) continue;

    for (const teamId of [fixture.homeTeamId, fixture.awayTeamId]) {
      if (!teamId) continue;
      counts[teamId] = (counts[teamId] ?? 0) + linkCount;
    }
  }

  return counts;
}

function findTeamRow(start: HTMLElement) {
  let current: HTMLElement | null = start;

  while (current && current.tagName !== "MAIN") {
    const className = current.className;
    if (
      current.tagName === "DIV" &&
      className.includes("grid") &&
      className.includes("px-6") &&
      className.includes("py-5")
    ) {
      return current;
    }
    current = current.parentElement;
  }

  return null;
}

function addCountBadges(counts: Record<string, number>) {
  const editLinks = Array.from(
    document.querySelectorAll<HTMLAnchorElement>('a[href^="/admin/teams/"]'),
  ).filter((link) => link.textContent?.trim() === "Edit");

  for (const editLink of editLinks) {
    const teamId = getTeamIdFromEditHref(editLink.getAttribute("href") ?? "");
    if (!teamId) continue;

    const row = findTeamRow(editLink);
    if (!row) continue;

    const name = Array.from(row.querySelectorAll<HTMLElement>("div")).find((element) =>
      element.className.includes("text-base") &&
      element.className.includes("font-semibold") &&
      element.className.includes("text-white"),
    );
    const badgeArea = name?.parentElement;
    if (!badgeArea) continue;

    const count = counts[teamId] ?? 0;
    const label = `SIXFL TV · ${count} ${count === 1 ? "link" : "links"}`;
    const existing = Array.from(badgeArea.querySelectorAll<HTMLElement>("span")).find(
      (span) =>
        span.dataset.sixflTvLinkCount === teamId ||
        span.textContent?.trim().startsWith("SIXFL TV"),
    );

    if (existing) {
      existing.dataset.sixflTvLinkCount = teamId;
      existing.textContent = label;
      continue;
    }

    const badge = document.createElement("span");
    badge.dataset.sixflTvLinkCount = teamId;
    badge.title = "Published SIXFL TV links for this team";
    badge.className =
      "rounded-lg border border-fuchsia-400/25 bg-fuchsia-500/10 px-2.5 py-1 text-[11px] font-semibold text-fuchsia-100";
    badge.textContent = label;
    badgeArea.appendChild(badge);
  }
}

export default function AdminTeamsSixflTvCountBridge() {
  const pathname = usePathname();

  useEffect(() => {
    if (pathname !== "/admin/teams") return;

    let cancelled = false;

    async function run() {
      const response = await fetch("/api/admin/fixtures/sixfl-tv", {
        cache: "no-store",
      });
      if (!response.ok || cancelled) return;

      const payload = (await response.json().catch(() => null)) as
        | TvFixtureResponse
        | null;
      if (!payload?.fixtures || cancelled) return;
      addCountBadges(buildCounts(payload.fixtures));
    }

    void run();
    const timer = window.setTimeout(() => void run(), 600);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [pathname]);

  return null;
}
