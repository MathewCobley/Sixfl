import { getServerSession } from "next-auth";

import { authOptions } from "@/auth";
import { formatDateTimeInLondon } from "@/lib/datetime/london";
import { getPlayerPerformanceHistory } from "@/lib/playerMatchPerformances";
import { prisma } from "@/lib/prisma";

type Contribution = {
  name: string;
  goals: number;
  assists: number;
  teamMemberId?: string;
};

type MatchOutcome = "W" | "D" | "L";
type PerformanceSource = "recorded" | "selected-squad" | "match-contribution";

type PerformanceHistoryRow = {
  matchResultId: string;
  teamMemberId: string;
  played: boolean;
  rating: number | null;
  kickoffAt: Date;
  homeTeamId: string;
  homeTeamName: string;
  awayTeamName: string;
  homeScore: number;
  awayScore: number;
  source: PerformanceSource;
};

function normalise(value: string | null | undefined) {
  return (value ?? "").trim().replace(/\s+/g, " ").toLowerCase();
}

function parseContributions(value: unknown): Contribution[] {
  if (!Array.isArray(value)) return [];

  return value.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const row = item as Record<string, unknown>;
    const name = String(row.name ?? "").trim();
    const goals = Number(row.goals ?? 0);
    const assists = Number(row.assists ?? 0);

    if (
      !name ||
      !Number.isInteger(goals) ||
      goals < 0 ||
      !Number.isInteger(assists) ||
      assists < 0
    ) {
      return [];
    }

    return [
      {
        name,
        goals,
        assists,
        teamMemberId:
          typeof row.teamMemberId === "string" && row.teamMemberId.trim()
            ? row.teamMemberId.trim()
            : undefined,
      },
    ];
  });
}

