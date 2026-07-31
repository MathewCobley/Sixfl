// ========================================
// File: src/components/admin/player-pool/PlayerPoolNudgeBridge.tsx
// ========================================

"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";

type NudgeResponse = {
  ok?: boolean;
  message?: string;
  error?: string;
  nudgedAt?: string;
};

function findProfileCard(deleteButton: HTMLButtonElement) {
  return deleteButton.closest<HTMLElement>("article");
}

function isInvitedCard(card: HTMLElement) {
  return Array.from(card.querySelectorAll("span")).some(
    (span) => span.textContent?.trim().toUpperCase() === "INVITED",
  );
}

function getProfileId(card: HTMLElement) {
  return (
    card.querySelector<HTMLInputElement>('input[name="profileId"]')?.value.trim() ??
    ""
  );
}

function getPlayerName(card: HTMLElement) {
  return card.querySelector("h3")?.textContent?.trim() || "this player";
}

function updateInvitedText(card: HTMLElement) {
  const invited = Array.from(card.querySelectorAll("span")).find((span) =>
    span.textContent?.trim().startsWith("Invited:"),
  );

  if (invited) {
    invited.textContent = "Last invite/nudge: just now";
  }
}

async function sendNudge(input: {
  profileId: string;
  playerName: string;
  button: HTMLButtonElement;
  card: HTMLElement;
}) {
  const confirmed = window.confirm(
    `Nudge ${input.playerName}?\n\nThis will resend their SIXFL PlayerPool profile form email.`,
  );

  if (!confirmed) return;

  input.button.disabled = true;
  input.button.textContent = "Sending…";

  try {
    const response = await fetch(
      `/api/admin/player-pool/${encodeURIComponent(input.profileId)}/nudge`,
      { method: "POST" },
    );
    const payload = (await response.json().catch(() => null)) as
      | NudgeResponse
      | null;

    if (!response.ok || !payload?.ok) {
      throw new Error(payload?.error || "The nudge could not be sent.");
    }

    input.button.textContent = "Nudged ✓";
    input.button.className =
      "inline-flex min-h-10 items-center justify-center rounded-xl border border-emerald-400/35 bg-emerald-500/15 px-4 py-2 text-xs font-bold text-emerald-100";
    updateInvitedText(input.card);
  } catch (error) {
    input.button.disabled = false;
    input.button.textContent = "Nudge";
    window.alert(
      error instanceof Error ? error.message : "The nudge could not be sent.",
    );
  }
}

function injectNudgeButtons() {
  const deleteButtons = Array.from(
    document.querySelectorAll<HTMLButtonElement>("button"),
  ).filter((button) => button.textContent?.trim() === "Delete from PlayerPool");

  for (const deleteButton of deleteButtons) {
    const card = findProfileCard(deleteButton);
    if (!card || !isInvitedCard(card)) continue;
    if (card.dataset.playerPoolNudgeInjected === "true") continue;

    const profileId = getProfileId(card);
    if (!profileId) continue;

    const deleteForm = deleteButton.closest("form");
    const actionRow = deleteForm?.parentElement;
    if (!(actionRow instanceof HTMLElement)) continue;

    card.dataset.playerPoolNudgeInjected = "true";
    actionRow.classList.add("flex-wrap", "gap-2");

    const button = document.createElement("button");
    button.type = "button";
    button.className =
      "inline-flex min-h-10 items-center justify-center rounded-xl border border-amber-400/30 bg-amber-500/10 px-4 py-2 text-xs font-bold text-amber-100 transition hover:border-amber-400/45 hover:bg-amber-500/15 disabled:cursor-wait disabled:opacity-60";
    button.textContent = "Nudge";
    button.setAttribute(
      "aria-label",
      `Nudge ${getPlayerName(card)} to complete their PlayerPool profile`,
    );
    button.addEventListener("click", () => {
      void sendNudge({
        profileId,
        playerName: getPlayerName(card),
        button,
        card,
      });
    });

    actionRow.insertBefore(button, deleteForm);
  }
}

export default function PlayerPoolNudgeBridge() {
  const pathname = usePathname();

  useEffect(() => {
    if (pathname !== "/admin/player-pool") return;

    injectNudgeButtons();

    const observer = new MutationObserver(() => {
      injectNudgeButtons();
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true,
    });

    return () => observer.disconnect();
  }, [pathname]);

  return null;
}
