// ========================================
// File: src/app/captain/team/[teamid]/page.tsx
// ========================================

import Link from "next/link";
import { notFound } from "next/navigation";

import { FixtureCaptainConfirmationStatus } from "@prisma/client";
import LeagueTableCard from "@/components/leagues/LeagueTableCard";
import { formatDateTimeInLondon } from "@/lib/datetime/london";
import { getLeagueTable } from "@/lib/leagueTable";
import { prisma } from "@/lib/prisma";
import { requireCaptain } from "@/lib/requireCaptain";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export const metadata = {
  title: "Captain Overview | SIXFL",
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

function formatShortDateTime(value: Date) {
  return formatDateTimeInLondon(value, {
    day: "2-digit",
    month: "short",
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

function formatOrdinal(value: number) {
  const mod10 = value % 10;
  const mod100 = value % 100;

  if (mod10 === 1 && mod100 !== 11) return `${value}st`;
  if (mod10 === 2 && mod100 !== 12) return `${value}nd`;
  if (mod10 === 3 && mod100 !== 13) return `${value}rd`;
  return `${value}th`;
}

function getFixtureLabel(input: {
  homeTeamName: string;
  awayTeamName: string;
}) {
  return `${input.homeTeamName} vs ${input.awayTeamName}`;
}

function getResultLabel(goalsFor: number, goalsAgainst: number) {
  if (goalsFor > goalsAgainst) return "Win";
  if (goalsFor < goalsAgainst) return "Loss";
  return "Draw";
}

function getFixtureCountdownLabel(kickoffAt: Date) {
  const now = new Date();
  const diffMs = kickoffAt.getTime() - now.getTime();

  if (diffMs <= 0) return "Kick-off time reached";

  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffDays = Math.floor(diffHours / 24);

  if (diffDays >= 2) return `${diffDays} days to go`;
  if (diffHours >= 24) return "Tomorrow";
  if (diffHours >= 1) return `${diffHours} hour${diffHours === 1 ? "" : "s"} to go`;

  return "Today";
}

function getFixtureConfirmationSummary(input: {
  confirmation:
    | {
        status: FixtureCaptainConfirmationStatus;
        confirmedAt: Date | null;
        issueRaisedAt: Date | null;
        lastChasedAt: Date | null;
      }
    | null
    | undefined;
  kickoffAt: Date;
}) {
  const confirmation = input.confirmation ?? null;
  const diffMs = input.kickoffAt.getTime() - Date.now();
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));

  if (confirmation?.status === "CONFIRMED") {
    return {
      label: "Fixture confirmed",
      tone: "emerald" as const,
      helper: confirmation.confirmedAt
        ? `Confirmed ${formatShortDateTime(confirmation.confirmedAt)}`
        : "Confirmed",
    };
  }

  if (confirmation?.status === "ISSUE_RAISED") {
    return {
      label: "Issue raised",
      tone: "amber" as const,
      helper: confirmation.issueRaisedAt
        ? `Raised ${formatShortDateTime(confirmation.issueRaisedAt)}`
        : "Awaiting review",
    };
  }

  if (diffHours <= 24) {
    return {
      label: "Overdue",
      tone: "red" as const,
      helper:
        confirmation?.lastChasedAt != null
          ? `Reminder sent ${formatShortDateTime(confirmation.lastChasedAt)}`
          : "Confirmation needed urgently",
    };
  }

  if (diffHours <= 72) {
    return {
      label: "Awaiting confirmation",
      tone: "amber" as const,
      helper:
        confirmation?.lastChasedAt != null
          ? `Reminder sent ${formatShortDateTime(confirmation.lastChasedAt)}`
          : "Please confirm before matchday",
    };
  }

  return {
    label: "Awaiting confirmation",
    tone: "neutral" as const,
    helper:
      confirmation?.lastChasedAt != null
        ? `Reminder sent ${formatShortDateTime(confirmation.lastChasedAt)}`
        : "Confirmation window open",
  };
}

function getToneClasses(tone: "emerald" | "amber" | "red" | "neutral") {
  switch (tone) {
    case "emerald":
      return "border-emerald-400/20 bg-emerald-500/10 text-emerald-100";
    case "amber":
      return "border-amber-400/20 bg-amber-500/10 text-amber-100";
    case "red":
      return "border-red-400/20 bg-red-500/10 text-red-100";
    default:
      return "border-white/10 bg-white/5 text-white/75";
  }
}

function getPublicLeagueTableTitle(leagueName?: string | null) {
  const compactLeagueText = (leagueName ?? "").replace(/·/g, " ").replace(/\s+/g, " ").trim();

  if (/Harrogate\s+West/i.test(compactLeagueText)) {
    return "Current Harrogate West 6 a side table";
  }

  const beforeSeason = compactLeagueText.split(/Spring|Summer|Autumn|Winter|Season/i)[0]?.trim();
  const cleaned = beforeSeason
    ?.replace(/^SIXFL\s+/i, "")
    .replace(/\bMens\b/i, "")
    .replace(/\bWomens\b/i, "")
    .replace(/\bLeague\b/gi, "")
    .replace(/\bTuesday\b|\bWednesday\b|\bThursday\b|\bMonday\b|\bFriday\b|\bSaturday\b|\bSunday\b/gi, "")
    .replace(/\s+/g, " ")
    .trim();

  return cleaned ? `Current ${cleaned} 6 a side table` : "Current league table";
}

function getPublicLeagueTableDescription(title: string) {
  const location = title.replace(/^Current\s+/i, "").replace(/\s+6 a side table$/i, "");

  return `Follow the latest standings, points, goal difference and recent form in this ${location} 6 a side football league.`;
}

export default async function CaptainOverviewPage({
  params,
}: {
  params: Promise<{ teamid: string }>;
}) {
  const { teamid } = await params;
  await requireCaptain(teamid);

  const [
    team,
    upcomingFixtures,
    recentResults,
    completionResults,
    activeDisputeCount,
    paymentCharges,
  ] = await Promise.all([
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
            venueName: true,
            dayOfWeek: true,
          },
        },
      },
    }),
    prisma.fixture.findMany({
      where: {
        OR: [{ homeTeamId: teamid }, { awayTeamId: teamid }],
        kickoffAt: { gte: new Date() },
        result: null,
        status: "SCHEDULED",
      },
      orderBy: [{ kickoffAt: "asc" }],
      take: 5,
      include: {
        homeTeam: { select: { id: true, name: true } },
        awayTeam: { select: { id: true, name: true } },
        venue: { select: { name: true } },
        captainConfirmations: {
          where: { teamId: teamid },
          select: {
            status: true,
            confirmedAt: true,
            issueRaisedAt: true,
            lastChasedAt: true,
          },
          take: 1,
        },
      },
    }),
    prisma.fixture.findMany({
      where: {
        OR: [{ homeTeamId: teamid }, { awayTeamId: teamid }],
        result: { isNot: null },
      },
      orderBy: [{ kickoffAt: "desc" }],
      take: 5,
      include: {
        homeTeam: { select: { id: true, name: true } },
        awayTeam: { select: { id: true, name: true } },
        result: {
          select: {
            id: true,
            homeScore: true,
            awayScore: true,
            isDisputed: true,
            disputes: {
              where: {
                teamId: teamid,
                status: {
                  in: ["OPEN", "REVIEW"],
                },
              },
              select: {
                id: true,
                status: true,
              },
            },
          },
        },
      },
    }),
    prisma.fixture.findMany({
      where: {
        OR: [{ homeTeamId: teamid }, { awayTeamId: teamid }],
        result: { isNot: null },
      },
      orderBy: [{ kickoffAt: "desc" }],
      include: {
        result: {
          include: {
            teamMetadata: {
              where: {
                teamId: teamid,
              },
            },
          },
        },
      },
    }),
    prisma.resultDispute.count({
      where: {
        teamId: teamid,
        status: {
          in: ["OPEN", "REVIEW"],
        },
      },
    }),
    prisma.paymentCharge.findMany({
      where: {
        teamId: teamid,
        status: {
          notIn: ["PAID", "VOID"],
        },
      },
      include: {
        transactions: {
          select: {
            amountPence: true,
          },
        },
      },
    }),
  ]);

  if (!team) {
    notFound();
  }

  const leagueTable = team.leagueId ? await getLeagueTable(team.leagueId) : [];
  const currentTeamPosition = leagueTable.findIndex((row) => row.teamId === teamid);
  const currentTeamRow =
    currentTeamPosition >= 0 ? leagueTable[currentTeamPosition] : null;
  const leagueTableTitle = getPublicLeagueTableTitle(team.league?.name);
  const leagueTableDescription = getPublicLeagueTableDescription(leagueTableTitle);

  const nextFixture = upcomingFixtures[0] ?? null;
  const nextFixtureConfirmation = nextFixture?.captainConfirmations[0] ?? null;
  const nextFixtureStatus = nextFixture
    ? getFixtureConfirmationSummary({
        confirmation: nextFixtureConfirmation,
        kickoffAt: nextFixture.kickoffAt,
      })
    : null;

  const needsCompletionCount = completionResults.filter((fixture) => {
    if (!fixture.result) return false;

    const isHome = fixture.homeTeamId === teamid;
    const goalsFor = isHome ? fixture.result.homeScore : fixture.result.awayScore;
    const teamMeta = fixture.result.teamMetadata[0] ?? null;
    const goalsRecorded = teamMeta?.goalsRecorded ?? 0;
    const playerOfMatchName = teamMeta?.playerOfMatchName ?? null;

    return goalsRecorded < goalsFor || !playerOfMatchName;
  }).length;

  const outstandingBalance = paymentCharges.reduce((sum, charge) => {
    const paid = charge.transactions.reduce(
      (txSum, tx) => txSum + tx.amountPence,
      0,
    );

    return sum + Math.max(charge.amountPence - paid, 0);
  }, 0);

  const openChargeCount = paymentCharges.length;

  return (
    <div className="space-y-8">
      <section className="overflow-hidden rounded-3xl border border-emerald-400/15 bg-[radial-gradient(circle_at_top_left,rgba(16,185,129,0.16),transparent_34%),linear-gradient(180deg,rgba(255,255,255,0.05),rgba(255,255,255,0.03))] shadow-[0_24px_80px_rgba(0,0,0,0.3)]">
        <div className="grid gap-8 px-6 py-6 lg:grid-cols-[1.2fr_0.8fr] lg:px-8 lg:py-8">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-emerald-300/80">
              Next fixture
            </p>

            <h2 className="mt-3 text-2xl font-semibold tracking-tight text-white sm:text-3xl">
              {nextFixture
                ? getFixtureLabel({
                    homeTeamName: nextFixture.homeTeam.name,
                    awayTeamName: nextFixture.awayTeam.name,
                  })
                : "No upcoming fixture"}
            </h2>

            <p className="mt-3 max-w-2xl text-sm text-white/70 sm:text-base">
              {nextFixture
                ? `${formatDateTime(nextFixture.kickoffAt)} · ${
                    nextFixture.venue?.name ?? team.league?.venueName ?? "Venue TBC"
                  }`
                : "As soon as your next match is scheduled, it will appear here."}
            </p>

            {nextFixture && nextFixtureStatus ? (
              <div className="mt-5 flex flex-wrap gap-2">
                <span
                  className={`rounded-full border px-3 py-1 text-xs font-medium ${getToneClasses(
                    nextFixtureStatus.tone,
                  )}`}
                >
                  {nextFixtureStatus.label}
                </span>
                <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-medium text-white/75">
                  {getFixtureCountdownLabel(nextFixture.kickoffAt)}
                </span>
                <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-medium text-white/75">
                  {team.league?.dayOfWeek ?? "Night TBC"}
                </span>
                {currentTeamPosition >= 0 ? (
                  <span className="rounded-full border border-emerald-400/20 bg-emerald-500/10 px-3 py-1 text-xs font-medium text-emerald-100">
                    Position {formatOrdinal(currentTeamPosition + 1)}
                  </span>
                ) : null}
              </div>
            ) : null}

            {nextFixtureStatus?.helper ? (
              <p className="mt-4 text-sm text-white/55">{nextFixtureStatus.helper}</p>
            ) : null}

            <div className="mt-6 flex flex-wrap gap-3">
              <Link
                href={`/captain/team/${teamid}/fixtures`}
                className="inline-flex items-center rounded-full border border-emerald-400/30 bg-emerald-500/15 px-5 py-3 text-sm font-medium text-emerald-50 transition hover:bg-emerald-500/20"
              >
                Open fixtures
              </Link>

              <Link
                href={`/captain/team/${teamid}/results`}
                className="inline-flex items-center rounded-full border border-white/10 bg-black/20 px-5 py-3 text-sm font-medium text-white/80 transition hover:border-white/20 hover:bg-white/5 hover:text-white"
              >
                Manage results
              </Link>

              {leagueTable.length > 0 ? (
                <a
                  href="#captain-league-table"
                  className="inline-flex items-center rounded-full border border-white/10 bg-black/20 px-5 py-3 text-sm font-medium text-white/80 transition hover:border-white/20 hover:bg-white/5 hover:text-white"
                >
                  View table
                </a>
              ) : null}
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-1">
            <div className="rounded-3xl border border-amber-400/20 bg-amber-500/10 p-5">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-amber-100/70">
                Action needed
              </p>
              <p className="mt-3 text-3xl font-semibold text-white">
                {needsCompletionCount}
              </p>
              <p className="mt-2 text-sm text-amber-100/75">
                Result{needsCompletionCount === 1 ? "" : "s"} still need scorers or Player of the Match.
              </p>
            </div>

            <div className="rounded-3xl border border-red-400/20 bg-red-500/10 p-5">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-red-100/70">
                Open issues
              </p>
              <p className="mt-3 text-3xl font-semibold text-white">
                {activeDisputeCount}
              </p>
              <p className="mt-2 text-sm text-red-100/75">
                Dispute{activeDisputeCount === 1 ? "" : "s"} open or under review.
              </p>
            </div>

            <Link
              href={`/captain/team/${teamid}/payments`}
              className="rounded-3xl border border-emerald-400/20 bg-emerald-500/10 p-5 transition hover:bg-emerald-500/15"
            >
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-emerald-100/70">
                Outstanding balance
              </p>
              <p className="mt-3 text-3xl font-semibold text-white">
                {formatMoney(outstandingBalance)}
              </p>
              <p className="mt-2 text-sm text-emerald-100/75">
                {openChargeCount} open charge{openChargeCount === 1 ? "" : "s"}.
              </p>
            </Link>
          </div>
        </div>
      </section>

      <section className="grid gap-8 lg:grid-cols-[1.15fr_0.85fr]">
        <div className="rounded-3xl border border-white/10 bg-white/[0.04]">
          <div className="flex items-center justify-between border-b border-white/10 px-6 py-5">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/45">
                Upcoming fixtures
              </p>
              <h2 className="mt-2 text-xl font-semibold text-white">
                Match schedule
              </h2>
            </div>

            <Link
              href={`/captain/team/${teamid}/fixtures`}
              className="inline-flex items-center rounded-full border border-emerald-400/30 bg-emerald-500/10 px-4 py-2 text-sm font-medium text-emerald-100 transition hover:bg-emerald-500/15"
            >
              View all
            </Link>
          </div>

          <div className="divide-y divide-white/10">
            {upcomingFixtures.length === 0 ? (
              <div className="px-6 py-10 text-sm text-white/55">
                No upcoming fixtures yet.
              </div>
            ) : (
              upcomingFixtures.map((fixture, index) => {
                const confirmation = fixture.captainConfirmations[0] ?? null;
                const status = getFixtureConfirmationSummary({
                  confirmation,
                  kickoffAt: fixture.kickoffAt,
                });

                return (
                  <div
                    key={fixture.id}
                    className="flex flex-col gap-3 px-6 py-5 sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <div className="text-base font-semibold text-white">
                          {getFixtureLabel({
                            homeTeamName: fixture.homeTeam.name,
                            awayTeamName: fixture.awayTeam.name,
                          })}
                        </div>

                        {index === 0 ? (
                          <span className="rounded-full border border-emerald-400/20 bg-emerald-500/10 px-2.5 py-1 text-[11px] font-medium text-emerald-100">
                            Next up
                          </span>
                        ) : null}
                      </div>

                      <div className="mt-1 text-sm text-white/60">
                        {formatDateTime(fixture.kickoffAt)}
                      </div>
                    </div>

                    <div className="text-sm sm:text-right">
                      <div className="text-white/65">
                        {fixture.venue?.name ?? team.league?.venueName ?? "Venue TBC"}
                      </div>
                      <div className="mt-2">
                        <span className={`inline-flex rounded-full border px-3 py-1 text-xs font-medium ${getToneClasses(status.tone)}`}>
                          {status.label}
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        <div className="rounded-3xl border border-white/10 bg-white/[0.04]">
          <div className="flex items-center justify-between border-b border-white/10 px-6 py-5">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/45">
                Recent results
              </p>
              <h2 className="mt-2 text-xl font-semibold text-white">
                Latest scores
              </h2>
            </div>

            <Link
              href={`/captain/team/${teamid}/results`}
              className="inline-flex items-center rounded-full border border-emerald-400/30 bg-emerald-500/10 px-4 py-2 text-sm font-medium text-emerald-100 transition hover:bg-emerald-500/15"
            >
              Open results
            </Link>
          </div>

          <div className="divide-y divide-white/10">
            {recentResults.length === 0 ? (
              <div className="px-6 py-10 text-sm text-white/55">
                No results recorded yet.
              </div>
            ) : (
              recentResults.map((fixture) => {
                const isHome = fixture.homeTeamId === teamid;
                const opponent = isHome ? fixture.awayTeam.name : fixture.homeTeam.name;
                const goalsFor = isHome ? fixture.result!.homeScore : fixture.result!.awayScore;
                const goalsAgainst = isHome ? fixture.result!.awayScore : fixture.result!.homeScore;
                const resultLabel = getResultLabel(goalsFor, goalsAgainst);
                const hasActiveDispute = (fixture.result?.disputes?.length ?? 0) > 0;

                return (
                  <div key={fixture.id} className="px-6 py-5">
                    <div className="flex items-center justify-between gap-4">
                      <div>
                        <div className="flex items-center gap-2">
                          <div className="text-base font-semibold text-white">
                            {opponent}
                          </div>

                          {hasActiveDispute ? (
                            <span className="rounded-full border border-amber-400/30 bg-amber-500/10 px-2.5 py-1 text-[11px] font-medium text-amber-100">
                              Under review
                            </span>
                          ) : null}
                        </div>

                        <div className="mt-1 text-sm text-white/60">
                          {formatDateTime(fixture.kickoffAt)}
                        </div>
                      </div>

                      <div className="text-right">
                        <div className="text-lg font-semibold text-white">
                          {goalsFor} - {goalsAgainst}
                        </div>
                        <div className="mt-1 text-xs uppercase tracking-[0.14em] text-white/45">
                          {resultLabel}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </section>

      <div id="captain-league-table">
        <LeagueTableCard
          rows={leagueTable}
          eyebrow="Standings"
          title={leagueTableTitle}
          description={leagueTableDescription}
          emptyMessage={
            team.leagueId
              ? "The league table will appear here once teams have been added."
              : "Your team is not assigned to a league yet, so there is no table to show here."
          }
          showTeamLinks={false}
        />
      </div>
    </div>
  );
}
