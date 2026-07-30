"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";

type CountResponse = {
  counts?: Record<string, number>;
};

function getTeamIdFromEditHref(href: string) {
  return href.match(/^\/admin\/teams\/([^/?#]+)$/)?.[1] ?? null;
}

function findTeamRow(start: HTMLElement) {
  let current: HTMLElement | null = start;

  while (current && current.tagName !== "MAIN") {
    const className = typeof current.className === "string" ? current.className : "";
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

    const existing = row.querySelector<HTMLElement>(
      `[data-sixfl-tv-link-count="${CSS.escape(teamId)}"]`,
    );
    if (existing) {
      const count = counts[teamId] ?? 0;
      existing.textContent = `SIXFL TV · ${count} ${count === 1 ? "link" : "links"}`;
      continue;
    }

    const name = Array.from(row.querySelectorAll<HTMLElement>("div")).find((element) => {
      const className = typeof element.className === "string" ? element.className : "";
      return (
        className.includes("text-base") &&
        className.includes("font-semibold") &&
        className.includes("text-white")
      );
    });
    const badgeArea = name?.parentElement;
    if (!badgeArea) continue;

    const count = counts[teamId] ?? 0;
    const badge = document.createElement("span");
    badge.dataset.sixflTvLinkCount = teamId;
    badge.title = "Published SIXFL TV links in the current season";
    badge.className =
      "rounded-lg border border-fuchsia-400/25 bg-fuchsia-500/10 px-2.5 py-1 text-[11px] font-semibold text-fuchsia-100";
    badge.textContent = `SIXFL TV · ${count} ${count === 1 ? "link" : "links"}`;
    badgeArea.appendChild(badge);
  }
}

export default function AdminTeamsSixflTvCountBridge() {
  const pathname = usePathname();

  useEffect(() => {
    if (pathname !== "/admin/teams") return;

    let cancelled = false;

    async function run() {
      const response = await fetch("/api/admin/teams/sixfl-tv-link-counts", {
        cache: "no-store",
      });
      if (!response.ok || cancelled) return;

      const payload = (await response.json().catch(() => null)) as CountResponse | null;
      if (!payload?.counts || cancelled) return;
      addCountBadges(payload.counts);
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
