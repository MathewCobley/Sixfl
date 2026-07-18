// ========================================
// File: src/components/admin/night-board/NightBoardWarningsPositionBridge.tsx
// ========================================

"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";

type TeamIssueCountResponse = {
  count?: number;
};

function findHeading(texts: string[]) {
  return Array.from(document.querySelectorAll<HTMLHeadingElement>("h2")).find((heading) =>
    texts.includes(heading.textContent?.trim() ?? ""),
  );
}

function getDirectChildOf(container: HTMLElement, element: HTMLElement) {
  let current: HTMLElement | null = element;

  while (current?.parentElement && current.parentElement !== container) {
    current = current.parentElement;
  }

  return current?.parentElement === container ? current : null;
}

function moveWarningsNearTop() {
  const warningsHeading = findHeading(["Warnings", "Warnings and potential issues"]);
  const pitchBoardHeading = findHeading(["Pitch board"]);
  if (!warningsHeading || !pitchBoardHeading) return;

  const container = warningsHeading.closest<HTMLElement>(".space-y-8");
  if (!container || !container.contains(pitchBoardHeading)) return;

  const warningsCard = getDirectChildOf(container, warningsHeading);
  const pitchBoardCard = getDirectChildOf(container, pitchBoardHeading);
  if (!warningsCard || !pitchBoardCard || warningsCard === pitchBoardCard) return;

  if (pitchBoardCard.previousElementSibling === warningsCard) return;
  container.insertBefore(warningsCard, pitchBoardCard);
}

function ensureTeamIssuesButton(issueCount: number | null) {
  const nightBoardHeading = Array.from(document.querySelectorAll<HTMLHeadingElement>("h1")).find(
    (heading) => heading.textContent?.trim() === "Night board",
  );
  const headerRow = nightBoardHeading?.parentElement?.parentElement;
  if (!headerRow) return;

  let actions = headerRow.parentElement?.querySelector<HTMLElement>("[data-night-board-team-issues-action]");

  if (!actions) {
    actions = document.createElement("div");
    actions.setAttribute("data-night-board-team-issues-action", "true");
    actions.className = "mt-5 flex flex-wrap gap-3";
    headerRow.insertAdjacentElement("afterend", actions);
  }

  let link = actions.querySelector<HTMLAnchorElement>('a[href="/admin/fixtures/issues"]');

  if (!link) {
    link = document.createElement("a");
    link.href = "/admin/fixtures/issues";
    link.className =
      "inline-flex min-h-11 items-center justify-center gap-3 rounded-xl border px-4 py-2.5 text-sm font-semibold transition";
    actions.appendChild(link);
  }

  const hasOpenIssues = issueCount !== null && issueCount > 0;
  link.className = [
    "inline-flex min-h-11 items-center justify-center gap-3 rounded-xl border px-4 py-2.5 text-sm font-semibold transition",
    hasOpenIssues
      ? "border-amber-400/35 bg-amber-500/15 text-amber-100 hover:bg-amber-500/20"
      : "border-white/10 bg-white/[0.05] text-white/80 hover:bg-white/[0.08]",
  ].join(" ");

  link.replaceChildren();

  const label = document.createElement("span");
  label.textContent = "Team fixture issues";
  link.appendChild(label);

  const badge = document.createElement("span");
  badge.className = [
    "inline-flex min-w-7 items-center justify-center rounded-full border px-2 py-0.5 text-xs font-bold",
    hasOpenIssues
      ? "border-amber-300/30 bg-black/20 text-amber-100"
      : "border-white/10 bg-black/20 text-white/55",
  ].join(" ");
  badge.textContent = issueCount === null ? "…" : String(issueCount);
  link.appendChild(badge);

  const suffix = document.createElement("span");
  suffix.className = "text-xs font-medium opacity-70";
  suffix.textContent = issueCount === 1 ? "open issue" : "open issues";
  link.appendChild(suffix);

  link.setAttribute(
    "aria-label",
    issueCount === null
      ? "View team fixture issues"
      : `View ${issueCount} open team fixture issue${issueCount === 1 ? "" : "s"}`,
  );
}

export default function NightBoardWarningsPositionBridge() {
  const pathname = usePathname();

  useEffect(() => {
    if (pathname !== "/admin/night-board") return;

    const controller = new AbortController();
    let issueCount: number | null = null;

    function refreshLayout() {
      moveWarningsNearTop();
      ensureTeamIssuesButton(issueCount);
    }

    refreshLayout();

    const observer = new MutationObserver(() => refreshLayout());
    observer.observe(document.body, { childList: true, subtree: true });

    void fetch("/api/admin/night-board/team-issue-count", {
      method: "GET",
      cache: "no-store",
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) throw new Error("Team fixture issue count could not be loaded.");
        return (await response.json()) as TeamIssueCountResponse;
      })
      .then((payload) => {
        issueCount = Number.isInteger(payload.count) && Number(payload.count) >= 0 ? Number(payload.count) : 0;
        refreshLayout();
      })
      .catch((error) => {
        if (controller.signal.aborted) return;
        console.error("Night Board team fixture issue count failed", error);
      });

    return () => {
      controller.abort();
      observer.disconnect();
    };
  }, [pathname]);

  return null;
}
