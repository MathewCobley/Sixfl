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
  recentGoalsFor: number[];
  recentGoalsAgainst: number[];
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

const OUTCOME_PRIOR_GAMES = 2;
const SCORING_PRIOR_GAMES = 1;
const RECENT_GOAL_PRIOR_GAMES = 1.25;
const RECENT_GOAL_WINDOW = 5;
const MAX_RECENT_GOAL_WEIGHT = 0.42;
const MAX_PREDICTED_SCORE = 12;

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
    recentGoalsFor: [],
    recentGoalsAgainst: [],
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
  input.stats.recentGoalsFor.push(input.goalsFor);
  input.stats.recentGoalsAgainst.push(input.goalsAgainst);

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
    goalsForPerGame: clamp(goalsFor / played, 0.5, 8),
    goalsAgainstPerGame: clamp(goalsAgainst / played, 0.5, 8),
    recentAverage: recentCount > 0 ? recentTotal / recentCount : 0.5,
  };
}

function getSmoothedPerGame(
  total: number,
  played: number,
  leagueAverage: number,
  priorGames = OUTCOME_PRIOR_GAMES,
) {
  return (
    (total + leagueAverage * priorGames) /
    (played + priorGames)
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
      baselines.recentAverage * OUTCOME_PRIOR_GAMES) /
    (recent.length + OUTCOME_PRIOR_GAMES);

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

function getWeightedRecentAverage(values: number[]) {
  const recent = values.slice(-RECENT_GOAL_WINDOW);
  if (recent.length === 0) return null;

  let weightedTotal = 0;
  let totalWeight = 0;

  recent.forEach((value, index) => {
    const weight = index + 1;
    weightedTotal += value * weight;
    totalWeight += weight;
  });

  return totalWeight > 0 ? weightedTotal / totalWeight : null;
}

function getScoringProfile(input: {
  total: number;
  played: number;
  recentValues: number[];
  leagueAverage: number;
}) {
  const seasonRate = getSmoothedPerGame(
    input.total,
    input.played,
    input.leagueAverage,
    SCORING_PRIOR_GAMES,
  );
  const weightedRecent = getWeightedRecentAverage(input.recentValues);

  if (weightedRecent === null) {
    return seasonRate;
  }

  const recentCount = Math.min(input.recentValues.length, RECENT_GOAL_WINDOW);
  const recentEvidence =
    recentCount / (recentCount + RECENT_GOAL_PRIOR_GAMES);
  const recentRate =
    input.leagueAverage +
    (weightedRecent - input.leagueAverage) * recentEvidence;
  const recentWeight = Math.min(
    MAX_RECENT_GOAL_WEIGHT,
    (input.played / 6) * MAX_RECENT_GOAL_WEIGHT,
  );

  return seasonRate * (1 - recentWeight) + recentRate * recentWeight;
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

function logFactorial(value: number) {
  let total = 0;
  for (let index = 2; index <= value; index += 1) {
    total += Math.log(index);
  }
  return total;
}

function poissonLogProbability(score: number, expectedGoals: number) {
  return (
    score * Math.log(Math.max(expectedGoals, 0.01)) -
    expectedGoals -
    logFactorial(score)
  );
}

function scorelineMatchesOutcome(input: {
  homeScore: number;
  awayScore: number;
  outcome: "home" | "draw" | "away";
}) {
  if (input.outcome === "home") return input.homeScore > input.awayScore;
  if (input.outcome === "away") return input.awayScore > input.homeScore;
  return input.homeScore === input.awayScore;
}

function getMostLikelyScoreline(input: {
  homeExpected: number;
  awayExpected: number;
  outcome: "home" | "draw" | "away";
}) {
  let best:
    | {
        homeScore: number;
        awayScore: number;
        logProbability: number;
        expectedDistance: number;
      }
    | null = null;

  for (let homeScore = 0; homeScore <= MAX_PREDICTED_SCORE; homeScore += 1) {
    for (let awayScore = 0; awayScore <= MAX_PREDICTED_SCORE; awayScore += 1) {
      if (!scorelineMatchesOutcome({ homeScore, awayScore, outcome: input.outcome })) {
        continue;
      }

      const logProbability =
        poissonLogProbability(homeScore, input.homeExpected) +
        poissonLogProbability(awayScore, input.awayExpected);
      const expectedDistance =
        Math.abs(homeScore - input.homeExpected) +
        Math.abs(awayScore - input.awayExpected);

      if (
        !best ||
        logProbability > best.logProbability + 1e-9 ||
        (Math.abs(logProbability - best.logProbability) <= 1e-9 &&
          expectedDistance < best.expectedDistance)
      ) {
        best = {
          homeScore,
          awayScore,
          logProbability,
          expectedDistance,
        };
      }
    }
  }

  return best ?? { homeScore: 0, awayScore: 0 };
}

function buildPredictedResult(input: {
  homeStats: TeamWinChanceStats | undefined;
  awayStats: TeamWinChanceStats | undefined;
  baselines: LeagueBaselines;
  strengthDifference: number;
  percentages: { home: number; draw: number; away: number };
}): PredictedResult {
  const leagueScoringRate = clamp(
    (input.baselines.goalsForPerGame + input.baselines.goalsAgainstPerGame) / 2,
    0.75,
    8,
  );
  const homeAttack = getScoringProfile({
    total: input.homeStats?.goalsFor ?? 0,
    played: input.homeStats?.played ?? 0,
    recentValues: input.homeStats?.recentGoalsFor ?? [],
    leagueAverage: leagueScoringRate,
  });
  const awayAttack = getScoringProfile({
    total: input.awayStats?.goalsFor ?? 0,
    played: input.awayStats?.played ?? 0,
    recentValues: input.awayStats?.recentGoalsFor ?? [],
    leagueAverage: leagueScoringRate,
  });
  const homeDefenceConceded = getScoringProfile({
    total: input.homeStats?.goalsAgainst ?? 0,
    played: input.homeStats?.played ?? 0,
    recentValues: input.homeStats?.recentGoalsAgainst ?? [],
    leagueAverage: leagueScoringRate,
  });
  const awayDefenceConceded = getScoringProfile({
    total: input.awayStats?.goalsAgainst ?? 0,
    played: input.awayStats?.played ?? 0,
    recentValues: input.awayStats?.recentGoalsAgainst ?? [],
    leagueAverage: leagueScoringRate,
  });

  // A team's own scoring record is the strongest signal for its expected goals,
  // with the opponent's conceding record providing the second part of the matchup.
  // Ratios preserve genuine high/low-scoring team identities instead of pulling
  // every fixture back towards the same league-average scoreline.
  const homeExpectedBase =
    leagueScoringRate *
    Math.pow(clamp(homeAttack / leagueScoringRate, 0.25, 3), 0.64) *
    Math.pow(clamp(awayDefenceConceded / leagueScoringRate, 0.25, 3), 0.36);
  const awayExpectedBase =
    leagueScoringRate *
    Math.pow(clamp(awayAttack / leagueScoringRate, 0.25, 3), 0.64) *
    Math.pow(clamp(homeDefenceConceded / leagueScoringRate, 0.25, 3), 0.36);
  const strengthGoalAdjustment = clamp(
    input.strengthDifference * 0.018,
    -0.75,
    0.75,
  );

  const homeExpected = clamp(
    homeExpectedBase + strengthGoalAdjustment,
    0.35,
    10.5,
  );
  const awayExpected = clamp(
    awayExpectedBase - strengthGoalAdjustment,
    0.35,
    10.5,
  );
  const outcome = getPredictedOutcome(input.percentages);
  const scoreline = getMostLikelyScoreline({
    homeExpected,
    awayExpected,
    outcome,
  });

  return {
    homeScore: scoreline.homeScore,
    awayScore: scoreline.awayScore,
    label: `${scoreline.homeScore}-${scoreline.awayScore}`,
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

  const evidenceWeight = games / (games + OUTCOME_PRIOR_GAMES);
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
      ? "Early-season estimate: limited team results are blended with league averages, recent form, goals scored, goals conceded and any head-to-head results."
      : "Based on completed results, team-specific scoring and conceding rates, recent goals, points per game, goal difference, recent form and head-to-head record.",
  };
}
