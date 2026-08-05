import { notFound } from "next/navigation";

import { getCaptainRelatedTeamContext } from "@/lib/captain/related-teams";
import { formatDateTimeInLondon } from "@/lib/datetime/london";
import { getStoredAiPreviewsByFixtureIds } from "@/lib/fixtures/storedAiPredictions";
import { prisma } from "@/lib/prisma";
import { requireCaptain } from "@/lib/requireCaptain";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const metadata = { title: "Results | SIXFL Captain" };

function formatDate(date: Date) {
  return formatDateTimeInLondon(date, {
    weekday: "short",
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function outcome(forScore: number, againstScore: number) {
  if (forScore > againstScore) return "WIN";
  if (forScore < againstScore) return "LOSS";
  return "DRAW";
}

export default async function CaptainResultsHistoryPage({
  params,
}: {
  params: Promise<{ teamid: string }>;
}) {
  const { teamid } = await params;
  await requireCaptain(teamid);

  const context = await getCaptainRelatedTeamContext(teamid);
  if (!context) notFound();

  const relatedTeamIds = new Set(context.relatedTeamIds);
  const fixtures = await prisma.fixture.findMany({
    where: {
      ...(context.currentLeagueId ? { leagueId: context.currentLeagueId } : {}),
      OR: [
        { homeTeamId: { in: context.relatedTeamIds } },
        { awayTeamId: { in: context.relatedTeamIds } },
      ],
      publishedAt: { not: null },
      result: { isNot: null },
    },
    orderBy: { kickoffAt: "desc" },
    take: 200,
    select: {
      id: true,
      kickoffAt: true,
      homeTeamId: true,
      awayTeamId: true,
      homeTeam: { select: { name: true, logoUrl: true } },
      awayTeam: { select: { name: true, logoUrl: true } },
      result: { select: { homeScore: true, awayScore: true } },
    },
  });

  const stored = await getStoredAiPreviewsByFixtureIds(fixtures.map((fixture) => fixture.id));

  return (
    <div className="space-y-6 pb-12">
      <section className="rounded-3xl border border-white/10 bg-white/[0.035] p-6 sm:p-8">
        <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-emerald-300/80">
          Results
        </p>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight text-white sm:text-4xl">
          Results and AI predictions
        </h1>
        <p className="mt-3 max-w-3xl text-sm leading-6 text-white/60">
          Every completed fixture in the current league, shown with the SIXFL AI score prediction that was stored before the match.
        </p>
      </section>

      {fixtures.length === 0 ? (
        <section className="rounded-3xl border border-dashed border-white/10 bg-black/20 p-10 text-center text-sm text-white/50">
          No completed results are available yet.
        </section>
      ) : (
        <section className="overflow-hidden rounded-3xl border border-white/10 bg-white/[0.035]">
          <div className="divide-y divide-white/10">
            {fixtures.map((fixture) => {
              const isHome = relatedTeamIds.has(fixture.homeTeamId);
              const opponent = isHome ? fixture.awayTeam : fixture.homeTeam;
              const actualFor = isHome ? fixture.result!.homeScore : fixture.result!.awayScore;
              const actualAgainst = isHome ? fixture.result!.awayScore : fixture.result!.homeScore;
              const preview = stored.get(fixture.id) ?? null;
              const hasPrediction =
                preview?.predictedHomeScore !== null &&
                preview?.predictedHomeScore !== undefined &&
                preview?.predictedAwayScore !== null &&
                preview?.predictedAwayScore !== undefined;
              const predictedFor = hasPrediction
                ? isHome
                  ? preview!.predictedHomeScore!
                  : preview!.predictedAwayScore!
                : null;
              const predictedAgainst = hasPrediction
                ? isHome
                  ? preview!.predictedAwayScore!
                  : preview!.predictedHomeScore!
                : null;
              const exact =
                predictedFor !== null &&
                predictedAgainst !== null &&
                predictedFor === actualFor &&
                predictedAgainst === actualAgainst;
              const correctResult =
                predictedFor !== null &&
                predictedAgainst !== null &&
                outcome(predictedFor, predictedAgainst) === outcome(actualFor, actualAgainst);

              return (
                <article key={fixture.id} className="grid gap-4 px-5 py-5 sm:grid-cols-[1fr_auto] sm:items-center sm:px-6">
                  <div className="min-w-0">
                    <div className="flex items-center gap-3">
                      {opponent.logoUrl ? (
                        <img src={opponent.logoUrl} alt="" className="h-10 w-10 rounded-xl border border-white/10 bg-white object-cover" />
                      ) : null}
                      <div>
                        <h2 className="font-semibold text-white">{opponent.name}</h2>
                        <p className="mt-1 text-sm text-white/45">{formatDate(fixture.kickoffAt)}</p>
                      </div>
                    </div>

                    <div className="mt-3 flex flex-wrap gap-2">
                      {predictedFor !== null && predictedAgainst !== null ? (
                        <span className="rounded-full border border-emerald-400/20 bg-emerald-500/10 px-3 py-1 text-xs font-semibold text-emerald-100">
                          SIXFL AI predicted {predictedFor} - {predictedAgainst}
                        </span>
                      ) : (
                        <span className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-xs font-semibold text-white/45">
                          No stored AI prediction
                        </span>
                      )}

                      {predictedFor !== null && predictedAgainst !== null ? (
                        <span className={exact
                          ? "rounded-full border border-amber-300/30 bg-amber-400/10 px-3 py-1 text-xs font-semibold text-amber-100"
                          : correctResult
                            ? "rounded-full border border-sky-300/25 bg-sky-400/10 px-3 py-1 text-xs font-semibold text-sky-100"
                            : "rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-xs font-semibold text-white/50"}
                        >
                          {exact ? "Exact score 🎯" : correctResult ? "Correct result" : "Prediction missed"}
                        </span>
                      ) : null}
                    </div>
                  </div>

                  <div className="text-left sm:text-right">
                    <div className="text-2xl font-semibold text-white">{actualFor} - {actualAgainst}</div>
                    <div className="mt-1 text-xs uppercase tracking-[0.16em] text-white/35">Actual result</div>
                  </div>
                </article>
              );
            })}
          </div>
        </section>
      )}
    </div>
  );
}
