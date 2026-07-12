// ========================================
// File: src/lib/fixtures/storedAiPredictions.ts
// ========================================

import { createHash } from "crypto";
import { Prisma } from "@prisma/client";

import {
  cleanFixtureAiPreviewForDisplay,
  getFixtureAiPreview,
  hasOpenAiPredictorConfig,
  type FixtureAiPreview,
} from "@/lib/fixtures/aiPredictor";
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
  const preview = cleanFixtureAiPreviewForDisplay({
    headline: row.headline,
    summary: row.summary,
    source: row.source === "openai" ? "openai" : "fallback",
  });

  return {
    ...preview,
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

function looksCorruptedPrediction(row: StoredPredictionRow) {
  const combined = `${row.headline} ${row.summary}`;
  const cleaned = cleanFixtureAiPreviewForDisplay({
    headline: row.headline,
    summary: row.summary,
    source: row.source === "openai" ? "openai" : "fallback",
  });

  if (/[{}]/.test(combined)) return true;
  if (/"headline"|"summary"/i.test(combined)) return true;
  if (/points to points/i.test(combined)) return true;
  if (/\bundefined\b|\bnull\b/i.test(combined)) return true;
  if (row.source === "openai" && /\b\d{1,3}%\b/.test(combined)) return true;
  if (cleaned.headline.length < 8 || cleaned.summary.length < 24) return true;

  return false;
}

function canReuseExistingPrediction(input: {
  existing: StoredPredictionRow | null;
  inputHash: string;
  force?: boolean;
}) {
  if (input.force || !input.existing) return false;
  if (input.existing.inputHash !== input.inputHash) return false;
  if (looksCorruptedPrediction(input.existing)) return false;

  const existingSource = input.existing.source === "openai" ? "openai" : "fallback";

  if (existingSource === "openai") return true;

  // If OpenAI is now configured, do not keep reusing an old fallback row.
  // This is what caused the dashboard to keep showing generic text.
  return !hasOpenAiPredictorConfig();
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
  const preview = cleanFixtureAiPreviewForDisplay(input.preview);

  await prisma.$executeRaw`
    INSERT INTO "FixtureAiPrediction"
      ("fixtureId", "headline", "summary", "source", "inputHash", "generatedAt", "updatedAt")
    VALUES
      (${input.fixtureId}, ${preview.headline}, ${preview.summary}, ${preview.source}, ${input.inputHash}, NOW(), NOW())
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

  const existing = await getExistingPrediction(input.fixture.id);
  if (canReuseExistingPrediction({ existing, inputHash, force: input.force })) {
    return existing ? toStoredPreview(existing) : null;
  }

  const preview = cleanFixtureAiPreviewForDisplay(
    await getFixtureAiPreview({
      homeTeamName: input.fixture.homeTeam.name,
      awayTeamName: input.fixture.awayTeam.name,
      winChance,
    }),
  );

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
