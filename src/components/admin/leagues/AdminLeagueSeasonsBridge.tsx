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
  button.className = "inline-flex items-center justify-center rounded-xl border border-emerald-400/30 bg-emerald-500/10 px-4 py-2.5 text-sm font-semibold text-emerald-100 transition hover:bg-emerald-500/15";
  button.textContent = label;
  return button;
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
    ? "This league is grouped under a parent competition, so previous seasons can stay visible while a new season is created."
    : "Create a parent competition before starting a new season. This preserves the old league table and results as a separate season.";

  copy.append(title, description);
  header.appendChild(copy);
  panel.appendChild(header);

  if (!input.summary.competition) {
    const button = createButton("Create parent competition");
    button.addEventListener("click", async () => {
      button.disabled = true;
      button.textContent = "Creating…";
      await fetch(`/api/admin/leagues/${input.leagueId}/competition`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "ensureCompetition" }),
      });
      window.location.reload();
    });

    header.appendChild(button);
    return panel;
  }

  const currentName = document.createElement("div");
  currentName.className = "mt-5 rounded-2xl border border-white/10 bg-black/20 p-4 text-sm text-white/70";
  currentName.innerHTML = `<span class="font-semibold text-white">Parent competition:</span> ${input.summary.competition.name}`;
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
      badge.textContent = season.isCurrent ? "Current season" : "Previous season";

      row.append(left, badge);
      seasons.appendChild(row);
    }
  }

  panel.appendChild(seasons);

  const form = document.createElement("div");
  form.className = "mt-5 rounded-2xl border border-white/10 bg-black/20 p-4";

  const formTitle = document.createElement("div");
  formTitle.className = "text-sm font-semibold text-white";
  formTitle.textContent = "Create next season";

  const formGrid = document.createElement("div");
  formGrid.className = "mt-3 grid gap-3 md:grid-cols-[1fr_auto] md:items-end";

  const inputWrap = document.createElement("label");
  inputWrap.className = "space-y-2 text-sm text-white/60";
  const inputLabel = document.createElement("span");
  inputLabel.textContent = "New season name";
  const input = document.createElement("input");
  input.type = "text";
  input.placeholder = "Summer 2026";
  input.className = "w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2.5 text-white outline-none focus:border-emerald-400/50";
  inputWrap.append(inputLabel, input);

  const create = createButton("Create season");
  create.addEventListener("click", async () => {
    const seasonName = input.value.trim();
    if (!seasonName) {
      input.focus();
      return;
    }

    create.disabled = true;
    create.textContent = "Creating…";

    const response = await fetch(`/api/admin/leagues/${input.summary?.leagueId ?? input}/competition`);
  });

  const copyTeams = document.createElement("label");
  copyTeams.className = "mt-4 flex items-start gap-3 text-sm text-white/70";
  const checkbox = document.createElement("input");
  checkbox.type = "checkbox";
  checkbox.checked = true;
  checkbox.className = "mt-1";
  const checkboxText = document.createElement("span");
  checkboxText.textContent = "Copy teams and division assignments into the new season. Fixtures and results are not copied.";
  copyTeams.append(checkbox, checkboxText);

  create.replaceWith(create);
  create.addEventListener("click", async () => {
    const seasonName = input.value.trim();
    if (!seasonName) {
      input.focus();
      return;
    }

    create.disabled = true;
    create.textContent = "Creating…";

    const response = await fetch(`/api/admin/leagues/${input.closest("[data-admin-league-seasons-panel]")?.getAttribute("data-league-id")}/competition`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "createSeason",
        seasonName,
        copyTeams: checkbox.checked,
      }),
    });

    const payload = (await response.json().catch(() => null)) as {
      leagueId?: string;
      error?: string;
    } | null;

    if (!response.ok || !payload?.leagueId) {
      create.disabled = false;
      create.textContent = payload?.error ?? "Could not create season";
      create.className = "inline-flex items-center justify-center rounded-xl border border-red-400/30 bg-red-500/10 px-4 py-2.5 text-sm font-semibold text-red-100";
      return;
    }

    window.location.href = `/admin/leagues/${payload.leagueId}`;
  });

  formGrid.append(inputWrap, create);
  form.append(formTitle, formGrid, copyTeams);
  panel.appendChild(form);

  return panel;
}

async function injectPanel(pathname: string | null) {
  const leagueId = getLeagueIdFromPathname(pathname);
  if (!leagueId) {
    removeExistingPanel();
    return;
  }

  const existing = document.querySelector("[data-admin-league-seasons-panel]");
  if (existing?.getAttribute("data-league-id") === leagueId) return;

  const target = Array.from(document.querySelectorAll("h2")).find(
    (heading) => heading.textContent?.trim() === "Divisions",
  )?.closest("div.rounded-3xl");

  if (!target) return;

  try {
    const response = await fetch(`/api/admin/leagues/${leagueId}/competition`, {
      cache: "no-store",
    });
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
    const run = () => {
      if (!cancelled) void injectPanel(pathname);
    };

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
