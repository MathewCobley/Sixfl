// ========================================
// File: src/components/admin/player-prospects/PlayerProspectsPlayerPoolBridge.tsx
// ========================================

"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";

type SendToPlayerPoolResponse = {
  ok?: boolean;
  message?: string;
  error?: string;
};

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
  const input = document.querySelector<HTMLInputElement>(
    `form input[name="prospectId"][value="${CSS.escape(prospectId)}"]`,
  );
  const link = document.querySelector<HTMLAnchorElement>(
    `a[href*="/prospects/${CSS.escape(prospectId)}/communications"]`,
  );
  const start = input ?? link;

  if (!start) return null;

  let current: HTMLElement | null = start;

  while (current && current.tagName !== "MAIN") {
    const className = typeof current.className === "string" ? current.className : "";

    if (
      current.tagName === "ARTICLE" ||
      (className.includes("rounded-3xl") && className.includes("p-5"))
    ) {
      return current;
    }

    current = current.parentElement;
  }

  return null;
}

function getActionArea(card: HTMLElement) {
  const assignForm = Array.from(card.querySelectorAll<HTMLFormElement>("form")).find(
    (form) => form.querySelector('input[name="prospectId"]'),
  );

  return assignForm?.parentElement instanceof HTMLElement
    ? assignForm.parentElement
    : null;
}

function isEligibleUnassignedCard(card: HTMLElement) {
  const text = card.textContent ?? "";
  const hasNoEmail = Array.from(card.querySelectorAll("span")).some(
    (span) => span.textContent?.trim() === "No email",
  );

  return (
    text.includes("Unassigned prospect") &&
    !text.includes("Active player") &&
    !text.includes("Not interested") &&
    !text.includes("Duplicated") &&
    !text.includes("Duplicate record") &&
    !hasNoEmail
  );
}

async function sendToPlayerPool(input: {
  prospectId: string;
  playerName: string;
  button: HTMLButtonElement;
}) {
  const confirmed = window.confirm(
    `Send ${input.playerName} a SIXFL PlayerPool profile form?`,
  );

  if (!confirmed) return;

  const originalText = input.button.textContent || "Send to PlayerPool";
  input.button.disabled = true;
  input.button.textContent = "Sending…";

  const leagueId = new URLSearchParams(window.location.search).get("leagueId");
  const response = await fetch(
    `/api/admin/player-prospects/${input.prospectId}/player-pool`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ leagueId }),
    },
  );
  const payload = (await response.json().catch(() => null)) as
    | SendToPlayerPoolResponse
    | null;

  if (!response.ok || !payload?.ok) {
    alert(payload?.error || "The PlayerPool form could not be sent.");
    input.button.disabled = false;
    input.button.textContent = originalText;
    return;
  }

  alert(payload.message || "PlayerPool form sent.");
  window.location.reload();
}

function addPlayerPoolButtons() {
  for (const prospectId of getProspectIds()) {
    const card = getCardForProspectId(prospectId);
    if (!card || !isEligibleUnassignedCard(card)) continue;

    if (card.querySelector(`[data-prospect-player-pool="${prospectId}"]`)) {
      continue;
    }

    const actionArea = getActionArea(card);
    if (!actionArea) continue;

    const button = document.createElement("button");
    button.type = "button";
    button.textContent = "Send to PlayerPool";
    button.dataset.prospectPlayerPool = prospectId;
    button.className =
      "inline-flex w-full items-center justify-center rounded-xl border border-emerald-400/30 bg-emerald-500/10 px-4 py-2.5 text-sm font-semibold text-emerald-100 transition hover:bg-emerald-500/15 disabled:cursor-not-allowed disabled:opacity-50";

    const playerName =
      card.querySelector("h3")?.textContent?.trim() || "this player";
    button.addEventListener("click", () => {
      void sendToPlayerPool({ prospectId, playerName, button });
    });

    const destructiveButton =
      actionArea.querySelector<HTMLElement>(
        `[data-prospect-not-interested="${prospectId}"]`,
      ) ??
      actionArea.querySelector<HTMLElement>(
        `[data-prospect-duplicate="${prospectId}"]`,
      );

    actionArea.insertBefore(button, destructiveButton ?? null);
  }
}

export default function PlayerProspectsPlayerPoolBridge() {
  const pathname = usePathname();

  useEffect(() => {
    if (pathname !== "/admin/player-prospects") return;

    addPlayerPoolButtons();

    const observer = new MutationObserver(addPlayerPoolButtons);
    observer.observe(document.body, {
      childList: true,
      subtree: true,
    });

    return () => observer.disconnect();
  }, [pathname]);

  return null;
}
