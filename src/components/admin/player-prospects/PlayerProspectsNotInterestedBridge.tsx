// ========================================
// File: src/components/admin/player-prospects/PlayerProspectsNotInterestedBridge.tsx
// ========================================

"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";

function getProspectIdFromCommsHref(href: string) {
  return href.match(/\/prospects\/([^/]+)\/communications(?:\?|#|$)/)?.[1] ?? null;
}

function getProspectIds() {
  const ids = new Set<string>();

  document
    .querySelectorAll<HTMLInputElement>('form input[name="prospectId"]')
    .forEach((input) => {
      const value = input.value.trim();
      if (value) ids.add(value);
    });

  document
    .querySelectorAll<HTMLAnchorElement>('a[href*="/prospects/"][href*="/communications"]')
    .forEach((link) => {
      const value = getProspectIdFromCommsHref(link.getAttribute("href") ?? "");
      if (value) ids.add(value);
    });

  return Array.from(ids);
}

function getCardForProspectId(prospectId: string) {
  const input = document.querySelector<HTMLInputElement>(`form input[name="prospectId"][value="${CSS.escape(prospectId)}"]`);
  const link = document.querySelector<HTMLAnchorElement>(`a[href*="/prospects/${CSS.escape(prospectId)}/communications"]`);
  const start = input ?? link;

  if (!start) return null;

  let current: HTMLElement | null = start;

  while (current && current.tagName !== "MAIN") {
    const className = typeof current.className === "string" ? current.className : "";

    if (current.tagName === "ARTICLE" || (className.includes("rounded-3xl") && className.includes("p-5"))) {
      return current;
    }

    current = current.parentElement;
  }

  return null;
}

function getActionArea(card: HTMLElement) {
  const assignForm = card.querySelector<HTMLFormElement>('form input[name="prospectId"]')?.closest("form");

  if (assignForm?.parentElement instanceof HTMLElement) {
    return assignForm.parentElement;
  }

  const commsLink = card.querySelector<HTMLAnchorElement>('a[href*="/prospects/"][href*="/communications"]');

  if (commsLink?.parentElement instanceof HTMLElement) {
    return commsLink.parentElement;
  }

  return null;
}

function isClosedProspectCard(card: HTMLElement) {
  const text = card.textContent ?? "";
  return text.includes("Not interested") || text.includes("Duplicated") || text.includes("Duplicate record");
}

function isHeldUnderTeam(card: HTMLElement) {
  const text = card.textContent ?? "";
  return text.includes("Currently held under") || text.includes("Active team");
}

async function moveProspectToMainPool(input: {
  prospectId: string;
  button: HTMLButtonElement;
}) {
  input.button.disabled = true;
  input.button.textContent = "Moving…";

  const response = await fetch(`/api/admin/player-prospects/${input.prospectId}/unassign`, {
    method: "POST",
  });

  if (response.ok) {
    window.location.reload();
    return;
  }

  input.button.disabled = false;
  input.button.textContent = "Move to main prospects";
}

async function moveProspectToNotInterested(input: {
  prospectId: string;
  button: HTMLButtonElement;
}) {
  input.button.disabled = true;
  input.button.textContent = "Moving…";

  const response = await fetch(`/api/admin/player-prospects/${input.prospectId}/not-interested`, {
    method: "POST",
  });

  if (response.ok) {
    window.location.reload();
    return;
  }

  input.button.disabled = false;
  input.button.textContent = "Move to not interested";
}

async function flagProspectAsDuplicate(input: {
  prospectId: string;
  button: HTMLButtonElement;
}) {
  const confirmed = window.confirm(
    "Mark this prospect as a duplicate record? It will leave the open pipeline and move to the duplicated records section.",
  );

  if (!confirmed) return;

  input.button.disabled = true;
  input.button.textContent = "Moving…";

  const response = await fetch(`/api/admin/player-prospects/${input.prospectId}/duplicate`, {
    method: "POST",
  });

  if (response.ok) {
    window.location.reload();
    return;
  }

  input.button.disabled = false;
  input.button.textContent = "Remove duplicate";
}

function addButtons() {
  for (const prospectId of getProspectIds()) {
    const card = getCardForProspectId(prospectId);
    if (!card || isClosedProspectCard(card)) {
      continue;
    }

    const actionArea = getActionArea(card);
    if (!actionArea) continue;

    if (isHeldUnderTeam(card) && !card.querySelector(`button[data-prospect-unassign="${prospectId}"]`)) {
      const poolButton = document.createElement("button");
      poolButton.type = "button";
      poolButton.textContent = "Move to main prospects";
      poolButton.dataset.prospectUnassign = prospectId;
      poolButton.className =
        "inline-flex w-full items-center justify-center rounded-xl border border-sky-400/25 bg-sky-500/10 px-4 py-2.5 text-sm font-medium text-sky-100 transition hover:bg-sky-500/15 disabled:cursor-not-allowed disabled:opacity-50";
      poolButton.addEventListener("click", () => {
        void moveProspectToMainPool({ prospectId, button: poolButton });
      });

      actionArea.appendChild(poolButton);
    }

    if (!card.querySelector(`button[data-prospect-not-interested="${prospectId}"]`)) {
      const button = document.createElement("button");
      button.type = "button";
      button.textContent = "Move to not interested";
      button.dataset.prospectNotInterested = prospectId;
      button.className =
        "inline-flex w-full items-center justify-center rounded-xl border border-red-400/25 bg-red-500/10 px-4 py-2.5 text-sm font-medium text-red-100 transition hover:bg-red-500/15 disabled:cursor-not-allowed disabled:opacity-50";
      button.addEventListener("click", () => {
        void moveProspectToNotInterested({ prospectId, button });
      });

      actionArea.appendChild(button);
    }

    if (!card.querySelector(`button[data-prospect-duplicate="${prospectId}"]`)) {
      const duplicateButton = document.createElement("button");
      duplicateButton.type = "button";
      duplicateButton.textContent = "Remove duplicate";
      duplicateButton.dataset.prospectDuplicate = prospectId;
      duplicateButton.className =
        "inline-flex w-full items-center justify-center rounded-xl border border-orange-400/25 bg-orange-500/10 px-4 py-2.5 text-sm font-medium text-orange-100 transition hover:bg-orange-500/15 disabled:cursor-not-allowed disabled:opacity-50";
      duplicateButton.addEventListener("click", () => {
        void flagProspectAsDuplicate({ prospectId, button: duplicateButton });
      });

      actionArea.appendChild(duplicateButton);
    }
  }
}

export default function PlayerProspectsNotInterestedBridge() {
  const pathname = usePathname();

  useEffect(() => {
    if (pathname !== "/admin/player-prospects") return;

    addButtons();

    const observer = new MutationObserver(addButtons);
    observer.observe(document.body, {
      childList: true,
      subtree: true,
    });

    return () => observer.disconnect();
  }, [pathname]);

  return null;
}
