// ========================================
// File: src/components/captain/ManagedSquadEditLinks.tsx
// ========================================

"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";

type MoveTeamData = {
  targetTeams: Array<{
    id: string;
    name: string;
    teamMode?: string | null;
    league: { name: string; season: string | null } | null;
  }>;
};

const moveTeamClassName =
  "inline-flex w-full items-center justify-center whitespace-nowrap rounded-xl border border-sky-400/30 bg-sky-500/10 px-4 py-2.5 text-center text-sm font-medium text-sky-100 transition hover:bg-sky-500/15";

const moveToProspectsClassName =
  "inline-flex w-full items-center justify-center whitespace-nowrap rounded-xl border border-amber-400/30 bg-amber-500/10 px-4 py-2.5 text-center text-sm font-medium text-amber-100 transition hover:bg-amber-500/15";

const removeDuplicateClassName =
  "inline-flex w-full items-center justify-center whitespace-nowrap rounded-xl border border-orange-400/30 bg-orange-500/10 px-4 py-2.5 text-center text-sm font-medium text-orange-100 transition hover:bg-orange-500/15";

function getTeamIdFromPathname(pathname: string) {
  const match = pathname.match(/\/captain\/team\/([^/]+)\/squad(?:\/)?$/);
  return match?.[1] ?? null;
}

function getTeamLabel(team: MoveTeamData["targetTeams"][number]) {
  const leagueLabel = team.league?.name
    ? `${team.league.name}${team.league.season ? ` · ${team.league.season}` : ""}`
    : "No league assigned";

  return `${team.name} — ${leagueLabel}`;
}

function normaliseSquadRowLayout(row: HTMLElement | null) {
  if (!row) return;

  const useDesktopLayout = window.matchMedia("(min-width: 1280px)").matches;

  row.classList.remove("xl:flex-row", "xl:items-start", "xl:justify-between");
  row.style.display = "grid";
  row.style.gridTemplateColumns = useDesktopLayout
    ? "minmax(0, 1fr) 22rem"
    : "minmax(0, 1fr)";
  row.style.gap = "1.25rem";
  row.style.alignItems = "start";
  row.style.width = "100%";

  const firstChild = row.firstElementChild;
  if (firstChild instanceof HTMLElement) {
    firstChild.style.minWidth = "0";
    firstChild.style.maxWidth = "100%";
  }
}

function normaliseActionLayout(actionsContainer: HTMLElement) {
  actionsContainer.className =
    "grid w-full min-w-0 grid-cols-1 gap-2 sm:grid-cols-2 xl:w-[22rem] xl:max-w-[22rem] xl:shrink-0";
  actionsContainer.style.display = "grid";
  actionsContainer.style.gridTemplateColumns = "repeat(2, minmax(0, 1fr))";
  actionsContainer.style.gap = "0.5rem";
  actionsContainer.style.width = "min(22rem, 100%)";
  actionsContainer.style.maxWidth = "22rem";
  actionsContainer.style.minWidth = "0";
  actionsContainer.style.alignItems = "stretch";

  for (const form of Array.from(actionsContainer.querySelectorAll("form"))) {
    const hasRoleSelect = Boolean(form.querySelector('[name="role"]'));

    if (hasRoleSelect) {
      form.className = "grid w-full min-w-0 grid-cols-1 gap-2 sm:col-span-2 sm:grid-cols-[minmax(0,1fr)_auto]";
      form.style.gridColumn = "1 / -1";
      form.style.display = "grid";
      form.style.gridTemplateColumns = "minmax(0, 1fr) auto";
      form.style.gap = "0.5rem";
      form.style.minWidth = "0";

      const selectWrapper = form.querySelector("div");
      if (selectWrapper instanceof HTMLElement) {
        selectWrapper.className = "min-w-0";
        selectWrapper.style.minWidth = "0";
      }
    } else {
      form.className = "w-full";
      form.style.gridColumn = "auto";
      form.style.minWidth = "0";
    }
  }

  for (const control of Array.from(
    actionsContainer.querySelectorAll<HTMLElement>("a, button"),
  )) {
    control.classList.add("w-full", "justify-center", "text-center");
    control.classList.remove("sm:w-auto", "shrink-0");
    control.style.width = "100%";
    control.style.minWidth = "0";
    control.style.minHeight = "2.75rem";
    control.style.whiteSpace = "normal";
    control.style.lineHeight = "1.15";
  }
}

