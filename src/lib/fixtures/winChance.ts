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

type LeagueBaselines = {
  pointsPerGame: number;
  winRate: number;
  goalDifferencePerGame: number;
  goalsForPerGame: number;
  goalsAgainstPerGame: number;
  recentAverage: number;
};

export type PredictedResult = {
  homeScore: number;
  awayScore: number;
  label: string;
};

export type FixtureWinChance = {
  home: number;
  draw: number;
  away: number;
  predictedResult: PredictedResult;
  confidence: "Low" | "Medium" | "High";
  explanation: string;
};

type UsableResultFixture = WinChanceFixture & { result: FixtureResult };

const EARLY_SEASON_PRIOR_GAMES = 2;

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function getFixtureTime(value?: Date | string | null) {
  if (!value) return 0;
  const parsed = new Date(value).getTime();
  return Number.isFinite(parsed) ? parsed : 0;
}

function hasUsableResult(fixture: WinChanceFixture): fixture is UsableResultFixture {
  return Boolean(fixture.result);
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
    .filter(hasUsableResult)
    .sort((a, b) => getFixtureTime(a.kickoffAt) - getFixtureTime(b.kickoffAt));

  for (const fixture of completedFixtures) {
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

function getLeagueBaselines(
  statsByTeamId: Map<string, TeamWinChanceStats>,
): LeagueBaselines {
  let played = 0;
  let wins = 0;
  let points = 0;
  let goalsFor = 0;
  let goalsAgainst = 0;
  let recentTotal = 0;
  let recentCount = 0;

  for (const stats of statsByTeamId.values()) {
    played += stats.played;
    wins += stats.wins;
    points += stats.points;
    goalsFor += stats.goalsFor;
    goalsAgainst += stats.goalsAgainst;
    recentTotal += stats.recent.reduce((sum, value) => sum + value, 0);
    recentCount += stats.recent.length;
  }

  if (played === 0) {
    return {
      pointsPerGame: 1.5,
      winRate: 0.4,
      goalDifferencePerGame: 0,
      goalsForPerGame: 2.5,
      goalsAgainstPerGame: 2.5,
      recentAverage: 0.5,
    };
  }

  return {
    pointsPerGame: points / played,
    winRate: wins / played,
    goalDifferencePerGame: (goalsFor - goalsAgainst) / played,
    goalsForPerGame: clamp(goalsFor / played, 0.5, 7),
    goalsAgainstPerGame: clamp(goalsAgainst / played, 0.5, 7),
    recentAverage: recentCount > 0 ? recentTotal / recentCount : 0.5,
  };
}

function getSmoothedPerGame(
  total: number,
  played: number,
  leagueAverage: number,
) {
  return (
    (total + leagueAverage * EARLY_SEASON_PRIOR_GAMES) /
    (played + EARLY_SEASON_PRIOR_GAMES)
  );
}

function getStrength(
  stats: TeamWinChanceStats | undefined,
  baselines: LeagueBaselines,
) {
  const played = stats?.played ?? 0;
  const pointsPerGame = getSmoothedPerGame(
    stats?.points ?? 0,
    played,
    baselines.pointsPerGame,
  );
  const winRate = getSmoothedPerGame(
    stats?.wins ?? 0,
    played,
    baselines.winRate,
  );
  const goalDifferencePerGame = getSmoothedPerGame(
    (stats?.goalsFor ?? 0) - (stats?.goalsAgainst ?? 0),
    played,
    baselines.goalDifferencePerGame,
  );
  const goalsForPerGame = getSmoothedPerGame(
    stats?.goalsFor ?? 0,
    played,
    baselines.goalsForPerGame,
  );
  const goalsAgainstPerGame = getSmoothedPerGame(
    stats?.goalsAgainst ?? 0,
    played,
    baselines.goalsAgainstPerGame,
  );
  const recent = stats?.recent.slice(-5) ?? [];
  const recentAverage =
    (recent.reduce((sum, value) => sum + value, 0) +
      baselines.recentAverage * EARLY_SEASON_PRIOR_GAMES) /
    (recent.length + EARLY_SEASON_PRIOR_GAMES);

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

function getGoalsForPerGame(
  stats: TeamWinChanceStats | undefined,
  leagueAverage: number,
) {
  return getSmoothedPerGame(
    stats?.goalsFor ?? 0,
    stats?.played ?? 0,
    leagueAverage,
  );
}

function getGoalsAgainstPerGame(
  stats: TeamWinChanceStats | undefined,
  leagueAverage: number,
) {
  return getSmoothedPerGame(
    stats?.goalsAgainst ?? 0,
    stats?.played ?? 0,
    leagueAverage,
  );
}

function getPredictedOutcome(input: {
  home: number;
  draw: number;
  away: number;
}) {
  if (input.draw >= input.home && input.draw >= input.away) return "draw" as const;
  if (input.home >= input.away) return "home" as const;
  return "away" as const;
}

function buildPredictedResult(input: {
  homeStats: TeamWinChanceStats | undefined;
  awayStats: TeamWinChanceStats | undefined;
  baselines: LeagueBaselines;
  strengthDifference: number;
  percentages: { home: number; draw: number; away: number };
}): PredictedResult {
  const homeAttack = getGoalsForPerGame(
    input.homeStats,
    input.baselines.goalsForPerGame,
  );
  const awayAttack = getGoalsForPerGame(
    input.awayStats,
    input.baselines.goalsForPerGame,
  );
  const homeDefenceConceded = getGoalsAgainstPerGame(
    input.homeStats,
    input.baselines.goalsAgainstPerGame,
  );
  const awayDefenceConceded = getGoalsAgainstPerGame(
    input.awayStats,
    input.baselines.goalsAgainstPerGame,
  );

  const homeExpected = clamp(
    homeAttack * 0.58 +
      awayDefenceConceded * 0.42 +
      input.strengthDifference * 0.025,
    0.4,
    8.5,
  );
  const awayExpected = clamp(
    awayAttack * 0.58 +
      homeDefenceConceded * 0.42 -
      input.strengthDifference * 0.025,
    0.4,
    8.5,
  );

  let homeScore = clamp(Math.round(homeExpected), 0, 9);
  let awayScore = clamp(Math.round(awayExpected), 0, 9);
  const outcome = getPredictedOutcome(input.percentages);

  if (outcome === "home" && homeScore <= awayScore) {
    homeScore = clamp(awayScore + 1, 1, 9);
  }

  if (outcome === "away" && awayScore <= homeScore) {
    awayScore = clamp(homeScore + 1, 1, 9);
  }

  if (outcome === "draw") {
    const drawScore = clamp(
      Math.round((homeExpected + awayExpected) / 2),
      0,
      8,
    );
    homeScore = drawScore;
    awayScore = drawScore;
  }

  return {
    homeScore,
    awayScore,
    label: `${homeScore}-${awayScore}`,
  };
}

function getHeadToHeadAdjustment(input: {
  homeTeamId: string;
  awayTeamId: string;
  fixtures: WinChanceFixture[];
}) {
  let goalDifferenceFromHomePerspective = 0;
  let games = 0;

  for (const fixture of input.fixtures) {
    if (!hasUsableResult(fixture)) continue;

    const homeIsCurrentHome = fixture.homeTeam.id === input.homeTeamId;
    const awayIsCurrentHome = fixture.awayTeam.id === input.homeTeamId;
    const isSamePair =
      (fixture.homeTeam.id === input.homeTeamId &&
        fixture.awayTeam.id === input.awayTeamId) ||
      (fixture.homeTeam.id === input.awayTeamId &&
        fixture.awayTeam.id === input.homeTeamId);

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

  const evidenceWeight = games / (games + EARLY_SEASON_PRIOR_GAMES);
  return clamp(
    (goalDifferenceFromHomePerspective / games) * 4 * evidenceWeight,
    -10,
    10,
  );
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

function getConfidence(
  homeGames: number,
  awayGames: number,
): FixtureWinChance["confidence"] {
  const leastExperiencedTeam = Math.min(homeGames, awayGames);
  const totalGames = homeGames + awayGames;

  if (leastExperiencedTeam >= 6 && totalGames >= 12) return "High";
  if (leastExperiencedTeam >= 3 && totalGames >= 6) return "Medium";
  return "Low";
}

export function calculateFixtureWinChance(input: {
  homeTeamId: string;
  awayTeamId: string;
  fixtures: WinChanceFixture[];
}): FixtureWinChance {
  const statsByTeamId = buildStats(input.fixtures);
  const baselines = getLeagueBaselines(statsByTeamId);
  const homeStats = statsByTeamId.get(input.homeTeamId);
  const awayStats = statsByTeamId.get(input.awayTeamId);
  const homeGames = homeStats?.played ?? 0;
  const awayGames = awayStats?.played ?? 0;
  const completedGames = homeGames + awayGames;

  if (completedGames === 0) {
    return {
      home: 35,
      draw: 30,
      away: 35,
      predictedResult: {
        homeScore: 0,
        awayScore: 0,
        label: "Too early",
      },
      confidence: "Low",
      explanation:
        "No completed results were found for these teams yet, so a score prediction will appear once there is usable match data.",
    };
  }

  const homeStrength = getStrength(homeStats, baselines);
  const awayStrength = getStrength(awayStats, baselines);
  const headToHeadAdjustment = getHeadToHeadAdjustment(input);
  const strengthDifference =
    homeStrength - awayStrength + headToHeadAdjustment;

  const homeShare = 1 / (1 + Math.exp(-strengthDifference / 18));
  const draw = clamp(28 - Math.abs(strengthDifference) * 0.45, 12, 30);
  const availableWinShare = 100 - draw;

  const rounded = roundPercentages({
    home: availableWinShare * homeShare,
    draw,
    away: availableWinShare * (1 - homeShare),
  });

  const predictedResult = buildPredictedResult({
    homeStats,
    awayStats,
    baselines,
    strengthDifference,
    percentages: rounded,
  });

  const isEarlySeason = Math.min(homeGames, awayGames) < 3;

  return {
    ...rounded,
    predictedResult,
    confidence: getConfidence(homeGames, awayGames),
    explanation: isEarlySeason
      ? "Early-season estimate: limited team results are blended with league averages, recent form, scoring record and any head-to-head results."
      : "Based on completed results for these teams, points per game, goal difference, recent form, scoring record and head-to-head record.",
  };
}
