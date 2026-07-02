// ========================================
// File: src/components/admin/teams/TeamCompetitionPickerBridge.tsx
// ========================================

"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";

type CompetitionOption = {
  id: string;
  name: string;
  slug: string;
  currentLeagueId: string | null;
  currentSeason: string | null;
};

type TeamCompetitionPayload = {
  team?: {
    id: string;
    name: string;
    competitionId: string | null;
    competitionName: string | null;
    currentLeagueId: string | null;
    currentSeason: string | null;
  };
  competitions?: CompetitionOption[];
};

function getTeamIdFromPathname(pathname: string | null) {
  const match = pathname?.match(/^\/admin\/teams\/([^/]+)(?:\/)?$/);
  const value = match?.[1] ?? null;
  return value && value !== "new" ? value : null;
}

function getLeagueField() {
  const select = document.querySelector<HTMLSelectElement>('select[name="leagueId"]');
  return {
    select,
    field: select?.closest("div.space-y-2") as HTMLElement | null,
  };
}

function removeExistingPicker() {
  document.querySelector("[data-admin-team-competition-picker]")?.remove();
}

function optionLabel(option: CompetitionOption) {
  return `${option.name}${option.currentSeason ? ` — ${option.currentSeason}` : ""}`;
}

function renderPicker(input: {
  teamId: string | null;
  leagueSelect: HTMLSelectElement;
  competitions: CompetitionOption[];
  selectedCompetitionId: string | null;
}) {
  const wrapper = document.createElement("div");
  wrapper.dataset.adminTeamCompetitionPicker = "true";
  wrapper.className = "space-y-2";

  const label = document.createElement("div");
  label.className = "text-sm text-white/60";
  label.textContent = "Competition";

  const box = document.createElement("div");
  box.className = "rounded-2xl border border-white/10 bg-black/20 p-3";

  const options = document.createElement("div");
  options.className = "flex flex-wrap gap-2";

  const status = document.createElement("div");
  status.className = "mt-2 text-xs text-white/45";
  status.textContent = "The team belongs to the competition. Seasons and divisions are managed from the season page.";

  function setActive(buttons: HTMLButtonElement[], activeId: string | null) {
    for (const button of buttons) {
      const isActive = button.dataset.competitionId === activeId;
      button.className = isActive
        ? "rounded-xl border border-emerald-400/40 bg-emerald-500/15 px-4 py-2.5 text-sm font-semibold text-emerald-50"
        : "rounded-xl border border-white/10 bg-[#0d1428] px-4 py-2.5 text-sm font-semibold text-white/70 transition hover:border-white/20 hover:text-white";
    }
  }

  const buttons: HTMLButtonElement[] = [];

  for (const competition of input.competitions) {
    const button = document.createElement("button");
    button.type = "button";
    button.dataset.competitionId = competition.id;
    button.textContent = optionLabel(competition);
    buttons.push(button);

    button.addEventListener("click", async () => {
      setActive(buttons, competition.id);
      input.leagueSelect.value = competition.currentLeagueId ?? "";
      input.leagueSelect.dispatchEvent(new Event("change", { bubbles: true }));

      if (!input.teamId) {
        status.className = "mt-2 text-xs text-emerald-200";
        status.textContent = "Competition selected for this new team.";
        return;
      }

      button.disabled = true;
      status.className = "mt-2 text-xs text-emerald-200";
      status.textContent = "Saving competition…";

      const response = await fetch(`/api/admin/teams/${input.teamId}/competition`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ competitionId: competition.id }),
      });
      const payload = (await response.json().catch(() => null)) as {
        error?: string;
        team?: { currentLeagueId: string | null };
      } | null;

      if (!response.ok) {
        button.disabled = false;
        status.className = "mt-2 text-xs text-red-300";
        status.textContent = payload?.error ?? "Competition could not be saved.";
        return;
      }

      input.leagueSelect.value = payload?.team?.currentLeagueId ?? competition.currentLeagueId ?? "";
      status.textContent = "Competition saved.";
      window.location.reload();
    });

    options.appendChild(button);
  }

  setActive(buttons, input.selectedCompetitionId);

  if (input.competitions.length === 0) {
    const empty = document.createElement("div");
    empty.className = "rounded-xl border border-dashed border-white/10 bg-black/20 px-4 py-3 text-sm text-white/55";
    empty.textContent = "No parent competitions exist yet. Create one from the league season page first.";
    options.appendChild(empty);
  }

  box.append(options, status);
  wrapper.append(label, box);
  return wrapper;
}

async function loadCompetitionsForNewTeam(): Promise<TeamCompetitionPayload> {
  const response = await fetch("/api/admin/competitions", { cache: "no-store" });
  if (!response.ok) return { competitions: [] };
  return (await response.json()) as TeamCompetitionPayload;
}

async function injectPicker(pathname: string | null) {
  if (!pathname?.startsWith("/admin/teams/")) {
    removeExistingPicker();
    return;
  }

  const { select, field } = getLeagueField();
  if (!select || !field) return;

  const existing = document.querySelector("[data-admin-team-competition-picker]");
  if (existing?.getAttribute("data-pathname") === pathname) return;

  field.style.display = "none";

  try {
    const teamId = getTeamIdFromPathname(pathname);
    let payload: TeamCompetitionPayload;

    if (teamId) {
      const response = await fetch(`/api/admin/teams/${teamId}/competition`, {
        cache: "no-store",
      });
      if (!response.ok) throw new Error("Could not load team competition.");
      payload = (await response.json()) as TeamCompetitionPayload;
    } else {
      payload = await loadCompetitionsForNewTeam();
    }

    removeExistingPicker();
    const picker = renderPicker({
      teamId,
      leagueSelect: select,
      competitions: payload.competitions ?? [],
      selectedCompetitionId: payload.team?.competitionId ?? null,
    });
    picker.setAttribute("data-pathname", pathname);
    field.insertAdjacentElement("afterend", picker);
  } catch {
    field.style.display = "";
  }
}

export default function TeamCompetitionPickerBridge() {
  const pathname = usePathname();

  useEffect(() => {
    if (!pathname?.startsWith("/admin/teams/")) return;

    let cancelled = false;
    const run = () => {
      if (!cancelled) void injectPicker(pathname);
    };

    const frame = window.requestAnimationFrame(run);
    const timer = window.setTimeout(run, 400);

    return () => {
      cancelled = true;
      window.cancelAnimationFrame(frame);
      window.clearTimeout(timer);
      removeExistingPicker();
      const { field } = getLeagueField();
      if (field) field.style.display = "";
    };
  }, [pathname]);

  return null;
}
