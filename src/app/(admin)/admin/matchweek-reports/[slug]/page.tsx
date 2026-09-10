import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/requireAdmin";
import { prisma } from "@/lib/prisma";
import { formatDateTimeInLondon } from "@/lib/datetime/london";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const metadata: Metadata = {
  title: "Admin matchweek report preview | SIXFL",
  robots: { index: false, follow: false },
};

type PageProps = {
  params: Promise<{ slug: string }>;
};

function formatDate(date: Date) {
  return formatDateTimeInLondon(date, {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

export default async function AdminWeeklyLeagueReportPreview({ params }: PageProps) {
  await requireAdmin();
  const { slug } = await params;

  const league = await prisma.league.findFirst({
    where: { slug, isActive: true },
    select: {
      name: true,
      slug: true,
      area: true,
      badgeUrl: true,
      fixtures: {
        where: {
          status: "COMPLETED",
          result: { isNot: null },
          publishedAt: { not: null },
        },
        orderBy: { kickoffAt: "desc" },
        take: 24,
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
              teamMetadata: {
                select: {
                  teamId: true,
                  scorers: true,
                  playerOfMatchName: true,
                },
              },
            },
          },
        },
      },
    },
  });

  if (!league) notFound();

  const latest = league.fixtures[0];
  if (!latest) {
    return (
      <div className="rounded-3xl border border-white/10 bg-white/[0.04] p-8 text-white">
        <p className="text-sm font-semibold uppercase tracking-[0.2em] text-emerald-300">Admin-only preview</p>
        <h1 className="mt-3 text-3xl font-black">{league.name}</h1>
        <h2 className="mt-5 text-xl font-bold">No completed results yet</h2>
        <p className="mt-3 text-white/65">This private preview will appear once the league has published completed fixtures. The report itself will not be published.</p>
        <Link href="/admin/matchweek-reports" className="mt-8 inline-flex rounded-xl bg-emerald-400 px-5 py-3 font-bold text-black">Back to matchweek reports</Link>
      </div>
    );
  }

  const latestRound = latest.round;
  const sameRound = latestRound
    ? league.fixtures.filter((fixture) => fixture.round === latestRound)
    : league.fixtures.filter((fixture) => {
        const a = new Date(fixture.kickoffAt);
        const b = new Date(latest.kickoffAt);
        return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
      });

  const matchweekFixtures = [...sameRound].sort(
    (a, b) => new Date(a.kickoffAt).getTime() - new Date(b.kickoffAt).getTime(),
  );

  const totalGoals = matchweekFixtures.reduce((sum, fixture) => {
    const result = fixture.result;
    return sum + (result ? result.homeScore + result.awayScore : 0);
  }, 0);

  const biggestWin = [...matchweekFixtures]
    .filter((fixture) => fixture.result)
    .sort((a, b) => {
      const ar = a.result!;
      const br = b.result!;
      return Math.abs(br.homeScore - br.awayScore) - Math.abs(ar.homeScore - ar.awayScore);
    })[0];

  return (
    <div className="overflow-hidden rounded-3xl border border-white/10 bg-black text-white">
      <div className="border-b border-amber-400/20 bg-amber-500/10 px-5 py-4 sm:px-8">
        <Link href="/admin/matchweek-reports" className="text-sm font-semibold text-emerald-300 hover:text-emerald-200">← All matchweek reports</Link>
        <p className="mt-2 text-sm text-amber-100">Admin-only preview — not published. This report is visible only to SIXFL administrators.</p>
      </div>
      <section className="border-b border-white/10 bg-gradient-to-b from-emerald-950/60 to-black">
        <div className="mx-auto max-w-6xl px-5 py-10 sm:px-8 sm:py-14">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <p className="text-sm font-bold uppercase tracking-[0.24em] text-emerald-300">SIXFL Matchweek Report</p>
            <span className="rounded-full border border-white/10 bg-white/[0.05] px-4 py-2 text-sm text-white/65">Private preview</span>
          </div>
          <h1 className="mt-5 max-w-4xl break-words text-3xl font-black leading-tight sm:text-5xl">{league.name}</h1>
          <p className="mt-4 text-lg text-white/65">{formatDate(latest.kickoffAt)}{latestRound ? ` • Round ${latestRound}` : ""}</p>

          <div className="mt-8 grid gap-3 sm:grid-cols-3">
            <div className="rounded-2xl border border-white/10 bg-white/[0.05] p-5"><div className="text-3xl font-black">{matchweekFixtures.length}</div><div className="mt-1 text-sm text-white/55">Matches played</div></div>
            <div className="rounded-2xl border border-white/10 bg-white/[0.05] p-5"><div className="text-3xl font-black">{totalGoals}</div><div className="mt-1 text-sm text-white/55">Goals scored</div></div>
            <div className="rounded-2xl border border-white/10 bg-white/[0.05] p-5"><div className="break-words text-lg font-black">{biggestWin ? `${biggestWin.homeTeam.name} ${biggestWin.result!.homeScore}–${biggestWin.result!.awayScore} ${biggestWin.awayTeam.name}` : "—"}</div><div className="mt-1 text-sm text-white/55">Biggest result</div></div>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-5 py-10 sm:px-8">
        <div className="mb-8 max-w-3xl">
          <h2 className="text-3xl font-black">This week in {league.area || league.name}</h2>
          <p className="mt-3 text-base leading-7 text-white/65">A clean, data-led weekly round-up using only recorded SIXFL results. We do not invent possession, chances, late goals or other match details that were not entered into the system.</p>
        </div>

        <div className="space-y-5">
          {matchweekFixtures.map((fixture) => {
            const result = fixture.result!;
            const metadata = result.teamMetadata || [];
            const potm = metadata.map((item) => item.playerOfMatchName).filter(Boolean).join(" / ");

            return (
              <article key={fixture.id} className="overflow-hidden rounded-3xl border border-white/10 bg-white/[0.035]">
                <div className="grid gap-6 p-6 sm:grid-cols-[1fr_auto_1fr] sm:items-center sm:p-8">
                  <div className="min-w-0 sm:text-right">
                    <div className="break-words text-xl font-black">{fixture.homeTeam.name}</div>
                  </div>
                  <div className="rounded-2xl border border-emerald-400/20 bg-emerald-400/10 px-6 py-3 text-center text-3xl font-black text-emerald-200">{result.homeScore}–{result.awayScore}</div>
                  <div className="min-w-0">
                    <div className="break-words text-xl font-black">{fixture.awayTeam.name}</div>
                  </div>
                </div>
                <div className="border-t border-white/10 px-6 py-5 sm:px-8">
                  <p className="leading-7 text-white/72">Recorded result: {fixture.homeTeam.name} {result.homeScore}–{result.awayScore} {fixture.awayTeam.name}.</p>
                  {potm ? <p className="mt-3 text-sm font-semibold text-emerald-300">Player of the Match: {potm}</p> : null}
                </div>
              </article>
            );
          })}
        </div>

        <div className="mt-10 flex flex-wrap gap-3">
          <Link href="/admin/matchweek-reports" className="rounded-xl bg-emerald-400 px-5 py-3 font-bold text-black">Choose another league</Link>
          <Link href="/admin/fixtures" className="rounded-xl border border-white/15 bg-white/[0.05] px-5 py-3 font-bold text-white">Admin fixtures & results</Link>
        </div>
      </section>
    </div>
  );
}
