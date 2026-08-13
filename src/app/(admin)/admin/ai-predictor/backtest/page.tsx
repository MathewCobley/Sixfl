import Link from "next/link";
import { Prisma } from "@prisma/client";

import {
  runPredictorBacktest,
  type PredictorBacktestRow,
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

function percentage(value: number | null) {
  if (value === null || !Number.isFinite(value)) return "—";
  return `${Math.round(value * 100)}%`;
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

function brier(value: number | null) {
  if (value === null) return "—";
  return value.toFixed(3);
}

function goalError(value: number | null) {
  if (value === null) return "—";
  return value.toFixed(1);
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
  const candidate = backtest.methods.find((method) => method.key === "elo-goals") ?? null;
  const candidateImprovement =
    current && candidate ? candidate.accuracy - current.accuracy : null;

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
            Replays completed SIXFL fixtures in chronological order. For every match, the models can only see results whose kick-off and result-entry time were both before that match kicked off. The match being predicted and all future results are excluded.
          </p>
        </div>
        <Link
          href="/admin/ai-predictor"
          className="inline-flex items-center justify-center rounded-full border border-white/10 bg-white/[0.04] px-5 py-3 text-sm font-semibold text-white/75 transition hover:border-white/20 hover:bg-white/[0.07] hover:text-white"
        >
          ← Live predictor monitoring
        </Link>
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
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-amber-100/65">Blind two-team guess</p>
          <p className="mt-3 text-4xl font-black text-amber-200">{percentage(backtest.twoTeamCoinExpectedAccuracy)}</p>
          <p className="mt-2 text-xs text-white/45">Expected accuracy from a 50/50 team choice, with draws always missed</p>
        </div>

        <div className="rounded-3xl border border-emerald-400/20 bg-emerald-500/10 p-5">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-emerald-100/65">Best historical method</p>
          <p className="mt-3 text-2xl font-black text-emerald-200">{backtest.bestMethodLabel ?? "—"}</p>
          <p className="mt-2 text-sm font-semibold text-white/75">{percentage(backtest.bestAccuracy)}</p>
        </div>
      </div>

      {current && candidate ? (
        <section className="rounded-3xl border border-sky-400/20 bg-sky-500/[0.07] p-6">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-sky-100/60">Candidate check</p>
              <h2 className="mt-2 text-xl font-semibold text-white">Does Elo + goals beat the live model?</h2>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-white/55">
                Current SIXFL: {percentage(current.accuracy)} · Elo + goals: {percentage(candidate.accuracy)}. This is a historical test only; it does not rewrite any stored prediction or live result.
              </p>
            </div>
            <div className={`text-4xl font-black ${candidateImprovement !== null && candidateImprovement > 0 ? "text-emerald-300" : "text-red-300"}`}>
              {candidateImprovement === null ? "—" : points(candidateImprovement)}
            </div>
          </div>
        </section>
      ) : null}

      <section className="rounded-3xl border border-white/10 bg-white/[0.04] p-6">
        <div>
          <h2 className="text-xl font-semibold text-white">Model comparison</h2>
          <p className="mt-1 max-w-4xl text-sm leading-6 text-white/55">
            Accuracy is the home/draw/away call. Exact score and goals-out are shown only for models that predict a score. Brier score measures probability quality — lower is better — so an overconfident wrong prediction is penalised more heavily.
          </p>
        </div>

        <div className="mt-5 overflow-x-auto rounded-2xl border border-white/10">
          <table className="min-w-full text-left text-sm">
            <thead className="bg-white/[0.04] text-[11px] uppercase tracking-[0.16em] text-white/40">
              <tr>
                <th className="px-4 py-3">Method</th>
                <th className="px-4 py-3">Calls</th>
                <th className="px-4 py-3">Correct</th>
                <th className="px-4 py-3">Accuracy</th>
                <th className="px-4 py-3">Vs blind guess</th>
                <th className="px-4 py-3">Exact</th>
                <th className="px-4 py-3">Avg goals out</th>
                <th className="px-4 py-3">Brier</th>
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
                  <td className="px-4 py-4 text-sky-200">
                    {method.exact === null ? "—" : `${method.exact} (${percentage(method.exactAccuracy)})`}
                  </td>
                  <td className="px-4 py-4 text-white/65">{goalError(method.averageGoalError)}</td>
                  <td className="px-4 py-4 text-white/65">{brier(method.brierScore)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="rounded-3xl border border-white/10 bg-white/[0.04] p-6">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2 className="text-xl font-semibold text-white">Recent replay examples</h2>
            <p className="mt-1 text-sm text-white/55">Useful for spotting what each method is doing differently on real SIXFL fixtures.</p>
          </div>
          <div className="text-xs text-white/40">Latest {backtest.examples.length} eligible historical fixtures</div>
        </div>

        <div className="mt-5 overflow-x-auto rounded-2xl border border-white/10">
          <table className="min-w-full text-left text-sm">
            <thead className="bg-white/[0.04] text-[11px] uppercase tracking-[0.16em] text-white/40">
              <tr>
                <th className="px-4 py-3">Fixture</th>
                <th className="px-4 py-3">Actual</th>
                <th className="px-4 py-3">Current SIXFL</th>
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
                  <td className="px-4 py-3 font-semibold text-emerald-200">{row.eloGoals}</td>
                  <td className="px-4 py-3 text-white/65">{row.ppg}</td>
                  <td className="px-4 py-3 text-white/65">{row.elo}</td>
                </tr>
              ))}
              {backtest.examples.length === 0 ? (
                <tr><td className="px-4 py-8 text-white/55" colSpan={6}>There is not enough historical data to run a fair replay yet.</td></tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>

      <div className="rounded-2xl border border-amber-400/15 bg-amber-500/[0.06] px-4 py-3 text-xs leading-5 text-amber-50/65">
        Back-testing is evidence, not proof. Once we choose a better model, future stored pre-match predictions remain the final test because they cannot benefit from retrospective tuning. No historical prediction rows are changed by this page.
      </div>
    </div>
  );
}
