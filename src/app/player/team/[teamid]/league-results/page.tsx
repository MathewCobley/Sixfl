import { FixtureStatus, UserRole } from "@prisma/client";
import { getServerSession } from "next-auth";
import { notFound, redirect } from "next/navigation";

import { authOptions } from "@/auth";
import { formatDateTimeInLondon } from "@/lib/datetime/london";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export const metadata = {
  title: "League Results | SIXFL Player App",
};

function formatDate(value: Date) {
  return formatDateTimeInLondon(value, {
    weekday: "short",
    day: "numeric",
    month: "short",
  });
}

function initials(name: string) {
  return (
    name
      .trim()
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase() ?? "")
      .join("") || "?"
  );
}

function TeamMark({
  name,
  logoUrl,
}: {
  name: string;
  logoUrl: string | null;
}) {
  return (
    <div className="min-w-0 text-center">
      <div className="mx-auto flex h-11 w-11 items-center justify-center">
        {logoUrl ? (
          <img
            src={logoUrl}
            alt={`${name} badge`}
            className="max-h-11 max-w-11 object-contain"
          />
        ) : (
          <span className="flex h-10 w-10 items-center justify-center rounded-xl border border-white/10 bg-white/[0.05] text-xs font-black text-white/45">
            {initials(name)}
          </span>
        )}
      </div>
      <div className="mt-1.5 break-words text-[11px] font-bold leading-4 text-white">
        {name}
      </div>
    </div>
  );
}

export default async function PlayerLeagueResultsPage({
  params,
}: {
  params: Promise<{ teamid: string }>;
}) {
  const { teamid } = await params;
  const session = await getServerSession(authOptions);

  if (!session?.user?.email) {
    redirect(
      `/login?callbackUrl=${encodeURIComponent(
        `/player/team/${teamid}/league-results`,
      )}`,
    );
  }

  const user = await prisma.user.findUnique({
    where: { email: session.user.email.trim().toLowerCase() },
    select: {
      role: true,
      teamMembers: {
        where: { teamId: teamid },
        select: { id: true },
        take: 1,
      },
    },
  });

  if (!user || (user.role !== UserRole.ADMIN && user.teamMembers.length === 0)) {
    notFound();
  }

  const team = await prisma.team.findUnique({
    where: { id: teamid },
    select: {
      league: {
        select: {
          id: true,
          name: true,
          season: true,
          competition: {
            select: {
              name: true,
              currentLeague: {
                select: {
                  id: true,
                  name: true,
                  season: true,
                },
              },
            },
          },
        },
      },
    },
  });

  if (!team) notFound();

  const league = team.league?.competition?.currentLeague ?? team.league;
  if (!league) {
    return (
      <main className="mx-auto w-full max-w-xl px-3 pb-28 pt-4 text-white">
        <h1 className="text-2xl font-black">League results</h1>
        <p className="mt-4 rounded-2xl border border-white/10 bg-white/[0.035] p-5 text-sm leading-6 text-white/50">
          This team is not currently linked to a league.
        </p>
      </main>
    );
  }

  const fixtures = await prisma.fixture.findMany({
    where: {
      leagueId: league.id,
      publishedAt: { not: null },
      status: FixtureStatus.COMPLETED,
      result: { isNot: null },
    },
    orderBy: [{ kickoffAt: "desc" }, { round: "desc" }, { position: "desc" }],
    take: 60,
    select: {
      id: true,
      kickoffAt: true,
      round: true,
      homeTeam: {
        select: { name: true, logoUrl: true },
      },
      awayTeam: {
        select: { name: true, logoUrl: true },
      },
      result: {
        select: {
          homeScore: true,
          awayScore: true,
          isDisputed: true,
        },
      },
    },
  });

  return (
    <main className="mx-auto w-full max-w-xl px-3 pb-28 pt-4 text-white">
      <header>
        <p className="text-[10px] font-black uppercase tracking-[0.18em] text-emerald-300/70">
          {league.season || "Current season"}
        </p>
        <h1 className="mt-1 text-2xl font-black">League results</h1>
        <p className="mt-1 text-sm text-white/50">
          {team.league?.competition?.name ?? league.name}
        </p>
      </header>

      <div className="mt-4 space-y-2.5">
        {fixtures.length ? (
          fixtures.map((fixture) => (
            <article
              key={fixture.id}
              className="rounded-[1.2rem] border border-white/10 bg-white/[0.035] p-3"
            >
              <div className="flex items-center justify-between gap-3">
                <span className="text-[10px] font-semibold text-white/40">
                  {fixture.round ? `Week ${fixture.round}` : formatDate(fixture.kickoffAt)}
                </span>
                <span className="text-[10px] text-white/35">
                  {formatDate(fixture.kickoffAt)}
                </span>
              </div>

              <div className="mt-3 grid grid-cols-[minmax(0,1fr)_4.5rem_minmax(0,1fr)] items-start gap-2">
                <TeamMark
                  name={fixture.homeTeam.name}
                  logoUrl={fixture.homeTeam.logoUrl}
                />
                <div className="rounded-xl border border-white/10 bg-black/25 px-2 py-2 text-center text-xl font-black tabular-nums text-white">
                  {fixture.result?.homeScore ?? "–"}–{fixture.result?.awayScore ?? "–"}
                </div>
                <TeamMark
                  name={fixture.awayTeam.name}
                  logoUrl={fixture.awayTeam.logoUrl}
                />
              </div>

              {fixture.result?.isDisputed ? (
                <div className="mt-3 text-center text-[10px] font-bold uppercase tracking-[0.12em] text-amber-200">
                  Result under review
                </div>
              ) : null}
            </article>
          ))
        ) : (
          <p className="rounded-2xl border border-white/10 bg-white/[0.035] p-5 text-sm leading-6 text-white/50">
            No completed league results are available yet.
          </p>
        )}
      </div>
    </main>
  );
}
