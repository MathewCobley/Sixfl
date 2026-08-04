import { getServerSession } from "next-auth";
import { Prisma } from "@prisma/client";

import { authOptions } from "@/auth";
import { formatDateTimeInLondon } from "@/lib/datetime/london";
import {
  getPlayerPerformanceHistory,
  getTeamPlayerPerformanceSummaries,
} from "@/lib/playerMatchPerformances";
import { prisma } from "@/lib/prisma";

type MatchOutcome = "W" | "D" | "L";

type MatchPlayerRow = {
  matchResultId: string;
  teamMemberId: string;
  playerName: string;
  rating: number | null;
  goals: number;
  assists: number;
  isPlayerOfMatch: boolean;
};

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
      team: { select: { name: true } },
      user: {
        select: {
          teamMembers: { select: { id: true }, take: 2 },
        },
      },
    },
  });
  if (!membership) return null;

  const [history, squadMembers, squadSummaries, recentMatches] = await Promise.all([
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
    prisma.matchResult.findMany({
      where: {
        fixture: {
          OR: [{ homeTeamId: teamId }, { awayTeamId: teamId }],
        },
      },
      orderBy: { fixture: { kickoffAt: "desc" } },
      take: 5,
      select: {
        id: true,
        homeScore: true,
        awayScore: true,
        fixture: {
          select: {
            kickoffAt: true,
            homeTeamId: true,
            awayTeamId: true,
            homeTeam: { select: { name: true } },
            awayTeam: { select: { name: true } },
          },
        },
      },
    }),
  ]);

  const recentMatchIds = recentMatches.map((match) => match.id);
  const matchPlayerRows =
    recentMatchIds.length === 0
      ? []
      : await prisma.$queryRaw<MatchPlayerRow[]>(Prisma.sql`
          SELECT
            performance."matchResultId",
            performance."teamMemberId",
            COALESCE(NULLIF(TRIM(player."name"), ''), 'Unnamed player') AS "playerName",
            performance."rating"::double precision AS "rating",
            performance."goals"::int AS "goals",
            performance."assists"::int AS "assists",
            performance."isPlayerOfMatch"
          FROM "PlayerMatchPerformance" performance
          INNER JOIN "TeamMember" member ON member."id" = performance."teamMemberId"
          INNER JOIN "User" player ON player."id" = member."userId"
          WHERE performance."teamId" = ${teamId}
            AND performance."matchResultId" IN (${Prisma.join(recentMatchIds)})
            AND performance."played" = TRUE
          ORDER BY
            performance."matchResultId",
            performance."isPlayerOfMatch" DESC,
            performance."rating" DESC NULLS LAST,
            performance."goals" DESC,
            "playerName" ASC
        `);

  const matchPlayersByResultId = new Map<string, MatchPlayerRow[]>();
  for (const row of matchPlayerRows) {
    const rows = matchPlayersByResultId.get(row.matchResultId) ?? [];
    rows.push(row);
    matchPlayersByResultId.set(row.matchResultId, rows);
  }

  const goals = history.reduce((sum, match) => sum + Number(match.goals), 0);
  const assists = history.reduce((sum, match) => sum + Number(match.assists), 0);
  const playerOfMatchAwards = history.filter((match) => match.isPlayerOfMatch).length;
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
              : " You can also see the whole squad's season and match statistics below."}
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
            <h3 className="text-lg font-semibold text-white">Squad season stats</h3>
            <p className="mt-1 text-sm text-white/50">
              Season totals for the {membership.team.name} squad. Your row is highlighted.
            </p>
          </div>
          <span className="text-xs text-white/40">
            {squadRows.length} squad member{squadRows.length === 1 ? "" : "s"}
          </span>
        </div>

        <div className="mt-3 overflow-x-auto rounded-2xl border border-white/10 bg-black/15">
          <table className="w-full min-w-[760px] text-left text-sm">
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

      <div className="mt-7">
        <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h3 className="text-lg font-semibold text-white">Match stats</h3>
            <p className="mt-1 text-sm text-white/50">
              Open a recent match to see who played and the squad’s individual statistics.
            </p>
          </div>
          <span className="text-xs text-white/40">
            Latest {recentMatches.length}
          </span>
        </div>

        {recentMatches.length === 0 ? (
          <div className="mt-3 rounded-2xl border border-dashed border-white/10 bg-black/15 p-4 text-sm leading-6 text-white/50">
            No completed matches have been recorded yet.
          </div>
        ) : (
          <div className="mt-3 space-y-3">
            {recentMatches.map((match) => {
              const isHome = match.fixture.homeTeamId === teamId;
              const opponent = isHome
                ? match.fixture.awayTeam.name
                : match.fixture.homeTeam.name;
              const outcome = getOutcome({
                teamId,
                homeTeamId: match.fixture.homeTeamId,
                homeScore: match.homeScore,
                awayScore: match.awayScore,
              });
              const players = matchPlayersByResultId.get(match.id) ?? [];

              return (
                <details
                  key={match.id}
                  className="group overflow-hidden rounded-2xl border border-white/10 bg-black/20"
                >
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-4 px-4 py-4 marker:hidden sm:px-5">
                    <div className="min-w-0">
                      <div className="text-xs text-white/40">
                        {formatDate(match.fixture.kickoffAt)}
                      </div>
                      <div className="mt-1 truncate font-semibold text-white">
                        {membership.team.name} vs {opponent}
                      </div>
                      <div className="mt-1 text-xs text-white/45">
                        {players.length} player{players.length === 1 ? "" : "s"} recorded
                      </div>
                    </div>
                    <div className="flex shrink-0 items-center gap-3">
                      <span className="text-lg font-black text-white">
                        {match.homeScore}-{match.awayScore}
                      </span>
                      <span
                        className={`inline-flex h-8 w-8 items-center justify-center rounded-full border text-[11px] font-black ${outcomeClasses(outcome)}`}
                      >
                        {outcome}
                      </span>
                      <span className="text-lg text-white/40 transition group-open:rotate-180">⌄</span>
                    </div>
                  </summary>

                  <div className="border-t border-white/10 px-3 py-4 sm:px-5">
                    {players.length === 0 ? (
                      <div className="rounded-xl border border-dashed border-white/10 p-4 text-sm text-white/50">
                        No individual player statistics were recorded for this match.
                      </div>
                    ) : (
                      <div className="overflow-x-auto rounded-xl border border-white/10">
                        <table className="w-full min-w-[620px] text-left text-sm">
                          <thead className="border-b border-white/10 bg-white/[0.03] text-[10px] font-semibold uppercase tracking-[0.14em] text-white/40">
                            <tr>
                              <th className="px-4 py-3">Player</th>
                              <th className="px-3 py-3 text-center">Goals</th>
                              <th className="px-3 py-3 text-center">Assists</th>
                              <th className="px-3 py-3 text-center">Rating</th>
                              <th className="px-3 py-3 text-center">POTM</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-white/[0.07]">
                            {players.map((player) => {
                              const isCurrentPlayer = player.teamMemberId === membership.id;
                              return (
                                <tr
                                  key={player.teamMemberId}
                                  className={isCurrentPlayer ? "bg-sky-500/10" : ""}
                                >
                                  <td className="px-4 py-3 font-semibold text-white">
                                    {player.playerName}
                                    {isCurrentPlayer ? (
                                      <span className="ml-2 rounded-full border border-sky-400/20 bg-sky-500/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-sky-100">
                                        You
                                      </span>
                                    ) : null}
                                  </td>
                                  <td className="px-3 py-3 text-center text-white/70">{Number(player.goals)}</td>
                                  <td className="px-3 py-3 text-center text-white/70">{Number(player.assists)}</td>
                                  <td className="px-3 py-3 text-center text-white/70">
                                    {player.rating === null ? "Not rated" : `${Number(player.rating).toFixed(1)}/10`}
                                  </td>
                                  <td className="px-3 py-3 text-center">
                                    {player.isPlayerOfMatch ? (
                                      <span className="rounded-full border border-violet-400/20 bg-violet-500/10 px-2.5 py-1 text-xs font-semibold text-violet-100">
                                        POTM
                                      </span>
                                    ) : (
                                      <span className="text-white/25">—</span>
                                    )}
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                </details>
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
}
