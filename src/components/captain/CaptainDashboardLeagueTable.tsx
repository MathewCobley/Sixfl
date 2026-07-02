// ========================================
// File: src/components/captain/CaptainDashboardLeagueTable.tsx
// ========================================

"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";
import type { LeagueFormResult, LeagueTableRow } from "@/lib/leagueTable";

function normaliseLogoUrl(value?: string | null) {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (trimmed.startsWith("http://") || trimmed.startsWith("https://") || trimmed.startsWith("/")) return trimmed;
  return `/${trimmed}`;
}

function getInitials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean).slice(0, 2);
  if (!parts.length) return "?";
  return parts.map((part) => part[0]?.toUpperCase() ?? "").join("");
}

function formatGoalDifference(value: number) {
  return value > 0 ? `+${value}` : `${value}`;
}

function getFormBadgeClasses(result: LeagueFormResult) {
  switch (result) {
    case "W": return "border-emerald-400/30 bg-emerald-500/15 text-emerald-200";
    case "D": return "border-white/10 bg-white/[0.06] text-white/75";
    case "L": return "border-red-400/30 bg-red-500/15 text-red-200";
    default: return "border-white/10 bg-white/[0.06] text-white/75";
  }
}

type CaptainLeagueTableApiResponse = {
  title?: string;
  description?: string;
  rows?: LeagueTableRow[];
};

function getTeamIdFromCaptainPath() {
  if (typeof window === "undefined") return null;
  const match = window.location.pathname.match(/\/captain\/team\/([^/]+)/);
  return match?.[1] ? decodeURIComponent(match[1]) : null;
}

