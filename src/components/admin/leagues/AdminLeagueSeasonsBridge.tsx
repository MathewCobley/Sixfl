// ========================================
// File: src/components/admin/leagues/AdminLeagueSeasonsBridge.tsx
// ========================================

"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";

type CompetitionSummary = {
  competition: {
    id: string;
    name: string;
    slug: string;
    currentLeagueId: string | null;
  } | null;
  seasons: Array<{
    id: string;
    name: string;
    slug: string;
    season: string | null;
    isActive: boolean;
    publicAt?: string | null;
    teamCount: number;
    fixtureCount: number;
    completedFixtureCount: number;
    isCurrent: boolean;
  }>;
};

function getLeagueIdFromPathname(pathname: string | null) {
  const match = pathname?.match(/^\/admin\/leagues\/([^/]+)(?:\/)?$/);
  return match?.[1] ?? null;
}

function removeExistingPanel() {
  document.querySelector("[data-admin-league-seasons-panel]")?.remove();
}

function createButton(label: string) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "inline-flex items-center justify-center rounded-xl border border-emerald-400/30 bg-emerald-500/10 px-4 py-2.5 text-sm font-semibold text-emerald-100 transition hover:bg-emerald-500/15 disabled:cursor-not-allowed disabled:opacity-50";
  button.textContent = label;
  return button;
}

function isPublicNow(season: CompetitionSummary["seasons"][number]) {
  const timestamp = season.publicAt ? Date.parse(season.publicAt) : NaN;
  return season.isActive && Number.isFinite(timestamp) && timestamp <= Date.now();
}

function visibilityLabel(season: CompetitionSummary["seasons"][number]) {
  if (!season.isActive) return "Inactive";
  if (!season.publicAt) return "Private draft";
  if (!isPublicNow(season)) return "Scheduled · not public yet";
  return "Public";
}

