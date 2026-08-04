import { getServerSession } from "next-auth";

import { authOptions } from "@/auth";
import { formatDateTimeInLondon } from "@/lib/datetime/london";
import {
  getPlayerPerformanceHistory,
  getTeamPlayerPerformanceSummaries,
} from "@/lib/playerMatchPerformances";
import { prisma } from "@/lib/prisma";

type MatchOutcome = "W" | "D" | "L";

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
      userId: true,
      team: { select: { name: true } },
      user: {
        select: {
          teamMembers: { select: { id: true }, take: 2 },
        },
      },
    },
  });
  if (!membership) return null;

  const [history, squadMembers, squadSummaries] = await Promise.all([
    getPlayerPerformanceHistory({
      teamId,
      teamMemberId: membership.id,
      limit: 100,
    }),
    prisma.teamMember.findMany({
      where: { teamId },
      orderBy: [{ createdAt: "asc" }],
      select: {
        id: true,
        user: { select: { name: true } },
      },
    }),
    getTeamPlayerPerformanceSummaries(teamId),
  ]);

  const goals = history.reduce((sum, match) => sum + Number(match.goals), 0);
  const assists = history.reduce((sum, match) => sum + Number(match.assists), 0);
  const playerOfMatchAwards = history.filter(
    (match) => match.isPlayerOfMatch,
  ).length;
  const ratings = history.flatMap((match) =>
    match.rating === null ? [] : [Number(match.rating)],
  );
  const unratedCount = history.filter((match) => match.rating === null).length;
  const averageRating =
    ratings.length > 0
      ? ratings.reduce((sum, value) => sum + value, 0) / ratings.length
      : null;
  const goalInvolvements = goals + assists;
  const hasRecoveredHistory = history.some(
    (match) => match.source !== "CAPTAIN_RECORDED",
  );
  const hasMultipleTeams = membership.user.teamMembers.length > 1;

  const summaryByMemberId = new Map(
    squadSummaries.map((summary) => [summary.teamMemberId, summary]),
  );
  const squadRows = squadMembers
    .map((member) => {
      const summary = summaryByMemberId.get(member.id);
      const rowGoals = Number(summary?.goals ?? 0);
      const rowAssists = Number(summary?.assists ?? 0);
      return {
        id: member.id,
        name: member.user.name?.trim() || "Unnamed player",
        appearances: Number(summary?.appearances ?? 0),
        goals: rowGoals,
        assists: rowAssists,
        goalInvolvements: rowGoals + rowAssists,
        averageRating:
          summary?.averageRating === null || summary?.averageRating === undefined
            ? null
            : Number(summary.averageRating),
        playerOfMatchAwards: Number(summary?.playerOfMatchAwards ?? 0),
      };
    })
    .sort(
      (a, b) =>
        b.goalInvolvements - a.goalInvolvements ||
        b.goals - a.goals ||
        b.appearances - a.appearances ||
        a.name.localeCompare(b.name),
    );

  return (
    <section className="overflow-hidden rounded-3xl border border-sky-400/15 bg-[radial-gradient(circle_at_top_left,rgba(14,165,233,0.13),transparent_38%),rgba(255,255,255,0.04)] p-5 shadow-[0_20px_70px_rgba(0,0,0,0.22)] sm:p-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-sky-200/70">
            Your performance
          </p>
          <h2 className="mt-2 text-2xl font-semibold text-white">Your stats</h2>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-white/60">
            These are your stats for {membership.team.name}.
            {hasMultipleTeams
              ? " Choose another team above to view your stats and that squad's statistics."
              : " You can also see the whole squad's statistics below."}
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

      <div className="mt-6">
        <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h3 className="text-lg font-semibold text-white">Squad stats</h3>
            <p className="mt-1 text-sm text-white/50">
              Football statistics for the {membership.team.name} squad. Your row is highlighted.
            </p>
          </div>
          <span className="text-xs text-white/40">
            {squadRows.length} squad member{squadRows.length === 1 ? "" : "s"}
          </span>
        </div>

        <div className="mt-3 overflow-x-auto rounded-2xl border border-white/10 bg-black/15">
          <table className="min-w-[760px] w-full text-left text-sm">
            <thead className="border-b border-white/10 bg-white/[0.03] text-[10px] font-semibold uppercase tracking-[0.14em] text-white/40">
              <tr>
                <th className="px-4 py-3">Player</th>
                <th className="px-3 py-3 text-center">Apps</th>
                <th className="px-3 py-3 text-center">Goals</th>
                <th className="px-3 py-3 text-center">Assists</th>
                <th className="px-3 py-3 text-center">Goal involvements</th>
                <th className="px-3 py-3 text-center">Avg rating</th>
                <th className="px-3 py-3 text-center">POTM</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/[0.07]">
              {squadRows.map((player) => {
                const isCurrentPlayer = player.id === membership.id;
                return (
                  <tr
                    key={player.id}
                    className={isCurrentPlayer ? "bg-sky-500/10" : "hover:bg-white/[0.025]"}
                  >
                    <td className="px-4 py-3 font-semibold text-white">
                      {player.name}
                      {isCurrentPlayer ? (
                        <span className="ml-2 rounded-full border border-sky-400/20 bg-sky-500/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-sky-100">
                          You
                        </span>
                      ) : null}
                    </td>
                    <td className="px-3 py-3 text-center text-white/70">{player.appearances}</td>
                    <td className="px-3 py-3 text-center text-white/70">{player.goals}</td>
                    <td className="px-3 py-3 text-center text-white/70">{player.assists}</td>
                    <td className="px-3 py-3 text-center font-semibold text-sky-100">{player.goalInvolvements}</td>
                    <td className="px-3 py-3 text-center text-white/70">
                      {player.averageRating === null ? "—" : player.averageRating.toFixed(1)}
                    </td>
                    <td className="px-3 py-3 text-center text-white/70">{player.playerOfMatchAwards}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <div className="mt-6">
        <div className="flex items-center justify-between gap-3">
          <h3 className="text-sm font-semibold text-white">Your recent performances</h3>
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
