// ========================================
// File: src/lib/fixtures/aiPredictor.ts
// ========================================

import type { FixtureWinChance } from "@/lib/fixtures/winChance";

export type FixtureAiPreview = {
  headline: string;
  summary: string;
  source: "openai" | "fallback";
  diagnostic?: string | null;
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

type ParsedPreviewJson = {
  headline?: unknown;
  summary?: unknown;
};

const AI_PREVIEW_CACHE = new Map<
  string,
  {
    expiresAt: number;
    value: FixtureAiPreview;
  }
>();

const CACHE_TTL_MS = 1000 * 60 * 60 * 6;
const HEADLINE_MAX_LENGTH = 68;
const SUMMARY_MAX_LENGTH = 260;

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
    .replace(/\.{3,}|…/g, "")
    .trim();
}

function stripBrokenHeadlineEnding(value: string) {
  return cleanText(value)
    .replace(/\s+(?:in|with)\s+(?:a\s+)?\d+\s*[-–]\s*\d+\s*(?:pred\w*)?\.?$/i, "")
    .replace(/[.,;:!?-]+$/, "")
    .trim();
}

function trimAtWordBoundary(value: string, maxLength: number) {
  const cleaned = cleanText(value);
  if (cleaned.length <= maxLength) return cleaned;

  const hardCut = cleaned.slice(0, maxLength).trim();
  const lastSpace = hardCut.lastIndexOf(" ");

  if (lastSpace > Math.floor(maxLength * 0.55)) {
    return hardCut.slice(0, lastSpace).replace(/[.,;:!?-]+$/, "").trim();
  }

  return hardCut.replace(/[.,;:!?-]+$/, "").trim();
}

function limitCompleteText(value: string, maxLength: number) {
  const cleaned = cleanText(value);
  if (cleaned.length <= maxLength) return cleaned;

  const sentences = cleaned.split(/(?<=[.!?])\s+/).filter(Boolean);
  const completeSentences: string[] = [];
  let currentLength = 0;

  for (const sentence of sentences) {
    const nextLength = currentLength + sentence.length + (completeSentences.length ? 1 : 0);
    if (nextLength > maxLength) break;

    completeSentences.push(sentence);
    currentLength = nextLength;
  }

  if (completeSentences.length > 0) {
    return completeSentences.join(" ").trim();
  }

  return trimAtWordBoundary(cleaned, maxLength);
}

function cleanHeadline(value: string) {
  const stripped = stripBrokenHeadlineEnding(value);
  const limited = limitCompleteText(stripped || value, HEADLINE_MAX_LENGTH);

  return limited.replace(/[.,;:!?-]+$/, "").trim() || "SIXFL AI Predictor";
}

export function cleanFixtureAiPreviewForDisplay(preview: FixtureAiPreview): FixtureAiPreview {
  return {
    ...preview,
    headline: cleanHeadline(preview.headline),
    summary: limitCompleteText(preview.summary, SUMMARY_MAX_LENGTH),
  };
}

export function hasOpenAiPredictorConfig() {
  return Boolean(process.env.OPENAI_API_KEY?.trim());
}

function getFavourite(input: FixtureAiPreviewInput) {
  const chance = input.winChance;

  if (chance.draw >= chance.home && chance.draw >= chance.away) {
    return "a draw";
  }

  if (chance.home >= chance.away) {
    return input.homeTeamName;
  }

  return input.awayTeamName;
}

function getFavouriteLabel(input: FixtureAiPreviewInput) {
  const favourite = getFavourite(input);

  if (favourite === "a draw") return "a tight draw";
  return favourite;
}

