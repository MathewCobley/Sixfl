// ========================================
// File: src/components/captain/CaptainDashboardLeagueTable.tsx
// ========================================

"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import MobileLeagueTable from "@/components/league/MobileLeagueTable";
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

function getCompactMobileTitle(value: string) {
  const compact = value
    .replace(/^Current\s+/i, "")
    .replace(/\s+6 a side table$/i, "")
    .replace(/\s+league table$/i, "")
    .replace(/\s+/g, " ")
    .trim();

  return compact || "Current league";
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
  currentTeamId?: string;
  relatedTeamIds?: string[];
};

function getTeamIdFromCaptainPath() {
  if (typeof window === "undefined") return null;
  const match = window.location.pathname.match(/\/captain\/team\/([^/]+)/);
  return match?.[1] ? decodeURIComponent(match[1]) : null;
}

function TeamBadge({ row, size = 44 }: { row: LeagueTableRow; size?: number }) {
  const logoUrl = normaliseLogoUrl(row.teamLogoUrl);
  const sizeClass = size >= 48 ? "h-12 w-12 rounded-2xl" : "h-10 w-10 rounded-xl";

  return (
    <div className={`relative flex shrink-0 items-center justify-center overflow-hidden border border-white/10 bg-white/[0.04] ${sizeClass}`}>
      {logoUrl ? (
        <Image src={logoUrl} alt={`${row.teamName} badge`} fill sizes={`${size}px`} className="object-contain p-1.5" unoptimized />
      ) : (
        <span className="text-sm font-black text-white/60">{getInitials(row.teamName)}</span>
      )}
    </div>
  );
}

function FormBadges({ row, compact = false }: { row: LeagueTableRow; compact?: boolean }) {
  if (row.recentForm.length === 0) return <span className="text-xs text-white/40">—</span>;

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {row.recentForm.map((result, formIndex) => (
        <span
          key={`${row.teamId}-form-${formIndex}-${compact ? "mobile" : "desktop"}`}
          className={`inline-flex ${compact ? "h-5 w-5 text-[10px]" : "h-6 w-6 text-[11px]"} items-center justify-center rounded-md border font-black ${getFormBadgeClasses(result)}`}
        >
          {result}
        </span>
      ))}
    </div>
  );
}

