// ========================================
// File: src/app/player/team/[teamid]/page.tsx
// ========================================

import Link from "next/link";
import { getServerSession } from "next-auth";
import { notFound, redirect } from "next/navigation";
import { FixtureStatus, TeamRole, UserRole } from "@prisma/client";

import { authOptions } from "@/auth";
import { formatDateTimeInLondon } from "@/lib/datetime/london";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export const metadata = {
  title: "Player Team | SIXFL",
};

type PageProps = {
  params: Promise<{ teamid: string }>;
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

function getFixtureLabel(input: {
  homeTeamName: string;
  awayTeamName: string;
}) {
  return `${input.homeTeamName} vs ${input.awayTeamName}`;
}

function getOpponentName(input: {
  teamId: string;
  homeTeamId: string;
  homeTeamName: string;
  awayTeamName: string;
}) {
  return input.homeTeamId === input.teamId
    ? input.awayTeamName
    : input.homeTeamName;
}

function getStatusClasses(status: FixtureStatus) {
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

export default async function PlayerTeamPage({ params }: PageProps) {
  const { teamid } = await params;
  const session = await getServerSession(authOptions);

  if (!session?.user?.email) {
    redirect(`/login?callbackUrl=${encodeURIComponent(`/player/team/${teamid}`)}`);
  }

  const email = session.user.email.trim().toLowerCase();

  const user = await prisma.user.findUnique({
    where: { email },
    select: {
      id: true,
      email: true,
      name: true,
      role: true,
      teamMembers: {
        where: { teamId: teamid },
        select: {
          id: true,
          role: true,
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
        take: 1,
      },
    },
  });

  if (!user) {
    redirect(`/login?callbackUrl=${encodeURIComponent(`/player/team/${teamid}`)}`);
  }

  const membership = user.teamMembers[0] ?? null;

  if (!membership && user.role !== UserRole.ADMIN) {
    notFound();
  }

  const team = membership?.team ??
    (await prisma.team.findUnique({
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
            slug: true,
            venueName: true,
            dayOfWeek: true,
          },
        },
      },
    }));

  if (!team) notFound();

  const now = new Date();

  const [upcomingFixtures, recentFixtures, squadMembers] = await Promise.all([
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
        result: {
          select: {
            homeScore: true,
            awayScore: true,
          },
        },
      },
    }),
    prisma.teamMember.findMany({
      where: { teamId: teamid },
      orderBy: [{ role: "asc" }, { createdAt: "asc" }],
      select: {
        id: true,
        role: true,
        user: {
          select: {
            name: true,
          },
        },
      },
    }),
  ]);

  return (
    <main className="min-h-screen bg-[#07130f] px-4 py-8 text-white">
      <div className="mx-auto max-w-6xl space-y-8">
        <section className="overflow-hidden rounded-[2rem] border border-emerald-400/15 bg-[radial-gradient(circle_at_top_left,rgba(16,185,129,0.16),transparent_34%),linear-gradient(180deg,rgba(255,255,255,0.05),rgba(255,255,255,0.03))] p-6 shadow-[0_24px_80px_rgba(0,0,0,0.3)] lg:p-8">
          <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-emerald-300/80">
                Player team area
              </p>
              <h1 className="mt-3 text-3xl font-semibold tracking-tight text-white sm:text-4xl">
                {team.name}
              </h1>
              <p className="mt-3 max-w-2xl text-sm leading-6 text-white/70">
                You’re linked to this SIXFL squad. Use this page to check your team details and upcoming fixtures.
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
                {membership?.role ? (
                  <span className="rounded-full border border-emerald-400/20 bg-emerald-500/10 px-3 py-1 text-xs font-medium text-emerald-100">
                    {getRoleLabel(membership.role)}
                  </span>
                ) : null}
              </div>
            </div>

            <div className="flex flex-wrap gap-3">
              <Link
                href={`/player/team/${teamid}/availability`}
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
              <Link
                href="/api/auth/signout"
                className="inline-flex items-center rounded-xl border border-white/10 bg-white/[0.04] px-4 py-2.5 text-sm font-medium text-white/80 transition hover:bg-white/10 hover:text-white"
              >
                Sign out
              </Link>
            </div>
          </div>
        </section>

        <section className="grid gap-6 lg:grid-cols-[1.15fr_0.85fr]">
          <div className="rounded-[2rem] border border-white/10 bg-white/[0.04] p-6">
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
                  No upcoming fixtures are currently published for your team.
                </div>
              ) : (
                upcomingFixtures.map((fixture) => (
                  <div key={fixture.id} className="rounded-2xl border border-white/10 bg-black/20 p-4">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
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
                      </div>
                      <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold ${getStatusClasses(fixture.status)}`}>
                        {fixture.status}
                      </span>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          <div className="space-y-6">
            <section className="rounded-[2rem] border border-white/10 bg-white/[0.04] p-6">
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

            <section className="rounded-[2rem] border border-white/10 bg-white/[0.04] p-6">
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