export function getFallbackFixtureAiPreview(
  input: FixtureAiPreviewInput,
  diagnostic?: string | null,
): FixtureAiPreview {
  const favourite = getFavourite(input);
  const favouriteLabel = getFavouriteLabel(input);

  return {
    headline:
      favourite === "a draw"
        ? "This one looks too close to call"
        : `${favourite} are favourites here`,
    summary:
      favourite === "a draw"
        ? `The numbers point towards ${input.winChance.predictedResult.label}: ${input.homeTeamName} ${input.winChance.home}%, draw ${input.winChance.draw}% and ${input.awayTeamName} ${input.winChance.away}%.`
        : `The numbers favour ${favouriteLabel}, with the predictor showing ${input.homeTeamName} ${input.winChance.home}%, draw ${input.winChance.draw}% and ${input.awayTeamName} ${input.winChance.away}%.`,
    source: "fallback",
    diagnostic: diagnostic ?? null,
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

function getSafeHeadline(input: FixtureAiPreviewInput) {
  const favourite = getFavourite(input);

  return favourite === "a draw"
    ? "This one looks too close to call"
    : `${favourite} are favourites here`;
}

function parseJsonPreview(text: string) {
  const trimmed = text.trim();
  const jsonStart = trimmed.indexOf("{");
  const jsonEnd = trimmed.lastIndexOf("}");

  if (jsonStart < 0 || jsonEnd <= jsonStart) return null;

  try {
    const parsed = JSON.parse(trimmed.slice(jsonStart, jsonEnd + 1)) as ParsedPreviewJson;
    const headline = typeof parsed.headline === "string" ? parsed.headline.trim() : "";
    const summary = typeof parsed.summary === "string" ? parsed.summary.trim() : "";

    if (!headline && !summary) return null;

    return { headline, summary };
  } catch {
    return null;
  }
}

function parsePreviewText(text: string, input: FixtureAiPreviewInput): FixtureAiPreview {
  const jsonPreview = parseJsonPreview(text);

  if (jsonPreview) {
    return {
      headline: cleanHeadline(jsonPreview.headline || getSafeHeadline(input)),
      summary: limitCompleteText(jsonPreview.summary || text, SUMMARY_MAX_LENGTH),
      source: "openai",
    };
  }

  const cleaned = cleanText(text)
    .replace(/^headline:\s*/i, "")
    .replace(/^summary:\s*/i, "");

  if (!cleaned) return getFallbackFixtureAiPreview(input, "OpenAI returned no text");

  const [firstSentence, ...rest] = cleaned.split(/(?<=[.!?])\s+/);
  const headline = cleanHeadline(firstSentence || getSafeHeadline(input));
  const summary = limitCompleteText(rest.join(" ") || cleaned, SUMMARY_MAX_LENGTH);

  return {
    headline: headline.length >= 8 ? headline : getSafeHeadline(input),
    summary,
    source: "openai",
  };
}

function getModelCandidates() {
  return Array.from(
    new Set(
      [
        process.env.OPENAI_PREDICTOR_MODEL?.trim(),
        process.env.OPENAI_MODEL?.trim(),
        "gpt-5.5",
        "gpt-4.1-mini",
        "gpt-4o-mini",
      ].filter(Boolean) as string[],
    ),
  );
}

async function callOpenAiPreview(input: FixtureAiPreviewInput, model: string, apiKey: string) {
  const timeoutSignal = (AbortSignal as typeof AbortSignal & { timeout?: (ms: number) => AbortSignal }).timeout?.(8000);

  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    signal: timeoutSignal,
    body: JSON.stringify({
      model,
      max_output_tokens: 180,
      instructions:
        "You write short, fun, factual 6-a-side football match previews for SIXFL. Use only the data provided. Do not invent injuries, absences, player names, previous fixtures or facts not provided. Keep it suitable for a public sports website. Return only compact JSON with keys headline and summary. The headline must be under 65 characters and must not include the exact scoreline.",
      input: `Write a public match preview for this fixture as JSON only: ${JSON.stringify({
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

  if (!response.ok) {
    const errorText = await response.text().catch(() => "");
    return {
      ok: false as const,
      reason: `${model} returned ${response.status}${errorText ? `: ${errorText.slice(0, 220)}` : ""}`,
    };
  }

  const payload = (await response.json()) as OpenAIResponsePayload;
  const text = extractOpenAIText(payload);

  if (!text.trim()) {
    return {
      ok: false as const,
      reason: `${model} returned an empty response`,
    };
  }

  return {
    ok: true as const,
    preview: parsePreviewText(text, input),
  };
}

export async function getFixtureAiPreview(
  input: FixtureAiPreviewInput,
): Promise<FixtureAiPreview> {
  const apiKey = process.env.OPENAI_API_KEY?.trim();

  if (!apiKey) return getFallbackFixtureAiPreview(input, "OPENAI_API_KEY is missing");

  const cacheKey = getCacheKey(input);
  const cached = AI_PREVIEW_CACHE.get(cacheKey);

  if (cached && cached.expiresAt > Date.now()) {
    return cached.value;
  }

  const failures: string[] = [];

  for (const model of getModelCandidates()) {
    try {
      const result = await callOpenAiPreview(input, model, apiKey);

      if (!result.ok) {
        failures.push(result.reason);
        continue;
      }

      const value = cleanFixtureAiPreviewForDisplay(result.preview);

      AI_PREVIEW_CACHE.set(cacheKey, {
        expiresAt: Date.now() + CACHE_TTL_MS,
        value,
      });

      return value;
    } catch (error) {
      failures.push(
        `${model} request failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  const diagnostic = failures.join(" | ") || "OpenAI preview failed";
  console.warn("[SIXFL AI Predictor] Falling back to local preview", {
    homeTeamName: input.homeTeamName,
    awayTeamName: input.awayTeamName,
    diagnostic,
  });

  return getFallbackFixtureAiPreview(input, diagnostic);
}
