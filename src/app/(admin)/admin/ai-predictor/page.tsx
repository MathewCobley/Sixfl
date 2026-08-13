// ========================================
// File: src/app/(admin)/admin/ai-predictor/page.tsx
// ========================================

import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/requireAdmin";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export const metadata = {
  title: "AI Predictor Accuracy | SIXFL Admin",
};

type PredictionAuditRow = {
  fixtureId: string;
  kickoffAt: Date;
  leagueName: string;
  homeTeamName: string;
  awayTeamName: string;
  predictedHomeScore: number | null;
  predictedAwayScore: number | null;
  actualHomeScore: number;
  actualAwayScore: number;
  source: string;
  generatedAt: Date;
};

type Outcome = "HOME" | "DRAW" | "AWAY";

type EvaluatedPrediction = PredictionAuditRow & {
  weekKey: string;
  predictedOutcome: Outcome;
  actualOutcome: Outcome;
  resultCorrect: boolean;
  exactScore: boolean;
  goalError: number;
  recovered: boolean;
};

type WeeklyStats = {
  weekKey: string;
  total: number;
  correct: number;
  wrong: number;
  exact: number;
  goalError: number;
};

const dateFormatter = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Europe/London",
  day: "2-digit",
  month: "short",
  year: "numeric",
});

const dateTimeFormatter = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Europe/London",
  day: "2-digit",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
});

function outcome(homeScore: number, awayScore: number): Outcome {
  if (homeScore > awayScore) return "HOME";
  if (awayScore > homeScore) return "AWAY";
  return "DRAW";
}

function mondayKey(date: Date) {
  const value = new Date(date);
  const dayFromMonday = (value.getUTCDay() + 6) % 7;
  value.setUTCDate(value.getUTCDate() - dayFromMonday);
  value.setUTCHours(0, 0, 0, 0);
  return value.toISOString().slice(0, 10);
}

function weekLabel(weekKey: string) {
  return dateFormatter.format(new Date(`${weekKey}T12:00:00.000Z`));
}

function percentage(correct: number, total: number) {
  if (total === 0) return "—";
  return `${Math.round((correct / total) * 100)}%`;
}

function averageGoalError(goalError: number, total: number) {
  if (total === 0) return "—";
  return (goalError / total).toFixed(1);
}

function average(value: number, total: number) {
  if (total === 0) return "—";
  return (value / total).toFixed(1);
}

function accuracyClasses(correct: number, total: number) {
  if (total === 0) return "text-white/55";
  const value = correct / total;
  if (value >= 0.7) return "text-emerald-300";
  if (value >= 0.5) return "text-amber-300";
  return "text-red-300";
}

function concentrationClasses(count: number, total: number) {
  if (total === 0) return "text-white/55";
  const share = count / total;
  if (share >= 0.4) return "text-red-300";
  if (share >= 0.25) return "text-amber-300";
  return "text-emerald-300";
}

function callBadge(row: EvaluatedPrediction) {
  if (row.recovered) {
    return {
      label: "Recovered · excluded",
      className: "border-amber-400/25 bg-amber-500/10 text-amber-100",
    };
  }

  return row.resultCorrect
    ? {
        label: "Correct",
        className: "border-emerald-400/25 bg-emerald-500/10 text-emerald-100",
      }
    : {
        label: "Wrong",
        className: "border-red-400/25 bg-red-500/10 text-red-100",
      };
}

