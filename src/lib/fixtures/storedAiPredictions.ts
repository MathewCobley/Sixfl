// ========================================
// File: src/lib/fixtures/storedAiPredictions.ts
// ========================================

import { createHash } from "crypto";
import { Prisma } from "@prisma/client";

import { getFixtureAiPreview, type FixtureAiPreview } from "@/lib/fixtures/aiPredictor";
import { calculateFixtureWinChance, type FixtureWinChance, type WinChanceFixture } from "@/lib/fixtures/winChance";
import { prisma } from "@/lib/prisma";

type StoredPredictionRow = {
  fixtureId: string;
  headline: string;
  summary: string;
  source: string;
  inputHash: string;
  generatedAt: Date;
};

type PredictionFixture = {
  id: string;
  leagueId: string;
  status: string;
  homeTeam: { id: string; name: string };
  awayTeam: { id: string; name: string };
};

export type StoredFixtureAiPreview = FixtureAiPreview & {
  inputHash: string;
  generatedAt: Date;
};

function toStoredPreview(row: StoredPredictionRow): StoredFixtureAiPreview {
  return {
    headline: row.headline,
    summary: row.summary,
    source: row.source === "openai" ? "openai" : "fallback",
    inputHash: row.inputHash,
    generatedAt: row.generatedAt,
  };
}

function predictionHash(input: {
  fixture: PredictionFixture;
  winChance: FixtureWinChance;
}) {
  return createHash("sha256")
    .update(JSON.stringify({
      fixtureId: input.fixture.id,
      homeTeamId: input.fixture.homeTeam.id,
      homeTeamName: input.fixture.homeTeam.name,
      awayTeamId: input.fixture.awayTeam.id,
      awayTeamName: input.fixture.awayTeam.name,
      predictedResult: input.winChance.predictedResult.label,
      home: input.winChance.home,
      draw: input.winChance.draw,
      away: input.winChance.away,
      confidence: input.winChance.confidence,
    }))
    .digest("hex");
}

export async function getStoredAiPreviewsByFixtureIds(fixtureIds: string[]) {
  const ids = Array.from(new Set(fixtureIds.filter(Boolean)));

  if (ids.length === 0) return new Map<string, StoredFixtureAiPreview>();

  const rows = await prisma.$queryRaw<StoredPredictionRow[]>`
    SELECT "fixtureId", "headline", "summary", "source", "inputHash", "generatedAt"
    FROM "FixtureAiPrediction"
    WHERE "fixtureId" IN (${Prisma.join(ids)})
  `;

  return new Map(rows.map((row) => [row.fixtureId, toStoredPreview(row)]));
}

async function getExistingPrediction(fixtureId: string) {
  const rows = await prisma.$queryRaw<StoredPredictionRow[]>`
    SELECT "fixtureId", "headline", "summary", "source", "inputHash", "generatedAt"
    FROM "FixtureAiPrediction"
    WHERE "fixtureId" = ${fixtureId}
    LIMIT 1
  `;

  return rows[0] ?? null;
}

async function savePrediction(input: {
  fixtureId: string;
  preview: FixtureAiPreview;
  inputHash: string;
}) {
  await prisma.$executeRaw`
    INSERT INTO "FixtureAiPrediction"
      ("fixtureId", "headline", "summary", "source", "inputHash", "generatedAt", "updatedAt")
    VALUES
      (${input.fixtureId}, ${input.preview.headline}, ${input.preview.summary}, ${input.preview.source}, ${input.inputHash}, NOW(), NOW())
    ON CONFLICT ("fixtureId") DO UPDATE SET
      "headline" = EXCLUDED."headline",
      "summary" = EXCLUDED."summary",
      "source" = EXCLUDED."source",
      "inputHash" = EXCLUDED."inputHash",
      "generatedAt" = EXCLUDED."generatedAt",
      "updatedAt" = NOW()
  `;
}

async function generateAndSave(input: {
  fixture: PredictionFixture;
  fixtures: WinChanceFixture[];
  force?: boolean;
}) {
  if (input.fixture.status !== "SCHEDULED") return null;

  const winChance = calculateFixtureWinChance({
    homeTeamId: input.fixture.homeTeam.id,
    awayTeamId: input.fixture.awayTeam.id,
    fixtures: input.fixtures,
  });
  const inputHash = predictionHash({ fixture: input.fixture, winChance });

  if (!input.force) {
    const existing = await getExistingPrediction(input.fixture.id);
    if (existing?.inputHash === inputHash) return toStoredPreview(existing);
  }

  const preview = await getFixtureAiPreview({
    homeTeamName: input.fixture.homeTeam.name,
    awayTeamName: input.fixture.awayTeam.name,
    winChance,
  });

  await savePrediction({ fixtureId: input.fixture.id, preview, inputHash });

  return { ...preview, inputHash, generatedAt: new Date() };
}

export async function refreshStoredAiPreviewForFixture(fixtureId: string, options?: { force?: boolean }) {
  const fixture = await prisma.fixture.findUnique({
    where: { id: fixtureId },
    select: {
      id: true,
      leagueId: true,
      status: true,
      homeTeam: { select: { id: true, name: true } },
      awayTeam: { select: { id: true, name: true } },
    },
  });

  if (!fixture) return null;

  const fixtures = await prisma.fixture.findMany({
    where: { leagueId: fixture.leagueId },
    select: {
      id: true,
      kickoffAt: true,
      status: true,
      homeTeam: { select: { id: true } },
      awayTeam: { select: { id: true } },
      result: { select: { homeScore: true, awayScore: true } },
    },
  });

  return generateAndSave({ fixture, fixtures, force: options?.force });
}

export async function refreshStoredAiPreviewsForLeague(leagueId: string, options?: { force?: boolean; fixtureIds?: string[] }) {
  const fixtures = await prisma.fixture.findMany({
    where: { leagueId },
    select: {
      id: true,
      leagueId: true,
      kickoffAt: true,
      status: true,
      homeTeam: { select: { id: true, name: true } },
      awayTeam: { select: { id: true, name: true } },
      result: { select: { homeScore: true, awayScore: true } },
    },
  });

  const targetIds = options?.fixtureIds ? new Set(options.fixtureIds) : null;

  for (const fixture of fixtures) {
    if (fixture.status !== "SCHEDULED") continue;
    if (targetIds && !targetIds.has(fixture.id)) continue;
    await generateAndSave({ fixture, fixtures, force: options?.force });
  }
}