function formatDate(value: Date) {
  return formatDateTimeInLondon(value, {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function Stat({
  label,
  value,
  suffix = "",
  tone,
}: {
  label: string;
  value: string | number;
  suffix?: string;
  tone: "emerald" | "amber" | "sky" | "violet" | "white";
}) {
  const toneClass =
    tone === "emerald"
      ? "border-emerald-400/20 bg-emerald-500/10"
      : tone === "amber"
        ? "border-amber-400/20 bg-amber-500/10"
        : tone === "sky"
          ? "border-sky-400/20 bg-sky-500/10"
          : tone === "violet"
            ? "border-violet-400/20 bg-violet-500/10"
            : "border-white/10 bg-black/20";

  return (
    <div className={`rounded-2xl border p-4 ${toneClass}`}>
      <div className="text-3xl font-black text-white">
        {value}
        {suffix}
      </div>
      <div className="mt-1 text-[10px] font-semibold uppercase tracking-[0.15em] text-white/45">
        {label}
      </div>
    </div>
  );
}

function getOutcome(input: {
  teamId: string;
  homeTeamId: string;
  homeScore: number;
  awayScore: number;
}): MatchOutcome {
  const isHome = input.homeTeamId === input.teamId;
  const teamScore = isHome ? input.homeScore : input.awayScore;
  const opponentScore = isHome ? input.awayScore : input.homeScore;
  return teamScore > opponentScore ? "W" : teamScore < opponentScore ? "L" : "D";
}

function outcomeClasses(outcome: MatchOutcome) {
  if (outcome === "W") {
    return "border-emerald-400/25 bg-emerald-500/10 text-emerald-100";
  }
  if (outcome === "L") {
    return "border-red-400/25 bg-red-500/10 text-red-100";
  }
  return "border-white/15 bg-white/[0.06] text-white/75";
}

export default async function PlayerPerformancePanel({
  teamId,
  membershipId,
}: {
  teamId: string;
  membershipId?: string | null;
}) {
  let resolvedMembershipId = membershipId?.trim() || null;

  if (!resolvedMembershipId) {
    const session = await getServerSession(authOptions);
    const email = session?.user?.email?.trim().toLowerCase();
    if (!email) return null;

    const sessionMembership = await prisma.teamMember.findFirst({
      where: { teamId, user: { email } },
      select: { id: true },
    });
    resolvedMembershipId = sessionMembership?.id ?? null;
  }

  if (!resolvedMembershipId) return null;

  const membership = await prisma.teamMember.findFirst({
    where: { id: resolvedMembershipId, teamId },
    select: {
      id: true,
      user: { select: { name: true, email: true } },
      team: { select: { name: true } },
    },
  });
  if (!membership) return null;

  const [recordedHistory, selectedMatches, metadata] = await Promise.all([
    getPlayerPerformanceHistory({
      teamId,
      teamMemberId: membership.id,
      limit: 100,
    }),
    prisma.fixtureSelection.findMany({
      where: {
        teamMemberId: membership.id,
        selectionStatus: "SELECTED",
        fixture: {
          OR: [{ homeTeamId: teamId }, { awayTeamId: teamId }],
          result: { isNot: null },
        },
      },
      select: {
        fixture: {
          select: {
            kickoffAt: true,
            homeTeamId: true,
            homeTeam: { select: { name: true } },
            awayTeam: { select: { name: true } },
            result: {
              select: { id: true, homeScore: true, awayScore: true },
            },
          },
        },
      },
    }),
    prisma.matchResultTeamMeta.findMany({
      where: { teamId },
      select: {
        matchResultId: true,
        scorers: true,
        playerOfMatchName: true,
        matchResult: {
          select: {
            homeScore: true,
            awayScore: true,
            fixture: {
              select: {
                kickoffAt: true,
                homeTeamId: true,
                homeTeam: { select: { name: true } },
                awayTeam: { select: { name: true } },
              },
            },
          },
        },
      },
    }),
  ]);

  const displayName = membership.user.name || membership.user.email || "Player";
  const normalisedDisplayName = normalise(displayName);
  const historyByResultId = new Map<string, PerformanceHistoryRow>();
  for (const match of recordedHistory) {
    historyByResultId.set(match.matchResultId, {
      ...match,
      source: "recorded",
    });
  }

  for (const selection of selectedMatches) {
    const result = selection.fixture.result;
    if (!result || historyByResultId.has(result.id)) continue;

    historyByResultId.set(result.id, {
      matchResultId: result.id,
      teamMemberId: membership.id,
      played: true,
      rating: null,
      kickoffAt: selection.fixture.kickoffAt,
      homeTeamId: selection.fixture.homeTeamId,
      homeTeamName: selection.fixture.homeTeam.name,
      awayTeamName: selection.fixture.awayTeam.name,
      homeScore: result.homeScore,
      awayScore: result.awayScore,
      source: "selected-squad",
    });
  }

  let goals = 0;
  let assists = 0;
  let playerOfMatchAwards = 0;

  for (const detail of metadata) {
    let hasRecordedContribution = false;

    for (const contribution of parseContributions(detail.scorers)) {
      const matchesPlayer = contribution.teamMemberId
        ? contribution.teamMemberId === membership.id
        : normalise(contribution.name) === normalisedDisplayName;

      if (!matchesPlayer) continue;
      goals += contribution.goals;
      assists += contribution.assists;
      hasRecordedContribution = true;
    }

    const wasPlayerOfMatch =
      normalise(detail.playerOfMatchName) === normalisedDisplayName;
    if (wasPlayerOfMatch) {
      playerOfMatchAwards += 1;
    }

    if (
      (hasRecordedContribution || wasPlayerOfMatch) &&
      !historyByResultId.has(detail.matchResultId)
    ) {
      const fixture = detail.matchResult.fixture;
      historyByResultId.set(detail.matchResultId, {
        matchResultId: detail.matchResultId,
        teamMemberId: membership.id,
        played: true,
        rating: null,
        kickoffAt: fixture.kickoffAt,
        homeTeamId: fixture.homeTeamId,
        homeTeamName: fixture.homeTeam.name,
        awayTeamName: fixture.awayTeam.name,
        homeScore: detail.matchResult.homeScore,
        awayScore: detail.matchResult.awayScore,
        source: "match-contribution",
      });
    }
  }

  const history = Array.from(historyByResultId.values())
    .sort((left, right) => right.kickoffAt.getTime() - left.kickoffAt.getTime())
    .slice(0, 100);
  const hasRecoveredHistory = history.some((match) => match.source !== "recorded");
  const ratings = history.flatMap((match) =>
    match.rating === null ? [] : [Number(match.rating)],
  );
  const unratedCount = history.filter((match) => match.rating === null).length;
  const averageRating =
    ratings.length > 0
      ? ratings.reduce((sum, value) => sum + value, 0) / ratings.length
      : null;
  const goalInvolvements = goals + assists;

  return (
    <section className="overflow-hidden rounded-3xl border border-sky-400/15 bg-[radial-gradient(circle_at_top_left,rgba(14,165,233,0.13),transparent_38%),rgba(255,255,255,0.04)] p-5 shadow-[0_20px_70px_rgba(0,0,0,0.22)] sm:p-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-sky-200/70">
            Your performance
          </p>
          <h2 className="mt-2 text-2xl font-semibold text-white">Your stats</h2>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-white/60">
            These are your stats for {membership.team.name}. Choose another team above to see your stats there.
          </p>
        </div>
        <span className="w-fit shrink-0 rounded-full border border-sky-400/20 bg-sky-500/10 px-3 py-1 text-xs font-semibold text-sky-100">
          {goalInvolvements} goal involvement
          {goalInvolvements === 1 ? "" : "s"}
        </span>
      </div>

      <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <Stat label="Appearances" value={history.length} tone="emerald" />
        <Stat
          label="Average rating"
          value={averageRating === null ? "—" : averageRating.toFixed(1)}
          suffix={averageRating === null ? "" : "/10"}
          tone="white"
        />
        <Stat label="Goals" value={goals} tone="amber" />
        <Stat label="Assists" value={assists} tone="sky" />
        <Stat
          label="Player of the Match"
          value={playerOfMatchAwards}
          tone="violet"
        />
      </div>

      {unratedCount > 0 ? (
        <div className="mt-4 rounded-2xl border border-amber-400/20 bg-amber-500/[0.08] px-4 py-3 text-sm leading-6 text-amber-50/80">
          <span className="font-semibold text-amber-100">
            The dressing-room jury is still out.
          </span>{" "}
          Your captain has {unratedCount} performance{unratedCount === 1 ? "" : "s"} left to rate.
          Give them a gentle nudge — reputations and bragging rights are at stake.
        </div>
      ) : null}

      {hasRecoveredHistory ? (
        <div className="mt-4 rounded-2xl border border-amber-400/15 bg-amber-500/[0.07] px-4 py-3 text-xs leading-5 text-amber-50/70">
          We’ve included your older appearances too. Some of those matches do not have a rating because one was not entered at the time.
        </div>
      ) : null}

      <div className="mt-5">
        <div className="flex items-center justify-between gap-3">
          <h3 className="text-sm font-semibold text-white">Recent performances</h3>
          <span className="text-xs text-white/40">
            Latest {Math.min(history.length, 5)}
          </span>
        </div>

        {history.length === 0 ? (
          <div className="mt-3 rounded-2xl border border-dashed border-white/10 bg-black/15 p-4 text-sm leading-6 text-white/50">
            No appearances have been added yet. Your stats will appear after your captain confirms who played and submits the result.
          </div>
        ) : (
          <div className="mt-3 grid gap-2 md:grid-cols-2 xl:grid-cols-5">
            {history.slice(0, 5).map((match) => {
              const opponent =
                match.homeTeamId === teamId
                  ? match.awayTeamName
                  : match.homeTeamName;
              const outcome = getOutcome({
                teamId,
                homeTeamId: match.homeTeamId,
                homeScore: match.homeScore,
                awayScore: match.awayScore,
              });

              return (
                <div
                  key={match.matchResultId}
                  className="rounded-2xl border border-white/10 bg-black/20 p-4"
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="text-xs text-white/40">
                      {formatDate(match.kickoffAt)}
                    </div>
                    <span
                      className={`inline-flex h-7 w-7 items-center justify-center rounded-full border text-[10px] font-black ${outcomeClasses(
                        outcome,
                      )}`}
                    >
                      {outcome}
                    </span>
                  </div>
                  <div className="mt-1 truncate text-sm font-semibold text-white">
                    vs {opponent}
                  </div>
                  <div className="mt-3 flex items-center justify-between gap-2 text-xs text-white/55">
                    <span>
                      {match.homeScore}-{match.awayScore}
                    </span>
                    <span className="rounded-full border border-sky-400/20 bg-sky-500/10 px-2.5 py-1 font-semibold text-sky-100">
                      {match.rating === null
                        ? "Not rated"
                        : `${Number(match.rating).toFixed(1)}/10`}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
}
