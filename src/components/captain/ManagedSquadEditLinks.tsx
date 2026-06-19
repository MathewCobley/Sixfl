// ========================================
// File: src/components/captain/ManagedSquadEditLinks.tsx
// ========================================

"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";

const moveToProspectsClassName =
  "inline-flex w-full items-center justify-center whitespace-nowrap rounded-xl border border-amber-400/30 bg-amber-500/10 px-4 py-2.5 text-center text-sm font-medium text-amber-100 transition hover:bg-amber-500/15 sm:w-auto";

function getTeamIdFromPathname(pathname: string) {
  const match = pathname.match(/\/captain\/team\/([^/]+)\/squad(?:\/)?$/);
  return match?.[1] ?? null;
}

function normaliseActionLayout(actionsContainer: HTMLElement) {
  actionsContainer.className =
    "flex w-full min-w-0 flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center xl:max-w-[42rem] xl:justify-end";

  for (const form of Array.from(actionsContainer.querySelectorAll("form"))) {
    const hasRoleSelect = Boolean(form.querySelector('[name="role"]'));

    if (hasRoleSelect) {
      form.className =
        "flex w-full min-w-0 flex-col gap-3 sm:w-auto sm:flex-row sm:flex-wrap sm:items-center";

      const selectWrapper = form.querySelector("div");
      if (selectWrapper instanceof HTMLElement) {
        selectWrapper.className = "w-full min-w-0 sm:w-[220px]";
      }
    } else {
      form.className = "w-full sm:w-auto";
    }
  }

  for (const control of Array.from(
    actionsContainer.querySelectorAll<HTMLElement>("a, button"),
  )) {
    control.classList.add("w-full", "justify-center", "text-center", "sm:w-auto");
    control.classList.remove("shrink-0");
  }
}

async function movePlayerToProspects(input: {
  teamId: string;
  membershipId: string;
  playerName: string;
  button: HTMLButtonElement;
}) {
  const confirmed = window.confirm(
    `Move ${input.playerName} back to Prospects? This removes them from the active squad but keeps their details for this team.`,
  );

  if (!confirmed) return;

  const originalText = input.button.textContent ?? "Move to prospects";
  input.button.disabled = true;
  input.button.textContent = "Moving…";

  try {
    const response = await fetch(
      `/api/captain/team/${input.teamId}/move-player-to-prospect`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ membershipId: input.membershipId }),
      },
    );

    const payload = (await response.json().catch(() => null)) as {
      error?: string;
    } | null;

    if (!response.ok) {
      throw new Error(payload?.error ?? "Player could not be moved to prospects.");
    }

    window.location.href = `/captain/team/${input.teamId}/prospects?saved=moved-to-prospects`;
  } catch (error) {
    input.button.disabled = false;
    input.button.textContent = originalText;
    window.alert(error instanceof Error ? error.message : "Player could not be moved to prospects.");
  }
}

function addManagedSquadEditLinks(pathname: string) {
  const teamId = getTeamIdFromPathname(pathname);
  if (!teamId) return;

  const roleForms = Array.from(
    document.querySelectorAll<HTMLFormElement>('main form input[name="membershipId"]'),
  )
    .map((input) => input.closest("form"))
    .filter((form): form is HTMLFormElement => form instanceof HTMLFormElement)
    .filter((form) => Boolean(form.querySelector('input[name="teamid"]')));

  for (const form of roleForms) {
    const membershipId = form
      .querySelector<HTMLInputElement>('input[name="membershipId"]')
      ?.value.trim();

    if (!membershipId) continue;

    const actionsContainer = form.parentElement;
    if (!(actionsContainer instanceof HTMLElement)) continue;

    normaliseActionLayout(actionsContainer);

    actionsContainer
      .querySelector(`a[data-managed-squad-edit-link="${membershipId}"]`)
      ?.remove();

    actionsContainer
      .querySelector(`button[data-managed-squad-move-link="${membershipId}"]`)
      ?.remove();

    const existingMoveToProspectsButton = actionsContainer.querySelector(
      `button[data-managed-squad-move-to-prospects-link="${membershipId}"]`,
    );

    if (!existingMoveToProspectsButton) {
      const row = actionsContainer.closest("div[class*='px-6'][class*='py-5']") ??
        actionsContainer.closest("div[class*='flex']");
      const playerName =
        row?.querySelector(".truncate.text-base.font-semibold.text-white")?.textContent?.trim() ||
        "this player";

      const moveButton = document.createElement("button");
      moveButton.type = "button";
      moveButton.textContent = "Move to prospects";
      moveButton.dataset.managedSquadMoveToProspectsLink = membershipId;
      moveButton.className = moveToProspectsClassName;
      moveButton.addEventListener("click", () => {
        void movePlayerToProspects({
          teamId,
          membershipId,
          playerName,
          button: moveButton,
        });
      });

      const removeForm = Array.from(actionsContainer.querySelectorAll("form")).find(
        (candidate) => candidate !== form && Boolean(candidate.querySelector('input[name="membershipId"]')),
      );

      actionsContainer.insertBefore(moveButton, removeForm ?? null);
    }

    normaliseActionLayout(actionsContainer);
  }
}

export default function ManagedSquadEditLinks() {
  const pathname = usePathname();

  useEffect(() => {
    addManagedSquadEditLinks(pathname);

    const observer = new MutationObserver(() => addManagedSquadEditLinks(pathname));
    observer.observe(document.body, {
      childList: true,
      subtree: true,
    });

    return () => observer.disconnect();
  }, [pathname]);

  return null;
}