async function submitSeasonAction(leagueId: string, body: Record<string, unknown>) {
  const response = await fetch(`/api/admin/leagues/${encodeURIComponent(leagueId)}/competition`, {
    method: "POST",
    credentials: "same-origin",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const payload = (await response.json().catch(() => null)) as { leagueId?: string; error?: string } | null;
  if (!response.ok || !payload) throw new Error(payload?.error || "The season could not be updated. Please try again.");
  return payload;
}

function createPanel(input: { leagueId: string; summary: CompetitionSummary }) {
  const panel = document.createElement("section");
  panel.dataset.adminLeagueSeasonsPanel = "true";
  panel.dataset.leagueId = input.leagueId;
  panel.className = "rounded-3xl border border-sky-400/20 bg-sky-500/[0.06] p-6 md:p-8";

  const header = document.createElement("div");
  header.className = "flex flex-col gap-4 md:flex-row md:items-start md:justify-between";

  const copy = document.createElement("div");
  const title = document.createElement("h2");
  title.className = "text-lg font-semibold text-white";
  title.textContent = "Competition seasons";

  const description = document.createElement("p");
  description.className = "mt-1 text-sm text-white/60";
  description.textContent = input.summary.competition
    ? "Prepare the next season privately while the current season stays live. Switching seasons is a separate confirmed action."
    : "Create a parent competition before starting a new season. This preserves the old league table and results as a separate season.";

  copy.append(title, description);
  header.appendChild(copy);
  panel.appendChild(header);

  if (!input.summary.competition) {
    const button = createButton("Create parent competition");
    button.addEventListener("click", async () => {
      button.disabled = true;
      button.textContent = "Creating…";
      try {
        await submitSeasonAction(input.leagueId, { action: "ensureCompetition" });
        window.location.reload();
      } catch (error) {
        button.disabled = false;
        button.textContent = error instanceof Error ? error.message : "Could not create competition";
      }
    });
    header.appendChild(button);
    return panel;
  }

  const currentName = document.createElement("div");
  currentName.className = "mt-5 rounded-2xl border border-white/10 bg-black/20 p-4 text-sm text-white/70";
  const currentSeason = input.summary.seasons.find((season) => season.isCurrent);
  currentName.textContent = `Parent competition: ${input.summary.competition.name} · Current season: ${currentSeason?.season || currentSeason?.name || "Not set"}`;
  panel.appendChild(currentName);

  const seasons = document.createElement("div");
  seasons.className = "mt-5 grid gap-3";

  if (input.summary.seasons.length === 0) {
    const empty = document.createElement("div");
    empty.className = "rounded-2xl border border-dashed border-white/10 bg-black/20 p-4 text-sm text-white/60";
    empty.textContent = "No seasons are linked yet.";
    seasons.appendChild(empty);
  } else {
    for (const season of input.summary.seasons) {
      const row = document.createElement("a");
      row.href = `/admin/leagues/${season.id}`;
      row.className = "flex flex-col gap-2 rounded-2xl border border-white/10 bg-black/20 p-4 transition hover:border-sky-400/30 hover:bg-white/[0.04] sm:flex-row sm:items-center sm:justify-between";

      const left = document.createElement("div");
      const name = document.createElement("div");
      name.className = "font-semibold text-white";
      name.textContent = season.season || season.name;

      const meta = document.createElement("div");
      meta.className = "mt-1 text-xs text-white/45";
      meta.textContent = `${season.teamCount} teams · ${season.fixtureCount} fixtures · ${season.completedFixtureCount} results`;
      left.append(name, meta);

      const badge = document.createElement("span");
      badge.className = season.isCurrent
        ? "rounded-full border border-emerald-400/30 bg-emerald-500/15 px-3 py-1 text-xs font-semibold text-emerald-100"
        : "rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-xs text-white/60";
      badge.textContent = season.isCurrent
        ? `Current season · ${visibilityLabel(season)}`
        : `${visibilityLabel(season)} · not current`;

      row.append(left, badge);
      seasons.appendChild(row);
    }
  }
  panel.appendChild(seasons);

  const viewedSeason = input.summary.seasons.find((season) => season.id === input.leagueId);
  if (viewedSeason && !viewedSeason.isCurrent) {
    const switchPanel = document.createElement("div");
    switchPanel.className = "mt-5 rounded-2xl border border-amber-400/20 bg-amber-500/[0.05] p-4";
    const switchCopy = document.createElement("p");
    switchCopy.className = "text-sm leading-6 text-white/70";
    switchCopy.textContent = "Keep Public go-live blank while preparing. When ready, save a go-live time that has arrived, then make this the current season here. Setting a date alone does not switch seasons. Fixtures remain unpublished until you publish them separately.";
    const switchButton = createButton("Make current season");
    switchButton.classList.add("mt-3");
    switchButton.disabled = !isPublicNow(viewedSeason);
    const status = document.createElement("p");
    status.className = "mt-2 text-sm text-amber-100";
    status.setAttribute("role", "status");
    if (switchButton.disabled) status.textContent = "Available once this season is active and its Public go-live time has arrived. Save the settings, then refresh this panel.";
    switchButton.addEventListener("click", async () => {
      if (!window.confirm(`Make ${viewedSeason.season || viewedSeason.name} the current season instead of ${currentSeason?.season || currentSeason?.name || "the existing selection"}? Team dashboards will switch to this season. Previous results and payment history will be kept. This does not publish fixtures or send messages.`)) return;
      switchButton.disabled = true;
      status.textContent = "Switching current season…";
      try {
        await submitSeasonAction(input.leagueId, {
          action: "makeCurrent",
          confirmed: true,
          expectedCurrentLeagueId: input.summary.competition?.currentLeagueId ?? null,
        });
        window.location.reload();
      } catch (error) {
        switchButton.disabled = false;
        status.textContent = error instanceof Error ? error.message : "Could not switch season";
      }
    });
    switchPanel.append(switchCopy, switchButton, status);
    panel.appendChild(switchPanel);
  }

  const form = document.createElement("div");
  form.className = "mt-5 rounded-2xl border border-white/10 bg-black/20 p-4";
  const formTitle = document.createElement("div");
  formTitle.className = "text-sm font-semibold text-white";
  formTitle.textContent = "Create next season privately";
  const helper = document.createElement("p");
  helper.className = "mt-2 text-sm leading-6 text-white/60";
  helper.textContent = "The new season starts private with no go-live date. The current season, its table and team dashboards stay unchanged. Keep any new fixtures in draft while organising teams and divisions.";

  const formGrid = document.createElement("div");
  formGrid.className = "mt-3 grid gap-3 md:grid-cols-[1fr_auto] md:items-end";
  const inputWrap = document.createElement("label");
  inputWrap.className = "space-y-2 text-sm text-white/60";
  const inputLabel = document.createElement("span");
  inputLabel.textContent = "New season name";
  const seasonInput = document.createElement("input");
  seasonInput.type = "text";
  seasonInput.placeholder = "Winter 2026/27";
  seasonInput.className = "w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2.5 text-white outline-none focus:border-emerald-400/50";
  inputWrap.append(inputLabel, seasonInput);

  const create = createButton("Create private season");
  const copyTeams = document.createElement("label");
  copyTeams.className = "mt-4 flex items-start gap-3 text-sm text-white/70";
  const checkbox = document.createElement("input");
  checkbox.type = "checkbox";
  checkbox.checked = true;
  checkbox.className = "mt-1";
  const checkboxText = document.createElement("span");
  checkboxText.textContent = "Copy teams and division assignments into the new season. Fixtures and results are not copied.";
  copyTeams.append(checkbox, checkboxText);
  const createStatus = document.createElement("p");
  createStatus.className = "mt-2 text-sm text-red-200";
  createStatus.setAttribute("role", "status");

  create.addEventListener("click", async () => {
    const seasonName = seasonInput.value.trim();
    if (!seasonName) { seasonInput.focus(); return; }
    create.disabled = true;
    create.textContent = "Creating…";
    createStatus.textContent = "";
    try {
      const payload = await submitSeasonAction(input.leagueId, {
        action: "createSeason", seasonName, copyTeams: checkbox.checked,
      });
      if (!payload.leagueId) throw new Error("The new season could not be opened. Refresh before trying again.");
      window.location.href = `/admin/leagues/${payload.leagueId}`;
    } catch (error) {
      create.disabled = false;
      create.textContent = "Create private season";
      createStatus.textContent = error instanceof Error ? error.message : "Could not create season";
    }
  });

  formGrid.append(inputWrap, create);
  form.append(formTitle, helper, formGrid, copyTeams, createStatus);
  panel.appendChild(form);
  return panel;
}

async function injectPanel(pathname: string | null) {
  const leagueId = getLeagueIdFromPathname(pathname);
  if (!leagueId) { removeExistingPanel(); return; }
  const existing = document.querySelector("[data-admin-league-seasons-panel]");
  if (existing?.getAttribute("data-league-id") === leagueId) return;
  const target = Array.from(document.querySelectorAll("h2")).find(
    (heading) => heading.textContent?.trim() === "Divisions",
  )?.closest("div.rounded-3xl");
  if (!target) return;
  try {
    const response = await fetch(`/api/admin/leagues/${leagueId}/competition`, { cache: "no-store" });
    if (!response.ok) return;
    const summary = (await response.json()) as CompetitionSummary;
    removeExistingPanel();
    const panel = createPanel({ leagueId, summary });
    target.insertAdjacentElement("beforebegin", panel);
  } catch {
    // Keep the league admin page usable if this enhancement cannot load.
  }
}

export default function AdminLeagueSeasonsBridge() {
  const pathname = usePathname();
  useEffect(() => {
    if (!pathname?.startsWith("/admin/leagues/")) return;
    let cancelled = false;
    const run = () => { if (!cancelled) void injectPanel(pathname); };
    const frame = window.requestAnimationFrame(run);
    const timer = window.setTimeout(run, 400);
    return () => {
      cancelled = true;
      window.cancelAnimationFrame(frame);
      window.clearTimeout(timer);
      removeExistingPanel();
    };
  }, [pathname]);
  return null;
}
