// ========================================
// File: src/app/(admin)/admin/social/ai-image/generate/route.ts
// ========================================

import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { SocialPostStatus, SocialPostType } from "@prisma/client";

import { formatDateTimeInLondon, formatTimeInLondon } from "@/lib/datetime/london";
import {
  getStoredAiPreviewsByFixtureIds,
  refreshStoredAiPreviewForFixture,
} from "@/lib/fixtures/storedAiPredictions";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/requireAdmin";
import { getBaseUrl } from "@/lib/social/weekly-match-card";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type CardRow = {
  id: string;
  leagueName: string;
  leagueSeason: string | null;
  fixtureDate: Date;
  postType: SocialPostType;
  caption: string | null;
};

type FixtureRow = {
  id: string;
  kickoffAt: Date;
  pitch: string | null;
  status: string;
  homeTeamName: string;
  awayTeamName: string;
};

function getString(formData: FormData, key: string) {
  return String(formData.get(key) ?? "").trim();
}

function getSocialRedirect(params: Record<string, string | number | null | undefined>) {
  const searchParams = new URLSearchParams();

  for (const [key, value] of Object.entries(params)) {
    if (value !== null && value !== undefined && String(value).trim()) {
      searchParams.set(key, String(value));
    }
  }

  return `/admin/social${searchParams.toString() ? `?${searchParams.toString()}` : ""}`;
}

function redirectToSocial(request: Request, params: Record<string, string | number | null | undefined>) {
  return NextResponse.redirect(new URL(getSocialRedirect(params), request.url), 303);
}

function getPostTypeLabel(postType: SocialPostType) {
  switch (postType) {
    case "RESULT":
      return "results night";
    case "UPDATE":
      return "fixture update";
    default:
      return "upcoming fixtures";
  }
}

function getFixtureDateLabel(value: Date) {
  return formatDateTimeInLondon(value, {
    weekday: "long",
    day: "numeric",
    month: "long",
  });
}

function getOpenAiImageModel() {
  return process.env.OPENAI_IMAGE_MODEL?.trim() || "gpt-image-1";
}

function getOpenAiImageQuality() {
  return process.env.OPENAI_IMAGE_QUALITY?.trim() || "medium";
}

function getOpenAiImageSize() {
  return process.env.OPENAI_IMAGE_SIZE?.trim() || "1024x1024";
}

function buildImagePrompt(input: {
  card: CardRow;
  fixtures: FixtureRow[];
  predictorLines: string[];
}) {
  const leagueLabel = input.card.leagueSeason
    ? `${input.card.leagueName} ${input.card.leagueSeason}`
    : input.card.leagueName;
  const fixtureLines = input.fixtures
    .slice(0, 8)
    .map((fixture) => {
      const time = formatTimeInLondon(fixture.kickoffAt);
      return `- ${time}: ${fixture.homeTeamName} vs ${fixture.awayTeamName}${fixture.pitch ? ` (${fixture.pitch})` : ""}`;
    })
    .join("\n");
  const predictorLines = input.predictorLines.slice(0, 5).join("\n");

  return `Create a premium square social media graphic for SIXFL 6-a-side football.

Purpose: ${getPostTypeLabel(input.card.postType)} post.
League: ${leagueLabel}.
Date: ${getFixtureDateLabel(input.card.fixtureDate)}.
Brand: SIXFL. Dark black/emerald football-night look, floodlights, artificial pitch, fast 6-a-side energy, premium local league feel.

Fixtures:
${fixtureLines}

Predictor notes to incorporate visually:
${predictorLines || "No predictor notes available. Use a generic 'Predictor watch' visual device."}

Design requirements:
- Square 1:1 social graphic.
- Keep text minimal and legible.
- Include the words: SIXFL, MATCH NIGHT, PREDICTOR.
- Do not invent new team names, scores, venues or kick-off times.
- Do not use real people, real club crests, copyrighted logos, or Premier League branding.
- Make it look like a polished sports poster that can be reviewed before publishing.
- It may include stylised footballers as generic silhouettes only.

Caption context, for style only:
${input.card.caption ?? ""}`;
}

async function getCard(cardId: string) {
  const rows = await prisma.$queryRaw<CardRow[]>`
    SELECT
      c."id",
      l."name" AS "leagueName",
      l."season" AS "leagueSeason",
      c."fixtureDate",
      c."postType",
      c."caption"
    FROM "SocialMatchCard" c
    INNER JOIN "League" l ON l."id" = c."leagueId"
    WHERE c."id" = ${cardId}
    LIMIT 1
  `;

  return rows[0] ?? null;
}

