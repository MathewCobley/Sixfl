// ========================================
// File: src/components/captain/ManagedSquadEditLinks.tsx
// ========================================

"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";

const moveToProspectsClassName =
  "inline-flex w-full items-center justify-center whitespace-nowrap rounded-xl border border-amber-400/30 bg-amber-500/10 px-4 py-2.5 text-center text-sm font-medium text-amber-100 transition hover:bg-amber-500/15";

function getTeamIdFromPathname(pathname: string) {
  const match = pathname.match(/\/captain\/team\/([^/]+)\/squad(?:\/)?$/);
  return match?.[1] ?? null;
}

function normaliseActionLayout(actionsContainer: HTMLElement) {
  actionsContainer.className =
    "grid w-full min-w-0 grid-cols-1 gap-2 sm:grid-cols-2 xl:w-[22rem] xl:max-w-[22rem] xl:shrink-0";
  actionsContainer.style.display = "grid";
  actionsContainer.style.gridTemplateColumns = "repeat(2, minmax(0, 1fr))";
  actionsContainer.style.gap = "0.5rem";
  actionsContainer.style.width = "min(22rem, 100%)";
  actionsContainer.style.maxWidth = "22rem";
  actionsContainer.style.alignItems = "stretch";

  for (const form of Array.from(actionsContainer.querySelectorAll("form"))) {
    const hasRoleSelect = Boolean(form.querySelector('[name="role"]'));

    if (hasRoleSelect) {
      form.className = "grid w-full min-w-0 grid-cols-1 gap-2 sm:col-span-2 sm:grid-cols-[minmax(0,1fr)_auto]";
      form.style.gridColumn = "1 / -1";
      form.style.display = "grid";
      form.style.gridTemplateColumns = "minmax(0, 1fr) auto";
      form.style.gap = "0.5rem";

      const selectWrapper = form.querySelector("div");
      if (selectWrapper instanceof HTMLElement) {
        selectWrapper.className = "min-w-0";
      }
    } else {
      form.className = "w-full";
      form.style.gridColumn = "auto";
    }
  }

  for (const control of Array.from(
    actionsContainer.querySelectorAll<HTMLElement>("a, button"),
  )) {
    control.classList.add("w-full", "justify-center", "text-center");
    control.classList.remove("sm:w-auto", "shrink-0");
    control.style.width = "100%";
    control.style.minHeight = "2.75rem";
  }
}

async function movePlayerToProspects(input: {
  teamId: string;
  membershipId: string;
  playerName: string;
  button: HTMLButtonElement;
}) {
  const confirmed = window.confirm(
    `Move ${input.playerName} to the Player Prospects list? This removes them from the active squad but keeps their details as a prospective player.`,
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

    window.location.href = "/admin/player-prospects";
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
