// ========================================
// File: src/components/captain/CaptainCurrentLeagueTableBridge.tsx
// ========================================

"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";

import CaptainOutstandingBalanceBridge from "@/components/captain/CaptainOutstandingBalanceBridge";

type LeagueTableRow = {
  teamId: string;
  teamName: string;
  teamLogoUrl: string | null;
  played: number;
  won: number;
  drawn: number;
  lost: number;
  goalsFor: number;
  goalsAgainst: number;
  goalDifference: number;
  points: number;
  recentForm: Array<"W" | "D" | "L">;
};

type LeagueTablePayload = {
  title: string;
  description: string;
  rows: LeagueTableRow[];
  currentTeamId: string;
  leagueId: string | null;
  leagueName?: string | null;
  leagueSeason?: string | null;
  divisionId: string | null;
  divisionName: string | null;
};

function getTeamIdFromPathname(pathname: string | null) {
  const match = pathname?.match(/^\/captain\/team\/([^/]+)/);
  return match?.[1] ?? null;
}

function escapeHtml(value: string | number | null | undefined) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function getFormClasses(result: "W" | "D" | "L") {
  switch (result) {
    case "W":
      return "border-emerald-400/30 bg-emerald-500/20 text-emerald-100";
    case "D":
      return "border-white/15 bg-white/10 text-white/75";
    default:
      return "border-red-400/30 bg-red-500/20 text-red-100";
  }
}

function formatGoalDifference(value: number) {
  return value > 0 ? `+${value}` : String(value);
}

function getInitials(name: string) {
  return (
    name
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase() ?? "")
      .join("") || "?"
  );
}

function renderForm(form: LeagueTableRow["recentForm"]) {
  if (form.length === 0) return `<span class="text-white/35">—</span>`;

  return form
    .map(
      (result) =>
        `<span class="inline-flex h-6 w-6 items-center justify-center rounded-md border text-[10px] font-black ${getFormClasses(result)}">${result}</span>`,
    )
    .join("");
}

function renderLogo(row: LeagueTableRow) {
  if (row.teamLogoUrl) {
    return `<span class="relative inline-flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-white/10 bg-white/[0.04]"><img src="${escapeHtml(row.teamLogoUrl)}" alt="" class="h-full w-full object-contain p-1" /></span>`;
  }

  return `<span class="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-white/[0.04] text-xs font-black text-white/60">${escapeHtml(getInitials(row.teamName))}</span>`;
}