function getRemoveForm(actionsContainer: HTMLElement, roleForm: HTMLFormElement) {
  return Array.from(actionsContainer.querySelectorAll<HTMLFormElement>("form")).find(
    (candidate) =>
      candidate !== roleForm &&
      Boolean(candidate.querySelector('input[name="membershipId"]')) &&
      !candidate.querySelector('[name="role"]'),
  );
}

function removeMoveTeamPicker() {
  document.querySelector("[data-squad-move-team-picker]")?.remove();
}

function showMoveTeamPicker(input: {
  teamId: string;
  membershipId: string;
  playerName: string;
}) {
  removeMoveTeamPicker();

  const overlay = document.createElement("div");
  overlay.dataset.squadMoveTeamPicker = "true";
  overlay.className =
    "fixed inset-0 z-[9999] flex items-center justify-center bg-black/75 px-4 py-6 backdrop-blur-sm";

  const panel = document.createElement("div");
  panel.className =
    "flex max-h-[88vh] w-full max-w-2xl flex-col overflow-hidden rounded-3xl border border-sky-400/20 bg-[#07130f] text-white shadow-2xl";

  const header = document.createElement("div");
  header.className = "border-b border-white/10 p-5";
  header.innerHTML = `
    <p class="text-[11px] font-semibold uppercase tracking-[0.22em] text-sky-100/70">Move team</p>
    <h2 class="mt-2 text-2xl font-semibold tracking-tight text-white">Move ${input.playerName}</h2>
    <p class="mt-2 text-sm leading-6 text-sky-100/70">Choose the team this player should be moved into. They will be removed from the current squad.</p>
  `;

  const searchWrap = document.createElement("div");
  searchWrap.className = "border-b border-white/10 p-4";

  const search = document.createElement("input");
  search.type = "search";
  search.placeholder = "Search teams…";
  search.className =
    "w-full rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-sm text-white outline-none transition placeholder:text-white/35 focus:border-sky-400/50";
  searchWrap.appendChild(search);

  const status = document.createElement("div");
  status.className = "px-5 py-4 text-sm text-white/60";
  status.textContent = "Loading teams…";

  const list = document.createElement("div");
  list.className = "grid max-h-[52vh] gap-2 overflow-y-auto p-4 sixfl-mobile-scroll";

  const footer = document.createElement("div");
  footer.className = "flex justify-end border-t border-white/10 p-4";

  const cancel = document.createElement("button");
  cancel.type = "button";
  cancel.textContent = "Cancel";
  cancel.className =
    "inline-flex items-center justify-center rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm font-medium text-white/80 transition hover:bg-white/10";
  cancel.addEventListener("click", removeMoveTeamPicker);
  footer.appendChild(cancel);

  panel.append(header, searchWrap, status, list, footer);
  overlay.appendChild(panel);
  document.body.appendChild(overlay);

  overlay.addEventListener("click", (event) => {
    if (event.target === overlay) removeMoveTeamPicker();
  });

  function renderTeams(teams: MoveTeamData["targetTeams"], query = "") {
    list.innerHTML = "";

    const normalisedQuery = query.trim().toLowerCase();
    const filteredTeams = normalisedQuery
      ? teams.filter((team) => getTeamLabel(team).toLowerCase().includes(normalisedQuery))
      : teams;

    if (filteredTeams.length === 0) {
      status.textContent = "No matching teams found.";
      return;
    }

    status.textContent = `${filteredTeams.length} team${filteredTeams.length === 1 ? "" : "s"} available`;

    for (const team of filteredTeams) {
      const button = document.createElement("button");
      button.type = "button";
      button.className =
        "flex w-full items-center justify-between gap-3 rounded-2xl border border-white/10 bg-black/25 px-4 py-3 text-left text-sm text-white transition hover:border-sky-400/35 hover:bg-sky-500/10";

      const leagueLabel = team.league?.name
        ? `${team.league.name}${team.league.season ? ` · ${team.league.season}` : ""}`
        : "No league assigned";

      button.innerHTML = `
        <span class="min-w-0">
          <span class="block truncate font-semibold text-white">${team.name}</span>
          <span class="mt-1 block truncate text-xs text-white/45">${leagueLabel}${team.teamMode ? ` · ${team.teamMode}` : ""}</span>
        </span>
        <span class="shrink-0 rounded-xl border border-sky-400/25 bg-sky-500/10 px-3 py-1.5 text-xs font-semibold text-sky-100">Move</span>
      `;

      button.addEventListener("click", async () => {
        const confirmed = window.confirm(`Move ${input.playerName} to ${team.name}?`);
        if (!confirmed) return;

        button.disabled = true;
        status.className = "px-5 py-4 text-sm text-sky-100";
        status.textContent = "Moving player…";

        try {
          const response = await fetch(`/api/captain/team/${input.teamId}/move-managed-player`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              type: "squad",
              itemId: input.membershipId,
              targetTeamId: team.id,
            }),
          });

          const payload = (await response.json().catch(() => null)) as { error?: string } | null;

          if (!response.ok) {
            throw new Error(payload?.error ?? "Player could not be moved.");
          }

          window.location.reload();
        } catch (error) {
          button.disabled = false;
          status.className = "px-5 py-4 text-sm text-red-100";
          status.textContent = error instanceof Error ? error.message : "Player could not be moved.";
        }
      });

      list.appendChild(button);
    }
  }

  fetch(`/api/captain/team/${input.teamId}/move-managed-player?type=squad`, {
    cache: "no-store",
  })
    .then(async (response) => {
      if (!response.ok) throw new Error("Could not load teams.");
      return (await response.json()) as MoveTeamData;
    })
    .then((data) => {
      renderTeams(data.targetTeams);
      search.addEventListener("input", () => renderTeams(data.targetTeams, search.value));
      search.focus();
    })
    .catch((error) => {
      status.className = "px-5 py-4 text-sm text-red-100";
      status.textContent = error instanceof Error ? error.message : "Could not load teams.";
    });
}

