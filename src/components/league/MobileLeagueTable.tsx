import Image from "next/image";
import {
  ArrowDownIcon,
  ArrowUpIcon,
} from "@heroicons/react/20/solid";

import type { LeagueFormResult, LeagueTableRow } from "@/lib/leagueTable";

function normaliseLogoUrl(value?: string | null) {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (
    trimmed.startsWith("http://") ||
    trimmed.startsWith("https://") ||
    trimmed.startsWith("/")
  ) {
    return trimmed;
  }
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
    case "W":
      return "border-emerald-400/30 bg-emerald-500/15 text-emerald-200";
    case "D":
      return "border-white/10 bg-white/[0.06] text-white/75";
    case "L":
      return "border-red-400/30 bg-red-500/15 text-red-200";
    default:
      return "border-white/10 bg-white/[0.06] text-white/75";
  }
}

function TeamBadge({ row }: { row: LeagueTableRow }) {
  const logoUrl = normaliseLogoUrl(row.teamLogoUrl);

  return (
    <span className="relative flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-white/10 bg-white/[0.04]">
      {logoUrl ? (
        <Image
          src={logoUrl}
          alt={`${row.teamName} badge`}
          fill
          sizes="36px"
          className="object-contain p-1.5"
          unoptimized
        />
      ) : (
        <span className="text-xs font-black text-white/60">
          {getInitials(row.teamName)}
        </span>
      )}
    </span>
  );
}

function MovementArrow({ movement }: { movement: LeagueTableRow["movement"] }) {
  if (movement === "UP") {
    return (
      <ArrowUpIcon
        aria-label="Moved up since the previous match night"
        className="h-3 w-3 shrink-0 text-emerald-300"
      />
    );
  }

  if (movement === "DOWN") {
    return (
      <ArrowDownIcon
        aria-label="Moved down since the previous match night"
        className="h-3 w-3 shrink-0 text-red-300"
      />
    );
  }

  return null;
}

function MobileStat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-xl border border-white/10 bg-black/25 px-2 py-2 text-center">
      <div className="text-[9px] font-semibold uppercase tracking-[0.12em] text-white/40">
        {label}
      </div>
      <div className="mt-1 text-xs font-black text-white">{value}</div>
    </div>
  );
}

function FormBadges({ row }: { row: LeagueTableRow }) {
  if (row.recentForm.length === 0) {
    return <span className="text-xs text-white/40">—</span>;
  }

  return (
    <div className="flex flex-wrap items-center gap-1">
      {row.recentForm.map((result, formIndex) => (
        <span
          key={`${row.teamId}-form-${formIndex}`}
          className={`inline-flex h-5 w-5 items-center justify-center rounded-md border text-[10px] font-black ${getFormBadgeClasses(result)}`}
        >
          {result}
        </span>
      ))}
    </div>
  );
}

export default function MobileLeagueTable({
  rows,
  currentTeamIds = [],
}: {
  rows: LeagueTableRow[];
  currentTeamIds?: string[];
}) {
  const highlightedTeamIds = new Set(currentTeamIds);

  return (
    <>
      <div className="grid grid-cols-[2.75rem_minmax(0,1fr)_2.15rem_2.75rem_2.75rem] items-center gap-1.5 border-b border-white/[0.07] bg-black/15 px-3 py-2 text-[9px] font-bold uppercase tracking-[0.1em] text-white/35">
        <span className="w-full text-center">Pos</span>
        <span>Team</span>
        <span className="w-full text-center">P</span>
        <span className="w-full text-center">GD</span>
        <span className="w-full text-center">Pts</span>
      </div>

      <div className="divide-y divide-white/[0.07]">
        {rows.map((row, index) => {
          const isTop = index === 0;
          const isCurrentTeam = highlightedTeamIds.has(row.teamId);

          return (
            <details
              key={row.teamId}
              className={`group ${isCurrentTeam ? "bg-emerald-500/[0.08]" : "bg-black/15"}`}
            >
              <summary className="grid min-h-[3.75rem] cursor-pointer list-none grid-cols-[2.75rem_minmax(0,1fr)_2.15rem_2.75rem_2.75rem] items-center gap-1.5 px-3 py-2 [&::-webkit-details-marker]:hidden">
                <span className="flex w-full items-center justify-center gap-0.5">
                  <span
                    className={`flex h-8 min-w-8 items-center justify-center rounded-xl border px-1 text-xs font-black ${
                      isTop || isCurrentTeam
                        ? "border-emerald-400/30 bg-emerald-500/10 text-emerald-200"
                        : "border-white/10 bg-white/[0.035] text-white/65"
                    }`}
                  >
                    {index + 1}
                  </span>
                  <MovementArrow movement={row.movement} />
                </span>

                <span className="flex min-w-0 items-center gap-2">
                  <TeamBadge row={row} />
                  <span className="min-w-0">
                    <span className="block truncate text-[12px] font-black leading-4 text-white">
                      {row.teamName}
                    </span>
                    {isCurrentTeam ? (
                      <span className="mt-0.5 block text-[8px] font-black uppercase tracking-[0.1em] text-emerald-300">
                        Your team
                      </span>
                    ) : null}
                  </span>
                </span>

                <span className="w-full text-center text-xs font-bold tabular-nums text-white/65">
                  {row.played}
                </span>
                <span className="w-full text-center text-xs font-bold tabular-nums text-white/70">
                  {formatGoalDifference(row.goalDifference)}
                </span>
                <span className="w-full text-center text-sm font-black tabular-nums text-emerald-100">
                  {row.points}
                </span>
              </summary>

              <div className="border-t border-white/[0.06] bg-black/20 px-3 pb-3 pt-2.5">
                <div className="grid grid-cols-5 gap-1.5">
                  <MobileStat label="W" value={row.won} />
                  <MobileStat label="D" value={row.drawn} />
                  <MobileStat label="L" value={row.lost} />
                  <MobileStat label="GF" value={row.goalsFor} />
                  <MobileStat label="GA" value={row.goalsAgainst} />
                </div>
                <div className="mt-2 flex items-center justify-between gap-3 rounded-xl border border-white/[0.07] bg-black/20 px-2.5 py-2">
                  <span className="text-[9px] font-bold uppercase tracking-[0.12em] text-white/35">
                    Recent form
                  </span>
                  <FormBadges row={row} />
                </div>
              </div>
            </details>
          );
        })}
      </div>
    </>
  );
}
