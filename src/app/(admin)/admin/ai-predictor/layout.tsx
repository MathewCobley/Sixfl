// ========================================
// File: src/app/(admin)/admin/ai-predictor/layout.tsx
// ========================================

import type { ReactNode } from "react";
import { Prisma } from "@prisma/client";

import { refreshStoredAiPreviewForFixture } from "@/lib/fixtures/storedAiPredictions";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/requireAdmin";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type MissingUpcomingPredictionRow = {
  fixtureId: string;
};

type LatestUpcomingPredictionRow = {
  fixtureId: string;
  kickoffAt: Date;
  leagueName: string;
  homeTeamName: string;
  awayTeamName: string;
  predictedHomeScore: number;
  predictedAwayScore: number;
  headline: string;
  summary: string;
  source: string;
  generatedAt: Date;
};

const dateTimeFormatter = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Europe/London",
  weekday: "short",
  day: "2-digit",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
});

async function repairMissingUpcomingPredictions() {
  const missing = await prisma.$queryRaw<MissingUpcomingPredictionRow[]>(Prisma.sql`
    SELECT fixture."id" AS "fixtureId"
    FROM "Fixture" fixture
    JOIN "Team" home_team ON home_team."id" = fixture."homeTeamId"
    JOIN "Team" away_team ON away_team."id" = fixture."awayTeamId"
    LEFT JOIN "FixtureAiPrediction" prediction ON prediction."fixtureId" = fixture."id"
    WHERE fixture."status" = 'SCHEDULED'
      AND fixture."kickoffAt" >= CURRENT_TIMESTAMP
      AND COALESCE(home_team."isFixturePlaceholder", false) = false
      AND COALESCE(away_team."isFixturePlaceholder", false) = false
      AND (
        prediction."fixtureId" IS NULL
        OR prediction."predictedHomeScore" IS NULL
        OR prediction."predictedAwayScore" IS NULL
      )
    ORDER BY fixture."kickoffAt" ASC
    LIMIT 48
  `);

  // Repair only fixtures that are still genuinely in the future. Work in small
  // batches so one broken fixture cannot block the rest and we do not create a
  // large burst of predictor requests when an old coverage gap is discovered.
  for (let index = 0; index < missing.length; index += 4) {
    const batch = missing.slice(index, index + 4);
    const results = await Promise.allSettled(
      batch.map((row) => refreshStoredAiPreviewForFixture(row.fixtureId)),
    );

    results.forEach((result, resultIndex) => {
      if (result.status === "rejected") {
        console.error("Could not self-heal missing upcoming AI prediction", {
          fixtureId: batch[resultIndex]?.fixtureId,
          error: result.reason,
        });
      }
    });
  }
}

async function getLatestUpcomingPredictions() {
  return prisma.$queryRaw<LatestUpcomingPredictionRow[]>(Prisma.sql`
    SELECT
      fixture."id" AS "fixtureId",
      fixture."kickoffAt" AS "kickoffAt",
      league."name" AS "leagueName",
      home_team."name" AS "homeTeamName",
      away_team."name" AS "awayTeamName",
      prediction."predictedHomeScore" AS "predictedHomeScore",
      prediction."predictedAwayScore" AS "predictedAwayScore",
      prediction."headline" AS "headline",
      prediction."summary" AS "summary",
      prediction."source" AS "source",
      prediction."generatedAt" AS "generatedAt"
    FROM "Fixture" fixture
    JOIN "League" league ON league."id" = fixture."leagueId"
    JOIN "Team" home_team ON home_team."id" = fixture."homeTeamId"
    JOIN "Team" away_team ON away_team."id" = fixture."awayTeamId"
    JOIN "FixtureAiPrediction" prediction ON prediction."fixtureId" = fixture."id"
    WHERE fixture."status" = 'SCHEDULED'
      AND fixture."kickoffAt" >= CURRENT_TIMESTAMP
      AND prediction."predictedHomeScore" IS NOT NULL
      AND prediction."predictedAwayScore" IS NOT NULL
      AND COALESCE(home_team."isFixturePlaceholder", false) = false
      AND COALESCE(away_team."isFixturePlaceholder", false) = false
    ORDER BY fixture."kickoffAt" ASC
    LIMIT 18
  `);
}

export default async function AiPredictorLayout({ children }: { children: ReactNode }) {
  await requireAdmin();
  await repairMissingUpcomingPredictions();
  const latestPredictions = await getLatestUpcomingPredictions();

  return (
    <>
      {children}

      {latestPredictions.length > 0 ? (
        <section className="mx-auto max-w-7xl px-4 pb-10 sm:px-6 lg:px-8">
          <div className="rounded-3xl border border-sky-400/20 bg-sky-500/[0.06] p-5 sm:p-6">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-sky-200/70">
                  Stored pre-match calls
                </p>
                <h2 className="mt-1 text-2xl font-black tracking-tight text-white">
                  Latest upcoming predictions
                </h2>
                <p className="mt-2 text-sm text-white/50">
                  These are the permanent predictions that will be measured against the final results.
                </p>
              </div>
              <p className="text-xs text-white/40">
                Showing next {latestPredictions.length} fixture{latestPredictions.length === 1 ? "" : "s"}
              </p>
            </div>

            <div className="mt-5 grid gap-3 lg:grid-cols-2">
              {latestPredictions.map((prediction) => (
                <article
                  key={prediction.fixtureId}
                  className="rounded-2xl border border-white/10 bg-black/25 p-4"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0">
                      <p className="text-xs font-semibold text-white/45">
                        {prediction.leagueName} · {dateTimeFormatter.format(prediction.kickoffAt)}
                      </p>
                      <p className="mt-2 text-base font-bold text-white">
                        {prediction.homeTeamName} <span className="text-white/35">v</span> {prediction.awayTeamName}
                      </p>
                    </div>
                    <div className="shrink-0 rounded-xl border border-sky-300/20 bg-sky-400/10 px-3 py-2 text-center">
                      <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-sky-100/55">
                        Prediction
                      </p>
                      <p className="mt-0.5 text-2xl font-black text-sky-200">
                        {prediction.predictedHomeScore}–{prediction.predictedAwayScore}
                      </p>
                    </div>
                  </div>

                  <p className="mt-4 font-semibold text-white/90">{prediction.headline}</p>
                  <p className="mt-1 text-sm leading-6 text-white/55">{prediction.summary}</p>

                  <div className="mt-4 flex flex-wrap items-center gap-2 text-[11px] text-white/35">
                    <span className="rounded-full border border-white/10 bg-white/[0.04] px-2 py-1">
                      {prediction.source === "openai" ? "AI prediction" : "Fallback model"}
                    </span>
                    <span>Stored {dateTimeFormatter.format(prediction.generatedAt)}</span>
                  </div>
                </article>
              ))}
            </div>
          </div>
        </section>
      ) : null}
    </>
  );
}
