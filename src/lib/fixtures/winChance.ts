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
  goalsForPerGame: number;
  goalsAgainstPerGame: number;
};

type Outcome = "home" | "draw" | "away";

type ScoreCandidate = {
  homeScore: number;
  awayScore: number;
  probability: number;
};

type PoissonModel = {
  home: number;
  draw: number;
  away: number;
  bestByOutcome: Record<Outcome, ScoreCandidate | null>;
};

type OpponentPerformance = {
  value: number;
  time: number;
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

const SCORING_PRIOR_GAMES = 1.25;
const RECENT_GOAL_PRIOR_GAMES = 1.25;
const RECENT_GOAL_WINDOW = 5;
const MAX_RECENT_GOAL_WEIGHT = 0.42;
const MAX_PREDICTED_SCORE = 12;
const ELO_K = 30;
const ELO_SCALE = 1200;
const MAX_ELO_DIFFERENCE = 350;
const HEAD_TO_HEAD_WINDOW = 4;
const COMMON_OPPONENT_WINDOW = 4;

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
  if (existing) return existing;

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

function getLeagueBaselines(statsByTeamId: Map<string, TeamWinChanceStats>): LeagueBaselines {
  let played = 0;
  let goalsFor = 0;
  let goalsAgainst = 0;

  for (const stats of statsByTeamId.values()) {
    played += stats.played;
    goalsFor += stats.goalsFor;
    goalsAgainst += stats.goalsAgainst;
  }

  if (played === 0) {
    return { goalsForPerGame: 2.5, goalsAgainstPerGame: 2.5 };
  }

  return {
    goalsForPerGame: clamp(goalsFor / played, 0.5, 8),
    goalsAgainstPerGame: clamp(goalsAgainst / played, 0.5, 8),
  };
}

function getSmoothedPerGame(
  total: number,
  played: number,
  leagueAverage: number,
  priorGames = SCORING_PRIOR_GAMES,
) {
  return (total + leagueAverage * priorGames) / (played + priorGames);
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
  if (weightedRecent === null) return seasonRate;

  const recentCount = Math.min(input.recentValues.length, RECENT_GOAL_WINDOW);
  const recentEvidence = recentCount / (recentCount + RECENT_GOAL_PRIOR_GAMES);
  const recentRate =
    input.leagueAverage + (weightedRecent - input.leagueAverage) * recentEvidence;
  const recentWeight = Math.min(
    MAX_RECENT_GOAL_WEIGHT,
    (input.played / 6) * MAX_RECENT_GOAL_WEIGHT,
  );

  return seasonRate * (1 - recentWeight) + recentRate * recentWeight;
}

function buildEloRatings(fixtures: WinChanceFixture[]) {
  const ratings = new Map<string, number>();
  const getRating = (teamId: string) => ratings.get(teamId) ?? 1500;

  const completedFixtures = fixtures
    .filter(hasUsableResult)
    .sort((a, b) => getFixtureTime(a.kickoffAt) - getFixtureTime(b.kickoffAt));

  for (const fixture of completedFixtures) {
    const homeRating = getRating(fixture.homeTeam.id);
    const awayRating = getRating(fixture.awayTeam.id);
    const expectedHome = 1 / (1 + Math.pow(10, (awayRating - homeRating) / 400));
    const actualHome =
      fixture.result.homeScore > fixture.result.awayScore
        ? 1
        : fixture.result.homeScore < fixture.result.awayScore
          ? 0
          : 0.5;
    const margin = Math.abs(fixture.result.homeScore - fixture.result.awayScore);
    const marginMultiplier = 1 + Math.log1p(margin) * 0.22;
    const change = ELO_K * marginMultiplier * (actualHome - expectedHome);

    ratings.set(fixture.homeTeam.id, homeRating + change);
    ratings.set(fixture.awayTeam.id, awayRating - change);
  }

  return ratings;
}

function weightedAverage(values: Array<{ value: number; time: number }>, window: number) {
  const recent = [...values]
    .sort((a, b) => a.time - b.time)
    .slice(-window);
  if (recent.length === 0) return null;

  let total = 0;
  let weightTotal = 0;
  recent.forEach((item, index) => {
    const weight = index + 1;
    total += item.value * weight;
    weightTotal += weight;
  });

  return weightTotal > 0 ? total / weightTotal : null;
}

function getHeadToHeadGoalAdjustment(input: {
  homeTeamId: string;
  awayTeamId: string;
  fixtures: WinChanceFixture[];
}) {
  const samples: OpponentPerformance[] = [];

  for (const fixture of input.fixtures) {
    if (!hasUsableResult(fixture)) continue;
    const sameDirection =
      fixture.homeTeam.id === input.homeTeamId &&
      fixture.awayTeam.id === input.awayTeamId;
    const reverseDirection =
      fixture.homeTeam.id === input.awayTeamId &&
      fixture.awayTeam.id === input.homeTeamId;
    if (!sameDirection && !reverseDirection) continue;

    samples.push({
      value: sameDirection
        ? fixture.result.homeScore - fixture.result.awayScore
        : fixture.result.awayScore - fixture.result.homeScore,
      time: getFixtureTime(fixture.kickoffAt),
    });
  }

  const averageDifference = weightedAverage(samples, HEAD_TO_HEAD_WINDOW);
  if (averageDifference === null) return 0;

  const evidence = Math.min(samples.length, HEAD_TO_HEAD_WINDOW);
  const evidenceWeight = evidence / (evidence + 2);
  return clamp(averageDifference * 0.16 * evidenceWeight, -0.65, 0.65);
}

function resultValue(goalsFor: number, goalsAgainst: number) {
  if (goalsFor > goalsAgainst) return 1;
  if (goalsFor < goalsAgainst) return -1;
  return 0;
}

function buildOpponentPerformanceMap(input: {
  teamId: string;
  fixtures: WinChanceFixture[];
}) {
  const map = new Map<string, OpponentPerformance[]>();

  for (const fixture of input.fixtures) {
    if (!hasUsableResult(fixture)) continue;

    let opponentId: string | null = null;
    let goalsFor = 0;
    let goalsAgainst = 0;

    if (fixture.homeTeam.id === input.teamId) {
      opponentId = fixture.awayTeam.id;
      goalsFor = fixture.result.homeScore;
      goalsAgainst = fixture.result.awayScore;
    } else if (fixture.awayTeam.id === input.teamId) {
      opponentId = fixture.homeTeam.id;
      goalsFor = fixture.result.awayScore;
      goalsAgainst = fixture.result.homeScore;
    }

    if (!opponentId) continue;

    const goalDifferenceSignal = clamp(goalsFor - goalsAgainst, -6, 6) / 6;
    const performance = resultValue(goalsFor, goalsAgainst) + goalDifferenceSignal;
    map.set(opponentId, [
      ...(map.get(opponentId) ?? []),
      { value: performance, time: getFixtureTime(fixture.kickoffAt) },
    ]);
  }

  return map;
}

function getCommonOpponentGoalAdjustment(input: {
  homeTeamId: string;
  awayTeamId: string;
  fixtures: WinChanceFixture[];
}) {
  const homeByOpponent = buildOpponentPerformanceMap({
    teamId: input.homeTeamId,
    fixtures: input.fixtures,
  });
  const awayByOpponent = buildOpponentPerformanceMap({
    teamId: input.awayTeamId,
    fixtures: input.fixtures,
  });

  let weightedDifference = 0;
  let totalWeight = 0;
  let commonOpponents = 0;

  for (const [opponentId, homeSamples] of homeByOpponent) {
    if (opponentId === input.awayTeamId || opponentId === input.homeTeamId) continue;
    const awaySamples = awayByOpponent.get(opponentId);
    if (!awaySamples?.length) continue;

    const homePerformance = weightedAverage(homeSamples, COMMON_OPPONENT_WINDOW);
    const awayPerformance = weightedAverage(awaySamples, COMMON_OPPONENT_WINDOW);
    if (homePerformance === null || awayPerformance === null) continue;

    const sharedEvidence = Math.min(homeSamples.length, awaySamples.length, COMMON_OPPONENT_WINDOW);
    const opponentWeight = sharedEvidence / (sharedEvidence + 1);
    weightedDifference += (homePerformance - awayPerformance) * opponentWeight;
    totalWeight += opponentWeight;
    commonOpponents += 1;
  }

  if (totalWeight === 0 || commonOpponents === 0) return 0;

  const averageDifference = weightedDifference / totalWeight;
  const breadthWeight = commonOpponents / (commonOpponents + 2);
  return clamp(averageDifference * 0.22 * breadthWeight, -0.55, 0.55);
}

function logFactorial(value: number) {
  let total = 0;
  for (let index = 2; index <= value; index += 1) total += Math.log(index);
  return total;
}

function poissonProbability(score: number, expectedGoals: number) {
  const lambda = Math.max(expectedGoals, 0.01);
  return Math.exp(score * Math.log(lambda) - lambda - logFactorial(score));
}

function outcomeForScore(homeScore: number, awayScore: number): Outcome {
  if (homeScore > awayScore) return "home";
  if (awayScore > homeScore) return "away";
  return "draw";
}

function buildPoissonModel(homeExpected: number, awayExpected: number): PoissonModel {
  let home = 0;
  let draw = 0;
  let away = 0;
  let total = 0;
  const bestByOutcome: Record<Outcome, ScoreCandidate | null> = {
    home: null,
    draw: null,
    away: null,
  };

  for (let homeScore = 0; homeScore <= MAX_PREDICTED_SCORE; homeScore += 1) {
    const homeProbability = poissonProbability(homeScore, homeExpected);

    for (let awayScore = 0; awayScore <= MAX_PREDICTED_SCORE; awayScore += 1) {
      const probability = homeProbability * poissonProbability(awayScore, awayExpected);
      const outcome = outcomeForScore(homeScore, awayScore);
      total += probability;

      if (outcome === "home") home += probability;
      else if (outcome === "away") away += probability;
      else draw += probability;

      const currentBest = bestByOutcome[outcome];
      if (!currentBest || probability > currentBest.probability) {
        bestByOutcome[outcome] = { homeScore, awayScore, probability };
      }
    }
  }

  if (total <= 0) {
    return {
      home: 1 / 3,
      draw: 1 / 3,
      away: 1 / 3,
      bestByOutcome,
    };
  }

  return {
    home: home / total,
    draw: draw / total,
    away: away / total,
    bestByOutcome,
  };
}

function getPredictedOutcome(model: Pick<PoissonModel, "home" | "draw" | "away">): Outcome {
  if (model.draw >= model.home && model.draw >= model.away) return "draw";
  if (model.home >= model.away) return "home";
  return "away";
}

function roundPercentages(input: { home: number; draw: number; away: number }) {
  const home = Math.round(input.home * 100);
  const draw = Math.round(input.draw * 100);
  const away = 100 - home - draw;

  if (away < 0) {
    return { home: clamp(home + away, 0, 100), draw, away: 0 };
  }

  return { home, draw, away };
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
      predictedResult: { homeScore: 0, awayScore: 0, label: "Too early" },
      confidence: "Low",
      explanation:
        "No completed results were found for these teams yet, so a score prediction will appear once there is usable match data.",
    };
  }

  const leagueScoringRate = clamp(
    (baselines.goalsForPerGame + baselines.goalsAgainstPerGame) / 2,
    0.75,
    8,
  );

  const homeAttack = getScoringProfile({
    total: homeStats?.goalsFor ?? 0,
    played: homeGames,
    recentValues: homeStats?.recentGoalsFor ?? [],
    leagueAverage: leagueScoringRate,
  });
  const awayAttack = getScoringProfile({
    total: awayStats?.goalsFor ?? 0,
    played: awayGames,
    recentValues: awayStats?.recentGoalsFor ?? [],
    leagueAverage: leagueScoringRate,
  });
  const homeConceding = getScoringProfile({
    total: homeStats?.goalsAgainst ?? 0,
    played: homeGames,
    recentValues: homeStats?.recentGoalsAgainst ?? [],
    leagueAverage: leagueScoringRate,
  });
  const awayConceding = getScoringProfile({
    total: awayStats?.goalsAgainst ?? 0,
    played: awayGames,
    recentValues: awayStats?.recentGoalsAgainst ?? [],
    leagueAverage: leagueScoringRate,
  });

  const homeExpectedBase =
    leagueScoringRate *
    Math.pow(clamp(homeAttack / leagueScoringRate, 0.25, 3), 0.64) *
    Math.pow(clamp(awayConceding / leagueScoringRate, 0.25, 3), 0.36);
  const awayExpectedBase =
    leagueScoringRate *
    Math.pow(clamp(awayAttack / leagueScoringRate, 0.25, 3), 0.64) *
    Math.pow(clamp(homeConceding / leagueScoringRate, 0.25, 3), 0.36);

  const ratings = buildEloRatings(input.fixtures);
  const homeRating = ratings.get(input.homeTeamId) ?? 1500;
  const awayRating = ratings.get(input.awayTeamId) ?? 1500;
  const eloDifference = clamp(homeRating - awayRating, -MAX_ELO_DIFFERENCE, MAX_ELO_DIFFERENCE);
  const homeEloMultiplier = Math.exp(eloDifference / ELO_SCALE);
  const awayEloMultiplier = Math.exp(-eloDifference / ELO_SCALE);

  const headToHeadAdjustment = getHeadToHeadGoalAdjustment(input);
  const commonOpponentAdjustment = getCommonOpponentGoalAdjustment(input);
  const matchupAdjustment = clamp(
    headToHeadAdjustment + commonOpponentAdjustment,
    -0.85,
    0.85,
  );

  const homeExpected = clamp(
    homeExpectedBase * homeEloMultiplier + matchupAdjustment,
    0.35,
    10.5,
  );
  const awayExpected = clamp(
    awayExpectedBase * awayEloMultiplier - matchupAdjustment,
    0.35,
    10.5,
  );

  const poisson = buildPoissonModel(homeExpected, awayExpected);
  const predictedOutcome = getPredictedOutcome(poisson);
  const predictedScore =
    poisson.bestByOutcome[predictedOutcome] ?? {
      homeScore: Math.max(0, Math.round(homeExpected)),
      awayScore: Math.max(0, Math.round(awayExpected)),
      probability: 0,
    };
  const percentages = roundPercentages(poisson);
  const isEarlySeason = Math.min(homeGames, awayGames) < 3;

  return {
    ...percentages,
    predictedResult: {
      homeScore: predictedScore.homeScore,
      awayScore: predictedScore.awayScore,
      label: `${predictedScore.homeScore}-${predictedScore.awayScore}`,
    },
    confidence: getConfidence(homeGames, awayGames),
    explanation: isEarlySeason
      ? "Early-season estimate: limited results are blended with league scoring levels, recent goals, opponent-adjusted strength, common-opponent results and any direct head-to-head meetings."
      : "Based on team scoring and conceding rates, recent goals, opponent-adjusted strength, common-opponent comparisons and direct head-to-head history. Win, draw and loss percentages are derived from the same Poisson score model as the predicted score.",
  };
}
