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

function addButtons() {
  for (const prospectId of getProspectIds()) {
    const card = getCardForProspectId(prospectId);
    if (!card || card.querySelector(`button[data-prospect-not-interested="${prospectId}"]`)) {
      continue;
    }

    if (card.textContent?.includes("Not interested")) {
      continue;
    }

    const actionArea = getActionArea(card);
    if (!actionArea) continue;

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