async function getCardFixtures(cardId: string) {
  return prisma.$queryRaw<FixtureRow[]>`
    SELECT
      f."id",
      f."kickoffAt",
      f."pitch",
      f."status",
      home."name" AS "homeTeamName",
      away."name" AS "awayTeamName"
    FROM "SocialMatchCardFixture" cf
    INNER JOIN "Fixture" f ON f."id" = cf."fixtureId"
    INNER JOIN "Team" home ON home."id" = f."homeTeamId"
    INNER JOIN "Team" away ON away."id" = f."awayTeamId"
    WHERE cf."socialMatchCardId" = ${cardId}
    ORDER BY cf."position" ASC, f."kickoffAt" ASC
  `;
}

async function saveCardError(cardId: string, message: string) {
  await prisma.$executeRaw`
    UPDATE "SocialMatchCard"
    SET
      "postStatus" = ${SocialPostStatus.FAILED}::"SocialPostStatus",
      "lastError" = ${message},
      "updatedAt" = NOW()
    WHERE "id" = ${cardId}
  `;
}

async function generateImage(prompt: string) {
  const apiKey = process.env.OPENAI_API_KEY?.trim();

  if (!apiKey) {
    throw new Error("OPENAI_API_KEY is not configured in Railway/Vercel environment variables.");
  }

  const model = getOpenAiImageModel();
  const response = await fetch("https://api.openai.com/v1/images/generations", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      prompt,
      size: getOpenAiImageSize(),
      quality: getOpenAiImageQuality(),
      n: 1,
    }),
  });

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(text || `OpenAI image generation failed with status ${response.status}.`);
  }

  const payload = (await response.json()) as {
    data?: Array<{
      b64_json?: string;
    }>;
  };
  const imageBase64 = payload.data?.[0]?.b64_json;

  if (!imageBase64) {
    throw new Error("OpenAI did not return image data.");
  }

  return { model, imageBase64 };
}

export async function POST(request: Request) {
  await requireAdmin();

  const formData = await request.formData();
  const cardId = getString(formData.get("cardId") ? formData : new FormData(), "cardId");

  if (!cardId) {
    return redirectToSocial(request, { aiImage: "missing-card" });
  }

  const card = await getCard(cardId);

  if (!card) {
    return redirectToSocial(request, { aiImage: "missing-card" });
  }

  try {
    const fixtures = await getCardFixtures(card.id);

    if (fixtures.length === 0) {
      throw new Error("This card has no fixtures linked to it yet. Generate the match card first, then create the AI image.");
    }

    await Promise.all(
      fixtures
        .filter((fixture) => fixture.status === "SCHEDULED")
        .map((fixture) => refreshStoredAiPreviewForFixture(fixture.id)),
    );

    const storedPreviews = await getStoredAiPreviewsByFixtureIds(fixtures.map((fixture) => fixture.id));
    const predictorLines = fixtures.map((fixture) => {
      const preview = storedPreviews.get(fixture.id);
      return preview
        ? `${fixture.homeTeamName} vs ${fixture.awayTeamName}: ${preview.headline}. ${preview.summary}`
        : `${fixture.homeTeamName} vs ${fixture.awayTeamName}: Predictor unavailable.`;
    });
    const prompt = buildImagePrompt({ card, fixtures, predictorLines });
    const generated = await generateImage(prompt);
    const imagePath = `/api/social/ai-image/${card.id}`;

    await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`
        INSERT INTO "SocialGeneratedImage" (
          "id",
          "socialMatchCardId",
          "prompt",
          "mimeType",
          "imageBase64",
          "provider",
          "model",
          "createdAt",
          "updatedAt"
        ) VALUES (
          ${randomUUID()},
          ${card.id},
          ${prompt},
          ${"image/png"},
          ${generated.imageBase64},
          ${"openai"},
          ${generated.model},
          NOW(),
          NOW()
        )
        ON CONFLICT ("socialMatchCardId") DO UPDATE SET
          "prompt" = EXCLUDED."prompt",
          "mimeType" = EXCLUDED."mimeType",
          "imageBase64" = EXCLUDED."imageBase64",
          "provider" = EXCLUDED."provider",
          "model" = EXCLUDED."model",
          "updatedAt" = NOW()
      `;

      await tx.$executeRaw`
        UPDATE "SocialMatchCard"
        SET
          "imageUrl" = ${`${getBaseUrl()}${imagePath}`},
          "postStatus" = ${SocialPostStatus.DRAFTED}::"SocialPostStatus",
          "lastError" = NULL,
          "queuedAt" = NOW(),
          "approvedAt" = NULL,
          "publishedAt" = NULL,
          "updatedAt" = NOW()
        WHERE "id" = ${card.id}
      `;
    });

    return redirectToSocial(request, { aiImage: "generated", cardId: card.id });
  } catch (error) {
    const message = error instanceof Error ? error.message : "OpenAI image generation failed.";
    await saveCardError(card.id, message.slice(0, 1200));

    return redirectToSocial(request, { aiImage: "failed", cardId: card.id });
  }
}
