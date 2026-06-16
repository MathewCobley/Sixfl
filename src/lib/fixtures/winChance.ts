// ========================================
// File: src/lib/fixtures/winChance.ts
// ========================================

type FixtureResult = {
  homeScore: number;
  awayScore: number;
};

export type WinChanceFixture = {
  kickoffAt?: Date | string | null;
  status: string;
  homeTeam: {
    id: string;
  };
  awayTeam: {
    id: string;
  };
  result: FixtureResult | null;
};

type TeamWinChanceStats = {
  teamId: string;
  played: number;
  wins: number;
  draws: number;
  losses: number;
  points: number;
  goalsFor: number;
  goalsAgainst: number;
  recent: number[];
};

export type FixtureWinChance = {
  home: number;
  draw: number;
  away: number;
  confidence: "Low" | "Medium" | "High";
  explanation: string;
};

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function getFixtureTime(value?: Date | string | null) {
  if (!value) return 0;
  const parsed = new Date(value).getTime();
  return Number.isFinite(parsed) ? parsed : 0;
}

function emptyStats(teamId: string): TeamWinChanceStats {
  return {
    teamId,
    played: 0,
    wins: 0,
    draws: 0,
    losses: 0,
    points: 0,
    goalsFor: 0,
    goalsAgainst: 0,
    recent: [],
  };
}

function getOrCreateStats(
  statsByTeamId: Map<string, TeamWinChanceStats>,
  teamId: string,
) {
  const existing = statsByTeamId.get(teamId);

  if (existing) {
    return existing;
  }

  const created = emptyStats(teamId);
  statsByTeamId.set(teamId, created);
  return created;
}

function addResult(input: {
  stats: TeamWinChanceStats;
  goalsFor: number;
  goalsAgainst: number;
}) {
  input.stats.played += 1;
  input.stats.goalsFor += input.goalsFor;
  input.stats.goalsAgainst += input.goalsAgainst;

  if (input.goalsFor > input.goalsAgainst) {
    input.stats.wins += 1;
    input.stats.points += 3;
    input.stats.recent.push(1);
    return;
  }

  if (input.goalsFor < input.goalsAgainst) {
    input.stats.losses += 1;
    input.stats.recent.push(0);
    return;
  }

  input.stats.draws += 1;
  input.stats.points += 1;
  input.stats.recent.push(0.5);
}

function buildStats(fixtures: WinChanceFixture[]) {
  const statsByTeamId = new Map<string, TeamWinChanceStats>();

  const completedFixtures = fixtures
    .filter((fixture) => fixture.status === "COMPLETED" && fixture.result)
    .sort((a, b) => getFixtureTime(a.kickoffAt) - getFixtureTime(b.kickoffAt));

  for (const fixture of completedFixtures) {
    if (!fixture.result) continue;

    const home = getOrCreateStats(statsByTeamId, fixture.homeTeam.id);
    const away = getOrCreateStats(statsByTeamId, fixture.awayTeam.id);

    addResult({
      stats: home,
      goalsFor: fixture.result.homeScore,
      goalsAgainst: fixture.result.awayScore,
    });

    addResult({
      stats: away,
      goalsFor: fixture.result.awayScore,
      goalsAgainst: fixture.result.homeScore,
    });
  }

  return statsByTeamId;
}

function getStrength(stats: TeamWinChanceStats | undefined) {
  if (!stats || stats.played === 0) {
    return 50;
  }

  const played = Math.max(stats.played, 1);
  const pointsPerGame = stats.points / played;
  const winRate = stats.wins / played;
  const goalDifferencePerGame = (stats.goalsFor - stats.goalsAgainst) / played;
  const goalsForPerGame = stats.goalsFor / played;
  const goalsAgainstPerGame = stats.goalsAgainst / played;
  const recent = stats.recent.slice(-5);
  const recentAverage = recent.length
    ? recent.reduce((sum, value) => sum + value, 0) / recent.length
    : 0.5;

  return (
    50 +
    pointsPerGame * 12 +
    winRate * 10 +
    goalDifferencePerGame * 5 +
    goalsForPerGame * 2 -
    goalsAgainstPerGame * 1.5 +
    (recentAverage - 0.5) * 14
  );
}

function getHeadToHeadAdjustment(input: {
  homeTeamId: string;
  awayTeamId: string;
  fixtures: WinChanceFixture[];
}) {
  let goalDifferenceFromHomePerspective = 0;
  let games = 0;

  for (const fixture of input.fixtures) {
    if (fixture.status !== "COMPLETED" || !fixture.result) continue;

    const homeIsCurrentHome = fixture.homeTeam.id === input.homeTeamId;
    const awayIsCurrentHome = fixture.awayTeam.id === input.homeTeamId;
    const isSamePair =
      (fixture.homeTeam.id === input.homeTeamId && fixture.awayTeam.id === input.awayTeamId) ||
      (fixture.homeTeam.id === input.awayTeamId && fixture.awayTeam.id === input.homeTeamId);

    if (!isSamePair) continue;

    games += 1;

    if (homeIsCurrentHome) {
      goalDifferenceFromHomePerspective +=
        fixture.result.homeScore - fixture.result.awayScore;
    } else if (awayIsCurrentHome) {
      goalDifferenceFromHomePerspective +=
        fixture.result.awayScore - fixture.result.homeScore;
    }
  }

  if (games === 0) return 0;

  return clamp((goalDifferenceFromHomePerspective / games) * 4, -10, 10);
}

function roundPercentages(input: { home: number; draw: number; away: number }) {
  const home = Math.round(input.home);
  const draw = Math.round(input.draw);
  const away = 100 - home - draw;

  if (away < 0) {
    return {
      home: clamp(home + away, 1, 98),
      draw,
      away: 0,
    };
  }

  return {
    home,
    draw,
    away,
  };
}

function getConfidence(totalGames: number): FixtureWinChance["confidence"] {
  if (totalGames >= 12) return "High";
  if (totalGames >= 5) return "Medium";
  return "Low";
}

export function calculateFixtureWinChance(input: {
  homeTeamId: string;
  awayTeamId: string;
  fixtures: WinChanceFixture[];
}): FixtureWinChance {
  const statsByTeamId = buildStats(input.fixtures);
  const homeStats = statsByTeamId.get(input.homeTeamId);
  const awayStats = statsByTeamId.get(input.awayTeamId);
  const completedGames = (homeStats?.played ?? 0) + (awayStats?.played ?? 0);

  if (completedGames === 0) {
    return {
      home: 35,
      draw: 30,
      away: 35,
      confidence: "Low",
      explanation: "No completed league results yet, so this starts as an even prediction.",
    };
  }

  const homeStrength = getStrength(homeStats);
  const awayStrength = getStrength(awayStats);
  const headToHeadAdjustment = getHeadToHeadAdjustment(input);
  const homeAdvantage = 2;
  const strengthDifference =
    homeStrength - awayStrength + headToHeadAdjustment + homeAdvantage;

  const homeShare = 1 / (1 + Math.exp(-strengthDifference / 18));
  const draw = clamp(28 - Math.abs(strengthDifference) * 0.45, 12, 30);
  const availableWinShare = 100 - draw;

  const rounded = roundPercentages({
    home: availableWinShare * homeShare,
    draw,
    away: availableWinShare * (1 - homeShare),
  });

  return {
    ...rounded,
    confidence: getConfidence(completedGames),
    explanation:
      "Based on completed league results, points per game, goal difference, recent form and head-to-head record.",
  };
}
