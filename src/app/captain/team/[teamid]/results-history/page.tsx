import { notFound } from "next/navigation";

import OverturnedResultNotice from "@/components/fixtures/OverturnedResultNotice";
import { getPredictorResult, RESULT_OVERTURN_SUMMARY_SELECT } from "@/lib/fixtures/result-score";

import { getCaptainRelatedTeamContext } from "@/lib/captain/related-teams";
import { formatDateTimeInLondon } from "@/lib/datetime/london";
import { getStoredAiPreviewsByFixtureIds } from "@/lib/fixtures/storedAiPredictions";
import { prisma } from "@/lib/prisma";
import { requireCaptain } from "@/lib/requireCaptain";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const metadata = { title: "Results | SIXFL Captain" };

type Scorer = {
  name: string;
  goals: number;
};

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

function parseScorers(value: unknown): Scorer[] {
  if (!Array.isArray(value)) return [];

  return value.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const row = item as Record<string, unknown>;
    const name = typeof row.name === "string" ? row.name.trim() : "";
    const goals = Number(row.goals ?? 0);

    if (!name || !Number.isInteger(goals) || goals < 1) return [];
    return [{ name, goals }];
  });
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
      result: {
        select: {
          homeScore: true,
          awayScore: true,
          overturn: { select: RESULT_OVERTURN_SUMMARY_SELECT },
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
  });

  const stored = await getStoredAiPreviewsByFixtureIds(fixtures.map((fixture) => fixture.id));

  return (
    <>
      <style>{`
        body:has(.captain-app-header) .captain-results-history-page { display:grid; gap:.7rem; padding-bottom:5.5rem; }
        body:has(.captain-app-header) .captain-results-history-page > section:first-child { border-radius:1.05rem !important; padding:.85rem !important; }
        body:has(.captain-app-header) .captain-results-history-page > section:first-child h1 { margin-top:.2rem !important; font-size:1.15rem !important; font-weight:800 !important; }
        body:has(.captain-app-header) .captain-results-history-page > section:first-child p[class*="max-w-"] { margin-top:.35rem !important; font-size:.7rem !important; line-height:1.1rem !important; color:rgba(255,255,255,.42) !important; }
        body:has(.captain-app-header) .captain-results-history-page > section:last-child { border-radius:1.05rem !important; }
        body:has(.captain-app-header) .captain-results-history-page > section:last-child > div:first-child { padding:.75rem .85rem !important; }
        body:has(.captain-app-header) .captain-results-history-page > section:last-child article { padding:.75rem .85rem !important; gap:.55rem !important; grid-template-columns:minmax(0,1fr) auto !important; align-items:center !important; }
        body:has(.captain-app-header) .captain-results-history-page > section:last-child article h2 { font-size:.78rem !important; line-height:1.1rem !important; font-weight:800 !important; }
        body:has(.captain-app-header) .captain-results-history-page > section:last-child article p { font-size:.62rem !important; line-height:.95rem !important; }
      `}</style>
      <div className="captain-results-history-page space-y-6 pb-12">
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
              const teamIdForFixture = isHome ? fixture.homeTeamId : fixture.awayTeamId;
              const opponent = isHome ? fixture.awayTeam : fixture.homeTeam;
              const actualFor = isHome ? fixture.result!.homeScore : fixture.result!.awayScore;
              const actualAgainst = isHome ? fixture.result!.awayScore : fixture.result!.homeScore;
              // The table uses the awarded score; assess a stored prediction
              // against the performance that actually happened on the pitch.
              const playedResult = getPredictorResult(fixture.result);
              const playedFor = playedResult ? (isHome ? playedResult.homeScore : playedResult.awayScore) : null;
              const playedAgainst = playedResult ? (isHome ? playedResult.awayScore : playedResult.homeScore) : null;
              const matchDetails =
                fixture.result!.teamMetadata.find((item) => item.teamId === teamIdForFixture) ?? null;
              const scorers = parseScorers(matchDetails?.scorers);
              const playerOfMatch = matchDetails?.playerOfMatchName?.trim() || null;
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
                predictedFor === playedFor &&
                predictedAgainst === playedAgainst;
              const correctResult =
                predictedFor !== null &&
                predictedAgainst !== null &&
                playedFor !== null && playedAgainst !== null &&
                outcome(predictedFor, predictedAgainst) === outcome(playedFor, playedAgainst);

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
                          {playedResult === null ? "Original result unavailable" : exact ? "Exact score 🎯" : correctResult ? "Correct result" : "Prediction missed"}
                        </span>
                      ) : null}
                    </div>

                    {fixture.result!.overturn ? <p className="mt-2 text-xs text-white/55">Prediction checked against the original on-field result.</p> : null}

                    {scorers.length > 0 || playerOfMatch ? (
                      <div className="mt-3 space-y-1 text-sm text-white/65">
                        {scorers.length > 0 ? (
                          <p>
                            <span className="font-semibold text-white/85">Scorers:</span>{" "}
                            {scorers.map((scorer) => `${scorer.name}${scorer.goals > 1 ? ` ×${scorer.goals}` : ""}`).join(", ")}
                          </p>
                        ) : null}
                        {playerOfMatch ? (
                          <p>
                            <span className="font-semibold text-amber-100">MOTM:</span>{" "}
                            {playerOfMatch}
                          </p>
                        ) : null}
                      </div>
                    ) : null}
                  </div>

                  <div className="text-left sm:text-right">
                    <div className="text-2xl font-semibold text-white">{actualFor} - {actualAgainst}</div>
                    <div className="mt-1 text-xs uppercase tracking-[0.16em] text-white/35">{fixture.result!.overturn ? "Awarded result" : "Actual result"}</div>
                  </div>
                  {fixture.result!.overturn ? (
                    <div className="min-w-0 sm:col-span-2">
                      <OverturnedResultNotice
                        overturn={fixture.result!.overturn}
                        homeName={fixture.homeTeam.name}
                        awayName={fixture.awayTeam.name}
                      />
                    </div>
                  ) : null}
                </article>
              );
            })}
          </div>
        </section>
      )}
    </div>
    </>
  );
}