export default function CaptainDashboardLeagueTable({
  rows,
  title,
  description,
  emptyMessage,
}: {
  rows: LeagueTableRow[];
  title: string;
  description: string;
  emptyMessage: string;
}) {
  const [apiTable, setApiTable] = useState<CaptainLeagueTableApiResponse | null>(null);

  useEffect(() => {
    const teamId = getTeamIdFromCaptainPath();
    if (!teamId) return;

    let cancelled = false;

    async function loadDivisionAwareTable() {
      try {
        const response = await fetch(`/api/captain/team/${encodeURIComponent(teamId)}/league-table`, { cache: "no-store" });
        if (!response.ok) return;
        const payload = (await response.json()) as CaptainLeagueTableApiResponse;
        if (!cancelled) setApiTable(payload);
      } catch {
        // Keep the server-rendered table as a safe fallback.
      }
    }

    void loadDivisionAwareTable();

    return () => {
      cancelled = true;
    };
  }, []);

  const displayRows = apiTable?.rows ?? rows;
  const displayTitle = apiTable?.title ?? title;
  const displayDescription = apiTable?.description ?? description;

  return (
    <section id="team-league-table" className="overflow-hidden rounded-3xl border border-white/10 bg-white/[0.03] shadow-[0_0_0_1px_rgba(255,255,255,0.02)]">
      <div className="border-b border-white/10 px-6 py-6 sm:px-8">
        <p className="text-sm font-semibold uppercase tracking-[0.2em] text-emerald-400">Standings</p>
        <h2 className="mt-3 text-2xl font-bold text-white sm:text-3xl">{displayTitle}</h2>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-white/60 sm:text-base">{displayDescription}</p>
      </div>

      {displayRows.length > 0 ? (
        <div className="w-full overflow-hidden">
          <div className="w-full">
            <div className="hidden grid-cols-[48px_minmax(210px,1.9fr)_150px_52px_52px_52px_52px_64px_64px_64px_64px] gap-3 border-b border-white/10 bg-white/[0.02] px-6 py-4 text-xs font-semibold uppercase tracking-[0.18em] text-white/45 lg:grid xl:grid-cols-[56px_minmax(250px,2fr)_160px_60px_60px_60px_60px_76px_76px_76px_80px] xl:gap-4 xl:px-8">
              <div>Pos</div><div>Team</div><div>Form</div><div className="text-center">P</div><div className="text-center">W</div><div className="text-center">D</div><div className="text-center">L</div><div className="text-center">GF</div><div className="text-center">GA</div><div className="text-center">GD</div><div className="text-center">Pts</div>
            </div>

            <div className="divide-y divide-white/10">
              {displayRows.map((row, index) => {
                const logoUrl = normaliseLogoUrl(row.teamLogoUrl);
                const isTop = index === 0;
                const mobileTopStats = [{ label: "P", value: row.played }, { label: "W", value: row.won }, { label: "D", value: row.drawn }, { label: "L", value: row.lost }];
                const mobileBottomStats = [{ label: "GF", value: row.goalsFor }, { label: "GA", value: row.goalsAgainst }, { label: "GD", value: formatGoalDifference(row.goalDifference) }, { label: "PTS", value: row.points }];

                return (
                  <div key={row.teamId} className="bg-black/20 px-4 py-4 sm:px-6 lg:px-6 lg:py-3 xl:px-8">
                    <div className="lg:hidden">
                      <div className="flex items-start gap-4">
                        <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border text-sm font-black ${isTop ? "border-emerald-400/30 bg-emerald-500/10 text-emerald-300" : "border-white/10 bg-white/[0.04] text-white/70"}`}>{index + 1}</div>
                        <div className="relative flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-white/10 bg-white/[0.04]">{logoUrl ? <Image src={logoUrl} alt={`${row.teamName} badge`} fill sizes="48px" className="object-contain p-1.5" unoptimized /> : <span className="text-sm font-black text-white/60">{getInitials(row.teamName)}</span>}</div>
                        <div className="min-w-0 flex-1">
                          <Link href={`/teams/${row.teamId}`} className="block text-base font-semibold leading-5 text-white hover:text-emerald-400">{row.teamName}</Link>
                          <div className="mt-3 flex flex-wrap items-center gap-2"><span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-white/45">Form</span>{row.recentForm.length > 0 ? row.recentForm.map((result, formIndex) => <span key={`${row.teamId}-mobile-form-${formIndex}`} className={`inline-flex h-6 w-6 items-center justify-center rounded-md border text-[11px] font-black ${getFormBadgeClasses(result)}`}>{result}</span>) : <span className="text-xs text-white/40">—</span>}</div>
                          <div className="mt-3 grid grid-cols-4 gap-2">{mobileTopStats.map((stat) => <div key={`${row.teamId}-${stat.label}`} className="rounded-2xl border border-white/10 bg-white/[0.04] px-2 py-2 text-center"><div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-white/45">{stat.label}</div><div className="mt-1 text-sm font-bold text-white">{stat.value}</div></div>)}</div>
                          <div className="mt-2 grid grid-cols-4 gap-2">{mobileBottomStats.map((stat) => <div key={`${row.teamId}-${stat.label}`} className="rounded-2xl border border-white/10 bg-white/[0.04] px-2 py-2 text-center"><div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-white/45">{stat.label}</div><div className="mt-1 text-sm font-bold text-white">{stat.value}</div></div>)}</div>
                        </div>
                      </div>
                    </div>

                    <div className="hidden grid-cols-[48px_minmax(210px,1.9fr)_150px_52px_52px_52px_52px_64px_64px_64px_64px] items-center gap-3 lg:grid xl:grid-cols-[56px_minmax(250px,2fr)_160px_60px_60px_60px_60px_76px_76px_76px_80px] xl:gap-4">
                      <div><div className={`flex h-9 w-9 items-center justify-center rounded-xl border text-sm font-black ${isTop ? "border-emerald-400/30 bg-emerald-500/10 text-emerald-300" : "border-white/10 bg-white/[0.04] text-white/70"}`}>{index + 1}</div></div>
                      <div className="flex min-w-0 items-center gap-3"><div className="relative flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-white/10 bg-white/[0.04]">{logoUrl ? <Image src={logoUrl} alt={`${row.teamName} badge`} fill sizes="40px" className="object-contain p-1.5" unoptimized /> : <span className="text-sm font-black text-white/60">{getInitials(row.teamName)}</span>}</div><div className="min-w-0 flex-1"><Link href={`/teams/${row.teamId}`} className="block min-w-0 truncate font-semibold leading-5 text-white transition hover:text-emerald-400">{row.teamName}</Link></div></div>
                      <div className="flex flex-wrap items-center gap-2">{row.recentForm.length > 0 ? row.recentForm.map((result, formIndex) => <span key={`${row.teamId}-form-${formIndex}`} className={`inline-flex h-6 w-6 items-center justify-center rounded-md border text-[11px] font-black ${getFormBadgeClasses(result)}`}>{result}</span>) : <span className="text-sm text-white/40">—</span>}</div>
                      <div className="text-center font-medium text-white/80">{row.played}</div><div className="text-center font-medium text-white/80">{row.won}</div><div className="text-center font-medium text-white/80">{row.drawn}</div><div className="text-center font-medium text-white/80">{row.lost}</div><div className="text-center font-medium text-white/80">{row.goalsFor}</div><div className="text-center font-medium text-white/80">{row.goalsAgainst}</div><div className="text-center font-medium text-white/80">{formatGoalDifference(row.goalDifference)}</div><div className="text-center text-base font-black text-white">{row.points}</div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      ) : <div className="px-6 py-10 text-sm text-white/55 sm:px-8">{emptyMessage}</div>}
    </section>
  );
}
