// ========================================
// File: src/lib/fixtures/aiPredictor.ts
// ========================================

import type { FixtureWinChance } from "@/lib/fixtures/winChance";

export type FixtureAiPreview = {
  headline: string;
  summary: string;
  source: "openai" | "fallback";
};

type FixtureAiPreviewInput = {
  homeTeamName: string;
  awayTeamName: string;
  winChance: FixtureWinChance;
};

type OpenAIResponsePayload = {
  output_text?: unknown;
  output?: Array<{
    type?: string;
    content?: Array<{
      type?: string;
      text?: unknown;
    }>;
  }>;
};

const AI_PREVIEW_CACHE = new Map<
  string,
  {
    expiresAt: number;
    value: FixtureAiPreview;
  }
>();

const CACHE_TTL_MS = 1000 * 60 * 60 * 6;

function getCacheKey(input: FixtureAiPreviewInput) {
  return JSON.stringify({
    homeTeamName: input.homeTeamName,
    awayTeamName: input.awayTeamName,
    home: input.winChance.home,
    draw: input.winChance.draw,
    away: input.winChance.away,
    predictedResult: input.winChance.predictedResult.label,
    confidence: input.winChance.confidence,
  });
}

function cleanText(value: string) {
  return value
    .replace(/\s+/g, " ")
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .trim();
}

function truncateSentence(value: string, maxLength: number) {
  const cleaned = cleanText(value);
  if (cleaned.length <= maxLength) return cleaned;

  return `${cleaned.slice(0, maxLength - 1).trim()}…`;
}

function getFavourite(input: FixtureAiPreviewInput) {
  const chance = input.winChance;

  if (chance.draw >= chance.home && chance.draw >= chance.away) {
    return "a tight draw";
  }

  if (chance.home >= chance.away) {
    return input.homeTeamName;
  }

  return input.awayTeamName;
}

export function getFallbackFixtureAiPreview(input: FixtureAiPreviewInput): FixtureAiPreview {
  const favourite = getFavourite(input);

  return {
    headline:
      favourite === "a tight draw"
        ? "The predictor expects a close one"
        : `${favourite} edge the predictor`,
    summary: `SIXFL AI Predictor has this down as ${input.winChance.predictedResult.label}, with ${input.homeTeamName} ${input.winChance.home}%, draw ${input.winChance.draw}% and ${input.awayTeamName} ${input.winChance.away}%.`,
    source: "fallback",
  };
}

function extractOpenAIText(payload: OpenAIResponsePayload) {
  if (typeof payload.output_text === "string" && payload.output_text.trim()) {
    return payload.output_text;
  }

  const parts: string[] = [];

  for (const item of payload.output ?? []) {
    for (const content of item.content ?? []) {
      if (typeof content.text === "string" && content.text.trim()) {
        parts.push(content.text);
      }
    }
  }

  return parts.join("\n").trim();
}

function parsePreviewText(text: string, input: FixtureAiPreviewInput): FixtureAiPreview {
  const cleaned = cleanText(text)
    .replace(/^headline:\s*/i, "")
    .replace(/^summary:\s*/i, "");

  if (!cleaned) return getFallbackFixtureAiPreview(input);

  const [firstSentence, ...rest] = cleaned.split(/(?<=[.!?])\s+/);
  const headline = truncateSentence(firstSentence || "SIXFL AI Predictor", 78);
  const summary = truncateSentence(rest.join(" ") || cleaned, 260);

  return {
    headline,
    summary,
    source: "openai",
  };
}

export async function getFixtureAiPreview(
  input: FixtureAiPreviewInput,
): Promise<FixtureAiPreview> {
  const fallback = getFallbackFixtureAiPreview(input);
  const apiKey = process.env.OPENAI_API_KEY?.trim();

  if (!apiKey) return fallback;

  const cacheKey = getCacheKey(input);
  const cached = AI_PREVIEW_CACHE.get(cacheKey);

  if (cached && cached.expiresAt > Date.now()) {
    return cached.value;
  }

  try {
    const model = process.env.OPENAI_PREDICTOR_MODEL?.trim() || "gpt-5.5";
    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        max_output_tokens: 170,
        instructions:
          "You write short, fun, factual 6-a-side football match previews for SIXFL. Do not invent injuries, absences, player names or facts not provided. Keep it suitable for a public sports website. Mention that it is a prediction only if needed.",
        input: `Write one punchy headline sentence and one short explanation sentence for this fixture. Use only this data: ${JSON.stringify({
          homeTeam: input.homeTeamName,
          awayTeam: input.awayTeamName,
          predictedResult: input.winChance.predictedResult.label,
          homeWinChance: input.winChance.home,
          drawChance: input.winChance.draw,
          awayWinChance: input.winChance.away,
          confidence: input.winChance.confidence,
          basis: input.winChance.explanation,
        })}`,
      }),
    });

    if (!response.ok) return fallback;

    const payload = (await response.json()) as OpenAIResponsePayload;
    const text = extractOpenAIText(payload);
    const value = parsePreviewText(text, input);

    AI_PREVIEW_CACHE.set(cacheKey, {
      expiresAt: Date.now() + CACHE_TTL_MS,
      value,
    });

    return value;
  } catch {
    return fallback;
  }
}