function renderTable(payload: LeagueTablePayload) {
  const rows = payload.rows
    .map((row, index) => {
      const isCurrentTeam = row.teamId === payload.currentTeamId;
      return `
        <tr class="border-t border-white/10 ${isCurrentTeam ? "bg-emerald-500/[0.07]" : ""}">
          <td class="px-5 py-4 text-sm font-black text-emerald-300">${index + 1}</td>
          <td class="px-5 py-4">
            <div class="flex min-w-0 items-center gap-3">
              ${renderLogo(row)}
              <div class="min-w-0">
                <div class="truncate text-sm font-black text-white">${escapeHtml(row.teamName)}</div>
                ${isCurrentTeam ? `<div class="mt-0.5 text-[11px] font-semibold uppercase tracking-[0.12em] text-emerald-300/80">Your team</div>` : ""}
              </div>
            </div>
          </td>
          <td class="hidden px-5 py-4 md:table-cell"><div class="flex gap-1.5">${renderForm(row.recentForm)}</div></td>
          <td class="px-5 py-4 text-center text-sm text-white/80">${row.played}</td>
          <td class="hidden px-5 py-4 text-center text-sm text-white/80 sm:table-cell">${row.won}</td>
          <td class="hidden px-5 py-4 text-center text-sm text-white/80 sm:table-cell">${row.drawn}</td>
          <td class="hidden px-5 py-4 text-center text-sm text-white/80 sm:table-cell">${row.lost}</td>
          <td class="hidden px-5 py-4 text-center text-sm text-white/80 lg:table-cell">${row.goalsFor}</td>
          <td class="hidden px-5 py-4 text-center text-sm text-white/80 lg:table-cell">${row.goalsAgainst}</td>
          <td class="px-5 py-4 text-center text-sm text-white/80">${formatGoalDifference(row.goalDifference)}</td>
          <td class="px-5 py-4 text-center text-base font-black text-white">${row.points}</td>
        </tr>
      `;
    })
    .join("");

  const divisionBadge = payload.divisionName
    ? `<span class="rounded-full border border-sky-400/30 bg-sky-500/10 px-3 py-1 text-xs font-semibold text-sky-100">${escapeHtml(payload.divisionName)}</span>`
    : "";
  const seasonBadge = payload.leagueSeason
    ? `<span class="rounded-full border border-emerald-400/30 bg-emerald-500/10 px-3 py-1 text-xs font-semibold text-emerald-100">${escapeHtml(payload.leagueSeason)}</span>`
    : "";

  return `
    <section class="overflow-hidden rounded-3xl border border-white/10 bg-white/[0.04]" data-captain-current-table="true">
      <div class="border-b border-white/10 px-6 py-6">
        <div class="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p class="text-[11px] font-semibold uppercase tracking-[0.24em] text-emerald-300/80">Standings</p>
            <h2 class="mt-3 text-2xl font-black tracking-tight text-white sm:text-3xl">${escapeHtml(payload.title)}</h2>
            <p class="mt-3 max-w-3xl text-sm leading-6 text-white/60">${escapeHtml(payload.description)}</p>
          </div>
          <div class="flex flex-wrap gap-2">${seasonBadge}${divisionBadge}</div>
        </div>
      </div>
      <div class="overflow-x-auto">
        <table class="w-full min-w-[840px] border-collapse text-left">
          <thead class="bg-white/[0.04] text-[10px] uppercase tracking-[0.18em] text-white/45">
            <tr>
              <th class="px-5 py-3">Pos</th>
              <th class="px-5 py-3">Team</th>
              <th class="hidden px-5 py-3 md:table-cell">Form</th>
              <th class="px-5 py-3 text-center">P</th>
              <th class="hidden px-5 py-3 text-center sm:table-cell">W</th>
              <th class="hidden px-5 py-3 text-center sm:table-cell">D</th>
              <th class="hidden px-5 py-3 text-center sm:table-cell">L</th>
              <th class="hidden px-5 py-3 text-center lg:table-cell">GF</th>
              <th class="hidden px-5 py-3 text-center lg:table-cell">GA</th>
              <th class="px-5 py-3 text-center">GD</th>
              <th class="px-5 py-3 text-center">Pts</th>
            </tr>
          </thead>
          <tbody>${rows || `<tr><td colspan="11" class="px-6 py-10 text-sm text-white/55">The league table will appear here once fixtures have been played.</td></tr>`}</tbody>
        </table>
      </div>
    </section>
  `;
}

async function refreshCaptainTable(pathname: string | null) {
  const teamId = getTeamIdFromPathname(pathname);
  const target = document.getElementById("captain-league-table");

  if (!teamId || !target || target.dataset.currentSeasonTableLoaded === teamId) return;

  try {
    const response = await fetch(`/api/captain/team/${encodeURIComponent(teamId)}/league-table`, {
      cache: "no-store",
    });

    if (!response.ok) return;

    const payload = (await response.json()) as LeagueTablePayload;
    target.innerHTML = renderTable(payload);
    target.dataset.currentSeasonTableLoaded = teamId;
  } catch {
    // Keep the server-rendered table if this enhancement fails.
  }
}

export default function CaptainCurrentLeagueTableBridge() {
  const pathname = usePathname();

  useEffect(() => {
    if (!pathname?.startsWith("/captain/team/")) return;

    const frame = window.requestAnimationFrame(() => {
      void refreshCaptainTable(pathname);
    });
    const timer = window.setTimeout(() => {
      void refreshCaptainTable(pathname);
    }, 500);

    return () => {
      window.cancelAnimationFrame(frame);
      window.clearTimeout(timer);
    };
  }, [pathname]);

  return <CaptainOutstandingBalanceBridge />;
}
