// ========================================
// File: src/app/(admin)/admin/fixtures/unavailable/page.tsx
// ========================================

import Link from "next/link";

import AdminCard from "@/components/admin/AdminCard";
import { formatDateTimeInLondon } from "@/lib/datetime/london";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/requireAdmin";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type SearchParams = {
  leagueId?: string | string[];
  round?: string | string[];
};

type AvailabilityIssue = {
  id: string;
  fixtureId: string;
  teamId: string;
  note: string | null;
  issueRaisedAt: Date | null;
  lastChasedAt: Date | null;
  team: {
    id: string;
    name: string;
    contactName: string | null;
    contactEmail: string | null;
    contactPhone: string | null;
    secondaryContactName: string | null;
    secondaryContactEmail: string | null;
    secondaryContactPhone: string | null;
  };
  confirmedByUser: {
    name: string | null;
    email: string | null;
  } | null;
  fixture: {
    id: string;
    leagueId: string;
    kickoffAt: Date;
    round: number | null;
    pitch: string | null;
    status: string;
    publishedAt: Date | null;
    league: {
      name: string;
      season: string | null;
    };
    homeTeam: {
      id: string;
      name: string;
    };
    awayTeam: {
      id: string;
      name: string;
    };
    venue: {
      name: string;
    } | null;
  };
};

type WeekSummary = {
  key: string;
  round: number | null;
  label: string;
  helper: string;
  earliestKickoff: Date;
  issueCount: number;
  teamCount: number;
  fixtureCount: number;
  issues: AvailabilityIssue[];
};

function getSearchParamValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] ?? null : value ?? null;
}

function parseRound(value: string | null) {
  if (!value) return null;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) return null;
  return parsed;
}

function formatCount(value: number, singular: string, plural = `${singular}s`) {
  return `${value} ${value === 1 ? singular : plural}`;
}

