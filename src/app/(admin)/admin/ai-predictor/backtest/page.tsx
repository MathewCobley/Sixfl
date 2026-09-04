import Link from "next/link";
import { Prisma } from "@prisma/client";

import {
  runPredictorBacktest,
  type PredictorBacktestMethod,
  type PredictorBacktestRow,
  type PredictorPromotionCheck,
} from "@/lib/fixtures/predictorBacktest";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/requireAdmin";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export const metadata = {
  title: "AI Predictor Back-test | SIXFL Admin",
};

const dateTimeFormatter = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Europe/London",
  day: "2-digit",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

const outcomeLabels = {
  HOME: "Team 1 win",
  DRAW: "Draw",
  AWAY: "Team 2 win",
} as const;

function percentage(value: number | null, digits = 0) {
  if (value === null || !Number.isFinite(value)) return "—";
  return `${(value * 100).toFixed(digits)}%`;
}

function points(value: number) {
  const rounded = Math.round(value * 1000) / 10;
  return `${rounded > 0 ? "+" : ""}${rounded.toFixed(1)} pts`;
}

function accuracyClass(value: number, baseline: number) {
  if (value >= Math.max(0.6, baseline + 0.08)) return "text-emerald-300";
  if (value >= baseline + 0.02) return "text-amber-300";
  return "text-red-300";
}

function decimal(value: number | null, digits = 1) {
  if (value === null || !Number.isFinite(value)) return "—";
  return value.toFixed(digits);
}

function signedDecimal(value: number | null, digits = 1) {
  if (value === null || !Number.isFinite(value)) return "—";
  return `${value > 0 ? "+" : ""}${value.toFixed(digits)}`;
}

function brier(value: number | null) {
  if (value === null) return "—";
  return value.toFixed(3);
}

function promotionMetricValue(check: PredictorPromotionCheck, value: number | null) {
  if (value === null) return "—";
  switch (check.key) {
    case "accuracy":
    case "top-four-share":
      return percentage(value, 1);
    case "brier":
      return value.toFixed(3);
    case "calibration":
      return `${(value * 100).toFixed(1)} pts`;
    case "goal-error":
      return value.toFixed(2);
    case "goal-bias":
      return signedDecimal(value, 2);
    case "distinct-scorelines":
      return Math.round(value).toString();
  }
}

function ScorelineCard({ method }: { method: PredictorBacktestMethod }) {
  return (
    <div className="rounded-3xl border border-violet-400/20 bg-violet-500/[0.06] p-5">
      <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-violet-100/60">
        {method.label}
      </div>
      <div className="mt-4 grid grid-cols-2 gap-3">
        <div className="rounded-2xl border border-white/10 bg-black/20 p-3">
          <div className="text-[10px] uppercase tracking-[0.14em] text-white/35">Most common</div>
          <div className="mt-2 text-2xl font-black text-emerald-300">
            {method.mostCommonScoreline ?? "—"}
          </div>
          <div className="mt-1 text-xs text-white/45">
            {method.mostCommonScorelineCount ?? 0} · {percentage(method.mostCommonScorelineShare)}
          </div>
        </div>
        <div className="rounded-2xl border border-white/10 bg-black/20 p-3">
          <div className="text-[10px] uppercase tracking-[0.14em] text-white/35">Different scores</div>
          <div className="mt-2 text-2xl font-black text-white">
            {method.distinctScorelines ?? "—"}
          </div>
          <div className="mt-1 text-xs text-white/45">
            Top four: {percentage(method.topFourScorelineShare)}
          </div>
        </div>
      </div>
      <div className="mt-3 rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-white/65">
        Predicted {decimal(method.averagePredictedGoals)} goals · actual {decimal(method.averageActualGoals)} · bias {signedDecimal(method.goalsBias)}
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        {method.commonScorelines.map((item) => (
          <span
            key={item.scoreline}
            className="rounded-full border border-white/10 bg-black/25 px-3 py-1 text-xs text-white/65"
          >
            {item.scoreline} · {item.count}
          </span>
        ))}
      </div>
    </div>
  );
}