export default function CaptainDashboardLeagueTable({
  rows,
  title,
  description,
  emptyMessage,
  currentTeamIds: initialCurrentTeamIds = [],
}: {
  rows: LeagueTableRow[];
  title: string;
  description: string;
  emptyMessage: string;
  currentTeamIds?: string[];
}) {
  const [apiTable, setApiTable] = useState<CaptainLeagueTableApiResponse | null>(null);

  useEffect(() => {
    const teamId = getTeamIdFromCaptainPath();
    if (!teamId) return;

    let cancelled = false;

    async function loadDivisionAwareTable(teamIdForRequest: string) {
      try {
        const response = await fetch(`/api/captain/team/${encodeURIComponent(teamIdForRequest)}/league-table`, { cache: "no-store" });
        if (!response.ok) return;
        const payload = (await response.json()) as CaptainLeagueTableApiResponse;
        if (!cancelled) setApiTable(payload);
      } catch {
        // Keep the server-rendered table as a safe fallback.
      }
    }

    void loadDivisionAwareTable(teamId);

    return () => {
      cancelled = true;
    };
  }, []);

  const displayRows = apiTable?.rows ?? rows;
  const displayTitle = apiTable?.title ?? title;
  const displayDescription = apiTable?.description ?? description;
  const currentTeamIds = useMemo(() => {
    return new Set(
      [
        ...initialCurrentTeamIds,
        apiTable?.currentTeamId,
        ...(apiTable?.relatedTeamIds ?? []),
      ].filter((value): value is string => Boolean(value)),
    );
  }, [initialCurrentTeamIds, apiTable?.currentTeamId, apiTable?.relatedTeamIds]);

  return (
    <section id="team-league-table" className="overflow-hidden rounded-3xl border border-white/10 bg-white/[0.03] shadow-[0_0_0_1px_rgba(255,255,255,0.02)]">
      <div className="border-b border-white/10 px-3 py-3 sm:px-8 sm:py-6">
        <div className="lg:hidden">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[10px] font-black uppercase tracking-[0.16em] text-emerald-300/75">
                League table
              </p>
              <h2 className="mt-1 truncate text-lg font-black text-white">{getCompactMobileTitle(displayTitle)}</h2>
            </div>
            <span className="shrink-0 rounded-full border border-white/10 bg-black/20 px-2.5 py-1 text-[10px] font-semibold text-white/45">
              {displayRows.length} teams
            </span>
          </div>
          <p className="mt-1.5 text-[11px] leading-5 text-white/45">
            Tap a team to see its full record and recent form.
          </p>
        </div>

        <div className="hidden lg:block">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-emerald-400 sm:text-sm">Standings</p>
          <h2 className="mt-3 text-2xl font-bold text-white sm:text-3xl">{displayTitle}</h2>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-white/60 sm:text-base">{displayDescription}</p>
        </div>
      </div>

      {displayRows.length > 0 ? (
        <>
          <div className="lg:hidden">
            <MobileLeagueTable
              rows={displayRows}
              currentTeamIds={[...currentTeamIds]}
            />
          </div>

          <div className="hidden w-full overflow-hidden lg:block">
            <div className="grid grid-cols-[48px_minmax(210px,1.9fr)_150px_52px_52px_52px_52px_64px_64px_64px_64px] gap-3 border-b border-white/10 bg-white/[0.02] px-6 py-4 text-xs font-semibold uppercase tracking-[0.18em] text-white/45 xl:grid-cols-[56px_minmax(250px,2fr)_160px_60px_60px_60px_60px_76px_76px_76px_80px] xl:gap-4 xl:px-8">
              <div>Pos</div><div>Team</div><div>Form</div><div className="text-center">P</div><div className="text-center">W</div><div className="text-center">D</div><div className="text-center">L</div><div className="text-center">GF</div><div className="text-center">GA</div><div className="text-center">GD</div><div className="text-center">Pts</div>
            </div>

            <div className="divide-y divide-white/10">
              {displayRows.map((row, index) => {
                const isTop = index === 0;
                const isCurrentTeam = currentTeamIds.has(row.teamId);

                return (
                  <div key={row.teamId} className={`grid grid-cols-[48px_minmax(210px,1.9fr)_150px_52px_52px_52px_52px_64px_64px_64px_64px] items-center gap-3 px-6 py-3 xl:grid-cols-[56px_minmax(250px,2fr)_160px_60px_60px_60px_60px_76px_76px_76px_80px] xl:gap-4 xl:px-8 ${isCurrentTeam ? "bg-emerald-500/[0.07]" : "bg-black/20"}`}>
                    <div><div className={`flex h-9 w-9 items-center justify-center rounded-xl border text-sm font-black ${isTop || isCurrentTeam ? "border-emerald-400/30 bg-emerald-500/10 text-emerald-300" : "border-white/10 bg-white/[0.04] text-white/70"}`}>{index + 1}</div></div>
                    <div className="flex min-w-0 items-center gap-3"><TeamBadge row={row} /><div className="min-w-0 flex-1"><Link href={`/teams/${row.teamId}`} className="block min-w-0 truncate font-semibold leading-5 text-white transition hover:text-emerald-400">{row.teamName}</Link>{isCurrentTeam ? <div className="mt-0.5 text-[11px] font-semibold uppercase tracking-[0.12em] text-emerald-300">Your team</div> : null}</div></div>
                    <FormBadges row={row} />
                    <div className="text-center font-medium text-white/80">{row.played}</div><div className="text-center font-medium text-white/80">{row.won}</div><div className="text-center font-medium text-white/80">{row.drawn}</div><div className="text-center font-medium text-white/80">{row.lost}</div><div className="text-center font-medium text-white/80">{row.goalsFor}</div><div className="text-center font-medium text-white/80">{row.goalsAgainst}</div><div className="text-center font-medium text-white/80">{formatGoalDifference(row.goalDifference)}</div><div className="text-center text-base font-black text-white">{row.points}</div>
                  </div>
                );
              })}
            </div>
          </div>
        </>
      ) : (
        <div className="px-6 py-10 text-sm text-white/55 sm:px-8">{emptyMessage}</div>
      )}
    </section>
  );
}
