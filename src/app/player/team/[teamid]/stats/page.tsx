import { getServerSession } from "next-auth";
import { notFound, redirect } from "next/navigation";
import { Prisma, UserRole } from "@prisma/client";

import { authOptions } from "@/auth";
import { formatDateTimeInLondon } from "@/lib/datetime/london";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const metadata = { title: "Player Stats | SIXFL" };

type SquadStatRow = {
  teamMemberId: string;
  name: string;
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

function formatRating(value: number | null) {
  return value === null || !Number.isFinite(value) ? "—" : value.toFixed(1);
}

function formatDate(value: Date) {
  return formatDateTimeInLondon(value, {
    weekday: "short",
    day: "2-digit",
    month: "short",
  });
}

function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean).slice(0, 2);
  return parts.map((part) => part[0]?.toUpperCase() ?? "").join("") || "?";
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

export default async function PlayerStatsPage({
  params,
}: {
  params: Promise<{ teamid: string }>;
}) {
  const { teamid } = await params;
  const session = await getServerSession(authOptions);

  if (!session?.user?.email) {
    redirect(`/login?callbackUrl=${encodeURIComponent(`/player/team/${teamid}/stats`)}`);
  }

  const user = await prisma.user.findUnique({
    where: { email: session.user.email.trim().toLowerCase() },
    select: {
      id: true,
      role: true,
      teamMembers: {
        where: { teamId: teamid },
        select: { id: true },
        take: 1,
      },
    },
  });

  if (!user) {
    redirect(`/login?callbackUrl=${encodeURIComponent(`/player/team/${teamid}/stats`)}`);
  }

  const ownMembershipId = user.teamMembers[0]?.id ?? null;
  if (!ownMembershipId && user.role !== UserRole.ADMIN) notFound();

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
  const competitionLabel =
    team.league?.competition?.name ?? currentLeague?.name ?? "SIXFL";
  const leagueFilter = currentLeagueId
    ? Prisma.sql`AND fixture."leagueId" = ${currentLeagueId}`
    : Prisma.empty;

  const squadStats = await prisma.$queryRaw<SquadStatRow[]>(Prisma.sql`
    SELECT
      member."id" AS "teamMemberId",
      COALESCE(NULLIF(BTRIM(account."name"), ''), account."email", 'Unnamed player') AS "name",
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
    GROUP BY result."id", fixture."id", home_team."name", away_team."name"
    ORDER BY fixture."kickoffAt" DESC
    LIMIT 6
  `);

  const scorerLeaders = topRows(squadStats, (row) => row.goals);
  const assistLeaders = topRows(squadStats, (row) => row.assists);
  const motmLeaders = topRows(squadStats, (row) => row.playerOfMatchAwards);
  const ratingLeaders = topRows(
    squadStats,
    (row) => row.averageRating ?? 0,
    (row) => row.ratingCount > 0 && row.averageRating !== null,
  );
  const ownStats = squadStats.find((row) => row.teamMemberId === ownMembershipId) ?? null;
  const sortedSquad = squadStats
    .slice()
    .sort(
      (a, b) =>
        b.goals + b.assists - (a.goals + a.assists) ||
        b.goals - a.goals ||
        b.playerOfMatchAwards - a.playerOfMatchAwards ||
        a.name.localeCompare(b.name),
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

  return (
    <main className="px-4 py-6 text-white">
      <div className="mx-auto max-w-6xl space-y-6">
        <section className="overflow-hidden rounded-3xl border border-violet-400/20 bg-[radial-gradient(circle_at_top_right,rgba(139,92,246,0.18),transparent_36%),linear-gradient(180deg,rgba(255,255,255,0.055),rgba(255,255,255,0.025))] p-6 shadow-[0_24px_80px_rgba(0,0,0,0.28)] sm:p-8">
          <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-[11px] font-black uppercase tracking-[0.22em] text-violet-200/70">
                {team.name} · {seasonLabel}
              </p>
              <h1 className="mt-2 text-3xl font-black tracking-tight text-white sm:text-4xl">
                Player stats
              </h1>
              <p className="mt-3 max-w-3xl text-sm leading-6 text-white/60 sm:text-base">
                Read-only squad performance for {competitionLabel}: appearances, goals,
                assists, ratings and Player of the Match awards recorded from match reports.
              </p>
            </div>
            {team.logoUrl ? (
              <img
                src={team.logoUrl}
                alt={`${team.name} badge`}
                className="h-20 w-20 shrink-0 rounded-2xl object-contain"
              />
            ) : null}
          </div>
        </section>

        {ownStats ? (
          <section className="rounded-3xl border border-emerald-400/20 bg-emerald-500/[0.08] p-5 sm:p-6">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-emerald-100/65">
              Your season
            </p>
            <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
              {[
                ["Apps", ownStats.appearances],
                ["Goals", ownStats.goals],
                ["Assists", ownStats.assists],
                ["G+A", ownStats.goals + ownStats.assists],
                ["MOTM", ownStats.playerOfMatchAwards],
                ["Rating", formatRating(ownStats.averageRating)],
              ].map(([label, value]) => (
                <div key={String(label)} className="rounded-2xl border border-white/10 bg-black/20 p-3 text-center">
                  <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-white/45">{label}</div>
                  <div className="mt-1 text-2xl font-black text-white">{value}</div>
                </div>
              ))}
            </div>
          </section>
        ) : null}

        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {leaderboardCards.map((card) => (
            <article key={card.title} className="rounded-3xl border border-white/10 bg-black/20 p-5">
              <div className="flex items-center justify-between gap-3">
                <h2 className="font-bold text-white">{card.title}</h2>
                <span className={`text-[10px] font-semibold uppercase tracking-[0.14em] ${card.accent}`}>
                  {card.label}
                </span>
              </div>
              {card.rows.length > 0 ? (
                <div className="mt-4 space-y-2">
                  {card.rows.map((player, index) => (
                    <div
                      key={`${card.title}-${player.teamMemberId}`}
                      className={`flex items-center gap-3 rounded-2xl border px-3 py-3 ${
                        player.teamMemberId === ownMembershipId
                          ? "border-emerald-400/25 bg-emerald-500/10"
                          : "border-white/10 bg-white/[0.035]"
                      }`}
                    >
                      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white/[0.07] text-xs font-black text-white/60">
                        {index + 1}
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm font-semibold text-white">
                          {player.name}{player.teamMemberId === ownMembershipId ? " · You" : ""}
                        </div>
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
            <h2 className="mt-2 text-2xl font-black text-white">Season leaderboard</h2>
          </div>

          <div className="divide-y divide-white/10">
            {sortedSquad.map((player, index) => (
              <div
                key={player.teamMemberId}
                className={`grid gap-4 p-4 sm:p-5 lg:grid-cols-[52px_minmax(180px,1fr)_repeat(6,minmax(70px,0.42fr))] lg:items-center ${
                  player.teamMemberId === ownMembershipId ? "bg-emerald-500/[0.07]" : ""
                }`}
              >
                <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-white/10 bg-black/20 text-sm font-black text-white/55">
                  {index + 1}
                </div>
                <div className="flex min-w-0 items-center gap-3">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white/[0.07] text-xs font-black text-white/60">
                    {initials(player.name)}
                  </div>
                  <div className="min-w-0">
                    <div className="truncate font-semibold text-white">
                      {player.name}{player.teamMemberId === ownMembershipId ? " · You" : ""}
                    </div>
                    <div className="mt-0.5 text-xs text-white/35">{roleLabel(player.role)}</div>
                  </div>
                </div>
                {[
                  ["Apps", player.appearances],
                  ["Goals", player.goals],
                  ["Assists", player.assists],
                  ["G+A", player.goals + player.assists],
                  ["MOTM", player.playerOfMatchAwards],
                  ["Rating", formatRating(player.averageRating)],
                ].map(([label, value]) => (
                  <div key={String(label)} className="rounded-xl border border-white/10 bg-black/15 px-2 py-2 text-center lg:border-0 lg:bg-transparent lg:p-0">
                    <div className="text-[9px] font-semibold uppercase tracking-[0.12em] text-white/35 lg:hidden">{label}</div>
                    <div className="mt-0.5 text-sm font-bold text-white lg:mt-0">{value}</div>
                  </div>
                ))}
              </div>
            ))}
            {sortedSquad.length === 0 ? (
              <div className="p-6 text-sm text-white/50">No squad players are available yet.</div>
            ) : null}
          </div>
        </section>

        <section className="rounded-3xl border border-white/10 bg-white/[0.035] p-5 sm:p-6">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-sky-300/70">
            Recent matches
          </p>
          <h2 className="mt-2 text-2xl font-black text-white">Latest recorded performances</h2>
          <div className="mt-5 grid gap-3 md:grid-cols-2">
            {recentMatches.map((match) => {
              const teamWasHome = match.homeTeamId === teamid;
              const opponent = teamWasHome ? match.awayTeamName : match.homeTeamName;
              const teamScore = teamWasHome ? match.homeScore : match.awayScore;
              const opponentScore = teamWasHome ? match.awayScore : match.homeScore;
              return (
                <article key={match.matchResultId} className="rounded-2xl border border-white/10 bg-black/20 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="text-xs text-white/40">{formatDate(match.kickoffAt)}</div>
                      <div className="mt-1 font-semibold text-white">vs {opponent}</div>
                    </div>
                    <div className="rounded-xl border border-white/10 bg-white/[0.05] px-3 py-2 text-lg font-black text-white">
                      {teamScore}–{opponentScore}
                    </div>
                  </div>
                  <div className="mt-4 flex flex-wrap gap-2 text-xs text-white/60">
                    <span className="rounded-full border border-white/10 bg-white/[0.04] px-2.5 py-1">⚽ {match.goalsRecorded} goals</span>
                    <span className="rounded-full border border-white/10 bg-white/[0.04] px-2.5 py-1">A {match.assistsRecorded} assists</span>
                    <span className="rounded-full border border-white/10 bg-white/[0.04] px-2.5 py-1">Rating {formatRating(match.averageRating)}</span>
                    {match.playerOfMatchName ? (
                      <span className="rounded-full border border-violet-400/20 bg-violet-500/10 px-2.5 py-1 text-violet-100">MOTM {match.playerOfMatchName}</span>
                    ) : null}
                  </div>
                </article>
              );
            })}
            {recentMatches.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-white/10 p-5 text-sm text-white/45">
                Match stats will appear here as match reports are completed.
              </div>
            ) : null}
          </div>
        </section>
      </div>
    </main>
  );
}
