// ========================================
// File: src/lib/fixtures/winChanceHistory.ts
// ========================================

import type { FixtureAiPreview } from "@/lib/fixtures/aiPredictor";
import type { WinChanceFixture } from "@/lib/fixtures/winChance";

type NamedTeam = {
  id: string;
  name: string;
};

type NamedFixtureSource = {
  kickoffAt?: Date | string | null;
  status: string;
  homeTeam: NamedTeam;
  awayTeam: NamedTeam;
  result: {
    homeScore: number;
    awayScore: number;
  } | null;
};

type TargetFixtureSource = {
  homeTeam: NamedTeam;
  awayTeam: NamedTeam;
};

export function normalisePredictorTeamName(value: string) {
  return value
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function buildCurrentTeamIdByName(targetFixtures: TargetFixtureSource[]) {
  const currentTeamIdByName = new Map<string, string>();

  for (const fixture of targetFixtures) {
    for (const team of [fixture.homeTeam, fixture.awayTeam]) {
      const key = normalisePredictorTeamName(team.name);
      if (key && !currentTeamIdByName.has(key)) {
        currentTeamIdByName.set(key, team.id);
      }
    }
  }

  return currentTeamIdByName;
}

function canonicalTeamId(input: { team: NamedTeam; currentTeamIdByName: Map<string, string> }) {
  const nameKey = normalisePredictorTeamName(input.team.name);
  return input.currentTeamIdByName.get(nameKey) ?? input.team.id;
}

export function buildNameAwareWinChanceFixtures(input: {
  historyFixtures: NamedFixtureSource[];
  targetFixtures: TargetFixtureSource[];
}): WinChanceFixture[] {
  const currentTeamIdByName = buildCurrentTeamIdByName(input.targetFixtures);

  return input.historyFixtures.map((fixture) => ({
    kickoffAt: fixture.kickoffAt,
    status: fixture.status,
    homeTeam: {
      id: canonicalTeamId({ team: fixture.homeTeam, currentTeamIdByName }),
    },
    awayTeam: {
      id: canonicalTeamId({ team: fixture.awayTeam, currentTeamIdByName }),
    },
    result: fixture.result,
  }));
}

export function shouldIgnoreStaleTooEarlyPreview(input: {
  preview?: FixtureAiPreview | null;
  predictedResultLabel: string;
}) {
  const preview = input.preview;
  if (!preview) return false;

  if (input.predictedResultLabel === "Too early") return false;

  const text = `${preview.headline} ${preview.summary}`.toLowerCase();

  return /no completed results?|no usable match data|too early for a score prediction|too early to call|without completed results?|not enough completed/.test(text);
}
