// ========================================
// File: src/components/captain/PendingActivationDeleteLinks.tsx
// ========================================

"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";

function getTeamIdFromPathname(pathname: string) {
  const match = pathname.match(/\/captain\/team\/([^/]+)\/squad(?:\/)?$/);
  return match?.[1] ?? null;
}

function findPendingActivationCard(start: HTMLElement) {
  let current: HTMLElement | null = start;

  while (current && current.tagName !== "MAIN") {
    const className = typeof current.className === "string" ? current.className : "";

    if (
      className.includes("rounded-2xl") &&
      className.includes("px-4") &&
      className.includes("py-4") &&
      current.querySelector('input[name="prospectId"]')
    ) {
      return current;
    }

    current = current.parentElement;
  }

  return null;
}

function getPendingActivationName(card: HTMLElement) {
  const heading = Array.from(card.querySelectorAll<HTMLElement>("div")).find((element) => {
    const className = typeof element.className === "string" ? element.className : "";
    return className.includes("text-base") && className.includes("font-semibold") && element.textContent?.trim();
  });

  return heading?.textContent?.trim() || "this pending player";
}

async function deletePendingPlayer(input: {
  teamId: string;
  prospectId: string;
  playerName: string;
  button: HTMLButtonElement;
}) {
  const confirmed = window.confirm(
    `Delete ${input.playerName}? This removes the pending activation prospect record from this team.`,
  );

  if (!confirmed) return;

  input.button.setAttribute("disabled", "true");
  input.button.textContent = "Deleting…";

  try {
    const response = await fetch(
      `/api/captain/team/${input.teamId}/prospects/${input.prospectId}`,
      { method: "DELETE" },
    );

    const payload = (await response.json().catch(() => null)) as {
      error?: string;
    } | null;

    if (!response.ok) {
      throw new Error(payload?.error ?? "Pending player could not be deleted.");
    }

    window.location.reload();
  } catch (error) {
    input.button.removeAttribute("disabled");
    input.button.textContent = "Delete pending player";
    window.alert(error instanceof Error ? error.message : "Pending player could not be deleted.");
  }
}

function addPendingActivationDeleteLinks(pathname: string) {
  const teamId = getTeamIdFromPathname(pathname);
  if (!teamId) return;

  const prospectInputs = Array.from(
    document.querySelectorAll<HTMLInputElement>('#pending-activation input[name="prospectId"]'),
  );

  for (const input of prospectInputs) {
    const prospectId = input.value.trim();
    if (!prospectId) continue;

    const card = findPendingActivationCard(input);
    if (!card) continue;

    if (card.querySelector(`button[data-pending-activation-delete-link="${prospectId}"]`)) {
      continue;
    }

    const actionsContainer = Array.from(card.querySelectorAll<HTMLElement>("div")).find((element) => {
      const className = typeof element.className === "string" ? element.className : "";
      return className.includes("flex") && className.includes("flex-wrap") && className.includes("gap-3");
    });

    if (!actionsContainer) continue;

    const playerName = getPendingActivationName(card);
    const deleteButton = document.createElement("button");
    deleteButton.type = "button";
    deleteButton.textContent = "Delete pending player";
    deleteButton.dataset.pendingActivationDeleteLink = prospectId;
    deleteButton.className =
      "inline-flex items-center rounded-xl border border-red-400/25 bg-red-500/10 px-4 py-2.5 text-sm font-medium text-red-100 transition hover:bg-red-500/15 disabled:cursor-not-allowed disabled:opacity-50";
    deleteButton.addEventListener("click", () => {
      void deletePendingPlayer({
        teamId,
        prospectId,
        playerName,
        button: deleteButton,
      });
    });

    actionsContainer.appendChild(deleteButton);
  }
}

export default function PendingActivationDeleteLinks() {
  const pathname = usePathname();

  useEffect(() => {
    if (!pathname.endsWith("/squad")) return;

    addPendingActivationDeleteLinks(pathname);

    const observer = new MutationObserver(() => addPendingActivationDeleteLinks(pathname));
    observer.observe(document.body, {
      childList: true,
      subtree: true,
    });

    return () => observer.disconnect();
  }, [pathname]);

  return null;
}
