// ========================================
// File: src/components/admin/night-board/NightBoardWarningsPositionBridge.tsx
// ========================================

"use client";

import { useEffect } from "react";
import { usePathname, useSearchParams } from "next/navigation";

type MissingFixtureWarning = {
  key: string;
  message: string;
};

type MissingFixtureResponse = {
  warnings?: MissingFixtureWarning[];
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

function clearMissingFixtureWarnings() {
  document
    .querySelectorAll<HTMLElement>("[data-night-board-missing-fixture-warning]")
    .forEach((warning) => warning.remove());
  document
    .querySelectorAll<HTMLElement>("[data-night-board-missing-fixture-note]")
    .forEach((note) => note.remove());
  document
    .querySelectorAll<HTMLElement>("[data-night-board-hidden-no-warnings]")
    .forEach((message) => {
      message.style.display = message.dataset.nightBoardPreviousDisplay ?? "";
      delete message.dataset.nightBoardPreviousDisplay;
      delete message.dataset.nightBoardHiddenNoWarnings;
    });
}

function renderMissingFixtureWarnings(warnings: MissingFixtureWarning[]) {
  clearMissingFixtureWarnings();
  if (warnings.length === 0) return;

  const warningsHeading = findHeading(["Warnings", "Warnings and potential issues"]);
  const warningsCard = warningsHeading?.closest<HTMLElement>("section");
  const warningsList = warningsHeading?.nextElementSibling;
  if (!warningsCard || !(warningsList instanceof HTMLElement)) return;

  const noWarningsMessage = Array.from(warningsList.children).find((element) =>
    element.textContent?.trim().startsWith("No obvious pitch"),
  );
  if (noWarningsMessage instanceof HTMLElement) {
    noWarningsMessage.dataset.nightBoardPreviousDisplay = noWarningsMessage.style.display;
    noWarningsMessage.dataset.nightBoardHiddenNoWarnings = "true";
    noWarningsMessage.style.display = "none";
  }

  for (const warning of warnings) {
    const warningElement = document.createElement("div");
    warningElement.dataset.nightBoardMissingFixtureWarning = warning.key;
    warningElement.className =
      "rounded-2xl border border-amber-400/25 bg-amber-500/10 px-4 py-3 text-sm text-amber-100";
    warningElement.textContent = warning.message;
    warningsList.appendChild(warningElement);
  }

  const note = document.createElement("p");
  note.dataset.nightBoardMissingFixtureNote = "true";
  note.className = "mt-2 text-xs leading-5 text-white/45";
  note.textContent =
    "The missing-fixture check looks across the full Monday-to-Sunday week and ignores venue filters. A bye or planned week off may be intentional.";
  warningsCard.appendChild(note);
}

async function loadMissingFixtureWarnings(searchKey: string, signal: AbortSignal) {
  const query = searchKey ? `?${searchKey}` : "";
  const response = await fetch(
    `/api/admin/night-board/missing-team-fixtures${query}`,
    {
      cache: "no-store",
      signal,
    },
  );
  if (!response.ok) throw new Error("Missing fixture warnings could not be loaded.");

  const payload = (await response.json()) as MissingFixtureResponse;
  return Array.isArray(payload.warnings) ? payload.warnings : [];
}

export default function NightBoardWarningsPositionBridge() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const searchKey = searchParams.toString();

  useEffect(() => {
    if (pathname !== "/admin/night-board") return;

    const controller = new AbortController();
    let disposed = false;
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

    async function refreshMissingFixtureWarnings() {
      try {
        const warnings = await loadMissingFixtureWarnings(
          searchKey,
          controller.signal,
        );
        if (!disposed) renderMissingFixtureWarnings(warnings);
      } catch (error) {
        if (controller.signal.aborted) return;
        console.error(error);
        if (!disposed) clearMissingFixtureWarnings();
      }
    }

    frame = window.requestAnimationFrame(() => {
      refreshLayout();
      void refreshMissingFixtureWarnings();
    });

    return () => {
      disposed = true;
      controller.abort();
      window.cancelAnimationFrame(frame);
      clearMissingFixtureWarnings();
      document.querySelectorAll<HTMLElement>("[data-night-board-team-raised-issue-highlighted]").forEach((card) => {
        delete card.dataset.nightBoardTeamRaisedIssueHighlighted;
        clearIssueHighlight(card);
      });
    };
  }, [pathname, searchKey]);

  return null;
}
