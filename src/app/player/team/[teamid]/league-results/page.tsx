import { UserRole } from "@prisma/client";
import { getServerSession } from "next-auth";
import { notFound, redirect } from "next/navigation";

import { authOptions } from "@/auth";
import { formatDateTimeInLondon } from "@/lib/datetime/london";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export const metadata = {
  title: "League results | SIXFL Player",
};

function formatResultDate(value: Date) {
  return formatDateTimeInLondon(value, {
    weekday: "short",
    day: "numeric",
    month: "short",
  });
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
      name: true,
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

  const league = team.league?.competition?.currentLeague ?? team.league ?? null;
  if (!league) {
    redirect(`/player/team/${teamid}`);
  }

  const results = await prisma.fixture.findMany({
    where: {
      leagueId: league.id,
      publishedAt: { not: null },
      result: { isNot: null },
    },
    orderBy: [{ kickoffAt: "desc" }],
    take: 40,
    select: {
      id: true,
      kickoffAt: true,
      homeTeam: {
        select: {
          id: true,
          name: true,
          logoUrl: true,
        },
      },
      awayTeam: {
        select: {
          id: true,
          name: true,
          logoUrl: true,
        },
      },
      result: {
        select: {
          homeScore: true,
          awayScore: true,
        },
      },
    },
  });

  const leagueName = team.league?.competition?.name ?? league.name;

  return (
    <main className="mx-auto w-full max-w-xl px-3 pb-28 pt-4 text-white">
      <header>
        <p className="text-[10px] font-black uppercase tracking-[0.18em] text-emerald-300/70">
          League
        </p>
        <h1 className="mt-1 text-2xl font-black tracking-tight">Results</h1>
        <p className="mt-1 text-sm text-white/50">
          {leagueName}
          {league.season ? ` · ${league.season}` : ""}
        </p>
      </header>

      <section className="mt-4 overflow-hidden rounded-2xl border border-white/10 bg-white/[0.025]">
        {results.length ? (
          <div className="divide-y divide-white/[0.07]">
            {results.map((fixture) => {
              const result = fixture.result;
              if (!result) return null;

              const yourTeamPlayed =
                fixture.homeTeam.id === teamid || fixture.awayTeam.id === teamid;

              return (
                <article
                  key={fixture.id}
                  className={
                    yourTeamPlayed
                      ? "bg-emerald-500/[0.055] px-3 py-3.5"
                      : "px-3 py-3.5"
                  }
                >
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-[10px] font-semibold text-white/35">
                      {formatResultDate(fixture.kickoffAt)}
                    </p>
                    {yourTeamPlayed ? (
                      <span className="rounded-full bg-emerald-400/10 px-2 py-0.5 text-[9px] font-black uppercase tracking-[0.12em] text-emerald-200">
                        Your team
                      </span>
                    ) : null}
                  </div>

                  <div className="mt-2 grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-2">
                    <div className="min-w-0 text-right">
                      <p className="truncate text-xs font-bold text-white/80">
                        {fixture.homeTeam.name}
                      </p>
                    </div>

                    <div
                      aria-label={`${result.homeScore} to ${result.awayScore}`}
                      className="rounded-lg bg-black/25 px-2.5 py-1.5 text-base font-black tabular-nums text-white"
                    >
                      {result.homeScore}–{result.awayScore}
                    </div>

                    <div className="min-w-0">
                      <p className="truncate text-xs font-bold text-white/80">
                        {fixture.awayTeam.name}
                      </p>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        ) : (
          <p className="p-5 text-sm leading-6 text-white/55">
            No published league results are available yet.
          </p>
        )}
      </section>

      <p className="mt-3 text-center text-[10px] text-white/35">
        Latest {results.length} published result{results.length === 1 ? "" : "s"} shown inside the Player app.
      </p>
    </main>
  );
}
