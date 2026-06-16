// ========================================
// File: src/components/captain/ManagedSquadEditLinks.tsx
// ========================================

"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";

type MoveData = {
  targetTeams: Array<{
    id: string;
    name: string;
    league: { name: string; season: string | null } | null;
  }>;
  items: Array<{
    id: string;
    name: string;
    contact: string;
    label: string;
  }>;
};

const injectedActionClassName =
  "inline-flex shrink-0 items-center justify-center whitespace-nowrap rounded-xl border border-sky-400/30 bg-sky-500/10 px-4 py-2.5 text-sm font-medium text-sky-100 transition hover:bg-sky-500/15 sm:w-auto";

function getTeamIdFromPathname(pathname: string) {
  const match = pathname.match(/\/captain\/team\/([^/]+)\/squad(?:\/)?$/);
  return match?.[1] ?? null;
}

function getTeamLabel(team: MoveData["targetTeams"][number]) {
  return team.league?.name
    ? `${team.name} · ${team.league.name}${team.league.season ? ` ${team.league.season}` : ""}`
    : team.name;
}

function removeMoveModal() {
  document.querySelector("[data-managed-squad-move-modal]")?.remove();
}

function showMoveModal(input: {
  teamId: string;
  membershipId: string;
  playerName: string;
}) {
  removeMoveModal();

  const overlay = document.createElement("div");
  overlay.dataset.managedSquadMoveModal = "true";
  overlay.className =
    "fixed inset-0 z-[9999] flex items-center justify-center bg-black/75 px-4 py-6 backdrop-blur-sm";

  const modal = document.createElement("div");
  modal.className =
    "w-full max-w-2xl rounded-3xl border border-sky-400/20 bg-[#07130f] p-6 text-white shadow-2xl";

  const heading = document.createElement("div");
  heading.innerHTML = `
    <p class="text-[11px] font-semibold uppercase tracking-[0.22em] text-sky-100/70">Move squad member</p>
    <h2 class="mt-2 text-2xl font-semibold tracking-tight text-white">Move ${input.playerName}</h2>
    <p class="mt-2 text-sm leading-6 text-sky-100/70">Choose the managed team to move this player into. They will remain a squad member in the destination team.</p>
  `;

  const status = document.createElement("div");
  status.className = "mt-4 rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3 text-sm text-white/65";
  status.textContent = "Loading managed teams…";

  const list = document.createElement("div");
  list.className = "mt-4 grid gap-2";

  const footer = document.createElement("div");
  footer.className = "mt-5 flex justify-end";

  const close = document.createElement("button");
  close.type = "button";
  close.textContent = "Cancel";
  close.className =
    "inline-flex items-center rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm font-medium text-white/80 transition hover:bg-white/10";
  close.addEventListener("click", removeMoveModal);
  footer.appendChild(close);

  modal.append(heading, status, list, footer);
  overlay.appendChild(modal);
  document.body.appendChild(overlay);

  overlay.addEventListener("click", (event) => {
    if (event.target === overlay) removeMoveModal();
  });

  fetch(`/api/captain/team/${input.teamId}/move-managed-player?type=squad`, {
    cache: "no-store",
  })
    .then(async (response) => {
      if (!response.ok) throw new Error("Could not load managed teams.");
      return (await response.json()) as MoveData;
    })
    .then((data) => {
      list.innerHTML = "";

      if (data.targetTeams.length === 0) {
        status.textContent = "No other managed teams are available.";
        return;
      }

      status.textContent = "Select a destination team.";

      for (const team of data.targetTeams) {
        const button = document.createElement("button");
        button.type = "button";
        button.className =
          "flex w-full items-center justify-between rounded-2xl border border-white/10 bg-black/25 px-4 py-3 text-left text-sm text-white transition hover:border-sky-400/30 hover:bg-sky-500/10";
        button.innerHTML = `
          <span>
            <span class="block font-semibold text-white">${getTeamLabel(team)}</span>
            <span class="mt-1 block text-xs text-white/45">Move into this managed squad</span>
          </span>
          <span class="rounded-xl border border-sky-400/25 bg-sky-500/10 px-3 py-1.5 text-xs font-semibold text-sky-100">Move</span>
        `;

        button.addEventListener("click", async () => {
          button.setAttribute("disabled", "true");
          status.className =
            "mt-4 rounded-2xl border border-sky-400/25 bg-sky-500/10 px-4 py-3 text-sm text-sky-100";
          status.textContent = "Moving player…";

          try {
            const response = await fetch(
              `/api/captain/team/${input.teamId}/move-managed-player`,
              {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  type: "squad",
                  itemId: input.membershipId,
                  targetTeamId: team.id,
                }),
              },
            );

            const payload = (await response.json().catch(() => null)) as {
              error?: string;
            } | null;

            if (!response.ok) {
              throw new Error(payload?.error ?? "Player could not be moved.");
            }

            status.className =
              "mt-4 rounded-2xl border border-emerald-400/25 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-100";
            status.textContent = "Player moved. Refreshing…";
            window.location.reload();
          } catch (error) {
            button.removeAttribute("disabled");
            status.className =
              "mt-4 rounded-2xl border border-red-400/25 bg-red-500/10 px-4 py-3 text-sm text-red-100";
            status.textContent = error instanceof Error ? error.message : "Player could not be moved.";
          }
        });

        list.appendChild(button);
      }
    })
    .catch((error) => {
      status.className =
        "mt-4 rounded-2xl border border-red-400/25 bg-red-500/10 px-4 py-3 text-sm text-red-100";
      status.textContent = error instanceof Error ? error.message : "Could not load managed teams.";
    });
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

    const existingMoveButton = actionsContainer.querySelector(
      `button[data-managed-squad-move-link="${membershipId}"]`,
    );

    if (!existingMoveButton) {
      const row = actionsContainer.closest("div[class*='px-6'][class*='py-5']") ??
        actionsContainer.closest("div[class*='flex']");
      const playerName =
        row?.querySelector(".truncate.text-base.font-semibold.text-white")?.textContent?.trim() ||
        "this player";

      const moveButton = document.createElement("button");
      moveButton.type = "button";
      moveButton.textContent = "Move player";
      moveButton.dataset.managedSquadMoveLink = membershipId;
      moveButton.className = injectedActionClassName;
      moveButton.addEventListener("click", () => {
        showMoveModal({ teamId, membershipId, playerName });
      });

      const removeForm = Array.from(actionsContainer.querySelectorAll("form")).find(
        (candidate) => candidate !== form && Boolean(candidate.querySelector('input[name="membershipId"]')),
      );

      actionsContainer.insertBefore(moveButton, removeForm ?? null);
    }

    const existingLink = actionsContainer.querySelector(
      `a[data-managed-squad-edit-link="${membershipId}"]`,
    );
    if (existingLink) continue;

    const editLink = document.createElement("a");
    editLink.href = `/captain/team/${teamId}/squad/${membershipId}/edit`;
    editLink.textContent = "Edit details";
    editLink.dataset.managedSquadEditLink = membershipId;
    editLink.className = injectedActionClassName;

    const removeForm = Array.from(actionsContainer.querySelectorAll("form")).find(
      (candidate) => candidate !== form && Boolean(candidate.querySelector('input[name="membershipId"]')),
    );

    actionsContainer.insertBefore(editLink, removeForm ?? null);
  }
}

export default function ManagedSquadEditLinks() {
  const pathname = usePathname();

  useEffect(() => {
    addManagedSquadEditLinks(pathname);
  }, [pathname]);

  return null;
}
