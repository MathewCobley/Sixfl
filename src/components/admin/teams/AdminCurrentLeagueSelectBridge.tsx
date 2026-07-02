// ========================================
// File: src/components/admin/teams/AdminCurrentLeagueSelectBridge.tsx
// ========================================

"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";

type CurrentLeague = {
  id: string;
  name: string;
  season: string | null;
  isActive: boolean;
};

function formatLeagueLabel(league: CurrentLeague) {
  return `${league.name}${league.season ? ` — ${league.season}` : ""}${league.isActive ? "" : " (inactive)"}`;
}

function isTeamEditPage(pathname: string | null) {
  return /^\/admin\/teams\/[^/]+\/?$/.test(pathname ?? "");
}

function getLeagueSelects() {
  return Array.from(document.querySelectorAll<HTMLSelectElement>('select[name="leagueId"]'));
}

function getField(select: HTMLSelectElement) {
  return select.closest("div.space-y-2");
}

function replaceEditPageLeagueField(select: HTMLSelectElement, leagues: CurrentLeague[], selectedValue: string) {
  if (select.dataset.sixflCompetitionReadonly === "true") return;

  const field = getField(select);
  if (!field) return;

  const selectedLeague = leagues.find((league) => league.id === selectedValue) ?? null;
  select.dataset.sixflCompetitionReadonly = "true";
  select.classList.add("sr-only");
  select.tabIndex = -1;

  const label = field.querySelector("label");
  if (label) label.textContent = "Competition";

  const existing = field.querySelector("[data-sixfl-competition-readonly]");
  if (existing) return;

  const card = document.createElement("div");
  card.dataset.sixflCompetitionReadonly = "true";
  card.className = "rounded-xl border border-white/10 bg-black/20 px-3 py-3 text-sm text-white";

  const competition = document.createElement("div");
  competition.className = "font-semibold";
  competition.textContent = selectedLeague?.name ?? "Competition not set";

  const help = document.createElement("div");
  help.className = "mt-1 text-xs leading-5 text-white/50";
  help.textContent = selectedLeague?.season
    ? `Current season shown for context: ${selectedLeague.season}. Season participation and division are managed on the league season page.`
    : "Season participation and division are managed on the league season page.";

  card.append(competition, help);
  field.appendChild(card);
}

function rebuildSelect(select: HTMLSelectElement, leagues: CurrentLeague[], selectedValue: string, pathname: string | null) {
  if (select.dataset.sixflCurrentLeagueFiltered === "true") return;

  const noLeagueOption = document.createElement("option");
  noLeagueOption.value = "";
  noLeagueOption.textContent = "No league";

  select.innerHTML = "";
  select.appendChild(noLeagueOption);

  for (const league of leagues) {
    const option = document.createElement("option");
    option.value = league.id;
    option.textContent = formatLeagueLabel(league);
    select.appendChild(option);
  }

  select.value = selectedValue;
  select.dataset.sixflCurrentLeagueFiltered = "true";

  if (isTeamEditPage(pathname)) {
    replaceEditPageLeagueField(select, leagues, selectedValue);
    return;
  }

  const help = document.createElement("div");
  help.dataset.sixflCurrentLeagueHelp = "true";
  help.className = "text-xs text-white/50";
  help.textContent = "Only current competition seasons are shown. Previous seasons stay available in the season archive.";

  const field = getField(select);
  if (field && !field.querySelector("[data-sixfl-current-league-help]")) {
    field.appendChild(help);
  }
}

async function filterLeagueSelects(pathname: string | null) {
  const selects = getLeagueSelects();
  if (selects.length === 0) return;

  for (const select of selects) {
    if (select.dataset.sixflCurrentLeagueFiltered === "true") continue;

    const selectedValue = select.value;
    const response = await fetch(
      `/api/admin/current-leagues${selectedValue ? `?include=${encodeURIComponent(selectedValue)}` : ""}`,
      { cache: "no-store" },
    );

    if (!response.ok) continue;

    const payload = (await response.json()) as { leagues?: CurrentLeague[] };
    rebuildSelect(select, payload.leagues ?? [], selectedValue, pathname);
  }
}

export default function AdminCurrentLeagueSelectBridge() {
  const pathname = usePathname();

  useEffect(() => {
    if (!pathname?.startsWith("/admin/teams")) return;

    let cancelled = false;
    const run = () => {
      if (!cancelled) void filterLeagueSelects(pathname);
    };

    const frame = window.requestAnimationFrame(run);
    const timer = window.setTimeout(run, 400);

    const observer = new MutationObserver(run);
    observer.observe(document.body, { childList: true, subtree: true });

    return () => {
      cancelled = true;
      window.cancelAnimationFrame(frame);
      window.clearTimeout(timer);
      observer.disconnect();
    };
  }, [pathname]);

  return null;
}
