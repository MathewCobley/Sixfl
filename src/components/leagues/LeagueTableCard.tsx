// ========================================
// File: src/components/leagues/LeagueTableCard.tsx
// ========================================

import Image from "next/image";
import Link from "next/link";
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
  const parts = name
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2);

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

function formatOrdinal(value: number) {
  const mod10 = value % 10;
  const mod100 = value % 100;

  if (mod10 === 1 && mod100 !== 11) return `${value}st`;
  if (mod10 === 2 && mod100 !== 12) return `${value}nd`;
  if (mod10 === 3 && mod100 !== 13) return `${value}rd`;
  return `${value}th`;
}

export default function LeagueTableCard({
  rows,
  title = "League table",
  eyebrow = "Standings",
  description,
  emptyMessage = "The league table will appear here once results have been entered.",
  currentTeamId,
  showTeamLinks = true,
  compactHeader = false,
}: {
  rows: LeagueTableRow[];
  title?: string;
  eyebrow?: string;
  description?: string;
  emptyMessage?: string;
  currentTeamId?: string | null;
  showTeamLinks?: boolean;
  compactHeader?: boolean;
}) {
  const currentTeamPosition = currentTeamId
    ? rows.findIndex((row) => row.teamId === currentTeamId)
    : -1;
  const currentTeamRow = currentTeamPosition >= 0 ? rows[currentTeamPosition] : null;

  return (
    <section className="overflow-hidden rounded-3xl border border-white/10 bg-white/[0.04] shadow-[0_24px_80px_rgba(0,0,0,0.2)]">
      <div className="flex flex-col gap-4 border-b border-white/10 px-6 py-5 sm:flex-row sm:items-end sm:justify-between sm:px-8">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-emerald-400">
            {eyebrow}
          </p>
          <h2
            className={[
              "mt-2 font-semibold text-white",
              compactHeader ? "text-xl" : "text-2xl sm:text-3xl",
            ].join(" ")}
          >
            {title}
          </h2>
          {description ? (
            <p className="mt-2 max-w-2xl text-sm leading-6 text-white/55 sm:text-base">
              {description}
            </p>
          ) : null}
        </div>

        {currentTeamRow ? (
          <div className="flex flex-wrap gap-2">
            <span className="rounded-full border border-emerald-400/20 bg-emerald-500/10 px-3 py-1 text-xs font-medium text-emerald-100">
              Your position: {formatOrdinal(currentTeamPosition + 1)}
            </span>
            <span className="rounded-full border border-white/10 bg-black/20 px-3 py-1 text-xs font-medium text-white/75">
              {currentTeamRow.points} pts
            </span>
          </div>
        ) : null}
      </div>

      {rows.length === 0 ? (
        <div className="px-6 py-10 text-sm text-white/55 sm:px-8">
          {emptyMessage}
        </div>
      ) : (
        <div className="lg:overflow-x-auto">
          <div className="lg:min-w-[1240px]">
            <div className="hidden grid-cols-[72px_minmax(280px,2fr)_170px_72px_72px_72px_72px_84px_84px_84px_92px] gap-4 border-b border-white/10 bg-white/[0.02] px-8 py-4 text-xs font-semibold uppercase tracking-[0.18em] text-white/45 lg:grid">
              <div>Pos</div>
              <div>Team</div>
              <div>Form</div>
              <div className="text-center">P</div>
              <div className="text-center">W</div>
              <div className="text-center">D</div>
              <div className="text-center">L</div>
              <div className="text-center">GF</div>
              <div className="text-center">GA</div>
              <div className="text-center">GD</div>
              <div className="text-center">Pts</div>
            </div>

            <div className="divide-y divide-white/10">
              {rows.map((row, index) => {
                const isTop = index === 0;
                const isCurrentTeam = Boolean(currentTeamId && row.teamId === currentTeamId);
                const logoUrl = normaliseLogoUrl(row.teamLogoUrl);

                const mobileTopStats = [
                  { label: "P", value: row.played },
                  { label: "W", value: row.won },
                  { label: "D", value: row.drawn },
                  { label: "L", value: row.lost },
                ];

                const mobileBottomStats = [
                  { label: "GF", value: row.goalsFor },
                  { label: "GA", value: row.goalsAgainst },
                  { label: "GD", value: formatGoalDifference(row.goalDifference) },
                  { label: "PTS", value: row.points },
                ];

                return (
                  <div
                    key={row.teamId}
                    className={[
                      "px-4 py-5 sm:px-6 lg:px-8",
                      isCurrentTeam ? "bg-emerald-500/10" : "bg-black/20",
                    ].join(" ")}
                  >
                    <div className="lg:hidden">
                      <div className="flex items-start gap-4">
                        <div
                          className={[
                            "flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border text-sm font-black",
                            isTop || isCurrentTeam
                              ? "border-emerald-400/30 bg-emerald-500/10 text-emerald-300"
                              : "border-white/10 bg-white/[0.04] text-white/70",
                          ].join(" ")}
                        >
                          {index + 1}
                        </div>

                        <div className="relative flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-white/10 bg-white/[0.04]">
                          {logoUrl ? (
                            <Image
                              src={logoUrl}
                              alt={`${row.teamName} badge`}
                              fill
                              sizes="48px"
                              className="object-contain p-1.5"
                              unoptimized
                            />
                          ) : (
                            <span className="text-sm font-black text-white/60">
                              {getInitials(row.teamName)}
                            </span>
                          )}
                        </div>

                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            {showTeamLinks ? (
                              <Link
                                href={`/teams/${row.teamId}`}
                                className="block text-base font-semibold leading-5 text-white hover:text-emerald-400"
                              >
                                {row.teamName}
                              </Link>
                            ) : (
                              <div className="text-base font-semibold leading-5 text-white">
                                {row.teamName}
                              </div>
                            )}

                            {isCurrentTeam ? (
                              <span className="rounded-full border border-emerald-400/20 bg-emerald-500/10 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-emerald-100">
                                Your team
                              </span>
                            ) : null}
                          </div>

                          <div className="mt-3 flex flex-wrap items-center gap-2">
                            <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-white/45">
                              Form
                            </span>
                            {row.recentForm.length > 0 ? (
                              row.recentForm.map((result, formIndex) => (
                                <span
                                  key={`${row.teamId}-mobile-form-${formIndex}`}
                                  className={`inline-flex h-6 w-6 items-center justify-center rounded-md border text-[11px] font-black ${getFormBadgeClasses(
                                    result,
                                  )}`}
                                >
                                  {result}
                                </span>
                              ))
                            ) : (
                              <span className="text-xs text-white/40">—</span>
                            )}
                          </div>

                          <div className="mt-3 grid grid-cols-4 gap-2">
                            {mobileTopStats.map((stat) => (
                              <div
                                key={`${row.teamId}-${stat.label}`}
                                className="rounded-2xl border border-white/10 bg-white/[0.04] px-2 py-2 text-center"
                              >
                                <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-white/45">
                                  {stat.label}
                                </div>
                                <div className="mt-1 text-sm font-bold text-white">
                                  {stat.value}
                                </div>
                              </div>
                            ))}
                          </div>

                          <div className="mt-2 grid grid-cols-4 gap-2">
                            {mobileBottomStats.map((stat) => (
                              <div
                                key={`${row.teamId}-${stat.label}`}
                                className="rounded-2xl border border-white/10 bg-white/[0.04] px-2 py-2 text-center"
                              >
                                <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-white/45">
                                  {stat.label}
                                </div>
                                <div className="mt-1 text-sm font-bold text-white">
                                  {stat.value}
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="hidden grid-cols-[72px_minmax(280px,2fr)_170px_72px_72px_72px_72px_84px_84px_84px_92px] items-center gap-4 lg:grid">
                      <div>
                        <div
                          className={[
                            "flex h-11 w-11 items-center justify-center rounded-2xl border text-sm font-black",
                            isTop || isCurrentTeam
                              ? "border-emerald-400/30 bg-emerald-500/10 text-emerald-300"
                              : "border-white/10 bg-white/[0.04] text-white/70",
                          ].join(" ")}
                        >
                          {index + 1}
                        </div>
                      </div>

                      <div className="flex min-w-0 items-center gap-4">
                        <div className="relative flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-white/10 bg-white/[0.04]">
                          {logoUrl ? (
                            <Image
                              src={logoUrl}
                              alt={`${row.teamName} badge`}
                              fill
                              sizes="56px"
                              className="object-contain p-2"
                              unoptimized
                            />
                          ) : (
                            <span className="text-base font-black text-white/60">
                              {getInitials(row.teamName)}
                            </span>
                          )}
                        </div>

                        <div className="min-w-0 flex-1">
                          {showTeamLinks ? (
                            <Link
                              href={`/teams/${row.teamId}`}
                              className="block min-w-0 font-semibold leading-5 text-white transition hover:text-emerald-400"
                            >
                              {row.teamName}
                            </Link>
                          ) : (
                            <div className="block min-w-0 font-semibold leading-5 text-white">
                              {row.teamName}
                            </div>
                          )}
                          {isCurrentTeam ? (
                            <div className="mt-1 text-xs font-semibold uppercase tracking-[0.14em] text-emerald-300/80">
                              Your team
                            </div>
                          ) : null}
                        </div>
                      </div>

                      <div className="flex flex-wrap items-center gap-2">
                        {row.recentForm.length > 0 ? (
                          row.recentForm.map((result, formIndex) => (
                            <span
                              key={`${row.teamId}-form-${formIndex}`}
                              className={`inline-flex h-7 w-7 items-center justify-center rounded-md border text-xs font-black ${getFormBadgeClasses(
                                result,
                              )}`}
                            >
                              {result}
                            </span>
                          ))
                        ) : (
                          <span className="text-sm text-white/40">—</span>
                        )}
                      </div>

                      <div className="text-center font-medium text-white/80">{row.played}</div>
                      <div className="text-center font-medium text-white/80">{row.won}</div>
                      <div className="text-center font-medium text-white/80">{row.drawn}</div>
                      <div className="text-center font-medium text-white/80">{row.lost}</div>
                      <div className="text-center font-medium text-white/80">{row.goalsFor}</div>
                      <div className="text-center font-medium text-white/80">{row.goalsAgainst}</div>
                      <div className="text-center font-medium text-white/80">
                        {formatGoalDifference(row.goalDifference)}
                      </div>
                      <div className="text-center text-base font-black text-white">
                        {row.points}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
