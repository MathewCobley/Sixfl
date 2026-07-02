// ========================================
// File: src/components/admin/teams/TeamDivisionPickerBridge.tsx
// ========================================

"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";

type TeamDivisionData = {
  team: {
    id: string;
    leagueId: string | null;
    divisionId: string | null;
  };
  divisions: Array<{
    id: string;
    leagueId: string;
    name: string;
    slug: string;
    sortOrder: number;
    leagueName: string;
    leagueSeason: string | null;
  }>;
};

const fieldClassName = "space-y-2";
const labelClassName = "text-sm text-white/60";
const selectClassName = "w-full rounded-xl border border-white/10 bg-black/20 px-3 py-2.5 text-white outline-none transition focus:border-emerald-500/60";
const helpClassName = "text-xs text-white/50";
const buttonClassName = "rounded-xl border border-emerald-400/30 bg-emerald-500/10 px-4 py-2.5 text-sm font-medium text-emerald-100 transition hover:bg-emerald-500/15";

function getTeamIdFromPathname(pathname: string | null) {
  const match = pathname?.match(/^\/admin\/teams\/([^/]+)(?:\/)?$/);
  return match?.[1] ?? null;
}

function getLeagueField() {
  const leagueSelect = document.querySelector<HTMLSelectElement>('select[name="leagueId"]');
  return leagueSelect?.closest("div.space-y-2") ?? null;
}

function removeExistingPicker() {
  document.querySelector("[data-admin-team-division-picker]")?.remove();
}

function buildPicker(input: {
  teamId: string;
  data: TeamDivisionData;
}) {
  const wrapper = document.createElement("div");
  wrapper.dataset.adminTeamDivisionPicker = "true";
  wrapper.className = fieldClassName;

  const label = document.createElement("label");
  label.className = labelClassName;
  label.textContent = "Division";

  const controlRow = document.createElement("div");
  controlRow.className = "grid gap-2 sm:grid-cols-[1fr_auto]";

  const select = document.createElement("select");
  select.className = selectClassName;

  const noDivision = document.createElement("option");
  noDivision.value = "";
  noDivision.textContent = input.data.team.leagueId
    ? "No division"
    : "Choose a league first";
  select.appendChild(noDivision);

  for (const division of input.data.divisions) {
    const option = document.createElement("option");
    option.value = division.id;
    option.textContent = division.name;
    select.appendChild(option);
  }

  select.value = input.data.team.divisionId ?? "";

  const button = document.createElement("button");
  button.type = "button";
  button.className = buttonClassName;
  button.textContent = "Save division";

  const help = document.createElement("div");
  help.className = helpClassName;
  help.textContent = input.data.divisions.length > 0
    ? "Assign this team to Premiership or Championship. If you change the league above, save the team first, then choose the division."
    : "No divisions are set up for this team’s current league yet. Add them on the league page first.";

  const status = document.createElement("div");
  status.className = "text-xs text-white/45";

  button.addEventListener("click", async () => {
    button.disabled = true;
    button.textContent = "Saving…";
    status.className = "text-xs text-emerald-200";
    status.textContent = "Saving division…";

    try {
      const response = await fetch(`/api/admin/teams/${input.teamId}/division`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ divisionId: select.value }),
      });
      const payload = (await response.json().catch(() => null)) as { error?: string } | null;

      if (!response.ok) {
        throw new Error(payload?.error ?? "Division could not be saved.");
      }

      status.textContent = "Division saved.";
      window.location.reload();
    } catch (error) {
      button.disabled = false;
      button.textContent = "Save division";
      status.className = "text-xs text-red-300";
      status.textContent = error instanceof Error ? error.message : "Division could not be saved.";
    }
  });

  controlRow.append(select, button);
  wrapper.append(label, controlRow, help, status);
  return wrapper;
}

async function injectDivisionPicker(pathname: string | null) {
  const teamId = getTeamIdFromPathname(pathname);
  if (!teamId) {
    removeExistingPicker();
    return;
  }

  const leagueField = getLeagueField();
  if (!leagueField) return;

  const existing = document.querySelector("[data-admin-team-division-picker]");
  if (existing?.getAttribute("data-team-id") === teamId) return;

  try {
    const response = await fetch(`/api/admin/teams/${teamId}/division`, {
      cache: "no-store",
    });
    if (!response.ok) return;

    const data = (await response.json()) as TeamDivisionData;
    removeExistingPicker();
    const picker = buildPicker({ teamId, data });
    picker.setAttribute("data-team-id", teamId);
    leagueField.insertAdjacentElement("afterend", picker);
  } catch {
    // Leave the normal team page untouched if the division helper cannot load.
  }
}

export default function TeamDivisionPickerBridge() {
  const pathname = usePathname();

  useEffect(() => {
    if (!pathname?.startsWith("/admin/teams/")) return;

    let cancelled = false;

    const run = () => {
      if (!cancelled) void injectDivisionPicker(pathname);
    };

    const frame = window.requestAnimationFrame(run);
    const timer = window.setTimeout(run, 350);

    return () => {
      cancelled = true;
      window.cancelAnimationFrame(frame);
      window.clearTimeout(timer);
      removeExistingPicker();
    };
  }, [pathname]);

  return null;
}