function formatKickoff(value: Date) {
  return formatDateTimeInLondon(value, {
    weekday: "short",
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatShortDate(value: Date) {
  return formatDateTimeInLondon(value, {
    weekday: "short",
    day: "2-digit",
    month: "short",
  });
}

function formatStamp(value: Date | null) {
  if (!value) return "Not recorded";

  return formatDateTimeInLondon(value, {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatLeague(league: { name: string; season: string | null }) {
  return league.season ? `${league.name} · ${league.season}` : league.name;
}

function buildBoardUrl(input: { leagueId?: string | null; round?: number | null }) {
  const params = new URLSearchParams();
  if (input.leagueId) params.set("leagueId", input.leagueId);
  if (typeof input.round === "number") params.set("round", String(input.round));

  const query = params.toString();
  return `/admin/fixtures/unavailable${query ? `?${query}` : ""}`;
}

function getIssueWeekKey(issue: AvailabilityIssue) {
  if (typeof issue.fixture.round === "number") return `round-${issue.fixture.round}`;
  return `date-${issue.fixture.kickoffAt.toISOString().slice(0, 10)}`;
}

function getIssueWeekLabel(issue: AvailabilityIssue) {
  if (typeof issue.fixture.round === "number") return `Week ${issue.fixture.round}`;
  return formatShortDate(issue.fixture.kickoffAt);
}

function sortIssuesByKickoff(a: AvailabilityIssue, b: AvailabilityIssue) {
  const kickoffDifference = a.fixture.kickoffAt.getTime() - b.fixture.kickoffAt.getTime();
  if (kickoffDifference !== 0) return kickoffDifference;

  const raisedA = a.issueRaisedAt?.getTime() ?? 0;
  const raisedB = b.issueRaisedAt?.getTime() ?? 0;
  return raisedB - raisedA;
}

function buildWeekSummaries(issues: AvailabilityIssue[]): WeekSummary[] {
  const map = new Map<
    string,
    {
      key: string;
      round: number | null;
      label: string;
      earliestKickoff: Date;
      issues: AvailabilityIssue[];
      teamIds: Set<string>;
      fixtureIds: Set<string>;
    }
  >();

  for (const issue of issues) {
    const key = getIssueWeekKey(issue);
    const current = map.get(key);

    if (!current) {
      map.set(key, {
        key,
        round: issue.fixture.round,
        label: getIssueWeekLabel(issue),
        earliestKickoff: issue.fixture.kickoffAt,
        issues: [issue],
        teamIds: new Set([issue.teamId]),
        fixtureIds: new Set([issue.fixtureId]),
      });
      continue;
    }

    current.issues.push(issue);
    current.teamIds.add(issue.teamId);
    current.fixtureIds.add(issue.fixtureId);
    if (issue.fixture.kickoffAt < current.earliestKickoff) {
      current.earliestKickoff = issue.fixture.kickoffAt;
    }
  }

  return Array.from(map.values())
    .map((summary) => ({
      key: summary.key,
      round: summary.round,
      label: summary.label,
      earliestKickoff: summary.earliestKickoff,
      helper: `${formatShortDate(summary.earliestKickoff)} · ${formatCount(
        summary.teamIds.size,
        "team",
      )} · ${formatCount(summary.fixtureIds.size, "fixture")}`,
      issueCount: summary.issues.length,
      teamCount: summary.teamIds.size,
      fixtureCount: summary.fixtureIds.size,
      issues: [...summary.issues].sort(sortIssuesByKickoff),
    }))
    .sort((a, b) => {
      if (a.round !== null && b.round !== null && a.round !== b.round) {
        return a.round - b.round;
      }
      const dateDifference = a.earliestKickoff.getTime() - b.earliestKickoff.getTime();
      if (dateDifference !== 0) return dateDifference;
      return a.label.localeCompare(b.label);
    });
}

function getOpponentLabel(issue: AvailabilityIssue) {
  const teamIsHome = issue.fixture.homeTeam.id === issue.teamId;
  return teamIsHome ? issue.fixture.awayTeam.name : issue.fixture.homeTeam.name;
}

function getIssueManager(issue: AvailabilityIssue) {
  return issue.confirmedByUser?.name ?? issue.confirmedByUser?.email ?? "Captain";
}

export default async function AdminTeamUnavailabilityPage({
  searchParams,
}: {
  searchParams?: Promise<SearchParams>;
}) {
  await requireAdmin();

  const sp = (await searchParams) ?? {};
  const requestedLeagueId = getSearchParamValue(sp.leagueId);
  const selectedRound = parseRound(getSearchParamValue(sp.round));

  const leagues = await prisma.league.findMany({
    orderBy: [{ isActive: "desc" }, { name: "asc" }, { season: "asc" }],
    select: {
      id: true,
      name: true,
      season: true,
    },
  });

  const selectedLeagueId = leagues.some((league) => league.id === requestedLeagueId)
    ? requestedLeagueId
    : null;

  const baseIssues: AvailabilityIssue[] = await prisma.fixtureCaptainConfirmation.findMany({
    where: {
      status: "ISSUE_RAISED",
      fixture: selectedLeagueId ? { leagueId: selectedLeagueId } : undefined,
    },
    orderBy: [{ issueRaisedAt: "desc" }, { updatedAt: "desc" }],
    select: {
      id: true,
      fixtureId: true,
      teamId: true,
      note: true,
      issueRaisedAt: true,
      lastChasedAt: true,
      team: {
        select: {
          id: true,
          name: true,
          contactName: true,
          contactEmail: true,
          contactPhone: true,
          secondaryContactName: true,
          secondaryContactEmail: true,
          secondaryContactPhone: true,
        },
      },
      confirmedByUser: {
        select: {
          name: true,
          email: true,
        },
      },
      fixture: {
        select: {
          id: true,
          leagueId: true,
          kickoffAt: true,
          round: true,
          pitch: true,
          status: true,
          publishedAt: true,
          league: {
            select: {
              name: true,
              season: true,
            },
          },
          homeTeam: { select: { id: true, name: true } },
          awayTeam: { select: { id: true, name: true } },
          venue: { select: { name: true } },
        },
      },
    },
  });

  const sortedBaseIssues = [...baseIssues].sort(sortIssuesByKickoff);
  const allWeekSummaries = buildWeekSummaries(sortedBaseIssues);
  const visibleIssues = selectedRound
    ? sortedBaseIssues.filter((issue) => issue.fixture.round === selectedRound)
    : sortedBaseIssues;
  const visibleWeekSummaries = buildWeekSummaries(visibleIssues);
  const selectedLeagueLabel = selectedLeagueId
    ? formatLeague(leagues.find((league) => league.id === selectedLeagueId) ?? { name: "Selected league", season: null })
    : "All leagues";
  const selectedWeekLabel = selectedRound ? `Week ${selectedRound}` : "All weeks";
  const affectedTeams = new Set(visibleIssues.map((issue) => issue.teamId)).size;
  const affectedFixtures = new Set(visibleIssues.map((issue) => issue.fixtureId)).size;

  return (
    <div className="mx-auto max-w-7xl space-y-8 px-4 pb-10 pt-6 sm:px-6 lg:px-8">
      <div className="overflow-hidden rounded-3xl border border-amber-400/20 bg-[radial-gradient(circle_at_top_left,rgba(245,158,11,0.18),transparent_34%),linear-gradient(180deg,rgba(255,255,255,0.06),rgba(255,255,255,0.03))] p-6 shadow-[0_24px_80px_rgba(0,0,0,0.34)] md:p-8">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <div className="inline-flex rounded-full border border-amber-400/25 bg-amber-400/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.22em] text-amber-100">
              Team availability
            </div>
            <h1 className="mt-4 text-3xl font-semibold tracking-tight text-white md:text-4xl">
              Teams that can’t field a side
            </h1>
            <p className="mt-3 max-w-3xl text-sm leading-6 text-white/60 md:text-base">
              Shows every open captain fixture issue grouped by matchweek, so you can see at a glance which teams need help before a given week of fixtures.
            </p>
          </div>

          <div className="flex flex-wrap gap-3">
            <Link
              href="/admin/fixtures/issues"
              className="inline-flex h-11 items-center justify-center rounded-xl border border-amber-400/25 bg-amber-400/10 px-4 text-sm font-semibold text-amber-50 transition hover:bg-amber-400/15"
            >
              Reply to issues
            </Link>
            <Link
              href="/admin/fixtures"
              className="inline-flex h-11 items-center justify-center rounded-xl border border-white/10 bg-white/[0.05] px-4 text-sm font-semibold text-white/80 transition hover:bg-white/[0.08]"
            >
              Back to fixtures
            </Link>
          </div>
        </div>
      </div>

      <AdminCard className="rounded-3xl border border-white/10 bg-white/[0.03] p-5 shadow-[0_24px_80px_rgba(0,0,0,0.32)] md:p-6">
        <div className="space-y-5">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h2 className="text-xl font-semibold text-white">Week filter</h2>
              <p className="mt-1 text-sm text-white/55">
                Current view: {selectedLeagueLabel} · {selectedWeekLabel}
              </p>
            </div>
            <Link
              href="/admin/fixtures/unavailable"
              className="inline-flex h-10 items-center rounded-xl border border-white/10 bg-white/[0.04] px-3 text-xs font-semibold text-white/65 transition hover:bg-white/[0.08]"
            >
              Reset filters
            </Link>
          </div>

          <div className="space-y-3">
            <div className="text-[11px] font-semibold uppercase tracking-[0.2em] text-white/35">Leagues</div>
            <div className="flex flex-wrap gap-2">
              <Link
                href={buildBoardUrl({ round: selectedRound })}
                className={[
                  "inline-flex h-10 items-center rounded-xl border px-3 text-xs font-semibold transition",
                  !selectedLeagueId
                    ? "border-emerald-400/30 bg-emerald-400/10 text-emerald-100"
                    : "border-white/10 bg-white/[0.04] text-white/65 hover:bg-white/[0.08]",
                ].join(" ")}
              >
                All leagues
              </Link>
              {leagues.map((league) => (
                <Link
                  key={league.id}
                  href={buildBoardUrl({ leagueId: league.id, round: selectedRound })}
                  className={[
                    "inline-flex h-10 items-center rounded-xl border px-3 text-xs font-semibold transition",
                    selectedLeagueId === league.id
                      ? "border-emerald-400/30 bg-emerald-400/10 text-emerald-100"
                      : "border-white/10 bg-white/[0.04] text-white/65 hover:bg-white/[0.08]",
                  ].join(" ")}
                >
                  {formatLeague(league)}
                </Link>
              ))}
            </div>
          </div>

          <div className="space-y-3">
            <div className="text-[11px] font-semibold uppercase tracking-[0.2em] text-white/35">Weeks with issues</div>
            <div className="flex flex-wrap gap-2">
              <Link
                href={buildBoardUrl({ leagueId: selectedLeagueId })}
                className={[
                  "inline-flex h-10 items-center rounded-xl border px-3 text-xs font-semibold transition",
                  !selectedRound
                    ? "border-emerald-400/30 bg-emerald-400/10 text-emerald-100"
                    : "border-white/10 bg-white/[0.04] text-white/65 hover:bg-white/[0.08]",
                ].join(" ")}
              >
                All weeks
              </Link>
              {allWeekSummaries.map((week) =>
                typeof week.round === "number" ? (
                  <Link
                    key={week.key}
                    href={buildBoardUrl({ leagueId: selectedLeagueId, round: week.round })}
                    className={[
                      "inline-flex h-10 items-center rounded-xl border px-3 text-xs font-semibold transition",
                      selectedRound === week.round
                        ? "border-emerald-400/30 bg-emerald-400/10 text-emerald-100"
                        : "border-white/10 bg-white/[0.04] text-white/65 hover:bg-white/[0.08]",
                    ].join(" ")}
                  >
                    {week.label}
                    <span className="ml-2 rounded-full bg-white/10 px-2 py-0.5 text-[10px] text-white/70">
                      {week.teamCount}
                    </span>
                  </Link>
                ) : null,
              )}
            </div>
          </div>
        </div>
      </AdminCard>

      <div className="grid gap-4 md:grid-cols-3">
        <AdminCard className="rounded-3xl border border-white/10 bg-white/[0.03] p-5">
          <div className="text-[11px] font-semibold uppercase tracking-[0.2em] text-white/35">Teams flagged</div>
          <div className="mt-3 text-3xl font-semibold text-white">{affectedTeams}</div>
          <p className="mt-2 text-sm text-white/50">Unique teams with an open fixture issue.</p>
        </AdminCard>
        <AdminCard className="rounded-3xl border border-white/10 bg-white/[0.03] p-5">
          <div className="text-[11px] font-semibold uppercase tracking-[0.2em] text-white/35">Fixtures affected</div>
          <div className="mt-3 text-3xl font-semibold text-white">{affectedFixtures}</div>
          <p className="mt-2 text-sm text-white/50">Fixtures needing a decision or support.</p>
        </AdminCard>
        <AdminCard className="rounded-3xl border border-white/10 bg-white/[0.03] p-5">
          <div className="text-[11px] font-semibold uppercase tracking-[0.2em] text-white/35">Open notes</div>
          <div className="mt-3 text-3xl font-semibold text-white">{visibleIssues.length}</div>
          <p className="mt-2 text-sm text-white/50">Captain issue notes in this view.</p>
        </AdminCard>
      </div>

      {visibleIssues.length === 0 ? (
        <div className="rounded-3xl border border-dashed border-white/10 bg-black/20 p-12 text-center">
          <h2 className="text-xl font-semibold text-white">No teams flagged for this view</h2>
          <p className="mt-2 text-sm leading-6 text-white/55">
            When a captain raises a fixture issue, it will appear here under the relevant matchweek.
          </p>
        </div>
      ) : (
        <div className="space-y-6">
          {visibleWeekSummaries.map((week) => (
            <section key={week.key} className="space-y-4">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
                <div>
                  <h2 className="text-2xl font-semibold tracking-tight text-white">{week.label}</h2>
                  <p className="mt-1 text-sm text-white/50">{week.helper}</p>
                </div>
                {typeof week.round === "number" ? (
                  <Link
                    href={buildBoardUrl({ leagueId: selectedLeagueId, round: week.round })}
                    className="text-sm font-semibold text-emerald-200 transition hover:text-emerald-100"
                  >
                    Focus this week
                  </Link>
                ) : null}
              </div>

              <div className="grid gap-4">
                {week.issues.map((issue) => (
                  <AdminCard
                    key={issue.id}
                    className="overflow-hidden rounded-3xl border border-amber-400/20 bg-[radial-gradient(circle_at_top_left,rgba(245,158,11,0.12),transparent_28%),rgba(255,255,255,0.03)] p-0"
                  >
                    <div className="grid gap-0 lg:grid-cols-[minmax(0,1fr)_320px]">
                      <div className="space-y-4 p-5 md:p-6">
                        <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                          <div>
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="inline-flex rounded-xl border border-amber-400/30 bg-amber-400/15 px-3 py-1.5 text-sm font-semibold text-amber-50">
                                {issue.team.name}
                              </span>
                              <span className="inline-flex rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-xs font-semibold text-white/60">
                                {formatLeague(issue.fixture.league)}
                              </span>
                              <span className="inline-flex rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-xs font-semibold text-white/60">
                                {issue.fixture.status.toLowerCase()}
                              </span>
                            </div>
                            <h3 className="mt-3 text-xl font-semibold tracking-tight text-white">
                              vs {getOpponentLabel(issue)}
                            </h3>
                            <p className="mt-2 text-sm leading-6 text-white/55">
                              {formatKickoff(issue.fixture.kickoffAt)}
                              {issue.fixture.venue?.name ? ` · ${issue.fixture.venue.name}` : ""}
                              {issue.fixture.pitch ? ` · ${issue.fixture.pitch}` : ""}
                            </p>
                          </div>
                          <div className="text-sm text-white/45 md:text-right">
                            <div>Raised by {getIssueManager(issue)}</div>
                            <div>{formatStamp(issue.issueRaisedAt)}</div>
                            {issue.lastChasedAt ? (
                              <div className="mt-1 text-white/35">Last reply/chase {formatStamp(issue.lastChasedAt)}</div>
                            ) : null}
                          </div>
                        </div>

                        <div className="rounded-2xl border border-amber-400/20 bg-amber-500/10 p-4 text-sm leading-6 text-amber-50/90">
                          <div className="mb-2 text-[11px] font-semibold uppercase tracking-[0.2em] text-amber-100/70">
                            Captain note
                          </div>
                          {issue.note || "No note recorded."}
                        </div>
                      </div>

                      <div className="border-t border-white/10 bg-black/20 p-5 md:p-6 lg:border-l lg:border-t-0">
                        <div className="space-y-4">
                          <div>
                            <div className="text-[11px] font-semibold uppercase tracking-[0.2em] text-white/35">
                              Primary contact
                            </div>
                            <div className="mt-2 text-sm font-semibold text-white">
                              {issue.team.contactName ?? issue.team.name}
                            </div>
                            <div className="mt-1 text-xs text-white/45">
                              {issue.team.contactEmail ?? "No email on team"}
                              {issue.team.contactPhone ? ` · ${issue.team.contactPhone}` : ""}
                            </div>
                          </div>

                          <div>
                            <div className="text-[11px] font-semibold uppercase tracking-[0.2em] text-white/35">
                              Secondary contact
                            </div>
                            <div className="mt-2 text-sm font-semibold text-white">
                              {issue.team.secondaryContactName ?? "Not set"}
                            </div>
                            <div className="mt-1 text-xs text-white/45">
                              {issue.team.secondaryContactEmail ?? "No secondary email"}
                              {issue.team.secondaryContactPhone ? ` · ${issue.team.secondaryContactPhone}` : ""}
                            </div>
                          </div>

                          <div className="flex flex-col gap-2 pt-2">
                            <Link
                              href={`/admin/fixtures/issues?leagueId=${issue.fixture.leagueId}`}
                              className="inline-flex h-10 items-center justify-center rounded-xl border border-emerald-400/25 bg-emerald-400/10 px-3 text-xs font-semibold text-emerald-100 transition hover:bg-emerald-400/15"
                            >
                              Reply / manage issue
                            </Link>
                            <Link
                              href={`/admin/fixtures?leagueId=${issue.fixture.leagueId}`}
                              className="inline-flex h-10 items-center justify-center rounded-xl border border-white/10 bg-white/[0.04] px-3 text-xs font-semibold text-white/65 transition hover:bg-white/[0.08]"
                            >
                              Open fixtures
                            </Link>
                          </div>
                        </div>
                      </div>
                    </div>
                  </AdminCard>
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
