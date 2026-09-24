// ========================================
// File: src/lib/fixtures/winChance.ts
// ========================================

import { getPredictorResult, type PredictorResultSource } from "./result-score";

type FixtureResult = PredictorResultSource;

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

type CareerTeamSignals = {
  attack: OpponentPerformance[];
  conceding: OpponentPerformance[];
  form: OpponentPerformance[];
  opponentStrength: OpponentPerformance[];
};

type CareerStrengthModel = {
  ratings: Map<string, number>;
  signalsByTeamId: Map<string, CareerTeamSignals>;
  referenceTime: number;
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
const CAREER_HALF_LIFE_DAYS = 240;
const ELO_INACTIVITY_HALF_LIFE_DAYS = 365;
const CAREER_GOAL_PRIOR_GAMES = 1.75;
const ADJUSTED_FORM_WINDOW = 8;
const OPPONENT_GOAL_RATING_SCALE = 750;
const EXPECTED_MARGIN_RATING_SCALE = 40;
const SCHEDULE_STRENGTH_RATING_SCALE = 240;

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

function decayRatingTowardNeutral(
  rating: number,
  previousTime: number | undefined,
  currentTime: number,
) {
  if (!previousTime || currentTime <= previousTime) return rating;

  const days = (currentTime - previousTime) / 86_400_000;
  const retained = Math.pow(0.5, days / ELO_INACTIVITY_HALF_LIFE_DAYS);
  return 1500 + (rating - 1500) * retained;
}

function getOrCreateCareerSignals(
  signalsByTeamId: Map<string, CareerTeamSignals>,
  teamId: string,
) {
  const existing = signalsByTeamId.get(teamId);
  if (existing) return existing;

  const created: CareerTeamSignals = {
    attack: [],
    conceding: [],
    form: [],
    opponentStrength: [],
  };
  signalsByTeamId.set(teamId, created);
  return created;
}

function buildCareerStrengthModel(fixtures: WinChanceFixture[]): CareerStrengthModel {
  const ratings = new Map<string, number>();
  const lastPlayedAt = new Map<string, number>();
  const signalsByTeamId = new Map<string, CareerTeamSignals>();
  const getRating = (teamId: string) => ratings.get(teamId) ?? 1500;

  const completedFixtures = fixtures
    .filter(hasUsableResult)
    .sort((a, b) => getFixtureTime(a.kickoffAt) - getFixtureTime(b.kickoffAt));

  const referenceTime = completedFixtures.reduce(
    (latest, fixture) => Math.max(latest, getFixtureTime(fixture.kickoffAt)),
    0,
  );

  for (const fixture of completedFixtures) {
    const time = getFixtureTime(fixture.kickoffAt) || referenceTime;
    const homeTeamId = fixture.homeTeam.id;
    const awayTeamId = fixture.awayTeam.id;
    const homeRating = decayRatingTowardNeutral(
      getRating(homeTeamId),
      lastPlayedAt.get(homeTeamId),
      time,
    );
    const awayRating = decayRatingTowardNeutral(
      getRating(awayTeamId),
      lastPlayedAt.get(awayTeamId),
      time,
    );

    const expectedHome = 1 / (1 + Math.pow(10, (awayRating - homeRating) / 400));
    const actualHome =
      fixture.result.homeScore > fixture.result.awayScore
        ? 1
        : fixture.result.homeScore < fixture.result.awayScore
          ? 0
          : 0.5;

    const observedMargin = clamp(
      fixture.result.homeScore - fixture.result.awayScore,
      -10,
      10,
    );
    const expectedMargin = clamp(
      (homeRating - awayRating) / EXPECTED_MARGIN_RATING_SCALE,
      -5,
      5,
    );
    const marginSurprise = clamp(
      (observedMargin - expectedMargin) / 4,
      -1.5,
      1.5,
    );
    const resultSurprise = clamp((actualHome - expectedHome) * 2, -1.5, 1.5);
    const homePerformance = clamp(
      resultSurprise * 0.08 + marginSurprise * 0.92,
      -1.5,
      1.5,
    );

    // Compare the score margin achieved with the score margin this opponent
    // strength implied. A one-goal loss when a three-goal loss was expected is
    // positive evidence; a one-goal win when a three-goal win was expected is
    // negative evidence. Result direction still contributes, but margin quality
    // carries most of the schedule-strength information.
    const marginPerformance = 1 / (1 + Math.exp(-observedMargin / 1.7));
    const expectedMarginPerformance =
      1 / (1 + Math.exp(-expectedMargin / 1.7));
    const performanceScore = clamp(
      actualHome * 0.18 + marginPerformance * 0.82,
      0,
      1,
    );
    const expectedPerformanceScore = clamp(
      expectedHome * 0.18 + expectedMarginPerformance * 0.82,
      0,
      1,
    );

    const homeSignals = getOrCreateCareerSignals(signalsByTeamId, homeTeamId);
    const awaySignals = getOrCreateCareerSignals(signalsByTeamId, awayTeamId);

    const homeAttackMultiplier = Math.exp(
      (awayRating - 1500) / OPPONENT_GOAL_RATING_SCALE,
    );
    const awayAttackMultiplier = Math.exp(
      (homeRating - 1500) / OPPONENT_GOAL_RATING_SCALE,
    );
    const homeConcedeMultiplier = Math.exp(
      (1500 - awayRating) / OPPONENT_GOAL_RATING_SCALE,
    );
    const awayConcedeMultiplier = Math.exp(
      (1500 - homeRating) / OPPONENT_GOAL_RATING_SCALE,
    );

    homeSignals.attack.push({
      value: fixture.result.homeScore * homeAttackMultiplier,
      time,
    });
    homeSignals.conceding.push({
      value: fixture.result.awayScore * homeConcedeMultiplier,
      time,
    });
    homeSignals.form.push({ value: homePerformance, time });
    homeSignals.opponentStrength.push({ value: awayRating, time });

    awaySignals.attack.push({
      value: fixture.result.awayScore * awayAttackMultiplier,
      time,
    });
    awaySignals.conceding.push({
      value: fixture.result.homeScore * awayConcedeMultiplier,
      time,
    });
    awaySignals.form.push({ value: -homePerformance, time });
    awaySignals.opponentStrength.push({ value: homeRating, time });

    const margin = Math.abs(fixture.result.homeScore - fixture.result.awayScore);
    const marginMultiplier = 1 + Math.log1p(margin) * 0.22;
    const change =
      ELO_K * marginMultiplier * (performanceScore - expectedPerformanceScore);

    ratings.set(homeTeamId, homeRating + change);
    ratings.set(awayTeamId, awayRating - change);
    lastPlayedAt.set(homeTeamId, time);
    lastPlayedAt.set(awayTeamId, time);
  }

  if (referenceTime > 0) {
    for (const [teamId, rating] of ratings) {
      ratings.set(
        teamId,
        decayRatingTowardNeutral(
          rating,
          lastPlayedAt.get(teamId),
          referenceTime,
        ),
      );
    }
  }

  return {
    ratings,
    signalsByTeamId,
    referenceTime,
  };
}

function decayedAverage(
  values: OpponentPerformance[],
  referenceTime: number,
  options?: { window?: number; halfLifeDays?: number },
) {
  const ordered = [...values].sort((a, b) => a.time - b.time);
  const selected = options?.window ? ordered.slice(-options.window) : ordered;
  if (selected.length === 0) return null;

  let weightedTotal = 0;
  let totalWeight = 0;
  const halfLifeDays = options?.halfLifeDays ?? CAREER_HALF_LIFE_DAYS;

  for (const item of selected) {
    const ageDays =
      referenceTime > item.time ? (referenceTime - item.time) / 86_400_000 : 0;
    const weight = Math.pow(0.5, ageDays / halfLifeDays);
    weightedTotal += item.value * weight;
    totalWeight += weight;
  }

  return totalWeight > 0
    ? { value: weightedTotal / totalWeight, evidence: totalWeight }
    : null;
}

function getCareerScoringProfile(input: {
  samples: OpponentPerformance[];
  referenceTime: number;
  leagueAverage: number;
  fallback: number;
}) {
  const adjusted = decayedAverage(input.samples, input.referenceTime);
  if (!adjusted) return input.fallback;

  return (
    adjusted.value * adjusted.evidence +
    input.leagueAverage * CAREER_GOAL_PRIOR_GAMES
  ) / (adjusted.evidence + CAREER_GOAL_PRIOR_GAMES);
}

function getCareerAdjustedForm(
  signals: CareerTeamSignals | undefined,
  referenceTime: number,
) {
  const adjusted = decayedAverage(signals?.form ?? [], referenceTime, {
    window: ADJUSTED_FORM_WINDOW,
    halfLifeDays: 120,
  });
  return adjusted?.value ?? 0;
}

function getCareerScheduleStrength(
  signals: CareerTeamSignals | undefined,
  referenceTime: number,
) {
  const adjusted = decayedAverage(
    signals?.opponentStrength ?? [],
    referenceTime,
    { halfLifeDays: CAREER_HALF_LIFE_DAYS },
  );
  return adjusted?.value ?? 1500;
}

function buildEloRatings(fixtures: WinChanceFixture[]) {
  return buildCareerStrengthModel(fixtures).ratings;
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
  input = { ...input, fixtures: input.fixtures.map(fixture => ({ ...fixture, result: getPredictorResult(fixture.result) })) };
  const statsByTeamId = buildStats(input.fixtures);
  const baselines = getLeagueBaselines(statsByTeamId);
  const homeStats = statsByTeamId.get(input.homeTeamId);
  const awayStats = statsByTeamId.get(input.awayTeamId);
  const homeGames = homeStats?.played ?? 0;
  const awayGames = awayStats?.played ?? 0;

  if (homeGames === 0 || awayGames === 0) {
    return {
      home: 35,
      draw: 30,
      away: 35,
      predictedResult: { homeScore: 0, awayScore: 0, label: "Too early" },
      confidence: "Low",
      explanation:
        "A score prediction will appear once both teams have at least one completed result.",
    };
  }

  const leagueScoringRate = clamp(
    (baselines.goalsForPerGame + baselines.goalsAgainstPerGame) / 2,
    0.75,
    8,
  );

  const careerStrength = buildCareerStrengthModel(input.fixtures);
  const homeCareerSignals = careerStrength.signalsByTeamId.get(input.homeTeamId);
  const awayCareerSignals = careerStrength.signalsByTeamId.get(input.awayTeamId);

  const homeAttackFallback = getScoringProfile({
    total: homeStats?.goalsFor ?? 0,
    played: homeGames,
    recentValues: homeStats?.recentGoalsFor ?? [],
    leagueAverage: leagueScoringRate,
  });
  const awayAttackFallback = getScoringProfile({
    total: awayStats?.goalsFor ?? 0,
    played: awayGames,
    recentValues: awayStats?.recentGoalsFor ?? [],
    leagueAverage: leagueScoringRate,
  });
  const homeConcedingFallback = getScoringProfile({
    total: homeStats?.goalsAgainst ?? 0,
    played: homeGames,
    recentValues: homeStats?.recentGoalsAgainst ?? [],
    leagueAverage: leagueScoringRate,
  });
  const awayConcedingFallback = getScoringProfile({
    total: awayStats?.goalsAgainst ?? 0,
    played: awayGames,
    recentValues: awayStats?.recentGoalsAgainst ?? [],
    leagueAverage: leagueScoringRate,
  });

  const homeAttack = getCareerScoringProfile({
    samples: homeCareerSignals?.attack ?? [],
    referenceTime: careerStrength.referenceTime,
    leagueAverage: leagueScoringRate,
    fallback: homeAttackFallback,
  });
  const awayAttack = getCareerScoringProfile({
    samples: awayCareerSignals?.attack ?? [],
    referenceTime: careerStrength.referenceTime,
    leagueAverage: leagueScoringRate,
    fallback: awayAttackFallback,
  });
  const homeConceding = getCareerScoringProfile({
    samples: homeCareerSignals?.conceding ?? [],
    referenceTime: careerStrength.referenceTime,
    leagueAverage: leagueScoringRate,
    fallback: homeConcedingFallback,
  });
  const awayConceding = getCareerScoringProfile({
    samples: awayCareerSignals?.conceding ?? [],
    referenceTime: careerStrength.referenceTime,
    leagueAverage: leagueScoringRate,
    fallback: awayConcedingFallback,
  });

  const homeExpectedBase =
    leagueScoringRate *
    Math.pow(clamp(homeAttack / leagueScoringRate, 0.25, 3), 0.64) *
    Math.pow(clamp(awayConceding / leagueScoringRate, 0.25, 3), 0.36);
  const awayExpectedBase =
    leagueScoringRate *
    Math.pow(clamp(awayAttack / leagueScoringRate, 0.25, 3), 0.64) *
    Math.pow(clamp(homeConceding / leagueScoringRate, 0.25, 3), 0.36);

  const ratings = careerStrength.ratings;
  const homeRating = ratings.get(input.homeTeamId) ?? 1500;
  const awayRating = ratings.get(input.awayTeamId) ?? 1500;
  const eloDifference = clamp(homeRating - awayRating, -MAX_ELO_DIFFERENCE, MAX_ELO_DIFFERENCE);
  const homeEloMultiplier = Math.exp(eloDifference / ELO_SCALE);
  const awayEloMultiplier = Math.exp(-eloDifference / ELO_SCALE);

  const headToHeadAdjustment = getHeadToHeadGoalAdjustment(input);
  const commonOpponentAdjustment = getCommonOpponentGoalAdjustment(input);
  const homeAdjustedForm = getCareerAdjustedForm(
    homeCareerSignals,
    careerStrength.referenceTime,
  );
  const awayAdjustedForm = getCareerAdjustedForm(
    awayCareerSignals,
    careerStrength.referenceTime,
  );
  const opponentAdjustedForm = clamp(
    (homeAdjustedForm - awayAdjustedForm) * 0.56,
    -0.75,
    0.75,
  );
  const homeScheduleStrength = getCareerScheduleStrength(
    homeCareerSignals,
    careerStrength.referenceTime,
  );
  const awayScheduleStrength = getCareerScheduleStrength(
    awayCareerSignals,
    careerStrength.referenceTime,
  );
  const scheduleStrengthAdjustment = clamp(
    ((homeScheduleStrength - awayScheduleStrength) /
      SCHEDULE_STRENGTH_RATING_SCALE) *
      0.48,
    -0.65,
    0.65,
  );
  const matchupAdjustment = clamp(
    headToHeadAdjustment +
      commonOpponentAdjustment +
      opponentAdjustedForm +
      scheduleStrengthAdjustment,
    -1.2,
    1.2,
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
      ? "Limited-history estimate: every previous SIXFL result available is blended with time-decayed career strength, opponent-adjusted goals, schedule-adjusted form, common-opponent results and any direct head-to-head meetings."
      : "Based on every previous SIXFL match available, with older results gradually down-weighted. Team strength, recent form, strength of schedule and scoring/conceding rates are adjusted for the quality of the opposition, alongside common-opponent and head-to-head evidence. Win, draw and loss percentages come from the same score model as the predicted score.",
  };
}