function ConfusionMatrix({ method }: { method: PredictorBacktestMethod }) {
  return (
    <div className="rounded-3xl border border-white/10 bg-white/[0.035] p-5">
      <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/45">
        {method.label}
      </div>
      <div className="mt-4 overflow-x-auto rounded-2xl border border-white/10">
        <table className="min-w-full text-center text-sm">
          <thead className="bg-white/[0.04] text-[10px] uppercase tracking-[0.12em] text-white/40">
            <tr>
              <th className="px-3 py-3 text-left">Actual ↓ / called →</th>
              <th className="px-3 py-3">Team 1</th>
              <th className="px-3 py-3">Draw</th>
              <th className="px-3 py-3">Team 2</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/10">
            {(["HOME", "DRAW", "AWAY"] as const).map((actual) => (
              <tr key={actual}>
                <th className="px-3 py-3 text-left text-xs font-semibold text-white/60">
                  {outcomeLabels[actual]}
                </th>
                {(["HOME", "DRAW", "AWAY"] as const).map((called) => (
                  <td
                    key={called}
                    className={`px-3 py-3 font-semibold ${actual === called ? "text-emerald-300" : "text-white/55"}`}
                  >
                    {method.confusionMatrix[actual][called]}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function CalibrationCard({ method }: { method: PredictorBacktestMethod }) {
  return (
    <div className="rounded-3xl border border-sky-400/20 bg-sky-500/[0.05] p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-sky-100/60">
            {method.label}
          </div>
          <div className="mt-2 text-sm text-white/55">
            Average confidence {percentage(method.averageConfidence, 1)}
          </div>
        </div>
        <div className="rounded-full border border-sky-300/20 bg-sky-400/10 px-3 py-1 text-xs font-semibold text-sky-100">
          Calibration error {method.calibrationError === null ? "—" : `${(method.calibrationError * 100).toFixed(1)} pts`}
        </div>
      </div>
      <div className="mt-4 overflow-x-auto rounded-2xl border border-white/10">
        <table className="min-w-full text-left text-xs">
          <thead className="bg-white/[0.04] uppercase tracking-[0.12em] text-white/35">
            <tr>
              <th className="px-3 py-2.5">Confidence band</th>
              <th className="px-3 py-2.5">Calls</th>
              <th className="px-3 py-2.5">Avg confidence</th>
              <th className="px-3 py-2.5">Actual accuracy</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/10">
            {method.calibrationBins.map((bin) => (
              <tr key={bin.label}>
                <td className="px-3 py-2.5 font-semibold text-white/70">{bin.label}</td>
                <td className="px-3 py-2.5 text-white/55">{bin.calls}</td>
                <td className="px-3 py-2.5 text-white/55">{percentage(bin.averageConfidence, 1)}</td>
                <td className="px-3 py-2.5 text-white/55">{percentage(bin.accuracy, 1)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default async function PredictorBacktestPage() {
  await requireAdmin();

  const rows = await prisma.$queryRaw<PredictorBacktestRow[]>(Prisma.sql`
    SELECT
      fixture."id" AS "fixtureId",
      fixture."leagueId" AS "leagueId",
      league."name" AS "leagueName",
      fixture."kickoffAt" AS "kickoffAt",
      result."enteredAt" AS "resultEnteredAt",
      home_team."id" AS "homeTeamId",
      home_team."name" AS "homeTeamName",
      away_team."id" AS "awayTeamId",
      away_team."name" AS "awayTeamName",
      result."homeScore" AS "actualHomeScore",
      result."awayScore" AS "actualAwayScore"
    FROM "Fixture" fixture
    JOIN "MatchResult" result ON result."fixtureId" = fixture."id"
    JOIN "League" league ON league."id" = fixture."leagueId"
    JOIN "Team" home_team ON home_team."id" = fixture."homeTeamId"
    JOIN "Team" away_team ON away_team."id" = fixture."awayTeamId"
    WHERE fixture."status" = 'COMPLETED'
      AND COALESCE(home_team."isFixturePlaceholder", false) = false
      AND COALESCE(away_team."isFixturePlaceholder", false) = false
    ORDER BY fixture."kickoffAt" ASC, fixture."id" ASC
  `);

  const backtest = runPredictorBacktest(rows);
  const current = backtest.methods.find((method) => method.key === "sixfl") ?? null;
  const v3Score = backtest.methods.find((method) => method.key === "v3-score") ?? null;
  const v3Full = backtest.methods.find((method) => method.key === "v3-full") ?? null;

  return (
    <div className="mx-auto max-w-7xl space-y-6 px-4 py-8 sm:px-6 lg:px-8">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-violet-300/80">
            AI predictor laboratory
          </p>
          <h1 className="mt-2 text-3xl font-black tracking-tight text-white sm:text-4xl">
            Historical predictor back-test
          </h1>
          <p className="mt-3 max-w-4xl text-sm leading-6 text-white/60">
            Replays completed SIXFL fixtures in chronological order. Every model sees only results whose kick-off and result-entry time were both before the match being predicted. The target match and all future information remain excluded.
          </p>
        </div>
        <Link
          href="/admin/ai-predictor"
          className="inline-flex items-center justify-center rounded-full border border-white/10 bg-white/[0.04] px-5 py-3 text-sm font-semibold text-white/75 transition hover:border-white/20 hover:bg-white/[0.07] hover:text-white"
        >
          ← Live predictor monitoring
        </Link>
      </div>

      <div className="rounded-2xl border border-emerald-400/20 bg-emerald-500/[0.07] px-5 py-4 text-sm leading-6 text-emerald-50/80">
        <span className="font-semibold text-emerald-200">Laboratory only:</span> the two V3 candidates below are calculated in memory. Opening this page does not rewrite stored predictions, alter completed matches or change the live model.
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-3xl border border-violet-400/20 bg-violet-500/10 p-5">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-violet-100/65">Fixtures replayed</p>
          <p className="mt-3 text-4xl font-black text-violet-200">{backtest.eligibleFixtures}</p>
          <p className="mt-2 text-xs text-white/45">
            {backtest.totalCompletedFixtures} completed · {backtest.skippedTooEarly} too early to call
          </p>
        </div>

        <div className="rounded-3xl border border-white/10 bg-white/[0.04] p-5">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/45">Draw rate</p>
          <p className="mt-3 text-4xl font-black text-white">{percentage(backtest.drawRate)}</p>
          <p className="mt-2 text-xs text-white/45">{backtest.draws} draws in the shared test sample</p>
        </div>

        <div className="rounded-3xl border border-amber-400/20 bg-amber-500/10 p-5">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-amber-100/65">Live control model</p>
          <p className="mt-3 text-4xl font-black text-amber-200">{percentage(current?.accuracy ?? null)}</p>
          <p className="mt-2 text-xs text-white/45">
            Blind two-team guess: {percentage(backtest.twoTeamCoinExpectedAccuracy)}
          </p>
        </div>

        <div className="rounded-3xl border border-emerald-400/20 bg-emerald-500/10 p-5">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-emerald-100/65">Best historical method</p>
          <p className="mt-3 text-2xl font-black text-emerald-200">{backtest.bestMethodLabel ?? "—"}</p>
          <p className="mt-2 text-sm font-semibold text-white/75">{percentage(backtest.bestAccuracy)}</p>
        </div>
      </div>

      <section className="rounded-3xl border border-white/10 bg-white/[0.035] p-6">
        <div className="flex flex-col gap-2 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-emerald-200/70">Promotion gate</p>
            <h2 className="mt-2 text-xl font-semibold text-white">Is either V3 candidate safe enough for a live trial?</h2>
            <p className="mt-2 max-w-4xl text-sm leading-6 text-white/55">
              A candidate must preserve result accuracy and probability quality while reducing score error, total-goal bias and scoreline concentration. Passing here still requires a separate, explicit live-model change.
            </p>
          </div>
        </div>

        <div className="mt-5 grid gap-4 xl:grid-cols-2">
          {backtest.promotionAssessments.map((assessment) => (
            <div
              key={assessment.candidateKey}
              className={`rounded-3xl border p-5 ${assessment.ready ? "border-emerald-400/30 bg-emerald-500/[0.08]" : "border-amber-400/20 bg-amber-500/[0.06]"}`}
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h3 className="font-semibold text-white">{assessment.candidateLabel}</h3>
                  <p className="mt-1 text-xs text-white/45">
                    {assessment.passedChecks} of {assessment.totalChecks} safeguards passed
                  </p>
                </div>
                <span
                  className={`rounded-full border px-3 py-1 text-xs font-semibold ${assessment.ready ? "border-emerald-300/25 bg-emerald-400/10 text-emerald-100" : "border-amber-300/25 bg-amber-400/10 text-amber-100"}`}
                >
                  {assessment.ready ? "Passes lab gate" : "Keep in laboratory"}
                </span>
              </div>

              <div className="mt-4 space-y-2">
                {assessment.checks.map((check) => (
                  <div
                    key={check.key}
                    className="flex flex-col gap-2 rounded-2xl border border-white/10 bg-black/20 px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div className="flex items-center gap-2 text-sm text-white/70">
                      <span className={check.passed ? "text-emerald-300" : "text-red-300"}>
                        {check.passed ? "✓" : "×"}
                      </span>
                      <span>{check.label}</span>
                    </div>
                    <div className="shrink-0 text-xs font-semibold text-white/50">
                      {promotionMetricValue(check, check.currentValue)} →{" "}
                      <span className={check.passed ? "text-emerald-200" : "text-red-200"}>
                        {promotionMetricValue(check, check.candidateValue)}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="rounded-3xl border border-white/10 bg-white/[0.04] p-6">
        <div>
          <h2 className="text-xl font-semibold text-white">Model comparison</h2>
          <p className="mt-1 max-w-5xl text-sm leading-6 text-white/55">
            Accuracy is the Team 1/draw/Team 2 call. Lower Brier, calibration error and goals-out are better. Predicted versus actual goals exposes systematic under- or over-scoring, while scoreline diversity shows whether the model is collapsing around 3–2 and 4–3.
          </p>
        </div>

        <div className="mt-5 overflow-x-auto rounded-2xl border border-white/10">
          <table className="min-w-[1500px] text-left text-sm">
            <thead className="bg-white/[0.04] text-[10px] uppercase tracking-[0.14em] text-white/40">
              <tr>
                <th className="px-4 py-3">Method</th>
                <th className="px-4 py-3">Calls</th>
                <th className="px-4 py-3">Correct</th>
                <th className="px-4 py-3">Accuracy</th>
                <th className="px-4 py-3">Vs blind</th>
                <th className="px-4 py-3">Brier</th>
                <th className="px-4 py-3">Calibration</th>
                <th className="px-4 py-3">Exact</th>
                <th className="px-4 py-3">Avg goals out</th>
                <th className="px-4 py-3">Pred / actual goals</th>
                <th className="px-4 py-3">Goal bias</th>
                <th className="px-4 py-3">Different scores</th>
                <th className="px-4 py-3">Top four share</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/10">
              {backtest.methods.map((method) => (
                <tr key={method.key} className="hover:bg-white/[0.025]">
                  <td className="max-w-md px-4 py-4">
                    <div className="font-semibold text-white">{method.label}</div>
                    <div className="mt-1 text-xs leading-5 text-white/40">{method.description}</div>
                  </td>
                  <td className="px-4 py-4 text-white/65">{method.calls}</td>
                  <td className="px-4 py-4 font-semibold text-white">{method.correct}</td>
                  <td className={`px-4 py-4 text-lg font-black ${accuracyClass(method.accuracy, backtest.twoTeamCoinExpectedAccuracy)}`}>
                    {percentage(method.accuracy)}
                  </td>
                  <td className={`px-4 py-4 font-semibold ${method.accuracy > backtest.twoTeamCoinExpectedAccuracy ? "text-emerald-300" : "text-red-300"}`}>
                    {points(method.accuracy - backtest.twoTeamCoinExpectedAccuracy)}
                  </td>
                  <td className="px-4 py-4 text-white/65">{brier(method.brierScore)}</td>
                  <td className="px-4 py-4 text-white/65">
                    {method.calibrationError === null ? "—" : `${(method.calibrationError * 100).toFixed(1)} pts`}
                  </td>
                  <td className="px-4 py-4 text-sky-200">
                    {method.exact === null ? "—" : `${method.exact} (${percentage(method.exactAccuracy)})`}
                  </td>
                  <td className="px-4 py-4 text-white/65">{decimal(method.averageGoalError)}</td>
                  <td className="px-4 py-4 text-white/65">
                    {method.averagePredictedGoals === null
                      ? "—"
                      : `${decimal(method.averagePredictedGoals)} / ${decimal(method.averageActualGoals)}`}
                  </td>
                  <td className="px-4 py-4 text-white/65">{signedDecimal(method.goalsBias)}</td>
                  <td className="px-4 py-4 text-white/65">{method.distinctScorelines ?? "—"}</td>
                  <td className="px-4 py-4 text-white/65">{percentage(method.topFourScorelineShare)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {current && v3Score && v3Full ? (
        <section className="rounded-3xl border border-violet-400/15 bg-violet-500/[0.04] p-6">
          <div>
            <h2 className="text-xl font-semibold text-white">Scoreline concentration</h2>
            <p className="mt-1 max-w-5xl text-sm leading-6 text-white/55">
              V3 score-only keeps every current result call unchanged, so this isolates whether the new overdispersed pace model improves the exact scores without moving the winner prediction. V3 full also tests the new result layer.
            </p>
          </div>
          <div className="mt-5 grid gap-4 xl:grid-cols-3">
            <ScorelineCard method={current} />
            <ScorelineCard method={v3Score} />
            <ScorelineCard method={v3Full} />
          </div>
        </section>
      ) : null}

      {current && v3Full ? (
        <section className="rounded-3xl border border-white/10 bg-white/[0.035] p-6">
          <div>
            <h2 className="text-xl font-semibold text-white">Outcome confusion</h2>
            <p className="mt-1 max-w-4xl text-sm leading-6 text-white/55">
              Rows are what happened; columns are what the model called. This makes missed draws and wrong-side calls visible rather than hiding them inside one accuracy number.
            </p>
          </div>
          <div className="mt-5 grid gap-4 xl:grid-cols-2">
            <ConfusionMatrix method={current} />
            <ConfusionMatrix method={v3Full} />
          </div>
        </section>
      ) : null}

      {current && v3Full ? (
        <section className="rounded-3xl border border-sky-400/15 bg-sky-500/[0.035] p-6">
          <div>
            <h2 className="text-xl font-semibold text-white">Confidence calibration</h2>
            <p className="mt-1 max-w-4xl text-sm leading-6 text-white/55">
              A well-calibrated 50% band should be right about half the time. Calibration error is the weighted gap between stated confidence and observed accuracy; lower is better.
            </p>
          </div>
          <div className="mt-5 grid gap-4 xl:grid-cols-2">
            <CalibrationCard method={current} />
            <CalibrationCard method={v3Full} />
          </div>
        </section>
      ) : null}

      <section className="rounded-3xl border border-white/10 bg-white/[0.04] p-6">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2 className="text-xl font-semibold text-white">Recent replay examples</h2>
            <p className="mt-1 text-sm text-white/55">Real SIXFL fixtures, replayed with only information available before kick-off.</p>
          </div>
          <div className="text-xs text-white/40">Latest {backtest.examples.length} eligible historical fixtures</div>
        </div>

        <div className="mt-5 overflow-x-auto rounded-2xl border border-white/10">
          <table className="min-w-[1150px] text-left text-sm">
            <thead className="bg-white/[0.04] text-[10px] uppercase tracking-[0.14em] text-white/40">
              <tr>
                <th className="px-4 py-3">Fixture</th>
                <th className="px-4 py-3">Actual</th>
                <th className="px-4 py-3">Current SIXFL</th>
                <th className="px-4 py-3">V3 score-only</th>
                <th className="px-4 py-3">V3 full</th>
                <th className="px-4 py-3">Elo + goals</th>
                <th className="px-4 py-3">PPG</th>
                <th className="px-4 py-3">Elo</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/10">
              {backtest.examples.map((row) => (
                <tr key={row.fixtureId} className="hover:bg-white/[0.025]">
                  <td className="px-4 py-3">
                    <div className="font-semibold text-white">{row.fixture}</div>
                    <div className="mt-1 text-xs text-white/40">{row.leagueName} · {dateTimeFormatter.format(row.kickoffAt)}</div>
                  </td>
                  <td className="px-4 py-3 text-lg font-black text-white">{row.actual}</td>
                  <td className="px-4 py-3 font-semibold text-sky-200">{row.sixfl}</td>
                  <td className="px-4 py-3 font-semibold text-violet-200">{row.v3Score}</td>
                  <td className="px-4 py-3 font-semibold text-emerald-200">{row.v3Full}</td>
                  <td className="px-4 py-3 text-white/65">{row.eloGoals}</td>
                  <td className="px-4 py-3 text-white/65">{row.ppg}</td>
                  <td className="px-4 py-3 text-white/65">{row.elo}</td>
                </tr>
              ))}
              {backtest.examples.length === 0 ? (
                <tr><td className="px-4 py-8 text-white/55" colSpan={8}>There is not enough historical data to run a fair replay yet.</td></tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>

      <div className="rounded-2xl border border-amber-400/15 bg-amber-500/[0.06] px-4 py-3 text-xs leading-5 text-amber-50/65">
        Back-testing is evidence, not proof. Even a candidate that passes every retrospective gate should first be promoted under a new model version for future fixtures only. Completed historical prediction rows remain the audit record and are not rewritten by this page.
      </div>
    </div>
  );
}
