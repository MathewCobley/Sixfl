import Link from "next/link";
import { notFound } from "next/navigation";

import CaptainVeoPriorityCard from "@/components/captain/CaptainVeoPriorityCard";
import { prisma } from "@/lib/prisma";
import { requireCaptain } from "@/lib/requireCaptain";

export const dynamic = "force-dynamic";

export default async function CaptainPriorityScorePage({
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
      leagueId: true,
      league: {
        select: {
          id: true,
          competition: {
            select: {
              currentLeagueId: true,
            },
          },
        },
      },
    },
  });

  if (!team) notFound();

  const currentLeagueId =
    team.league?.competition?.currentLeagueId ??
    team.league?.id ??
    team.leagueId ??
    null;

  return (
    <div className="space-y-6">
      <section className="overflow-hidden rounded-3xl border border-fuchsia-400/20 bg-[radial-gradient(circle_at_top_right,rgba(217,70,239,0.14),transparent_35%),rgba(255,255,255,0.035)]">
        <div className="px-5 py-6 sm:px-7 sm:py-7">
          <p className="text-[11px] font-black uppercase tracking-[0.2em] text-fuchsia-200/70">
            SIXFL TV
          </p>
          <h1 className="mt-2 text-3xl font-black tracking-tight text-white">
            Priority Score
          </h1>
          <p className="mt-3 max-w-4xl text-sm leading-6 text-white/65">
            This is the one score SIXFL uses when deciding which eligible matches get recording priority.
            It is out of 100: reliability contributes up to 80 points, audience up to 10 and goal-award
            participation up to 10.
          </p>

          <div className="mt-5 grid gap-3 sm:grid-cols-3">
            <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
              <div className="text-2xl font-black text-white">80</div>
              <div className="mt-1 text-sm font-semibold text-white/80">Reliability points</div>
              <p className="mt-1 text-xs leading-5 text-white/45">
                Recent match cards, payment, fixture confirmation, assists and ratings.
              </p>
            </div>
            <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
              <div className="text-2xl font-black text-white">10</div>
              <div className="mt-1 text-sm font-semibold text-white/80">Audience points</div>
              <p className="mt-1 text-xs leading-5 text-white/45">
                Based on the team&apos;s View index across all measured SIXFL TV matches.
              </p>
            </div>
            <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
              <div className="text-2xl font-black text-white">10</div>
              <div className="mt-1 text-sm font-semibold text-white/80">Participation points</div>
              <p className="mt-1 text-xs leading-5 text-white/45">
                Earned by players taking part in Goal of the Month nominations and voting.
              </p>
            </div>
          </div>

          <div className="mt-5 flex flex-wrap gap-3">
            <Link
              href={`/captain/team/${teamid}/tv`}
              className="inline-flex min-h-11 items-center rounded-xl border border-white/15 bg-black/20 px-4 py-2 text-sm font-semibold text-white/80 transition hover:bg-white/5 hover:text-white"
            >
              Open SIXFL TV
            </Link>
            <Link
              href={`/goal-of-the-month?from=captain&teamId=${encodeURIComponent(teamid)}`}
              className="inline-flex min-h-11 items-center rounded-xl border border-fuchsia-300/30 bg-fuchsia-500/10 px-4 py-2 text-sm font-semibold text-fuchsia-50 transition hover:bg-fuchsia-400/15"
            >
              Goal of the Month
            </Link>
          </div>
        </div>
      </section>

      {currentLeagueId ? (
        <CaptainVeoPriorityCard teamId={teamid} leagueId={currentLeagueId} />
      ) : (
        <section className="rounded-3xl border border-white/10 bg-white/[0.04] p-6 text-sm leading-6 text-white/60">
          {team.name} is not currently linked to a live league, so a SIXFL TV Priority breakdown is not available yet.
        </section>
      )}
    </div>
  );
}
