import Link from "next/link";
import { notFound } from "next/navigation";
import { Prisma } from "@prisma/client";

import { formatDateTimeInLondon } from "@/lib/datetime/london";
import { prisma } from "@/lib/prisma";
import { requireCaptain } from "@/lib/requireCaptain";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const metadata = { title: "Player Stats | SIXFL" };

type SquadStatRow = {
  teamMemberId: string;
  name: string;
  email: string | null;
  role: string;
  appearances: number;
  goals: number;
  assists: number;
  playerOfMatchAwards: number;
  ratingCount: number;
  averageRating: number | null;
};

type RecentMatchRow = {
  matchResultId: string;
  kickoffAt: Date;
  homeTeamId: string;
  homeTeamName: string;
  awayTeamId: string;
  awayTeamName: string;
  homeScore: number;
  awayScore: number;
  goalsRecorded: number;
  assistsRecorded: number;
  averageRating: number | null;
  playerOfMatchName: string | null;
};

function roleLabel(value: string) {
  return value
    .toLowerCase()
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function formatDate(value: Date) {
  return formatDateTimeInLondon(value, {
    weekday: "short",
    day: "2-digit",
    month: "short",
  });
}

function formatRating(value: number | null) {
  return value === null || !Number.isFinite(value) ? "—" : value.toFixed(1);
}

function perAppearance(value: number, appearances: number) {
  if (appearances <= 0) return "0.00";
  return (value / appearances).toFixed(2);
}

function topRows(
  rows: SquadStatRow[],
  metric: (row: SquadStatRow) => number,
  hasValue: (row: SquadStatRow) => boolean = (row) => metric(row) > 0,
) {
  return rows
    .filter(hasValue)
    .slice()
    .sort((a, b) => metric(b) - metric(a) || a.name.localeCompare(b.name))
    .slice(0, 3);
}

function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean).slice(0, 2);
  return parts.map((part) => part[0]?.toUpperCase() ?? "").join("") || "?";
}