async function movePlayerToProspects(input: {
  teamId: string;
  membershipId: string;
  playerName: string;
  button: HTMLButtonElement;
}) {
  const confirmed = window.confirm(
    `Move ${input.playerName} to the player pool? This removes them from the active squad but keeps their details available for another suitable team.`,
  );

  if (!confirmed) return;

  const originalText = input.button.textContent ?? "Move to player pool";
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
      throw new Error(payload?.error ?? "Player could not be moved to the player pool.");
    }

    window.location.href = "/admin/player-prospects";
  } catch (error) {
    input.button.disabled = false;
    input.button.textContent = originalText;
    window.alert(error instanceof Error ? error.message : "Player could not be moved to the player pool.");
  }
}

async function markPlayerNotInterested(input: {
  teamId: string;
  membershipId: string;
  playerName: string;
  button: HTMLButtonElement;
}) {
  const confirmed = window.confirm(
    `Mark ${input.playerName} as not interested? This removes them from the squad but keeps them in the Player Prospects not interested list.`,
  );

  if (!confirmed) return;

  const originalText = input.button.textContent ?? "Not interested";
  input.button.disabled = true;
  input.button.textContent = "Saving…";

  try {
    const response = await fetch(
      `/api/captain/team/${input.teamId}/mark-player-not-interested`,
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
      throw new Error(payload?.error ?? "Player could not be marked as not interested.");
    }

    window.location.href = "/admin/player-prospects#not-interested";
  } catch (error) {
    input.button.disabled = false;
    input.button.textContent = originalText;
    window.alert(error instanceof Error ? error.message : "Player could not be marked as not interested.");
  }
}

async function markPlayerDuplicate(input: {
  teamId: string;
  membershipId: string;
  playerName: string;
  button: HTMLButtonElement;
}) {
  const confirmed = window.confirm(
    `Remove ${input.playerName} as a duplicate? This removes them from the squad and keeps the record in the duplicated prospects section.`,
  );

  if (!confirmed) return;

  const originalText = input.button.textContent ?? "Remove duplicate";
  input.button.disabled = true;
  input.button.textContent = "Removing…";

  try {
    const response = await fetch(
      `/api/captain/team/${input.teamId}/mark-player-duplicate`,
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
      throw new Error(payload?.error ?? "Player could not be marked as a duplicate.");
    }

    window.location.reload();
  } catch (error) {
    input.button.disabled = false;
    input.button.textContent = originalText;
    window.alert(error instanceof Error ? error.message : "Player could not be marked as a duplicate.");
  }
}

