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
  source: string | null;
  generatedAt: Date | null;
};

type UpcomingCoverageRow = {
  fixtureId: string;
  kickoffAt: Date;
  leagueName: string;
  homeTeamName: string;
  awayTeamName: string;
  predictedHomeScore: number | null;
  predictedAwayScore: number | null;
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
  totalFixtures: number;
  measured: number;
  recovered: number;
  missing: number;
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

function percentage(value: number, total: number) {
  if (total === 0) return "—";
  return `${Math.round((value / total) * 100)}%`;
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

function coverageClasses(stored: number, total: number) {
  if (total === 0) return "text-white/55";
  if (stored === total) return "text-emerald-300";
  if (stored / total >= 0.9) return "text-amber-300";
  return "text-red-300";
}

function concentrationClasses(count: number, total: number) {
  if (total === 0) return "text-white/55";
  const share = count / total;
  if (share >= 0.4) return "text-red-300";
  if (share >= 0.25) return "text-amber-300";
  return "text-emerald-300";
}

function callBadge(row: EvaluatedPrediction | null) {
  if (!row) {
    return {
      label: "Missing prediction",
      className: "border-red-400/25 bg-red-500/10 text-red-100",
    };
  }

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

function hasStoredScore(row: {
  predictedHomeScore: number | null;
  predictedAwayScore: number | null;
}) {
  return row.predictedHomeScore !== null && row.predictedAwayScore !== null;
}

function emptyWeek(weekKey: string): WeeklyStats {
  return {
    weekKey,
    totalFixtures: 0,
    measured: 0,
    recovered: 0,
    missing: 0,
    correct: 0,
    wrong: 0,
    exact: 0,
    goalError: 0,
  };
}

export default async function AiPredictorAccuracyPage() {
  await requireAdmin();

  const [rows, upcomingRows] = await Promise.all([
    prisma.$queryRaw<PredictionAuditRow[]>(Prisma.sql`
      SELECT
        fixture."id" AS "fixtureId",
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
      FROM "Fixture" fixture
      JOIN "MatchResult" result ON result."fixtureId" = fixture."id"
      JOIN "League" league ON league."id" = fixture."leagueId"
      JOIN "Team" home_team ON home_team."id" = fixture."homeTeamId"
      JOIN "Team" away_team ON away_team."id" = fixture."awayTeamId"
      LEFT JOIN "FixtureAiPrediction" prediction ON prediction."fixtureId" = fixture."id"
      WHERE fixture."status" = 'COMPLETED'
        AND COALESCE(home_team."isFixturePlaceholder", false) = false
        AND COALESCE(away_team."isFixturePlaceholder", false) = false
      ORDER BY fixture."kickoffAt" DESC
    `),
    prisma.$queryRaw<UpcomingCoverageRow[]>(Prisma.sql`
      SELECT
        fixture."id" AS "fixtureId",
        fixture."kickoffAt" AS "kickoffAt",
        league."name" AS "leagueName",
        home_team."name" AS "homeTeamName",
        away_team."name" AS "awayTeamName",
        prediction."predictedHomeScore" AS "predictedHomeScore",
        prediction."predictedAwayScore" AS "predictedAwayScore"
      FROM "Fixture" fixture
      JOIN "League" league ON league."id" = fixture."leagueId"
      JOIN "Team" home_team ON home_team."id" = fixture."homeTeamId"
      JOIN "Team" away_team ON away_team."id" = fixture."awayTeamId"
      LEFT JOIN "FixtureAiPrediction" prediction ON prediction."fixtureId" = fixture."id"
      WHERE fixture."status" = 'SCHEDULED'
        AND COALESCE(home_team."isFixturePlaceholder", false) = false
        AND COALESCE(away_team."isFixturePlaceholder", false) = false
      ORDER BY fixture."kickoffAt" ASC
    `),
  ]);

  const scoredRows = rows.filter(
    (row): row is PredictionAuditRow & { predictedHomeScore: number; predictedAwayScore: number } =>
      hasStoredScore(row),
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

  const measured = evaluated.filter((row) => !row.recovered);
  const evaluatedByFixtureId = new Map(evaluated.map((row) => [row.fixtureId, row]));
  const weeklyMap = new Map<string, WeeklyStats>();

  for (const row of rows) {
    const weekKey = mondayKey(row.kickoffAt);
    const week = weeklyMap.get(weekKey) ?? emptyWeek(weekKey);
    week.totalFixtures += 1;
    weeklyMap.set(weekKey, week);
  }

  for (const row of evaluated) {
    const week = weeklyMap.get(row.weekKey) ?? emptyWeek(row.weekKey);

    if (row.recovered) {
      week.recovered += 1;
    } else {
      week.measured += 1;
      week.correct += row.resultCorrect ? 1 : 0;
      week.wrong += row.resultCorrect ? 0 : 1;
      week.exact += row.exactScore ? 1 : 0;
      week.goalError += row.goalError;
    }

    weeklyMap.set(row.weekKey, week);
  }

  for (const week of weeklyMap.values()) {
    week.missing = Math.max(week.totalFixtures - week.measured - week.recovered, 0);
  }

  const weekly = Array.from(weeklyMap.values()).sort((a, b) => b.weekKey.localeCompare(a.weekKey));
  const latestWeek = weekly[0] ?? null;
  const totalCorrect = measured.filter((row) => row.resultCorrect).length;
  const totalWrong = measured.length - totalCorrect;
  const totalExact = measured.filter((row) => row.exactScore).length;
  const totalGoalError = measured.reduce((sum, row) => sum + row.goalError, 0);
  const recoveredCount = evaluated.filter((row) => row.recovered).length;
  const missingCompletedCount = rows.length - scoredRows.length;

  const nextWeekKey = upcomingRows[0] ? mondayKey(upcomingRows[0].kickoffAt) : null;
  const nextWeekRows = nextWeekKey
    ? upcomingRows.filter((row) => mondayKey(row.kickoffAt) === nextWeekKey)
    : [];
  const nextWeekStored = nextWeekRows.filter(hasStoredScore);
  const nextWeekMissing = nextWeekRows.filter((row) => !hasStoredScore(row));

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
            Predictor accuracy & coverage
          </h1>
          <p className="mt-3 max-w-4xl text-sm leading-6 text-white/60">
            Coverage shows whether every real fixture has a permanently stored pre-match prediction. Accuracy only scores genuine predictions that were stored before the result; recovered historical rows remain visible but are excluded.
          </p>
        </div>
        {recoveredCount > 0 ? (
          <div className="rounded-full border border-amber-400/20 bg-amber-500/10 px-3 py-1.5 text-xs font-semibold text-amber-100">
            {recoveredCount} recovered historical row{recoveredCount === 1 ? "" : "s"} excluded from accuracy
          </div>
        ) : null}
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <div className="rounded-3xl border border-emerald-400/20 bg-emerald-500/10 p-5">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-emerald-100/65">Next fixture week coverage</p>
          <p className={`mt-3 text-4xl font-black ${coverageClasses(nextWeekStored.length, nextWeekRows.length)}`}>
            {nextWeekRows.length ? `${nextWeekStored.length}/${nextWeekRows.length}` : "—"}
          </p>
          <p className="mt-2 text-xs text-white/45">
            {nextWeekKey ? `Week commencing ${weekLabel(nextWeekKey)} · ${percentage(nextWeekStored.length, nextWeekRows.length)} stored` : "No scheduled fixtures"}
          </p>
        </div>

        <div className="rounded-3xl border border-white/10 bg-white/[0.04] p-5">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/45">Latest played week coverage</p>
          <p className={`mt-3 text-4xl font-black ${latestWeek ? coverageClasses(latestWeek.measured, latestWeek.totalFixtures) : "text-white/55"}`}>
            {latestWeek ? `${latestWeek.measured}/${latestWeek.totalFixtures}` : "—"}
          </p>
          <p className="mt-2 text-xs text-white/45">
            {latestWeek ? `${latestWeek.recovered} recovered · ${latestWeek.missing} missing` : "No completed fixtures yet"}
          </p>
        </div>

        <div className="rounded-3xl border border-sky-400/20 bg-sky-500/10 p-5">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-sky-100/65">Latest result accuracy</p>
          <p className={`mt-3 text-4xl font-black ${latestWeek ? accuracyClasses(latestWeek.correct, latestWeek.measured) : "text-white/55"}`}>
            {latestWeek ? percentage(latestWeek.correct, latestWeek.measured) : "—"}
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
          <p className="mt-2 text-xs text-white/45">{latestWeek?.measured ?? 0} genuine prediction{latestWeek?.measured === 1 ? "" : "s"} measured</p>
        </div>

        <div className="rounded-3xl border border-sky-400/20 bg-sky-500/10 p-5">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-sky-100/65">Latest exact scores</p>
          <p className="mt-3 text-4xl font-black text-sky-200">{latestWeek?.exact ?? 0}</p>
          <p className="mt-2 text-xs text-white/45">
            {latestWeek ? `${percentage(latestWeek.exact, latestWeek.measured)} of measured predictions` : "No completed live predictions yet"}
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

      {nextWeekMissing.length > 0 ? (
        <section className="rounded-3xl border border-red-400/25 bg-red-500/[0.08] p-6">
          <h2 className="text-xl font-semibold text-red-100">Missing upcoming predictions</h2>
          <p className="mt-1 text-sm text-red-100/65">
            {nextWeekMissing.length} fixture{nextWeekMissing.length === 1 ? " is" : "s are"} missing a stored score in the next fixture week. These should be investigated before match night.
          </p>
          <div className="mt-4 grid gap-2 md:grid-cols-2">
            {nextWeekMissing.map((row) => (
              <div key={row.fixtureId} className="rounded-2xl border border-red-400/15 bg-black/20 px-4 py-3">
                <div className="font-semibold text-white">{row.homeTeamName} v {row.awayTeamName}</div>
                <div className="mt-1 text-xs text-white/45">{row.leagueName} · {dateTimeFormatter.format(row.kickoffAt)}</div>
              </div>
            ))}
          </div>
        </section>
      ) : nextWeekRows.length > 0 ? (
        <div className="rounded-2xl border border-emerald-400/20 bg-emerald-500/10 px-4 py-3 text-sm font-semibold text-emerald-100">
          All {nextWeekRows.length} fixtures in the next fixture week have a stored AI prediction.
        </div>
      ) : null}

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
            <h2 className="text-xl font-semibold text-white">Accuracy & coverage by week</h2>
            <p className="mt-1 text-sm text-white/55">Total fixtures are shown alongside genuine measured predictions so incomplete coverage cannot look like a complete week.</p>
          </div>
          <div className="text-xs text-white/40">{rows.length} completed real fixture{rows.length === 1 ? "" : "s"} checked</div>
        </div>

        <div className="mt-5 overflow-x-auto rounded-2xl border border-white/10">
          <table className="min-w-full text-left text-sm">
            <thead className="bg-white/[0.04] text-[11px] uppercase tracking-[0.16em] text-white/40">
              <tr>
                <th className="px-4 py-3">Week commencing</th>
                <th className="px-4 py-3">Total fixtures</th>
                <th className="px-4 py-3">Measured</th>
                <th className="px-4 py-3">Recovered</th>
                <th className="px-4 py-3">Missing</th>
                <th className="px-4 py-3">Correct</th>
                <th className="px-4 py-3">Wrong</th>
                <th className="px-4 py-3">Accuracy</th>
                <th className="px-4 py-3">Exact</th>
                <th className="px-4 py-3">Avg goals out</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/10">
              {weekly.map((week) => (
                <tr key={week.weekKey} className="hover:bg-white/[0.025]">
                  <td className="px-4 py-3 font-semibold text-white">{weekLabel(week.weekKey)}</td>
                  <td className="px-4 py-3 font-semibold text-white">{week.totalFixtures}</td>
                  <td className={`px-4 py-3 font-semibold ${coverageClasses(week.measured, week.totalFixtures)}`}>{week.measured}</td>
                  <td className="px-4 py-3 text-amber-200">{week.recovered}</td>
                  <td className={week.missing ? "px-4 py-3 font-semibold text-red-300" : "px-4 py-3 text-white/45"}>{week.missing}</td>
                  <td className="px-4 py-3 font-semibold text-emerald-300">{week.correct}</td>
                  <td className="px-4 py-3 font-semibold text-red-300">{week.wrong}</td>
                  <td className={`px-4 py-3 font-black ${accuracyClasses(week.correct, week.measured)}`}>{percentage(week.correct, week.measured)}</td>
                  <td className="px-4 py-3 text-sky-200">{week.exact} ({percentage(week.exact, week.measured)})</td>
                  <td className="px-4 py-3 text-white/65">{averageGoalError(week.goalError, week.measured)}</td>
                </tr>
              ))}
              {weekly.length === 0 ? (
                <tr><td className="px-4 py-8 text-white/55" colSpan={10}>No completed fixtures are available yet.</td></tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>

      <section className="rounded-3xl border border-white/10 bg-white/[0.04] p-6">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2 className="text-xl font-semibold text-white">Recent predictor checks</h2>
            <p className="mt-1 text-sm text-white/55">Every completed real fixture appears here, including fixtures where no genuine stored prediction exists.</p>
          </div>
          <div className="text-xs text-white/40">Latest {Math.min(rows.length, 100)} shown</div>
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
              {rows.slice(0, 100).map((row) => {
                const evaluatedRow = evaluatedByFixtureId.get(row.fixtureId) ?? null;
                const badge = callBadge(evaluatedRow);
                return (
                  <tr key={row.fixtureId} className="hover:bg-white/[0.025]">
                    <td className="px-4 py-3">
                      <div className="font-semibold text-white">{row.homeTeamName} v {row.awayTeamName}</div>
                      {evaluatedRow?.exactScore ? (
                        <span className="mt-1 inline-flex rounded-full border border-sky-400/25 bg-sky-500/10 px-2 py-0.5 text-[10px] font-semibold text-sky-100">Exact score</span>
                      ) : null}
                    </td>
                    <td className="px-4 py-3 text-white/60">
                      <div>{row.leagueName}</div>
                      <div className="mt-0.5 text-xs text-white/35">{dateTimeFormatter.format(row.kickoffAt)}</div>
                    </td>
                    <td className="px-4 py-3 font-black text-white">
                      {hasStoredScore(row) ? `${row.predictedHomeScore}–${row.predictedAwayScore}` : "—"}
                    </td>
                    <td className="px-4 py-3 font-black text-white">{row.actualHomeScore}–{row.actualAwayScore}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold ${badge.className}`}>{badge.label}</span>
                    </td>
                    <td className="px-4 py-3 text-white/65">{evaluatedRow ? evaluatedRow.goalError : "—"}</td>
                  </tr>
                );
              })}
              {rows.length === 0 ? (
                <tr><td className="px-4 py-8 text-white/55" colSpan={6}>No completed fixtures are ready to audit yet.</td></tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>

      <div className="rounded-2xl border border-white/10 bg-black/25 px-4 py-3 text-xs leading-5 text-white/45">
        Result accuracy is based only on genuine stored pre-match predictions. Recovered rows are excluded because they were reconstructed later. Missing means the completed fixture has no stored predicted score at all. {missingCompletedCount > 0 ? `${missingCompletedCount} completed fixture${missingCompletedCount === 1 ? " is" : "s are"} currently missing a stored score.` : "Every completed fixture currently has a stored score or a clearly marked recovered row."} Overall average goals out: {averageGoalError(totalGoalError, measured.length)}.
      </div>
    </div>
  );
}
