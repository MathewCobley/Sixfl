// ========================================
// File: src/app/(admin)/admin/teams/[id]/players/[membershipId]/preview/page.tsx
// ========================================

import Link from "next/link";
import { notFound } from "next/navigation";
import { FixtureStatus, PlayerMatchFeeStatus, TeamRole } from "@prisma/client";

import { formatDateTimeInLondon } from "@/lib/datetime/london";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/requireAdmin";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export const metadata = {
  title: "Player Dashboard Preview | SIXFL Admin",
};

type ContributionRow = {
  name: string;
  goals: number;
  assists: number;
  teamMemberId?: string;
};

function formatFixtureDate(value: Date) {
  return formatDateTimeInLondon(value, {
    weekday: "short",
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

function getFixtureLabel(input: { homeTeamName: string; awayTeamName: string }) {
  return `${input.homeTeamName} vs ${input.awayTeamName}`;
}

function getOpponentName(input: {
  teamId: string;
  homeTeamId: string;
  homeTeamName: string;
  awayTeamName: string;
}) {
  return input.homeTeamId === input.teamId ? input.awayTeamName : input.homeTeamName;
}

function getRoleLabel(role: TeamRole) {
  switch (role) {
    case TeamRole.CAPTAIN:
      return "Captain";
    case TeamRole.MANAGER:
      return "Manager";
    case TeamRole.COACH:
      return "Coach";
    case TeamRole.VICE_CAPTAIN:
      return "Vice captain";
    case TeamRole.BACKUP_PLAYER:
      return "Backup player";
    default:
      return "Player";
  }
}

function getResponseLabel(response?: string | null) {
  switch (response) {
    case "AVAILABLE":
      return "Available";
    case "MAYBE":
      return "Maybe";
    case "UNAVAILABLE":
      return "Unavailable";
    default:
      return "No response";
  }
}

function getResponseClasses(response?: string | null) {
  switch (response) {
    case "AVAILABLE":
      return "border-emerald-400/25 bg-emerald-500/10 text-emerald-100";
    case "MAYBE":
      return "border-amber-400/25 bg-amber-500/10 text-amber-100";
    case "UNAVAILABLE":
      return "border-red-400/25 bg-red-500/10 text-red-100";
    default:
      return "border-white/10 bg-white/[0.04] text-white/60";
  }
}

function getFeeStatusLabel(status: PlayerMatchFeeStatus) {
  switch (status) {
    case PlayerMatchFeeStatus.PAID:
      return "Paid";
    case PlayerMatchFeeStatus.WAIVED:
      return "Waived";
    case PlayerMatchFeeStatus.CANCELLED:
      return "Cancelled";
    default:
      return "Due";
  }
}

function getFeeStatusClasses(status: PlayerMatchFeeStatus) {
  switch (status) {
    case PlayerMatchFeeStatus.PAID:
      return "border-emerald-400/25 bg-emerald-500/10 text-emerald-100";
    case PlayerMatchFeeStatus.WAIVED:
      return "border-sky-400/25 bg-sky-500/10 text-sky-100";
    case PlayerMatchFeeStatus.CANCELLED:
      return "border-red-400/25 bg-red-500/10 text-red-100";
    default:
      return "border-amber-400/25 bg-amber-500/10 text-amber-100";
  }
}

function getFixtureStatusClasses(status: FixtureStatus) {
  switch (status) {
    case FixtureStatus.COMPLETED:
      return "border-emerald-400/20 bg-emerald-500/10 text-emerald-100";
    case FixtureStatus.CANCELLED:
      return "border-red-400/20 bg-red-500/10 text-red-100";
    case FixtureStatus.POSTPONED:
      return "border-amber-400/20 bg-amber-500/10 text-amber-100";
    default:
      return "border-sky-400/20 bg-sky-500/10 text-sky-100";
  }
}

function normalisePlayerName(value: string | null | undefined) {
  return (value ?? "").trim().toLowerCase();
}

function parseStoredContributions(value: unknown): ContributionRow[] {
  if (!Array.isArray(value)) return [];

  return value
    .map((item): ContributionRow | null => {
      if (!item || typeof item !== "object") return null;

      const row = item as Partial<ContributionRow>;
      const name = typeof row.name === "string" ? row.name.trim() : "";
      const goals = Number(row.goals ?? 0);
      const assists = Number(row.assists ?? 0);

      if (
        !name ||
        !Number.isInteger(goals) ||
        goals < 0 ||
        !Number.isInteger(assists) ||
        assists < 0 ||
        goals + assists < 1
      ) {
        return null;
      }

      const contribution: ContributionRow = { name, goals, assists };

      if (typeof row.teamMemberId === "string" && row.teamMemberId.trim()) {
        contribution.teamMemberId = row.teamMemberId;
      }

      return contribution;
    })
    .filter((item): item is ContributionRow => item !== null);
}

export default async function AdminPlayerDashboardPreviewPage({
  params,
}: {
  params: Promise<{ id: string; membershipId: string }>;
}) {
  await requireAdmin();

  const { id: teamid, membershipId } = await params;
  const now = new Date();

  const membership = await prisma.teamMember.findFirst({
    where: { id: membershipId, teamId: teamid },
    select: {
      id: true,
      role: true,
      user: { select: { id: true, name: true, email: true } },
      team: {
        select: {
          id: true,
          name: true,
          logoUrl: true,
          league: {
            select: {
              id: true,
              name: true,
              season: true,
              slug: true,
              venueName: true,
              dayOfWeek: true,
            },
          },
        },
      },
    },
  });

  if (!membership) notFound();

  const team = membership.team;
  const playerName = membership.user.name?.trim() || membership.user.email?.trim() || "Player";
  const playerEmail = membership.user.email?.trim().toLowerCase() || null;
  const linkedMemberships = await prisma.teamMember.findMany({
    where: { userId: membership.user.id },
    select: { id: true },
  });
  const linkedMembershipIds = linkedMemberships.map((item) => item.id);
  const playerFeeIdentityFilter = [
    ...(linkedMembershipIds.length > 0
      ? [
          {
            teamMemberId: {
              in: linkedMembershipIds,
            },
          },
        ]
      : []),
    ...(playerEmail
      ? [
          {
            prospect: {
              email: {
                equals: playerEmail,
                mode: "insensitive" as const,
              },
            },
          },
        ]
      : []),
  ];

  const [upcomingFixtures, recentFixtures, squadMembers, playerFees, matchDetails] = await Promise.all([
    prisma.fixture.findMany({
      where: {
        OR: [{ homeTeamId: teamid }, { awayTeamId: teamid }],
        kickoffAt: { gte: now },
        status: { in: [FixtureStatus.SCHEDULED, FixtureStatus.POSTPONED] },
      },
      orderBy: { kickoffAt: "asc" },
      take: 5,
      select: {
        id: true,
        kickoffAt: true,
        status: true,
        pitch: true,
        homeTeamId: true,
        homeTeam: { select: { name: true } },
        awayTeam: { select: { name: true } },
        venue: { select: { name: true } },
        availabilities: {
          where: { teamMemberId: membership.id },
          select: {
            response: true,
            note: true,
            respondedAt: true,
          },
          take: 1,
        },
      },
    }),
    prisma.fixture.findMany({
      where: {
        OR: [{ homeTeamId: teamid }, { awayTeamId: teamid }],
        kickoffAt: { lt: now },
      },
      orderBy: { kickoffAt: "desc" },
      take: 5,
      select: {
        id: true,
        kickoffAt: true,
        status: true,
        homeTeamId: true,
        homeTeam: { select: { name: true } },
        awayTeam: { select: { name: true } },
        result: { select: { homeScore: true, awayScore: true } },
      },
    }),
    prisma.teamMember.findMany({
      where: { teamId: teamid },
      orderBy: [{ role: "asc" }, { createdAt: "asc" }],
      select: {
        id: true,
        role: true,
        user: { select: { name: true } },
      },
    }),
    playerFeeIdentityFilter.length > 0
      ? prisma.playerMatchFee.findMany({
          where: {
            OR: playerFeeIdentityFilter,
            status: {
              in: [PlayerMatchFeeStatus.OPEN, PlayerMatchFeeStatus.PAID, PlayerMatchFeeStatus.WAIVED],
            },
          },
          orderBy: [{ createdAt: "desc" }],
          take: 20,
          select: {
            id: true,
            fixtureId: true,
            teamId: true,
            amountPence: true,
            status: true,
            paymentUrl: true,
            createdAt: true,
            paidAt: true,
            team: {
              select: {
                name: true,
              },
            },
            fixture: {
              select: {
                kickoffAt: true,
                homeTeamId: true,
                homeTeam: { select: { name: true } },
                awayTeam: { select: { name: true } },
              },
            },
          },
        })
      : Promise.resolve([]),
    prisma.matchResultTeamMeta.findMany({
      where: { teamId: teamid },
      select: {
        scorers: true,
        playerOfMatchName: true,
      },
    }),
  ]);

  const playerNameKey = normalisePlayerName(playerName);
  const playerTotals = matchDetails.reduce(
    (totals, details) => {
      parseStoredContributions(details.scorers).forEach((contribution) => {
        const matchesById = contribution.teamMemberId
          ? linkedMembershipIds.includes(contribution.teamMemberId)
          : false;
        const matchesByName = normalisePlayerName(contribution.name) === playerNameKey;

        if (matchesById || matchesByName) {
          totals.goals += contribution.goals;
          totals.assists += contribution.assists;
        }
      });

      return totals;
    },
    { goals: 0, assists: 0 },
  );
  const playerGoals = playerTotals.goals;
  const playerAssists = playerTotals.assists;
  const playerOfMatchAwards = matchDetails.filter(
    (details) => normalisePlayerName(details.playerOfMatchName) === playerNameKey,
  ).length;

  const openFees = playerFees.filter((fee) => fee.status === PlayerMatchFeeStatus.OPEN);
  const outstandingPence = openFees.reduce((sum, fee) => sum + fee.amountPence, 0);
  const nextOpenFee = openFees
    .slice()
    .sort((a, b) => a.fixture.kickoffAt.getTime() - b.fixture.kickoffAt.getTime())[0];
  const feesByFixtureId = new Map(
    playerFees
      .filter((fee) => fee.teamId === teamid)
      .map((fee) => [fee.fixtureId, fee]),
  );
  const availabilityCount = upcomingFixtures.filter(
    (fixture) => fixture.availabilities[0]?.response === "AVAILABLE",
  ).length;

  return (
    <main className="min-h-screen bg-[#07130f] px-4 py-8 text-white">
      <div className="mx-auto max-w-6xl space-y-8">
        <section className="rounded-3xl border border-amber-400/25 bg-amber-500/10 p-5">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-amber-100/70">
                Admin preview
              </p>
              <h1 className="mt-2 text-2xl font-semibold text-white">
                Viewing {playerName}'s player dashboard
              </h1>
              <p className="mt-1 text-sm text-amber-100/75">
                This preview now includes the player’s recorded fixture availability responses.
              </p>
            </div>
            <div className="flex flex-wrap gap-3">
              <Link
                href={`/captain/team/${teamid}/squad`}
                className="inline-flex items-center rounded-xl border border-white/10 bg-black/20 px-4 py-2.5 text-sm font-medium text-white/80 transition hover:bg-white/5 hover:text-white"
              >
                Back to squad
              </Link>
              <Link
                href={`/admin/teams/${teamid}/communications`}
                className="inline-flex items-center rounded-xl border border-emerald-400/30 bg-emerald-500/10 px-4 py-2.5 text-sm font-medium text-emerald-100 transition hover:bg-emerald-500/15"
              >
                Team comms
              </Link>
            </div>
          </div>
        </section>

        <section className="overflow-hidden rounded-3xl border border-emerald-400/15 bg-[radial-gradient(circle_at_top_left,rgba(16,185,129,0.16),transparent_34%),linear-gradient(180deg,rgba(255,255,255,0.05),rgba(255,255,255,0.03))] p-6 shadow-[0_24px_80px_rgba(0,0,0,0.3)] lg:p-8">
          <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-emerald-300/80">
                Player team area
              </p>
              <h2 className="mt-3 text-3xl font-semibold tracking-tight text-white sm:text-4xl">
                {team.name}
              </h2>
              <p className="mt-3 max-w-2xl text-sm leading-6 text-white/70">
                {playerName} is linked to this SIXFL squad.
              </p>

              <div className="mt-5 flex flex-wrap gap-2">
                {team.league?.name ? (
                  <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-medium text-white/75">
                    {team.league.name}
                    {team.league.season ? ` · ${team.league.season}` : ""}
                  </span>
                ) : null}
                {team.league?.dayOfWeek ? (
                  <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-medium text-white/75">
                    {team.league.dayOfWeek}
                  </span>
                ) : null}
                {team.league?.venueName ? (
                  <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-medium text-white/75">
                    {team.league.venueName}
                  </span>
                ) : null}
                <span className="rounded-full border border-emerald-400/20 bg-emerald-500/10 px-3 py-1 text-xs font-medium text-emerald-100">
                  {getRoleLabel(membership.role)}
                </span>
              </div>
            </div>

            <div className="flex flex-wrap gap-3">
              <Link
                href={
                  upcomingFixtures[0]
                    ? `/player/team/${teamid}/availability?fixtureId=${upcomingFixtures[0].id}`
                    : `/player/team/${teamid}/availability`
                }
                className="inline-flex items-center rounded-xl border border-emerald-400/30 bg-emerald-500/10 px-4 py-2.5 text-sm font-medium text-emerald-100 transition hover:bg-emerald-500/15"
              >
                Confirm availability
              </Link>
              {team.league?.slug ? (
                <Link
                  href={`/leagues/${team.league.slug}`}
                  className="inline-flex items-center rounded-xl border border-white/10 bg-black/20 px-4 py-2.5 text-sm font-medium text-white/80 transition hover:bg-white/5 hover:text-white"
                >
                  View league
                </Link>
              ) : null}
            </div>
          </div>
        </section>

        <section className="grid gap-4 md:grid-cols-4">
          <div className="rounded-3xl border border-emerald-400/15 bg-white/[0.04] p-5">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-emerald-300/75">
              Availability
            </p>
            <h2 className="mt-2 text-xl font-semibold text-white">
              {availabilityCount} available
            </h2>
            <p className="mt-2 text-sm leading-6 text-white/60">
              Across {upcomingFixtures.length} upcoming fixture{upcomingFixtures.length === 1 ? "" : "s"}.
            </p>
          </div>

          <div className="rounded-3xl border border-emerald-400/20 bg-emerald-500/10 p-5">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-emerald-100/70">
              Player stats
            </p>
            <h2 className="mt-2 text-xl font-semibold text-white">
              {playerGoals} goal{playerGoals === 1 ? "" : "s"}
            </h2>
            <p className="mt-2 text-sm leading-6 text-emerald-100/70">
              {playerAssists} assist{playerAssists === 1 ? "" : "s"} · {playerOfMatchAwards} Player of the Match award{playerOfMatchAwards === 1 ? "" : "s"}.
            </p>
          </div>

          <div className="rounded-3xl border border-amber-400/20 bg-amber-500/10 p-5">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-amber-100/70">
              Match fees
            </p>
            <h2 className="mt-2 text-xl font-semibold text-white">
              {outstandingPence > 0 ? `${formatMoney(outstandingPence)} due` : "Nothing due"}
            </h2>
            <p className="mt-2 text-sm leading-6 text-amber-100/70">
              {outstandingPence > 0
                ? `${openFees.length} open fee${openFees.length === 1 ? "" : "s"} linked to this player account.`
                : "No outstanding player match fees are showing for this player."}
            </p>
            {nextOpenFee ? (
              <div className="mt-3 rounded-2xl border border-amber-400/15 bg-black/20 p-3 text-xs text-amber-100/75">
                <span className="font-semibold text-amber-100">Next due:</span>{" "}
                {formatMoney(nextOpenFee.amountPence)} · {nextOpenFee.team.name} · {getFixtureLabel({
                  homeTeamName: nextOpenFee.fixture.homeTeam.name,
                  awayTeamName: nextOpenFee.fixture.awayTeam.name,
                })}
              </div>
            ) : null}
            {nextOpenFee?.paymentUrl ? (
              <Link
                href={nextOpenFee.paymentUrl}
                target="_blank"
                className="mt-4 inline-flex items-center rounded-xl bg-amber-400 px-4 py-2.5 text-sm font-semibold text-black transition hover:bg-amber-300"
              >
                Pay now
              </Link>
            ) : null}
          </div>

          <div className="rounded-3xl border border-white/10 bg-white/[0.04] p-5">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/45">
              Player account
            </p>
            <h2 className="mt-2 text-xl font-semibold text-white">{playerName}</h2>
            <p className="mt-2 break-all text-sm leading-6 text-white/60">
              {membership.user.email ?? "No email on account"}
            </p>
          </div>
        </section>

        <section className="grid gap-6 lg:grid-cols-[1.15fr_0.85fr]">
          <div className="rounded-3xl border border-white/10 bg-white/[0.04] p-6">
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/45">
                  Fixtures
                </p>
                <h2 className="mt-2 text-xl font-semibold text-white">Upcoming fixtures</h2>
              </div>
              <div className="rounded-full border border-white/10 bg-black/20 px-3 py-1 text-xs text-white/60">
                {upcomingFixtures.length} shown
              </div>
            </div>

            <div className="mt-5 space-y-3">
              {upcomingFixtures.length === 0 ? (
                <div className="rounded-2xl border border-white/10 bg-black/20 p-4 text-sm text-white/60">
                  No upcoming fixtures are currently published for this team.
                </div>
              ) : (
                upcomingFixtures.map((fixture) => {
                  const fee = feesByFixtureId.get(fixture.id) ?? null;
                  const availability = fixture.availabilities[0] ?? null;

                  return (
                    <div key={fixture.id} className="rounded-2xl border border-white/10 bg-black/20 p-4">
                      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                        <div>
                          <div className="font-semibold text-white">
                            {getFixtureLabel({
                              homeTeamName: fixture.homeTeam.name,
                              awayTeamName: fixture.awayTeam.name,
                            })}
                          </div>
                          <div className="mt-1 text-sm text-white/60">
                            Opponent: {getOpponentName({
                              teamId: teamid,
                              homeTeamId: fixture.homeTeamId,
                              homeTeamName: fixture.homeTeam.name,
                              awayTeamName: fixture.awayTeam.name,
                            })}
                          </div>
                          <div className="mt-2 text-sm text-white/55">
                            {formatFixtureDate(fixture.kickoffAt)}
                            {fixture.venue?.name ? ` · ${fixture.venue.name}` : ""}
                            {fixture.pitch ? ` · ${fixture.pitch}` : ""}
                          </div>
                          <div className="mt-3 flex flex-wrap gap-2">
                            <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-medium ${getResponseClasses(availability?.response)}`}>
                              Availability: {getResponseLabel(availability?.response)}
                            </span>
                            {availability?.respondedAt ? (
                              <span className="inline-flex rounded-full border border-white/10 bg-white/[0.04] px-2.5 py-1 text-xs font-medium text-white/60">
                                Updated {formatFixtureDate(availability.respondedAt)}
                              </span>
                            ) : null}
                            {fee ? (
                              <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-medium ${getFeeStatusClasses(fee.status)}`}>
                                Fee: {formatMoney(fee.amountPence)} · {getFeeStatusLabel(fee.status)}
                              </span>
                            ) : null}
                            {fee?.status === PlayerMatchFeeStatus.OPEN && fee.paymentUrl ? (
                              <Link
                                href={fee.paymentUrl}
                                target="_blank"
                                className="inline-flex rounded-full border border-amber-400/25 bg-amber-500/10 px-2.5 py-1 text-xs font-medium text-amber-100 transition hover:bg-amber-500/15"
                              >
                                Pay fee
                              </Link>
                            ) : null}
                          </div>
                          {availability?.note ? (
                            <div className="mt-2 text-xs text-white/50">Note: {availability.note}</div>
                          ) : null}
                        </div>
                        <div className="flex flex-wrap gap-2 sm:justify-end">
                          <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold ${getFixtureStatusClasses(fixture.status)}`}>
                            {fixture.status}
                          </span>
                          <Link
                            href={`/player/team/${teamid}/availability?fixtureId=${fixture.id}`}
                            className="inline-flex rounded-full border border-emerald-400/25 bg-emerald-500/10 px-3 py-1.5 text-xs font-semibold text-emerald-100 transition hover:bg-emerald-500/15"
                          >
                            Confirm availability
                          </Link>
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          <div className="space-y-6">
            <section className="rounded-3xl border border-white/10 bg-white/[0.04] p-6">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/45">
                Squad
              </p>
              <h2 className="mt-2 text-xl font-semibold text-white">Linked squad members</h2>
              <div className="mt-5 space-y-2">
                {squadMembers.length === 0 ? (
                  <div className="rounded-2xl border border-white/10 bg-black/20 p-4 text-sm text-white/60">
                    No linked squad members yet.
                  </div>
                ) : (
                  squadMembers.map((member) => (
                    <div key={member.id} className="flex items-center justify-between gap-4 rounded-2xl border border-white/10 bg-black/20 px-4 py-3">
                      <div className="min-w-0">
                        <div className="truncate text-sm font-semibold text-white">
                          {member.user.name || "Squad member"}
                        </div>
                        <div className="mt-1 text-xs text-white/45">
                          Contact details are managed privately by SIXFL.
                        </div>
                      </div>
                      <span className="shrink-0 rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-[11px] text-white/70">
                        {getRoleLabel(member.role)}
                      </span>
                    </div>
                  ))
                )}
              </div>
            </section>

            <section className="rounded-3xl border border-white/10 bg-white/[0.04] p-6">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/45">
                Recent
              </p>
              <h2 className="mt-2 text-xl font-semibold text-white">Recent results</h2>
              <div className="mt-5 space-y-2">
                {recentFixtures.length === 0 ? (
                  <div className="rounded-2xl border border-white/10 bg-black/20 p-4 text-sm text-white/60">
                    No recent fixtures found.
                  </div>
                ) : (
                  recentFixtures.map((fixture) => (
                    <div key={fixture.id} className="rounded-2xl border border-white/10 bg-black/20 p-4">
                      <div className="text-sm font-semibold text-white">
                        {getFixtureLabel({
                          homeTeamName: fixture.homeTeam.name,
                          awayTeamName: fixture.awayTeam.name,
                        })}
                      </div>
                      <div className="mt-1 text-xs text-white/50">
                        {formatFixtureDate(fixture.kickoffAt)}
                      </div>
                      <div className="mt-2 text-sm text-white/70">
                        {fixture.result
                          ? `${fixture.result.homeScore} - ${fixture.result.awayScore}`
                          : fixture.status}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </section>
          </div>
        </section>
      </div>
    </main>
  );
}
