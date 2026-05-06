// ========================================
// File: src/components/captain/PendingActivationDeleteLinks.tsx
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
};

function getTeamIdFromPathname(pathname: string) {
  const match = pathname.match(/\/captain\/team\/([^/]+)\/squad(?:\/)?$/);
  return match?.[1] ?? null;
}

function getTeamLabel(team: MoveData["targetTeams"][number]) {
  return team.league?.name
    ? `${team.name} · ${team.league.name}${team.league.season ? ` ${team.league.season}` : ""}`
    : team.name;
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

function removeMoveModal() {
  document.querySelector("[data-pending-activation-move-modal]")?.remove();
}

function showMoveModal(input: {
  teamId: string;
  prospectId: string;
  playerName: string;
}) {
  removeMoveModal();

  const overlay = document.createElement("div");
  overlay.dataset.pendingActivationMoveModal = "true";
  overlay.className =
    "fixed inset-0 z-[9999] flex items-center justify-center bg-black/75 px-4 py-6 backdrop-blur-sm";

  const modal = document.createElement("div");
  modal.className =
    "w-full max-w-2xl rounded-3xl border border-sky-400/20 bg-[#07130f] p-6 text-white shadow-2xl";

  const heading = document.createElement("div");
  heading.innerHTML = `
    <p class="text-[11px] font-semibold uppercase tracking-[0.22em] text-sky-100/70">Move pending player</p>
    <h2 class="mt-2 text-2xl font-semibold tracking-tight text-white">Move ${input.playerName}</h2>
    <p class="mt-2 text-sm leading-6 text-sky-100/70">Choose the managed team to move this pending activation player into. They will remain pending activation in the destination squad.</p>
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

  fetch(`/api/captain/team/${input.teamId}/move-managed-player?type=prospect`, {
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
            <span class="mt-1 block text-xs text-white/45">Move into this managed squad as pending activation</span>
          </span>
          <span class="rounded-xl border border-sky-400/25 bg-sky-500/10 px-3 py-1.5 text-xs font-semibold text-sky-100">Move</span>
        `;

        button.addEventListener("click", async () => {
          button.setAttribute("disabled", "true");
          status.className =
            "mt-4 rounded-2xl border border-sky-400/25 bg-sky-500/10 px-4 py-3 text-sm text-sky-100";
          status.textContent = "Moving pending player…";

          try {
            const response = await fetch(
              `/api/captain/team/${input.teamId}/move-managed-player`,
              {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  type: "prospect",
                  itemId: input.prospectId,
                  targetTeamId: team.id,
                }),
              },
            );

            const payload = (await response.json().catch(() => null)) as {
              error?: string;
            } | null;

            if (!response.ok) {
              throw new Error(payload?.error ?? "Pending player could not be moved.");
            }

            status.className =
              "mt-4 rounded-2xl border border-emerald-400/25 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-100";
            status.textContent = "Pending player moved. Refreshing…";
            window.location.reload();
          } catch (error) {
            button.removeAttribute("disabled");
            status.className =
              "mt-4 rounded-2xl border border-red-400/25 bg-red-500/10 px-4 py-3 text-sm text-red-100";
            status.textContent = error instanceof Error ? error.message : "Pending player could not be moved.";
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

function addPendingActivationControls(pathname: string) {
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

    const actionsContainer = Array.from(card.querySelectorAll<HTMLElement>("div")).find((element) => {
      const className = typeof element.className === "string" ? element.className : "";
      return className.includes("flex") && className.includes("flex-wrap") && className.includes("gap-3");
    });

    if (!actionsContainer) continue;

    const playerName = getPendingActivationName(card);

    if (!card.querySelector(`button[data-pending-activation-move-link="${prospectId}"]`)) {
      const moveButton = document.createElement("button");
      moveButton.type = "button";
      moveButton.textContent = "Move pending player";
      moveButton.dataset.pendingActivationMoveLink = prospectId;
      moveButton.className =
        "inline-flex items-center rounded-xl border border-sky-400/30 bg-sky-500/10 px-4 py-2.5 text-sm font-medium text-sky-100 transition hover:bg-sky-500/15 disabled:cursor-not-allowed disabled:opacity-50";
      moveButton.addEventListener("click", () => {
        showMoveModal({ teamId, prospectId, playerName });
      });

      actionsContainer.appendChild(moveButton);
    }

    if (!card.querySelector(`button[data-pending-activation-delete-link="${prospectId}"]`)) {
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
}

export default function PendingActivationDeleteLinks() {
  const pathname = usePathname();

  useEffect(() => {
    if (!pathname.endsWith("/squad")) return;

    addPendingActivationControls(pathname);

    const observer = new MutationObserver(() => addPendingActivationControls(pathname));
    observer.observe(document.body, {
      childList: true,
      subtree: true,
    });

    return () => observer.disconnect();
  }, [pathname]);

  return null;
}