export default async function AiPredictorAccuracyPage() {
  await requireAdmin();

  const rows = await prisma.$queryRaw<PredictionAuditRow[]>(Prisma.sql`
    SELECT
      prediction."fixtureId" AS "fixtureId",
      fixture."kickoffAt" AS "kickoffAt",
      league."name" AS "leagueName",
      home_team."name" AS "homeTeamName",
      away_team."name" AS "awayTeamName",
      prediction."predictedHomeScore" AS "predictedHomeScore",
      prediction."predictedAwayScore" AS "predictedAwayScore",
      result."homeScore" AS "actualHomeScore",
      result."awayScore" AS "actualAwayScore",
      prediction."source" AS "source",
      prediction."generatedAt" AS "generatedAt"
    FROM "FixtureAiPrediction" prediction
    JOIN "Fixture" fixture ON fixture."id" = prediction."fixtureId"
    JOIN "MatchResult" result ON result."fixtureId" = fixture."id"
    JOIN "League" league ON league."id" = fixture."leagueId"
    JOIN "Team" home_team ON home_team."id" = fixture."homeTeamId"
    JOIN "Team" away_team ON away_team."id" = fixture."awayTeamId"
    WHERE fixture."status" = 'COMPLETED'
      AND COALESCE(home_team."isFixturePlaceholder", false) = false
      AND COALESCE(away_team."isFixturePlaceholder", false) = false
    ORDER BY fixture."kickoffAt" DESC
  `);

  const scoredRows = rows.filter(
    (row): row is PredictionAuditRow & { predictedHomeScore: number; predictedAwayScore: number } =>
      row.predictedHomeScore !== null && row.predictedAwayScore !== null,
  );

  const evaluated: EvaluatedPrediction[] = scoredRows.map((row) => {
    const predictedOutcome = outcome(row.predictedHomeScore, row.predictedAwayScore);
    const actualOutcome = outcome(row.actualHomeScore, row.actualAwayScore);

    return {
      ...row,
      weekKey: mondayKey(row.kickoffAt),
      predictedOutcome,
      actualOutcome,
      resultCorrect: predictedOutcome === actualOutcome,
      exactScore:
        row.predictedHomeScore === row.actualHomeScore &&
        row.predictedAwayScore === row.actualAwayScore,
      goalError:
        Math.abs(row.predictedHomeScore - row.actualHomeScore) +
        Math.abs(row.predictedAwayScore - row.actualAwayScore),
      recovered: row.source === "recovered",
    };
  });

  // Recovered rows are useful for restoring missing historical fixture displays, but
  // they were reconstructed later using the current predictor logic. Keep them visible
  // for context without allowing them to inflate or depress the live accuracy measure.
  const measured = evaluated.filter((row) => !row.recovered);
  const recoveredCount = evaluated.length - measured.length;
  const unmeasurableCount = rows.length - scoredRows.length;

  const weeklyMap = new Map<string, WeeklyStats>();

  for (const row of measured) {
    const current = weeklyMap.get(row.weekKey) ?? {
      weekKey: row.weekKey,
      total: 0,
      correct: 0,
      wrong: 0,
      exact: 0,
      goalError: 0,
    };

    current.total += 1;
    current.correct += row.resultCorrect ? 1 : 0;
    current.wrong += row.resultCorrect ? 0 : 1;
    current.exact += row.exactScore ? 1 : 0;
    current.goalError += row.goalError;
    weeklyMap.set(row.weekKey, current);
  }

  const weekly = Array.from(weeklyMap.values()).sort((a, b) => b.weekKey.localeCompare(a.weekKey));
  const latestWeek = weekly[0] ?? null;
  const totalCorrect = measured.filter((row) => row.resultCorrect).length;
  const totalWrong = measured.length - totalCorrect;
  const totalExact = measured.filter((row) => row.exactScore).length;
  const totalGoalError = measured.reduce((sum, row) => sum + row.goalError, 0);

  const scorelineCounts = new Map<string, number>();
  let predictedGoalTotal = 0;
  let actualGoalTotal = 0;

  for (const row of measured) {
    const scoreline = `${row.predictedHomeScore}–${row.predictedAwayScore}`;
    scorelineCounts.set(scoreline, (scorelineCounts.get(scoreline) ?? 0) + 1);
    predictedGoalTotal += row.predictedHomeScore + row.predictedAwayScore;
    actualGoalTotal += row.actualHomeScore + row.actualAwayScore;
  }

  const scorelineDistribution = Array.from(scorelineCounts.entries())
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  const mostCommonScoreline = scorelineDistribution[0] ?? null;

  return (
    <div className="mx-auto max-w-7xl space-y-6 px-4 py-8 sm:px-6 lg:px-8">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-emerald-300/80">
            AI predictor monitoring
          </p>
          <h1 className="mt-2 text-3xl font-black tracking-tight text-white sm:text-4xl">
            Predictor accuracy
          </h1>
          <p className="mt-3 max-w-4xl text-sm leading-6 text-white/60">
            Tracks completed fixtures with a genuine stored pre-match predictor score. Result accuracy means the predictor correctly called a home win, draw or away win. Exact-score accuracy is shown separately because it is a much stricter test.
          </p>
        </div>
        {recoveredCount > 0 ? (
          <div className="rounded-full border border-amber-400/20 bg-amber-500/10 px-3 py-1.5 text-xs font-semibold text-amber-100">
            {recoveredCount} recovered historical row{recoveredCount === 1 ? "" : "s"} excluded
          </div>
        ) : null}
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-3xl border border-emerald-400/20 bg-emerald-500/10 p-5">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-emerald-100/65">Latest week accuracy</p>
          <p className={`mt-3 text-4xl font-black ${latestWeek ? accuracyClasses(latestWeek.correct, latestWeek.total) : "text-white/55"}`}>
            {latestWeek ? percentage(latestWeek.correct, latestWeek.total) : "—"}
          </p>
          <p className="mt-2 text-xs text-white/45">
            {latestWeek ? `Week commencing ${weekLabel(latestWeek.weekKey)}` : "No completed live predictions yet"}
          </p>
        </div>

        <div className="rounded-3xl border border-white/10 bg-white/[0.04] p-5">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/45">Latest week calls</p>
          <div className="mt-3 flex items-end gap-3">
            <span className="text-3xl font-black text-emerald-300">{latestWeek?.correct ?? 0}</span>
            <span className="pb-1 text-xs text-white/40">correct</span>
            <span className="text-3xl font-black text-red-300">{latestWeek?.wrong ?? 0}</span>
            <span className="pb-1 text-xs text-white/40">wrong</span>
          </div>
          <p className="mt-2 text-xs text-white/45">{latestWeek?.total ?? 0} measured fixture{latestWeek?.total === 1 ? "" : "s"}</p>
        </div>

        <div className="rounded-3xl border border-sky-400/20 bg-sky-500/10 p-5">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-sky-100/65">Latest exact scores</p>
          <p className="mt-3 text-4xl font-black text-sky-200">{latestWeek?.exact ?? 0}</p>
          <p className="mt-2 text-xs text-white/45">
            {latestWeek ? `${percentage(latestWeek.exact, latestWeek.total)} of that week's fixtures` : "No completed live predictions yet"}
          </p>
        </div>

        <div className="rounded-3xl border border-white/10 bg-white/[0.04] p-5">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/45">All-time result accuracy</p>
          <p className={`mt-3 text-4xl font-black ${accuracyClasses(totalCorrect, measured.length)}`}>
            {percentage(totalCorrect, measured.length)}
          </p>
          <p className="mt-2 text-xs text-white/45">{totalCorrect} correct · {totalWrong} wrong · {totalExact} exact</p>
        </div>
      </div>

      <section className="rounded-3xl border border-violet-400/15 bg-violet-500/[0.06] p-6">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2 className="text-xl font-semibold text-white">Scoreline diversity</h2>
            <p className="mt-1 max-w-3xl text-sm text-white/55">Checks whether the exact-score model is collapsing too many different fixtures into the same prediction.</p>
          </div>
          <div className="text-xs text-white/40">Genuine stored predictions only</div>
        </div>

        <div className="mt-5 grid gap-4 md:grid-cols-3">
          <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-white/40">Most common prediction</p>
            <p className={`mt-2 text-3xl font-black ${mostCommonScoreline ? concentrationClasses(mostCommonScoreline[1], measured.length) : "text-white/55"}`}>
              {mostCommonScoreline?.[0] ?? "—"}
            </p>
            <p className="mt-2 text-xs text-white/45">
              {mostCommonScoreline ? `${mostCommonScoreline[1]} of ${measured.length} · ${percentage(mostCommonScoreline[1], measured.length)}` : "No measured predictions yet"}
            </p>
          </div>

          <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-white/40">Different scorelines used</p>
            <p className="mt-2 text-3xl font-black text-violet-200">{scorelineDistribution.length || "—"}</p>
            <p className="mt-2 text-xs text-white/45">Across {measured.length} measured prediction{measured.length === 1 ? "" : "s"}</p>
          </div>

          <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-white/40">Goals per fixture</p>
            <div className="mt-2 flex items-baseline gap-3">
              <span className="text-3xl font-black text-violet-200">{average(predictedGoalTotal, measured.length)}</span>
              <span className="text-xs text-white/40">predicted</span>
              <span className="text-2xl font-black text-white/75">{average(actualGoalTotal, measured.length)}</span>
              <span className="text-xs text-white/40">actual</span>
            </div>
          </div>
        </div>

        {scorelineDistribution.length > 0 ? (
          <div className="mt-4 flex flex-wrap gap-2">
            {scorelineDistribution.slice(0, 8).map(([scoreline, count]) => (
              <span key={scoreline} className="rounded-full border border-white/10 bg-black/20 px-3 py-1 text-xs text-white/65">
                {scoreline} · {count}
              </span>
            ))}
          </div>
        ) : null}
      </section>

      <section className="rounded-3xl border border-white/10 bg-white/[0.04] p-6">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2 className="text-xl font-semibold text-white">Accuracy by week</h2>
            <p className="mt-1 text-sm text-white/55">See whether genuine pre-match predictions are improving or becoming less reliable week by week.</p>
          </div>
          <div className="text-xs text-white/40">{measured.length} live completed prediction{measured.length === 1 ? "" : "s"} measured</div>
        </div>

        <div className="mt-5 overflow-x-auto rounded-2xl border border-white/10">
          <table className="min-w-full text-left text-sm">
            <thead className="bg-white/[0.04] text-[11px] uppercase tracking-[0.16em] text-white/40">
              <tr>
                <th className="px-4 py-3">Week commencing</th>
                <th className="px-4 py-3">Fixtures</th>
                <th className="px-4 py-3">Correct</th>
                <th className="px-4 py-3">Wrong</th>
                <th className="px-4 py-3">Result accuracy</th>
                <th className="px-4 py-3">Exact scores</th>
                <th className="px-4 py-3">Avg goals out</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/10">
              {weekly.map((week) => (
                <tr key={week.weekKey} className="hover:bg-white/[0.025]">
                  <td className="px-4 py-3 font-semibold text-white">{weekLabel(week.weekKey)}</td>
                  <td className="px-4 py-3 text-white/65">{week.total}</td>
                  <td className="px-4 py-3 font-semibold text-emerald-300">{week.correct}</td>
                  <td className="px-4 py-3 font-semibold text-red-300">{week.wrong}</td>
                  <td className={`px-4 py-3 font-black ${accuracyClasses(week.correct, week.total)}`}>{percentage(week.correct, week.total)}</td>
                  <td className="px-4 py-3 text-sky-200">{week.exact} ({percentage(week.exact, week.total)})</td>
                  <td className="px-4 py-3 text-white/65">{averageGoalError(week.goalError, week.total)}</td>
                </tr>
              ))}
              {weekly.length === 0 ? (
                <tr><td className="px-4 py-8 text-white/55" colSpan={7}>No completed genuine predictor scores are available yet.</td></tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>

      <section className="rounded-3xl border border-white/10 bg-white/[0.04] p-6">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2 className="text-xl font-semibold text-white">Recent predictor checks</h2>
            <p className="mt-1 text-sm text-white/55">Predicted score versus the result currently recorded. Recovered historical rows are visible but never counted in the accuracy percentages.</p>
          </div>
          <div className="text-xs text-white/40">Latest {Math.min(evaluated.length, 100)} shown</div>
        </div>

        <div className="mt-5 overflow-x-auto rounded-2xl border border-white/10">
          <table className="min-w-full text-left text-sm">
            <thead className="bg-white/[0.04] text-[11px] uppercase tracking-[0.16em] text-white/40">
              <tr>
                <th className="px-4 py-3">Fixture</th>
                <th className="px-4 py-3">League / date</th>
                <th className="px-4 py-3">Predicted</th>
                <th className="px-4 py-3">Actual</th>
                <th className="px-4 py-3">Call</th>
                <th className="px-4 py-3">Goals out</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/10">
              {evaluated.slice(0, 100).map((row) => {
                const badge = callBadge(row);
                return (
                  <tr key={row.fixtureId} className="hover:bg-white/[0.025]">
                    <td className="px-4 py-3">
                      <div className="font-semibold text-white">{row.homeTeamName} v {row.awayTeamName}</div>
                      {row.exactScore ? (
                        <span className="mt-1 inline-flex rounded-full border border-sky-400/25 bg-sky-500/10 px-2 py-0.5 text-[10px] font-semibold text-sky-100">Exact score</span>
                      ) : null}
                    </td>
                    <td className="px-4 py-3 text-white/60">
                      <div>{row.leagueName}</div>
                      <div className="mt-0.5 text-xs text-white/35">{dateTimeFormatter.format(row.kickoffAt)}</div>
                    </td>
                    <td className="px-4 py-3 font-black text-white">{row.predictedHomeScore}–{row.predictedAwayScore}</td>
                    <td className="px-4 py-3 font-black text-white">{row.actualHomeScore}–{row.actualAwayScore}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold ${badge.className}`}>{badge.label}</span>
                    </td>
                    <td className="px-4 py-3 text-white/65">{row.goalError}</td>
                  </tr>
                );
              })}
              {evaluated.length === 0 ? (
                <tr><td className="px-4 py-8 text-white/55" colSpan={6}>No predictor results are ready to audit yet.</td></tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>

      <div className="rounded-2xl border border-white/10 bg-black/25 px-4 py-3 text-xs leading-5 text-white/45">
        Result accuracy is the main headline measure. “Avg goals out” is the average total difference between the predicted home/away scores and the actual home/away scores. Recovered historical rows use today’s predictor logic with only data that existed before kick-off, so they are shown for context but excluded from the live accuracy percentage. {unmeasurableCount > 0 ? `${unmeasurableCount} older completed prediction${unmeasurableCount === 1 ? " has" : "s have"} no stored score and ${unmeasurableCount === 1 ? "is" : "are"} also excluded.` : "All non-recovered completed prediction rows currently have a stored score."} Overall average goals out: {averageGoalError(totalGoalError, measured.length)}.
      </div>
    </div>
  );
}
