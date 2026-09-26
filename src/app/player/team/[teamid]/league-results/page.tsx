import { FixtureStatus, UserRole } from "@prisma/client";
import { getServerSession } from "next-auth";
import { notFound, redirect } from "next/navigation";

import { authOptions } from "@/auth";
import { formatDateTimeInLondon } from "@/lib/datetime/london";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const metadata = { title: "League Results | SIXFL Player App" };

function resultDate(value: Date) {
  return formatDateTimeInLondon(value, {
    weekday: "short",
    day: "2-digit",
    month: "short",
  });
}

export default async function PlayerLeagueResultsPage({
  params,
  searchParams,
}: {
  params: Promise<{ teamid: string }>;
  searchParams?: Promise<{ previewMembershipId?: string }>;
}) {
  const { teamid } = await params;
  const sp = (await searchParams) ?? {};
  const session = await getServerSession(authOptions);

  if (!session?.user?.email) {
    redirect(
      `/login?callbackUrl=${encodeURIComponent(`/player/team/${teamid}/league-results`)}`,
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

  if (!user) notFound();

  const requestedPreviewMembershipId =
    user.role === UserRole.ADMIN ? sp.previewMembershipId?.trim() || null : null;
  const previewMembership = requestedPreviewMembershipId
    ? await prisma.teamMember.findFirst({
        where: { id: requestedPreviewMembershipId, teamId: teamid },
        select: { id: true },
      })
    : null;

  if (
    user.role !== UserRole.ADMIN &&
    user.teamMembers.length === 0
  ) {
    notFound();
  }
  if (requestedPreviewMembershipId && !previewMembership) notFound();

  const team = await prisma.team.findUnique({
    where: { id: teamid },
    select: {
      id: true,
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

  if (!currentLeagueId) {
    return (
      <main className="min-h-screen bg-[#07130f] px-3 pb-28 pt-4 text-white">
        <div className="mx-auto w-full max-w-xl">
          <h1 className="text-2xl font-black">League results</h1>
          <p className="mt-3 rounded-2xl border border-white/10 bg-white/[0.035] p-4 text-sm text-white/50">
            No current league is assigned to this team.
          </p>
        </div>
      </main>
    );
  }

  const fixtures = await prisma.fixture.findMany({
    where: {
      leagueId: currentLeagueId,
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
      homeTeam: { select: { id: true, name: true, logoUrl: true } },
      awayTeam: { select: { id: true, name: true, logoUrl: true } },
      result: {
        select: {
          homeScore: true,
          awayScore: true,
          isDisputed: true,
        },
      },
    },
  });

  const results = fixtures.filter(
    (
      fixture,
    ): fixture is typeof fixture & { result: NonNullable<typeof fixture.result> } =>
      Boolean(fixture.result),
  );

  return (
    <main className="min-h-screen bg-[#07130f] px-3 pb-28 pt-4 text-white">
      <div className="mx-auto w-full max-w-xl">
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.18em] text-emerald-300/75">
            Player app
          </p>
          <h1 className="mt-1 text-2xl font-black tracking-tight">League results</h1>
          <p className="mt-1 text-xs text-white/45">
            {team.league?.competition?.name ?? currentLeague?.name ?? "SIXFL"}
            {currentLeague?.season ? ` · ${currentLeague.season}` : ""}
          </p>
        </div>

        <div className="mt-4 space-y-2">
          {results.map((fixture) => {
            const involvesTeam =
              fixture.homeTeam.id === teamid || fixture.awayTeam.id === teamid;
            return (
              <article
                key={fixture.id}
                className={[
                  "rounded-2xl border p-3",
                  involvesTeam
                    ? "border-emerald-300/20 bg-emerald-500/[0.07]"
                    : "border-white/[0.08] bg-white/[0.035]",
                ].join(" ")}
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-2 text-center">
                      <div className="min-w-0">
                        <div className="truncate text-xs font-bold text-white/75">
                          {fixture.homeTeam.name}
                        </div>
                      </div>
                      <div className="rounded-lg bg-black/25 px-2.5 py-1.5 text-lg font-black tabular-nums text-white">
                        {fixture.result.homeScore}–{fixture.result.awayScore}
                      </div>
                      <div className="min-w-0">
                        <div className="truncate text-xs font-bold text-white/75">
                          {fixture.awayTeam.name}
                        </div>
                      </div>
                    </div>
                    <div className="mt-2 flex items-center justify-center gap-2 text-[10px] text-white/35">
                      <span>{resultDate(fixture.kickoffAt)}</span>
                      {fixture.round ? <span>· Week {fixture.round}</span> : null}
                      {fixture.result.isDisputed ? (
                        <span className="text-amber-200">· Under review</span>
                      ) : null}
                    </div>
                  </div>
                </div>
              </article>
            );
          })}

          {results.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-white/10 p-5 text-sm text-white/45">
              No completed league results are available yet.
            </div>
          ) : null}
        </div>
      </div>
    </main>
  );
}
