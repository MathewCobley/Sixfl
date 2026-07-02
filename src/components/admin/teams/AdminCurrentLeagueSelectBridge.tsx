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

function getLeagueSelects() {
  return Array.from(document.querySelectorAll<HTMLSelectElement>('select[name="leagueId"]'));
}

function rebuildSelect(select: HTMLSelectElement, leagues: CurrentLeague[], selectedValue: string) {
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

  const help = document.createElement("div");
  help.dataset.sixflCurrentLeagueHelp = "true";
  help.className = "text-xs text-white/50";
  help.textContent = "Only current competition seasons are shown. Previous seasons stay available in the season archive.";

  const field = select.closest("div.space-y-2");
  if (field && !field.querySelector("[data-sixfl-current-league-help]")) {
    field.appendChild(help);
  }
}

async function filterLeagueSelects() {
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
    rebuildSelect(select, payload.leagues ?? [], selectedValue);
  }
}

export default function AdminCurrentLeagueSelectBridge() {
  const pathname = usePathname();

  useEffect(() => {
    if (!pathname?.startsWith("/admin/teams")) return;

    let cancelled = false;
    const run = () => {
      if (!cancelled) void filterLeagueSelects();
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
