// ========================================
// File: src/components/admin/night-board/NightBoardWarningsPositionBridge.tsx
// ========================================

"use client";

import { useEffect } from "react";
import { usePathname, useSearchParams } from "next/navigation";

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

function findFixtureCard(element: HTMLElement) {
  let current: HTMLElement | null = element;

  while (current && current !== document.body) {
    if (current.querySelector<HTMLInputElement>('form input[name="fixtureId"]')) return current;
    current = current.parentElement;
  }

  return null;
}

function findTeamRaisedIssueCards() {
  const statusLabels = Array.from(document.querySelectorAll<HTMLElement>("span, div")).filter(
    (element) => element.children.length === 0 && element.textContent?.trim() === "Issue raised",
  );

  const cards = statusLabels
    .map((status) => findFixtureCard(status))
    .filter((card): card is HTMLElement => Boolean(card));

  return Array.from(new Set(cards));
}

function clearIssueHighlight(card: HTMLElement) {
  card.style.outline = card.dataset.issuePreviousOutline ?? "";
  card.style.outlineOffset = card.dataset.issuePreviousOutlineOffset ?? "";
  delete card.dataset.issuePreviousOutline;
  delete card.dataset.issuePreviousOutlineOffset;
}

function highlightIssueCard(card: HTMLElement) {
  document.querySelectorAll<HTMLElement>("[data-night-board-team-raised-issue-highlighted]").forEach((otherCard) => {
    delete otherCard.dataset.nightBoardTeamRaisedIssueHighlighted;
    clearIssueHighlight(otherCard);
  });

  card.dataset.issuePreviousOutline = card.style.outline;
  card.dataset.issuePreviousOutlineOffset = card.style.outlineOffset;
  card.dataset.nightBoardTeamRaisedIssueHighlighted = "true";
  card.style.outline = "2px solid rgba(251, 191, 36, 0.9)";
  card.style.outlineOffset = "4px";
  card.scrollIntoView({ behavior: "smooth", block: "center", inline: "nearest" });

  window.setTimeout(() => {
    if (card.dataset.nightBoardTeamRaisedIssueHighlighted !== "true") return;
    delete card.dataset.nightBoardTeamRaisedIssueHighlighted;
    clearIssueHighlight(card);
  }, 3000);
}

function ensureTeamIssuesButton(issueCards: HTMLElement[], onViewIssue: () => void) {
  const nightBoardHeading = Array.from(document.querySelectorAll<HTMLHeadingElement>("h1")).find(
    (heading) => heading.textContent?.trim() === "Night board",
  );
  const headerRow = nightBoardHeading?.parentElement?.parentElement;
  if (!headerRow) return;

  let actions = headerRow.parentElement?.querySelector<HTMLElement>("[data-night-board-team-issues-action]");

  if (!actions) {
    actions = document.createElement("div");
    actions.setAttribute("data-night-board-team-issues-action", "true");
    actions.className = "mt-5 flex flex-wrap items-center gap-3";
    headerRow.insertAdjacentElement("afterend", actions);
  }

  let button = actions.querySelector<HTMLButtonElement>("button[data-night-board-view-team-raised-issues]");

  if (!button) {
    button = document.createElement("button");
    button.type = "button";
    button.setAttribute("data-night-board-view-team-raised-issues", "true");
    actions.appendChild(button);
  }

  const issueCount = issueCards.length;
  const hasIssues = issueCount > 0;

  button.disabled = !hasIssues;
  button.className = [
    "inline-flex min-h-11 items-center justify-center gap-3 rounded-xl border px-4 py-2.5 text-sm font-semibold transition",
    hasIssues
      ? "border-red-400/35 bg-red-500/15 text-red-100 hover:bg-red-500/20"
      : "cursor-default border-white/10 bg-white/[0.04] text-white/45",
  ].join(" ");

  button.replaceChildren();

  const label = document.createElement("span");
  label.textContent = hasIssues ? "View team-raised fixture issues" : "No team-raised fixture issues";
  button.appendChild(label);

  const badge = document.createElement("span");
  badge.className = [
    "inline-flex min-w-7 items-center justify-center rounded-full border px-2 py-0.5 text-xs font-bold",
    hasIssues
      ? "border-red-300/30 bg-black/20 text-red-100"
      : "border-white/10 bg-black/20 text-white/45",
  ].join(" ");
  badge.textContent = String(issueCount);
  button.appendChild(badge);

  const suffix = document.createElement("span");
  suffix.className = "text-xs font-medium opacity-70";
  suffix.textContent = hasIssues ? "on this night" : "on this night";
  button.appendChild(suffix);

  button.onclick = hasIssues ? onViewIssue : null;
  button.setAttribute(
    "aria-label",
    hasIssues
      ? `View ${issueCount} team-raised fixture issue${issueCount === 1 ? "" : "s"} on this night`
      : "No team-raised fixture issues on this night",
  );
}

export default function NightBoardWarningsPositionBridge() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const searchKey = searchParams.toString();

  useEffect(() => {
    if (pathname !== "/admin/night-board") return;

    let issueIndex = 0;
    let frame = 0;

    function refreshLayout() {
      moveWarningsNearTop();
      const issueCards = findTeamRaisedIssueCards();

      issueCards.forEach((card) => {
        card.dataset.nightBoardTeamRaisedIssue = "true";
      });

      ensureTeamIssuesButton(issueCards, () => {
        const currentIssueCards = findTeamRaisedIssueCards();
        if (currentIssueCards.length === 0) return;

        if (issueIndex >= currentIssueCards.length) issueIndex = 0;
        highlightIssueCard(currentIssueCards[issueIndex]);
        issueIndex = (issueIndex + 1) % currentIssueCards.length;
      });
    }

    frame = window.requestAnimationFrame(refreshLayout);

    return () => {
      window.cancelAnimationFrame(frame);
      document.querySelectorAll<HTMLElement>("[data-night-board-team-raised-issue-highlighted]").forEach((card) => {
        delete card.dataset.nightBoardTeamRaisedIssueHighlighted;
        clearIssueHighlight(card);
      });
    };
  }, [pathname, searchKey]);

  return null;
}
