import { createHash } from "crypto";
import { Prisma } from "@prisma/client";

import { getFallbackFixtureAiPreview } from "@/lib/fixtures/aiPredictor";
import { buildNameAwareWinChanceFixtures } from "@/lib/fixtures/winChanceHistory";
import { calculateFixtureWinChance } from "@/lib/fixtures/winChance";
import { prisma } from "@/lib/prisma";
import { getFixturePlaceholderTeamIds } from "@/lib/teams/fixture-placeholders";

type RecoveryFixture = {
  id: string;
  leagueId: string;
  kickoffAt: Date;
  status: string;
  homeTeam: { id: string; name: string };
  awayTeam: { id: string; name: string };
};

function recoveryHash(input: {
  fixture: RecoveryFixture;
  predictedResult: string;
  home: number;
  draw: number;
  away: number;
  confidence: string;
}) {
  return createHash("sha256")
    .update(
      JSON.stringify({
        recoveryVersion: 1,
        fixtureId: input.fixture.id,
        homeTeamId: input.fixture.homeTeam.id,
        homeTeamName: input.fixture.homeTeam.name,
        awayTeamId: input.fixture.awayTeam.id,
        awayTeamName: input.fixture.awayTeam.name,
        predictedResult: input.predictedResult,
        home: input.home,
        draw: input.draw,
        away: input.away,
        confidence: input.confidence,
      }),
    )
    .digest("hex");
}

async function ensurePredictionScoreColumns() {
  await prisma.$executeRawUnsafe(
    'ALTER TABLE "FixtureAiPrediction" ADD COLUMN IF NOT EXISTS "predictedHomeScore" INTEGER',
  );
  await prisma.$executeRawUnsafe(
    'ALTER TABLE "FixtureAiPrediction" ADD COLUMN IF NOT EXISTS "predictedAwayScore" INTEGER',
  );
}

export async function recoverMissingHistoricalAiPredictions(fixtureIds: string[]) {
  const ids = Array.from(new Set(fixtureIds.filter(Boolean)));
  if (ids.length === 0) return 0;

  await ensurePredictionScoreColumns();

  const existingRows = await prisma.$queryRaw<Array<{ fixtureId: string }>>`
    SELECT "fixtureId"
    FROM "FixtureAiPrediction"
    WHERE "fixtureId" IN (${Prisma.join(ids)})
  `;
  const existingIds = new Set(existingRows.map((row) => row.fixtureId));
  const missingIds = ids.filter((id) => !existingIds.has(id));
  if (missingIds.length === 0) return 0;

  const candidates = await prisma.fixture.findMany({
    where: {
      id: { in: missingIds },
      publishedAt: { not: null },
      result: { isNot: null },
    },
    select: {
      id: true,
      leagueId: true,
      kickoffAt: true,
      status: true,
      homeTeam: { select: { id: true, name: true } },
      awayTeam: { select: { id: true, name: true } },
    },
  });

  let recovered = 0;

  for (const fixture of candidates) {
    const placeholderTeamIds = await getFixturePlaceholderTeamIds([
      fixture.homeTeam.id,
      fixture.awayTeam.id,
    ]);
    if (placeholderTeamIds.size > 0) continue;

    // Only use results that were actually entered before this fixture kicked off.
    // That prevents this fixture's result, future results, or late backfills from
    // leaking into the recovered pre-match prediction.
    const historyFixtures = await prisma.fixture.findMany({
      where: {
        leagueId: fixture.leagueId,
        publishedAt: { not: null },
        kickoffAt: { lt: fixture.kickoffAt },
        result: {
          is: {
            enteredAt: { lt: fixture.kickoffAt },
          },
        },
      },
      orderBy: [{ kickoffAt: "asc" }],
      select: {
        kickoffAt: true,
        status: true,
        homeTeam: { select: { id: true, name: true } },
        awayTeam: { select: { id: true, name: true } },
        result: { select: { homeScore: true, awayScore: true } },
      },
    });

    const predictionHistory = buildNameAwareWinChanceFixtures({
      historyFixtures,
      targetFixtures: [fixture],
    });
    const winChance = calculateFixtureWinChance({
      homeTeamId: fixture.homeTeam.id,
      awayTeamId: fixture.awayTeam.id,
      fixtures: predictionHistory,
    });
    const preview = getFallbackFixtureAiPreview(
      {
        homeTeamName: fixture.homeTeam.name,
        awayTeamName: fixture.awayTeam.name,
        winChance,
      },
      "Recovered from results that were recorded before kick-off because the original stored prediction row was missing.",
    );
    const inputHash = recoveryHash({
      fixture,
      predictedResult: winChance.predictedResult.label,
      home: winChance.home,
      draw: winChance.draw,
      away: winChance.away,
      confidence: winChance.confidence,
    });

    const inserted = await prisma.$executeRaw`
      INSERT INTO "FixtureAiPrediction" (
        "fixtureId",
        "headline",
        "summary",
        "source",
        "inputHash",
        "generatedAt",
        "updatedAt",
        "predictedHomeScore",
        "predictedAwayScore"
      )
      VALUES (
        ${fixture.id},
        ${preview.headline},
        ${preview.summary},
        'recovered',
        ${inputHash},
        NOW(),
        NOW(),
        ${winChance.predictedResult.homeScore},
        ${winChance.predictedResult.awayScore}
      )
      ON CONFLICT ("fixtureId") DO NOTHING
    `;

    if (inserted > 0) recovered += 1;
  }

  return recovered;
}
