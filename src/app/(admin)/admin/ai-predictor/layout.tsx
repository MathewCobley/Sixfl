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

export default async function AiPredictorLayout({ children }: { children: ReactNode }) {
  await requireAdmin();
  await repairMissingUpcomingPredictions();

  return children;
}
