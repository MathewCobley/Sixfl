// ========================================
// File: src/components/player/PlayerLeagueMediaPanel.tsx
// ========================================

import Link from "next/link";
import { getServerSession } from "next-auth";
import { FixtureStatus, Prisma, UserRole } from "@prisma/client";

import { authOptions } from "@/auth";
import { formatDateTimeInLondon } from "@/lib/datetime/london";
import {
  getStoredAiPreviewsByFixtureIds,
  refreshStoredAiPreviewForFixture,
} from "@/lib/fixtures/storedAiPredictions";
import { prisma } from "@/lib/prisma";

type TvSummaryRow = {
  fixtureCount: bigint;
  videoCount: bigint;
};

function formatDateTime(value: Date) {
  return formatDateTimeInLondon(value, {
    weekday: "short",
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default async function PlayerLeagueMediaPanel({ teamId }: { teamId: string }) {
  const session = await getServerSession(authOptions);
  const email = session?.user?.email?.trim().toLowerCase();
  if (!email) return null;

  const user = await prisma.user.findUnique({
    where: { email },
    select: {
      role: true,
      teamMembers: {
        where: { teamId },
        select: { id: true },
        take: 1,
      },
    },
  });

  if (!user || (user.role !== UserRole.ADMIN && user.teamMembers.length === 0)) return null;

  const team = await prisma.team.findUnique({
    where: { id: teamId },
    select: {
      id: true,
      name: true,
      league: {
        select: {
          id: true,
          name: true,
          season: true,
          slug: true,
          venueName: true,
        },
      },
    },
  });

  if (!team) return null;

  const [nextFixture, recentResults, tvSummaryRows] = await Promise.all([
    prisma.fixture.findFirst({
      where: {
        publishedAt: { not: null },
        OR: [{ homeTeamId: teamId }, { awayTeamId: teamId }],
        kickoffAt: { gte: new Date() },
        status: FixtureStatus.SCHEDULED,
        result: null,
      },
      orderBy: { kickoffAt: "asc" },
      select: {
        id: true,
        kickoffAt: true,
        homeTeamId: true,
        homeTeam: { select: { name: true } },
        awayTeam: { select: { name: true } },
      },
    }),
    prisma.fixture.findMany({
      where: {
        publishedAt: { not: null },
        OR: [{ homeTeamId: teamId }, { awayTeamId: teamId }],
        result: { isNot: null },
      },
      orderBy: { kickoffAt: "desc" },
      take: 5,
      select: {
        id: true,
        kickoffAt: true,
        homeTeamId: true,
        homeTeam: { select: { name: true } },
        awayTeam: { select: { name: true } },
        result: { select: { homeScore: true, awayScore: true } },
      },
    }),
    prisma.$queryRaw<TvSummaryRow[]>(Prisma.sql`
      SELECT
        COUNT(*)::bigint AS "fixtureCount",
        COALESCE(SUM(array_length(regexp_split_to_array(f."sixflTvUrl", E'\\n+'), 1)), 0)::bigint AS "videoCount"
      FROM "Fixture" f
      WHERE f."publishedAt" IS NOT NULL
        AND f."sixflTvRecorded" = true
        AND f."sixflTvUrl" IS NOT NULL
        AND f."sixflTvUrl" <> ''
        AND (f."homeTeamId" = ${teamId} OR f."awayTeamId" = ${teamId})
    `),
  ]);

  let prediction = nextFixture
    ? (await getStoredAiPreviewsByFixtureIds([nextFixture.id])).get(nextFixture.id) ?? null
    : null;

  if (
    nextFixture &&
    (!prediction ||
      prediction.predictedHomeScore === null ||
      prediction.predictedAwayScore === null)
  ) {
    prediction = await refreshStoredAiPreviewForFixture(nextFixture.id);
  }

  const scorePrediction =
    prediction &&
    prediction.predictedHomeScore !== null &&
    prediction.predictedAwayScore !== null
      ? {
          home: prediction.predictedHomeScore,
          away: prediction.predictedAwayScore,
          headline: prediction.headline,
          summary: prediction.summary,
        }
      : null;

  const tvSummary = tvSummaryRows[0] ?? {
    fixtureCount: BigInt(0),
    videoCount: BigInt(0),
  };

  return (
    <section className="mx-auto mt-8 grid w-full max-w-6xl gap-6 px-4 lg:grid-cols-[1.05fr_0.95fr]">
      <div className="overflow-hidden rounded-3xl border border-emerald-400/15 bg-white/[0.04] text-white">
        <div className="flex flex-col gap-4 border-b border-white/10 px-6 py-5 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-emerald-300/75">
              League & form
            </p>
            <h2 className="mt-2 text-xl font-semibold">
              {team.league?.name ?? "Your SIXFL league"}
            </h2>
            <p className="mt-1 text-sm text-white/55">
              {[team.league?.season, team.league?.venueName]
                .filter(Boolean)
                .join(" · ") || "League details will appear here."}
            </p>
          </div>
          {team.league?.slug ? (
            <Link
              href={`/leagues/${team.league.slug}`}
              className="inline-flex items-center justify-center rounded-full border border-emerald-400/30 bg-emerald-500/10 px-4 py-2 text-sm font-semibold text-emerald-100 transition hover:bg-emerald-500/15"
            >
              Open league
            </Link>
          ) : null}
        </div>

        <div className="divide-y divide-white/10">
          {recentResults.length === 0 ? (
            <div className="px-6 py-8 text-sm text-white/55">
              No completed results are available yet.
            </div>
          ) : (
            recentResults.map((fixture) => {
              const isHome = fixture.homeTeamId === teamId;
              const opponent = isHome
                ? fixture.awayTeam.name
                : fixture.homeTeam.name;
              const goalsFor = isHome
                ? fixture.result!.homeScore
                : fixture.result!.awayScore;
              const goalsAgainst = isHome
                ? fixture.result!.awayScore
                : fixture.result!.homeScore;
              const outcome =
                goalsFor > goalsAgainst ? "W" : goalsFor < goalsAgainst ? "L" : "D";

              return (
                <div
                  key={fixture.id}
                  className="flex items-center justify-between gap-4 px-6 py-4"
                >
                  <div>
                    <div className="font-semibold text-white">{opponent}</div>
                    <div className="mt-1 text-sm text-white/50">
                      {formatDateTime(fixture.kickoffAt)}
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <span
                      className={`rounded-full border px-2.5 py-1 text-xs font-bold ${
                        outcome === "W"
                          ? "border-emerald-400/25 bg-emerald-500/10 text-emerald-100"
                          : outcome === "L"
                            ? "border-red-400/25 bg-red-500/10 text-red-100"
                            : "border-white/10 bg-white/5 text-white/65"
                      }`}
                    >
                      {outcome}
                    </span>
                    <span className="text-lg font-black text-white">
                      {goalsFor} - {goalsAgainst}
                    </span>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      <div className="space-y-6">
        <div className="rounded-3xl border border-fuchsia-400/20 bg-[radial-gradient(circle_at_top_left,rgba(217,70,239,0.16),transparent_40%),rgba(255,255,255,0.04)] p-6 text-white">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-fuchsia-200/75">
            SIXFL TV
          </p>
          <h2 className="mt-2 text-xl font-semibold">Watch your team</h2>
          <p className="mt-2 text-sm leading-6 text-white/60">
            Match highlights, full matches and extra clips are all available from your
            player area.
          </p>
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <Link
              href={`/player/team/${teamId}/tv`}
              className="inline-flex items-center justify-center rounded-full border border-fuchsia-300/35 bg-fuchsia-500/15 px-5 py-3 text-sm font-semibold text-fuchsia-50 transition hover:bg-fuchsia-500/25"
            >
              Open SIXFL TV
            </Link>
            <span className="text-sm text-white/50">
              {Number(tvSummary.videoCount)} video
              {Number(tvSummary.videoCount) === 1 ? "" : "s"}
            </span>
          </div>
        </div>

        <div className="rounded-3xl border border-emerald-400/20 bg-emerald-500/[0.07] p-6 text-white">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-emerald-300">
            SIXFL AI Predictor
          </p>
          {nextFixture ? (
            <>
              <h2 className="mt-2 text-xl font-semibold">
                {nextFixture.homeTeam.name} vs {nextFixture.awayTeam.name}
              </h2>
              <p className="mt-1 text-sm text-white/55">
                {formatDateTime(nextFixture.kickoffAt)}
              </p>
              {scorePrediction ? (
                <div className="mt-5 rounded-2xl border border-emerald-400/20 bg-black/25 p-4">
                  <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-emerald-200/70">
                    Predicted score
                  </div>
                  <div className="mt-2 text-3xl font-black text-white">
                    {scorePrediction.home} - {scorePrediction.away}
                  </div>
                  <div className="mt-3 text-sm font-semibold text-white">
                    {scorePrediction.headline}
                  </div>
                  <p className="mt-1 text-sm leading-6 text-white/55">
                    {scorePrediction.summary}
                  </p>
                </div>
              ) : (
                <p className="mt-4 text-sm text-white/55">
                  The next prediction is being prepared.
                </p>
              )}
            </>
          ) : (
            <p className="mt-3 text-sm text-white/55">
              No upcoming published fixture is available yet.
            </p>
          )}
        </div>
      </div>
    </section>
  );
}
