// ========================================
// File: src/app/captain/team/[teamid]/page.tsx
// ========================================

import Link from "next/link";
import { notFound } from "next/navigation";
import { PaymentChargeStatus, ResultDisputeStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireCaptain } from "@/lib/requireCaptain";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Captain Overview | SIXFL",
};

function formatDate(date: Date) {
  return date.toLocaleDateString("en-GB", {
    weekday: "short",
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function formatTime(date: Date) {
  return date.toLocaleTimeString("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatMoney(amountPence: number) {
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: "GBP",
  }).format(amountPence / 100);
}

function getOutcome(goalsFor: number, goalsAgainst: number) {
  if (goalsFor > goalsAgainst) return "W";
  if (goalsFor < goalsAgainst) return "L";
  return "D";
}

export default async function CaptainOverviewPage({
  params,
}: {
  params: Promise<{ teamid: string }>;
}) {
  const { teamid } = await params;
  await requireCaptain(teamid);

  const [team, upcomingFixtures, recentFixtures, unreadThreads, charges, transactions] =
    await Promise.all([
      prisma.team.findUnique({
        where: { id: teamid },
        select: {
          id: true,
          name: true,
          leagueId: true,
          league: {
            select: {
              id: true,
              name: true,
              season: true,
            },
          },
          members: {
            where: { isActive: true },
            include: {
              user: { select: { id: true, name: true, email: true } },
            },
          },
        },
      }),
      prisma.fixture.findMany({
        where: {
          OR: [{ homeTeamId: teamid }, { awayTeamId: teamid }],
          kickoffAt: { gte: new Date() },
        },
        orderBy: { kickoffAt: "asc" },
        take: 3,
        include: {
          homeTeam: { select: { name: true } },
          awayTeam: { select: { name: true } },
          venue: { select: { name: true } },
        },
      }),
      prisma.fixture.findMany({
        where: {
          OR: [{ homeTeamId: teamid }, { awayTeamId: teamid }],
          result: { isNot: null },
        },
        orderBy: { kickoffAt: "desc" },
        take: 5,
        include: {
          homeTeam: { select: { name: true } },
          awayTeam: { select: { name: true } },
          result: {
            include: {
              teamMetadata: true,
              disputes: {
                where: {
                  teamId: teamid,
                  status: {
                    in: [ResultDisputeStatus.OPEN, ResultDisputeStatus.UNDER_REVIEW],
                  },
                },
              },
            },
          },
        },
      }),
      prisma.messageThread.count({
        where: {
          teamId: teamid,
          unreadForCaptainCount: { gt: 0 },
        },
      }),
      prisma.paymentCharge.findMany({
        where: {
          teamId: teamid,
          status: {
            notIn: [PaymentChargeStatus.VOID, PaymentChargeStatus.WAIVED],
          },
        },
        include: {
          allocations: true,
        },
      }),
      prisma.paymentTransaction.findMany({
        where: { teamId: teamid },
        include: { allocations: true },
      }),
    ]);

  if (!team) notFound();

  const nextFixture = upcomingFixtures[0] ?? null;
  const now = Date.now();

  const balancesByCharge = charges.map((charge) => {
    const allocated = charge.allocations.reduce((sum, row) => sum + row.amountPence, 0);
    return {
      charge,
      allocated,
      outstanding: Math.max(charge.amountPence - allocated, 0),
    };
  });

  const outstandingPence = balancesByCharge.reduce(
    (sum, row) => sum + row.outstanding,
    0,
  );
  const overduePence = balancesByCharge
    .filter((row) => row.outstanding > 0 && row.charge.dueAt && row.charge.dueAt < new Date())
    .reduce((sum, row) => sum + row.outstanding, 0);
  const collectedPence = transactions.reduce((sum, row) => sum + row.amountPence, 0);
  const unpaidPlayers = new Set(
    balancesByCharge
      .filter((row) => row.outstanding > 0)
      .map((row) => row.charge.playerNameSnapshot),
  ).size;

  const recentResults = recentFixtures.map((fixture) => {
    const isHome = fixture.homeTeamId === teamid;
    const goalsFor = isHome ? fixture.result!.homeScore : fixture.result!.awayScore;
    const goalsAgainst = isHome ? fixture.result!.awayScore : fixture.result!.homeScore;
    const meta = fixture.result!.teamMetadata.find((item) => item.teamId === teamid) ?? null;
    const scorers = Array.isArray(meta?.scorers) ? (meta?.scorers as Array<{ name: string; goals: number }>) : [];
    const goalsRecorded = meta?.goalsRecorded ?? 0;
    const goalsExpected = goalsFor;

    return {
      id: fixture.id,
      opponent: isHome ? fixture.awayTeam.name : fixture.homeTeam.name,
      goalsFor,
      goalsAgainst,
      outcome: getOutcome(goalsFor, goalsAgainst),
      playedAt: fixture.kickoffAt,
      scorers,
      playerOfMatch: meta?.playerOfMatchName ?? null,
      needsScorers: goalsRecorded < goalsExpected,
      needsPom: !meta?.playerOfMatchName,
      hasActiveDispute: fixture.result!.disputes.length > 0,
    };
  });

  const resultsMissingScorers = recentFixtures.filter((fixture) => {
    const isHome = fixture.homeTeamId === teamid;
    const goalsExpected = isHome ? fixture.result!.homeScore : fixture.result!.awayScore;
    const meta = fixture.result!.teamMetadata.find((item) => item.teamId === teamid);
    return (meta?.goalsRecorded ?? 0) < goalsExpected;
  }).length;

  const resultsMissingPom = recentFixtures.filter((fixture) => {
    const meta = fixture.result!.teamMetadata.find((item) => item.teamId === teamid);
    return !meta?.playerOfMatchName;
  }).length;

  const activeDisputes = recentFixtures.filter(
    (fixture) => fixture.result!.disputes.length > 0,
  ).length;

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-white/10 bg-white/5 p-6">
        <p className="text-sm uppercase tracking-[0.2em] text-emerald-300/80">Page title</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight">Overview</h1>
        <p className="mt-2 text-sm text-white/65">
          Matchday snapshot, recent results, outstanding actions, and payment totals for {team.name}.
        </p>
      </section>

      <div className="grid gap-6 lg:grid-cols-[1.4fr,1fr]">
        <section className="rounded-2xl border border-white/10 bg-white/5 p-6">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-sm uppercase tracking-[0.2em] text-emerald-300/80">
                Next fixture
              </p>
              {nextFixture ? (
                <>
                  <h2 className="mt-3 text-2xl font-semibold">
                    {nextFixture.homeTeam.name} vs {nextFixture.awayTeam.name}
                  </h2>
                  <p className="mt-2 text-white/70">
                    {formatDate(nextFixture.kickoffAt)} · {formatTime(nextFixture.kickoffAt)}
                    {nextFixture.venue?.name ? ` · ${nextFixture.venue.name}` : ""}
                  </p>
                </>
              ) : (
                <h2 className="mt-3 text-2xl font-semibold">No upcoming fixture</h2>
              )}
            </div>

            {nextFixture ? (
              <span className="rounded-full border border-emerald-400/30 bg-emerald-500/10 px-3 py-1 text-sm text-emerald-200">
                {Math.max(
                  0,
                  Math.ceil((nextFixture.kickoffAt.getTime() - now) / (1000 * 60 * 60 * 24)),
                )} day(s)
              </span>
            ) : null}
          </div>

          <div className="mt-6 grid gap-3 sm:grid-cols-3">
            {upcomingFixtures.length === 0 ? (
              <div className="rounded-xl border border-dashed border-white/10 px-4 py-5 text-sm text-white/60 sm:col-span-3">
                Fixtures will appear here once they are published.
              </div>
            ) : (
              upcomingFixtures.map((fixture) => (
                <div key={fixture.id} className="rounded-xl border border-white/10 bg-[#0d1428] p-4">
                  <p className="text-sm text-white/60">
                    {formatDate(fixture.kickoffAt)} · {formatTime(fixture.kickoffAt)}
                  </p>
                  <p className="mt-2 font-medium">
                    {fixture.homeTeam.name} vs {fixture.awayTeam.name}
                  </p>
                  <p className="mt-2 text-sm text-white/55">
                    {fixture.venue?.name ?? "Venue TBC"}
                  </p>
                </div>
              ))
            )}
          </div>
        </section>

        <section className="rounded-2xl border border-white/10 bg-white/5 p-6">
          <p className="text-sm uppercase tracking-[0.2em] text-emerald-300/80">At a glance</p>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <div className="rounded-xl border border-white/10 bg-[#0d1428] p-4">
              <p className="text-sm text-white/55">Active squad</p>
              <p className="mt-2 text-3xl font-semibold">{team.members.length}</p>
            </div>
            <div className="rounded-xl border border-white/10 bg-[#0d1428] p-4">
              <p className="text-sm text-white/55">Unread inbox threads</p>
              <p className="mt-2 text-3xl font-semibold">{unreadThreads}</p>
            </div>
            <div className="rounded-xl border border-white/10 bg-[#0d1428] p-4">
              <p className="text-sm text-white/55">Outstanding</p>
              <p className="mt-2 text-3xl font-semibold">{formatMoney(outstandingPence)}</p>
            </div>
            <div className="rounded-xl border border-white/10 bg-[#0d1428] p-4">
              <p className="text-sm text-white/55">Collected</p>
              <p className="mt-2 text-3xl font-semibold">{formatMoney(collectedPence)}</p>
            </div>
          </div>
        </section>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1.4fr,1fr]">
        <section className="rounded-2xl border border-white/10 bg-white/5 p-6">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-xl font-semibold">Recent results</h2>
            <Link
              href={`/captain/team/${team.id}/results`}
              className="rounded-full border border-white/10 px-4 py-2 text-sm text-white/80 hover:border-emerald-400/40 hover:bg-emerald-500/10"
            >
              Open results
            </Link>
          </div>

          <div className="space-y-3">
            {recentResults.length === 0 ? (
              <div className="rounded-xl border border-dashed border-white/10 px-4 py-5 text-sm text-white/60">
                Results will show here once scores have been entered.
              </div>
            ) : (
              recentResults.map((result) => (
                <div key={result.id} className="rounded-xl border border-white/10 bg-[#0d1428] p-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <p className="text-sm text-white/55">{formatDate(result.playedAt)}</p>
                      <h3 className="mt-1 text-lg font-medium">vs {result.opponent}</h3>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="rounded-full border border-white/10 px-3 py-1 text-sm text-white/70">
                        {result.goalsFor}-{result.goalsAgainst}
                      </span>
                      <span className="rounded-full border border-emerald-400/30 bg-emerald-500/10 px-3 py-1 text-sm text-emerald-200">
                        {result.outcome}
                      </span>
                    </div>
                  </div>
                  <p className="mt-3 text-sm text-white/70">
                    Scorers:{" "}
                    {result.scorers.length > 0
                      ? result.scorers.map((row) => `${row.name} x${row.goals}`).join(", ")
                      : "Not recorded"}
                  </p>
                  <p className="mt-1 text-sm text-white/70">
                    Player of the Match: {result.playerOfMatch ?? "Not recorded"}
                  </p>
                  {(result.needsScorers || result.needsPom || result.hasActiveDispute) && (
                    <div className="mt-3 flex flex-wrap gap-2 text-xs">
                      {result.needsScorers ? (
                        <span className="rounded-full bg-amber-500/15 px-3 py-1 text-amber-200">
                          Needs scorers
                        </span>
                      ) : null}
                      {result.needsPom ? (
                        <span className="rounded-full bg-amber-500/15 px-3 py-1 text-amber-200">
                          Needs POM
                        </span>
                      ) : null}
                      {result.hasActiveDispute ? (
                        <span className="rounded-full bg-red-500/15 px-3 py-1 text-red-200">
                          Dispute open
                        </span>
                      ) : null}
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        </section>

        <section className="rounded-2xl border border-white/10 bg-white/5 p-6">
          <h2 className="text-xl font-semibold">Outstanding actions</h2>
          <div className="mt-4 space-y-3">
            <div className="rounded-xl border border-white/10 bg-[#0d1428] p-4">
              <p className="text-sm text-white/55">Results missing scorers</p>
              <p className="mt-2 text-2xl font-semibold">{resultsMissingScorers}</p>
            </div>
            <div className="rounded-xl border border-white/10 bg-[#0d1428] p-4">
              <p className="text-sm text-white/55">Results missing POM</p>
              <p className="mt-2 text-2xl font-semibold">{resultsMissingPom}</p>
            </div>
            <div className="rounded-xl border border-white/10 bg-[#0d1428] p-4">
              <p className="text-sm text-white/55">Active disputes</p>
              <p className="mt-2 text-2xl font-semibold">{activeDisputes}</p>
            </div>
            <div className="rounded-xl border border-white/10 bg-[#0d1428] p-4">
              <p className="text-sm text-white/55">Overdue balance</p>
              <p className="mt-2 text-2xl font-semibold">{formatMoney(overduePence)}</p>
              <p className="mt-2 text-sm text-white/50">Unpaid players: {unpaidPlayers}</p>
            </div>
            <div className="flex gap-2 pt-2">
              <Link
                href={`/captain/team/${team.id}/results`}
                className="rounded-full border border-white/10 px-4 py-2 text-sm text-white/80 hover:border-emerald-400/40 hover:bg-emerald-500/10"
              >
                Manage results
              </Link>
              <Link
                href={`/captain/team/${team.id}/payments`}
                className="rounded-full border border-white/10 px-4 py-2 text-sm text-white/80 hover:border-emerald-400/40 hover:bg-emerald-500/10"
              >
                Manage payments
              </Link>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