function wireNotInterestedForm(input: {
  teamId: string;
  membershipId: string;
  playerName: string;
  actionsContainer: HTMLElement;
  roleForm: HTMLFormElement;
}) {
  const removeForm = getRemoveForm(input.actionsContainer, input.roleForm);

  if (!removeForm) return;

  const button = removeForm.querySelector<HTMLButtonElement>('button[type="submit"]');
  if (!button) return;

  button.textContent = "Not interested";
  button.dataset.squadNotInterestedLink = input.membershipId;

  if (removeForm.dataset.squadNotInterestedWired === input.membershipId) return;

  removeForm.dataset.squadNotInterestedWired = input.membershipId;
  removeForm.addEventListener("submit", (event) => {
    event.preventDefault();
    void markPlayerNotInterested({
      teamId: input.teamId,
      membershipId: input.membershipId,
      playerName: input.playerName,
      button,
    });
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
    .filter(
      (form) =>
        Boolean(form.querySelector('input[name="teamid"]')) &&
        Boolean(form.querySelector('[name="role"]')),
    );

  for (const form of roleForms) {
    const membershipId = form
      .querySelector<HTMLInputElement>('input[name="membershipId"]')
      ?.value.trim();

    if (!membershipId) continue;

    const actionsContainer = form.parentElement;
    if (!(actionsContainer instanceof HTMLElement)) continue;

    const row = actionsContainer.closest("div[class*='px-6'][class*='py-5']") ??
      actionsContainer.closest("div[class*='flex']");
    normaliseSquadRowLayout(row instanceof HTMLElement ? row : null);

    const playerName =
      row?.querySelector(".truncate.text-base.font-semibold.text-white")?.textContent?.trim() ||
      "this player";

    const removeForm = getRemoveForm(actionsContainer, form);

    const existingMoveTeamButton = actionsContainer.querySelector(
      `button[data-managed-squad-move-team-link="${membershipId}"]`,
    );

    if (!existingMoveTeamButton) {
      const moveTeamButton = document.createElement("button");
      moveTeamButton.type = "button";
      moveTeamButton.textContent = "Move team";
      moveTeamButton.dataset.managedSquadMoveTeamLink = membershipId;
      moveTeamButton.className = moveTeamClassName;
      moveTeamButton.addEventListener("click", () => {
        showMoveTeamPicker({ teamId, membershipId, playerName });
      });

      actionsContainer.insertBefore(moveTeamButton, removeForm ?? null);
    }

    const existingMoveToProspectsButton = actionsContainer.querySelector(
      `button[data-managed-squad-move-to-prospects-link="${membershipId}"]`,
    );

    if (!existingMoveToProspectsButton) {
      const moveButton = document.createElement("button");
      moveButton.type = "button";
      moveButton.textContent = "Move to player pool";
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

      actionsContainer.insertBefore(moveButton, removeForm ?? null);
    }

    const existingDuplicateButton = actionsContainer.querySelector(
      `button[data-managed-squad-duplicate-link="${membershipId}"]`,
    );

    if (!existingDuplicateButton) {
      const duplicateButton = document.createElement("button");
      duplicateButton.type = "button";
      duplicateButton.textContent = "Remove duplicate";
      duplicateButton.dataset.managedSquadDuplicateLink = membershipId;
      duplicateButton.className = removeDuplicateClassName;
      duplicateButton.addEventListener("click", () => {
        void markPlayerDuplicate({
          teamId,
          membershipId,
          playerName,
          button: duplicateButton,
        });
      });

      actionsContainer.insertBefore(duplicateButton, removeForm ?? null);
    }

    wireNotInterestedForm({
      teamId,
      membershipId,
      playerName,
      actionsContainer,
      roleForm: form,
    });

    normaliseActionLayout(actionsContainer);
  }
}

export default function ManagedSquadEditLinks() {
  const pathname = usePathname();

  useEffect(() => {
    let cancelled = false;

    const run = () => {
      if (!cancelled) addManagedSquadEditLinks(pathname);
    };

    const frame = window.requestAnimationFrame(run);
    window.addEventListener("resize", run);

    return () => {
      cancelled = true;
      window.cancelAnimationFrame(frame);
      window.removeEventListener("resize", run);
    };
  }, [pathname]);

  return null;
}