export default async function CaptainPlayerStatsPage({
  params,
}: {
  params: Promise<{ teamid: string }>;
}) {
  const { teamid } = await params;
  await requireCaptain(teamid);

  const team = await prisma.team.findUnique({
    where: { id: teamid },
    select: {
      id: true,
      name: true,
      logoUrl: true,
      league: {
        select: {
          id: true,
          name: true,
          season: true,
          competition: {
            select: {
              name: true,
              currentLeague: {
                select: { id: true, name: true, season: true },
              },
            },
          },
        },
      },
    },
  });

  if (!team) notFound();

  const currentLeague = team.league?.competition?.currentLeague ?? team.league;
  const currentLeagueId = currentLeague?.id ?? null;
  const seasonLabel = currentLeague?.season ?? "Current season";
  const competitionLabel = team.league?.competition?.name ?? currentLeague?.name ?? "SIXFL";

  const leagueFilter = currentLeagueId
    ? Prisma.sql`AND fixture."leagueId" = ${currentLeagueId}`
    : Prisma.empty;

  const squadStats = await prisma.$queryRaw<SquadStatRow[]>(Prisma.sql`
    SELECT
      member."id" AS "teamMemberId",
      COALESCE(NULLIF(BTRIM(account."name"), ''), account."email", 'Unnamed player') AS "name",
      account."email",
      member."role"::text AS "role",
      COALESCE(stats."appearances", 0)::int AS "appearances",
      COALESCE(stats."goals", 0)::int AS "goals",
      COALESCE(stats."assists", 0)::int AS "assists",
      COALESCE(stats."playerOfMatchAwards", 0)::int AS "playerOfMatchAwards",
      COALESCE(stats."ratingCount", 0)::int AS "ratingCount",
      stats."averageRating"::float8 AS "averageRating"
    FROM "TeamMember" member
    INNER JOIN "User" account ON account."id" = member."userId"
    LEFT JOIN (
      SELECT
        performance."teamMemberId",
        COUNT(*) FILTER (WHERE performance."played" = true)::int AS "appearances",
        COALESCE(SUM(performance."goals"), 0)::int AS "goals",
        COALESCE(SUM(performance."assists"), 0)::int AS "assists",
        COUNT(*) FILTER (WHERE performance."isPlayerOfMatch" = true)::int AS "playerOfMatchAwards",
        COUNT(performance."rating")::int AS "ratingCount",
        AVG(performance."rating")::float8 AS "averageRating"
      FROM "PlayerMatchPerformance" performance
      INNER JOIN "MatchResult" result ON result."id" = performance."matchResultId"
      INNER JOIN "Fixture" fixture ON fixture."id" = result."fixtureId"
      WHERE performance."teamId" = ${teamid}
        ${leagueFilter}
      GROUP BY performance."teamMemberId"
    ) stats ON stats."teamMemberId" = member."id"
    WHERE member."teamId" = ${teamid}
    ORDER BY
      COALESCE(stats."goals", 0) + COALESCE(stats."assists", 0) DESC,
      COALESCE(stats."goals", 0) DESC,
      COALESCE(stats."appearances", 0) DESC,
      COALESCE(NULLIF(BTRIM(account."name"), ''), account."email", 'Unnamed player') ASC
  `);

  const recentMatches = await prisma.$queryRaw<RecentMatchRow[]>(Prisma.sql`
    SELECT
      result."id" AS "matchResultId",
      fixture."kickoffAt",
      fixture."homeTeamId",
      home_team."name" AS "homeTeamName",
      fixture."awayTeamId",
      away_team."name" AS "awayTeamName",
      result."homeScore",
      result."awayScore",
      COALESCE(SUM(performance."goals"), 0)::int AS "goalsRecorded",
      COALESCE(SUM(performance."assists"), 0)::int AS "assistsRecorded",
      AVG(performance."rating")::float8 AS "averageRating",
      MAX(
        CASE
          WHEN performance."isPlayerOfMatch" = true
          THEN COALESCE(NULLIF(BTRIM(account."name"), ''), account."email", 'Player')
          ELSE NULL
        END
      ) AS "playerOfMatchName"
    FROM "MatchResult" result
    INNER JOIN "Fixture" fixture ON fixture."id" = result."fixtureId"
    INNER JOIN "Team" home_team ON home_team."id" = fixture."homeTeamId"
    INNER JOIN "Team" away_team ON away_team."id" = fixture."awayTeamId"
    LEFT JOIN "PlayerMatchPerformance" performance
      ON performance."matchResultId" = result."id"
      AND performance."teamId" = ${teamid}
    LEFT JOIN "TeamMember" member ON member."id" = performance."teamMemberId"
    LEFT JOIN "User" account ON account."id" = member."userId"
    WHERE fixture."status" = 'COMPLETED'
      AND (${teamid} IN (fixture."homeTeamId", fixture."awayTeamId"))
      ${leagueFilter}
    GROUP BY
      result."id",
      fixture."id",
      home_team."name",
      away_team."name"
    ORDER BY fixture."kickoffAt" DESC
    LIMIT 6
  `);

  const totalAppearances = squadStats.reduce((sum, row) => sum + row.appearances, 0);
  const totalGoals = squadStats.reduce((sum, row) => sum + row.goals, 0);
  const totalAssists = squadStats.reduce((sum, row) => sum + row.assists, 0);
  const totalMotm = squadStats.reduce((sum, row) => sum + row.playerOfMatchAwards, 0);
  const ratedPlayers = squadStats.filter((row) => row.ratingCount > 0 && row.averageRating !== null);
  const weightedRatingTotal = ratedPlayers.reduce(
    (sum, row) => sum + (row.averageRating ?? 0) * row.ratingCount,
    0,
  );
  const ratingCount = ratedPlayers.reduce((sum, row) => sum + row.ratingCount, 0);
  const squadAverageRating = ratingCount > 0 ? weightedRatingTotal / ratingCount : null;

  const scorerLeaders = topRows(squadStats, (row) => row.goals);
  const assistLeaders = topRows(squadStats, (row) => row.assists);
  const motmLeaders = topRows(squadStats, (row) => row.playerOfMatchAwards);
  const ratingLeaders = topRows(
    squadStats,
    (row) => row.averageRating ?? 0,
    (row) => row.ratingCount > 0 && row.averageRating !== null,
  );

  const leaderboardCards = [
    {
      title: "Top scorers",
      label: "Goals",
      rows: scorerLeaders,
      value: (row: SquadStatRow) => String(row.goals),
      accent: "text-amber-200",
    },
    {
      title: "Assist leaders",
      label: "Assists",
      rows: assistLeaders,
      value: (row: SquadStatRow) => String(row.assists),
      accent: "text-sky-200",
    },
    {
      title: "MOTM leaders",
      label: "Awards",
      rows: motmLeaders,
      value: (row: SquadStatRow) => String(row.playerOfMatchAwards),
      accent: "text-violet-200",
    },
    {
      title: "Highest rated",
      label: "Avg rating",
      rows: ratingLeaders,
      value: (row: SquadStatRow) => formatRating(row.averageRating),
      accent: "text-emerald-200",
    },
  ];

  const sortedSquad = squadStats
    .slice()
    .sort(
      (a, b) =>
        b.goals + b.assists - (a.goals + a.assists) ||
        b.goals - a.goals ||
        b.playerOfMatchAwards - a.playerOfMatchAwards ||
        a.name.localeCompare(b.name),
    );

  return (
    <div className="space-y-6">
      <section className="overflow-hidden rounded-3xl border border-violet-400/20 bg-[radial-gradient(circle_at_top_right,rgba(139,92,246,0.18),transparent_36%),linear-gradient(180deg,rgba(255,255,255,0.055),rgba(255,255,255,0.025))] p-6 shadow-[0_24px_80px_rgba(0,0,0,0.28)] sm:p-8">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-[11px] font-black uppercase tracking-[0.22em] text-violet-200/70">
              Squad performance · {seasonLabel}
            </p>
            <h2 className="mt-2 text-3xl font-black tracking-tight text-white sm:text-4xl">
              Player stats
            </h2>
            <p className="mt-3 max-w-3xl text-sm leading-6 text-white/60 sm:text-base">
              A read-only view of the squad&apos;s recorded appearances, goals, assists,
              ratings and MOTM awards for {competitionLabel}. Match Reports remains
              the place to enter or correct the match data.
            </p>
          </div>
          <Link
            href={`/captain/team/${teamid}/results`}
            className="inline-flex min-h-12 items-center justify-center rounded-2xl border border-violet-300/25 bg-violet-500/10 px-5 py-3 text-sm font-bold text-violet-100 transition hover:bg-violet-500/15"
          >
            Open Match Reports →
          </Link>
        </div>
      </section>

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        {[
          ["Squad", squadStats.length, "Players currently in this squad"],
          ["Recorded appearances", totalAppearances, "Player appearances across reports"],
          ["Goals", totalGoals, "Recorded player goals"],
          ["Assists", totalAssists, "Recorded assists"],
          ["Squad rating", formatRating(squadAverageRating), ratingCount > 0 ? `${ratingCount} saved player rating${ratingCount === 1 ? "" : "s"}` : "No ratings recorded yet"],
        ].map(([label, value, text]) => (
          <article key={String(label)} className="rounded-3xl border border-white/10 bg-white/[0.04] p-5">
            <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-white/40">
              {label}
            </p>
            <p className="mt-2 text-3xl font-black text-white">{value}</p>
            <p className="mt-1 text-xs leading-5 text-white/45">{text}</p>
          </article>
        ))}
      </section>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {leaderboardCards.map((card) => (
          <article key={card.title} className="rounded-3xl border border-white/10 bg-black/20 p-5">
            <div className="flex items-center justify-between gap-3">
              <h3 className="font-bold text-white">{card.title}</h3>
              <span className={`text-[10px] font-semibold uppercase tracking-[0.14em] ${card.accent}`}>
                {card.label}
              </span>
            </div>
            {card.rows.length > 0 ? (
              <div className="mt-4 space-y-2">
                {card.rows.map((player, index) => (
                  <div
                    key={`${card.title}-${player.teamMemberId}`}
                    className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.035] px-3 py-3"
                  >
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white/[0.07] text-xs font-black text-white/60">
                      {index + 1}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-semibold text-white">{player.name}</div>
                      <div className="mt-0.5 text-[11px] text-white/35">{roleLabel(player.role)}</div>
                    </div>
                    <span className={`text-lg font-black ${card.accent}`}>{card.value(player)}</span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="mt-4 text-sm leading-6 text-white/40">Nothing recorded yet.</p>
            )}
          </article>
        ))}
      </section>

      <section className="overflow-hidden rounded-3xl border border-white/10 bg-white/[0.035]">
        <div className="border-b border-white/10 p-5 sm:p-6">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-emerald-300/70">
            Full squad
          </p>
          <div className="mt-2 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
            <h3 className="text-2xl font-black text-white">Season leaderboard</h3>
            <p className="text-xs text-white/40">Sorted by goal involvements, then goals and MOTM.</p>
          </div>
        </div>

        {sortedSquad.length > 0 ? (
          <div className="overflow-x-auto">
            <div className="min-w-[900px]">
              <div className="grid grid-cols-[52px_minmax(220px,1.6fr)_80px_80px_80px_90px_90px_100px_110px] gap-3 border-b border-white/10 bg-black/20 px-5 py-3 text-[10px] font-semibold uppercase tracking-[0.14em] text-white/35">
                <div>#</div>
                <div>Player</div>
                <div className="text-center">Apps</div>
                <div className="text-center">Goals</div>
                <div className="text-center">Assists</div>
                <div className="text-center">G+A</div>
                <div className="text-center">MOTM</div>
                <div className="text-center">Avg rating</div>
                <div className="text-center">Goals / app</div>
              </div>
              <div className="divide-y divide-white/10">
                {sortedSquad.map((player, index) => (
                  <div
                    key={player.teamMemberId}
                    className="grid grid-cols-[52px_minmax(220px,1.6fr)_80px_80px_80px_90px_90px_100px_110px] items-center gap-3 px-5 py-4 text-sm"
                  >
                    <div className="font-black text-white/35">{index + 1}</div>
                    <div className="flex min-w-0 items-center gap-3">
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-white/[0.05] text-xs font-black text-white/55">
                        {initials(player.name)}
                      </div>
                      <div className="min-w-0">
                        <div className="truncate font-semibold text-white">{player.name}</div>
                        <div className="mt-0.5 text-[11px] text-white/35">{roleLabel(player.role)}</div>
                      </div>
                    </div>
                    <div className="text-center font-semibold text-white/70">{player.appearances}</div>
                    <div className="text-center font-black text-amber-200">{player.goals}</div>
                    <div className="text-center font-black text-sky-200">{player.assists}</div>
                    <div className="text-center font-black text-white">{player.goals + player.assists}</div>
                    <div className="text-center font-black text-violet-200">{player.playerOfMatchAwards}</div>
                    <div className="text-center font-semibold text-emerald-200">{formatRating(player.averageRating)}</div>
                    <div className="text-center font-semibold text-white/65">{perAppearance(player.goals, player.appearances)}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        ) : (
          <div className="p-6 text-sm text-white/50">No squad players are available yet.</div>
        )}
      </section>

      <section className="rounded-3xl border border-white/10 bg-white/[0.035] p-5 sm:p-6">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-sky-300/70">
              Match by match
            </p>
            <h3 className="mt-2 text-2xl font-black text-white">Recent reports</h3>
          </div>
          <p className="text-xs text-white/40">Latest six completed fixtures in {seasonLabel}.</p>
        </div>

        {recentMatches.length > 0 ? (
          <div className="mt-5 grid gap-3 lg:grid-cols-2">
            {recentMatches.map((match) => {
              const isHome = match.homeTeamId === teamid;
              const opponent = isHome ? match.awayTeamName : match.homeTeamName;
              const teamScore = isHome ? match.homeScore : match.awayScore;
              const opponentScore = isHome ? match.awayScore : match.homeScore;
              const outcome = teamScore > opponentScore ? "W" : teamScore < opponentScore ? "L" : "D";
              const outcomeClass =
                outcome === "W"
                  ? "border-emerald-400/25 bg-emerald-500/10 text-emerald-100"
                  : outcome === "D"
                    ? "border-white/15 bg-white/[0.05] text-white/70"
                    : "border-red-400/25 bg-red-500/10 text-red-100";

              return (
                <article key={match.matchResultId} className="rounded-2xl border border-white/10 bg-black/20 p-4">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className={`inline-flex h-7 w-7 items-center justify-center rounded-full border text-[11px] font-black ${outcomeClass}`}>
                          {outcome}
                        </span>
                        <span className="text-xs text-white/40">{formatDate(match.kickoffAt)}</span>
                      </div>
                      <div className="mt-2 font-semibold text-white">vs {opponent}</div>
                    </div>
                    <div className="text-2xl font-black text-white">{teamScore}–{opponentScore}</div>
                  </div>
                  <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
                    <div className="rounded-xl bg-white/[0.04] px-3 py-2">
                      <div className="text-[9px] uppercase tracking-[0.12em] text-white/35">Goals logged</div>
                      <div className="mt-1 font-black text-amber-100">{match.goalsRecorded}</div>
                    </div>
                    <div className="rounded-xl bg-white/[0.04] px-3 py-2">
                      <div className="text-[9px] uppercase tracking-[0.12em] text-white/35">Assists</div>
                      <div className="mt-1 font-black text-sky-100">{match.assistsRecorded}</div>
                    </div>
                    <div className="rounded-xl bg-white/[0.04] px-3 py-2">
                      <div className="text-[9px] uppercase tracking-[0.12em] text-white/35">Avg rating</div>
                      <div className="mt-1 font-black text-emerald-100">{formatRating(match.averageRating)}</div>
                    </div>
                    <div className="rounded-xl bg-white/[0.04] px-3 py-2">
                      <div className="text-[9px] uppercase tracking-[0.12em] text-white/35">MOTM</div>
                      <div className="mt-1 truncate font-black text-violet-100" title={match.playerOfMatchName ?? undefined}>
                        {match.playerOfMatchName ?? "—"}
                      </div>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        ) : (
          <div className="mt-5 rounded-2xl border border-dashed border-white/10 bg-black/20 p-5 text-sm leading-6 text-white/45">
            No completed match reports are available for this season yet. Enter the details in Match Reports after a result is recorded.
          </div>
        )}
      </section>

      <section className="rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-xs leading-5 text-white/40">
        Stats are read from SIXFL&apos;s canonical player-match performance records. If a goal, assist, rating, appearance or MOTM award looks wrong, correct the relevant fixture in Match Reports rather than editing totals here.
        {totalMotm > 0 ? ` ${totalMotm} MOTM award${totalMotm === 1 ? " has" : "s have"} been recorded this season.` : ""}
      </section>
    </div>
  );
}
