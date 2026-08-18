import { Prisma } from "@prisma/client";

import { refreshStoredAiPreviewForFixture } from "@/lib/fixtures/storedAiPredictions";
import { prisma } from "@/lib/prisma";

type PredictionRepairRow = {
  fixtureId: string;
  homeTeamId: string;
  awayTeamId: string;
};

async function ensureMatchupSnapshotColumns() {
  await prisma.$executeRawUnsafe(
    'ALTER TABLE "FixtureAiPrediction" ADD COLUMN IF NOT EXISTS "homeTeamIdSnapshot" TEXT',
  );
  await prisma.$executeRawUnsafe(
    'ALTER TABLE "FixtureAiPrediction" ADD COLUMN IF NOT EXISTS "awayTeamIdSnapshot" TEXT',
  );
}

export async function repairUpcomingAiPredictionIntegrity(limit = 60) {
  await ensureMatchupSnapshotColumns();

  const safeLimit = Math.max(1, Math.min(Math.trunc(limit), 120));
  const rows = await prisma.$queryRaw<PredictionRepairRow[]>(Prisma.sql`
    SELECT
      fixture."id" AS "fixtureId",
      fixture."homeTeamId" AS "homeTeamId",
      fixture."awayTeamId" AS "awayTeamId"
    FROM "Fixture" fixture
    JOIN "Team" home_team ON home_team."id" = fixture."homeTeamId"
    JOIN "Team" away_team ON away_team."id" = fixture."awayTeamId"
    LEFT JOIN "FixtureAiPrediction" prediction ON prediction."fixtureId" = fixture."id"
    WHERE fixture."status"::text = 'SCHEDULED'
      AND fixture."publishedAt" IS NOT NULL
      AND fixture."kickoffAt" > CURRENT_TIMESTAMP
      AND COALESCE(home_team."isFixturePlaceholder", FALSE) = FALSE
      AND COALESCE(away_team."isFixturePlaceholder", FALSE) = FALSE
      AND (
        prediction."fixtureId" IS NULL
        OR prediction."predictedHomeScore" IS NULL
        OR prediction."predictedAwayScore" IS NULL
        OR prediction."homeTeamIdSnapshot" IS DISTINCT FROM fixture."homeTeamId"
        OR prediction."awayTeamIdSnapshot" IS DISTINCT FROM fixture."awayTeamId"
      )
    ORDER BY fixture."kickoffAt" ASC
    LIMIT ${safeLimit}
  `);

  let repaired = 0;
  let failed = 0;

  for (const row of rows) {
    try {
      const preview = await refreshStoredAiPreviewForFixture(row.fixtureId, {
        force: true,
      });

      if (!preview) {
        failed += 1;
        continue;
      }

      // The database trigger normally stamps this automatically. Keep this
      // explicit update as a recovery fallback for environments deployed while
      // a migration is still being applied.
      await prisma.$executeRaw(Prisma.sql`
        UPDATE "FixtureAiPrediction"
        SET
          "homeTeamIdSnapshot" = ${row.homeTeamId},
          "awayTeamIdSnapshot" = ${row.awayTeamId}
        WHERE "fixtureId" = ${row.fixtureId}
      `);

      repaired += 1;
    } catch (error) {
      failed += 1;
      console.error("Could not repair stale upcoming AI prediction", {
        fixtureId: row.fixtureId,
        error,
      });
    }
  }

  return {
    checked: rows.length,
    repaired,
    failed,
  };
}
