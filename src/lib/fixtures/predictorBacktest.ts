import {
  calculatePredictorV3Candidates,
  type PredictorV3Outcome,
  type PredictorV3Probabilities,
} from "@/lib/fixtures/predictorV3Candidate";
import { calculateFixtureWinChance, type WinChanceFixture } from "@/lib/fixtures/winChance";

export type PredictorBacktestRow = {
  fixtureId: string;
  leagueId: string;
  leagueName: string;
  kickoffAt: Date;
  resultEnteredAt: Date;
  homeTeamId: string;
  homeTeamName: string;
  awayTeamId: string;
  awayTeamName: string;
  actualHomeScore: number;
  actualAwayScore: number;
};

type Outcome = PredictorV3Outcome;

type Probabilities = PredictorV3Probabilities;

type TeamStats = {
  played: number;
  points: number;
  goalsFor: number;
  goalsAgainst: number;
  recentGoalsFor: number[];
  recentGoalsAgainst: number[];
};

type ModelPrediction = {
  outcome: Outcome;
  probabilities?: Probabilities;
  score?: { home: number; away: number };
};

type MutableCalibrationBin = {
  label: string;
  calls: number;
  confidenceTotal: number;
  correct: number;
};

type OutcomeConfusionMatrix = Record<Outcome, Record<Outcome, number>>;

type MutableMethod = {
  key: string;
  label: string;
  description: string;
  calls: number;
  correct: number;
  exact: number;
  scoredCalls: number;
  totalGoalError: number;
  predictedGoalsTotal: number;
  actualGoalsTotal: number;
  scorelineCounts: Map<string, number>;
  brierTotal: number;
  brierCalls: number;
  confidenceTotal: number;
  calibrationBins: MutableCalibrationBin[];
  confusionMatrix: OutcomeConfusionMatrix;
};

export type PredictorCalibrationBin = {
  label: string;
  calls: number;
  averageConfidence: number | null;
  accuracy: number | null;
};

export type PredictorCommonScoreline = {
  scoreline: string;
  count: number;
  share: number;
};

export type PredictorBacktestMethod = {
  key: string;
  label: string;
  description: string;
  calls: number;
  correct: number;
  accuracy: number;
  exact: number | null;
  exactAccuracy: number | null;
  averageGoalError: number | null;
  averagePredictedGoals: number | null;
  averageActualGoals: number | null;
  goalsBias: number | null;
  distinctScorelines: number | null;
  mostCommonScoreline: string | null;
  mostCommonScorelineCount: number | null;
  mostCommonScorelineShare: number | null;
  topFourScorelineShare: number | null;
  commonScorelines: PredictorCommonScoreline[];
  brierScore: number | null;
  averageConfidence: number | null;
  calibrationError: number | null;
  calibrationBins: PredictorCalibrationBin[];
  confusionMatrix: OutcomeConfusionMatrix;
};

export type PredictorPromotionCheck = {
  key:
    | "accuracy"
    | "brier"
    | "goal-error"
    | "goal-bias"
    | "top-four-share"
    | "distinct-scorelines"
    | "calibration";
  label: string;
  passed: boolean;
  currentValue: number | null;
  candidateValue: number | null;
  requiredValue: number | null;
  direction: "higher" | "lower" | "closer-to-zero";
};

export type PredictorPromotionAssessment = {
  candidateKey: string;
  candidateLabel: string;
  ready: boolean;
  passedChecks: number;
  totalChecks: number;
  checks: PredictorPromotionCheck[];
};

export type PredictorBacktestExample = {
  fixtureId: string;
  leagueName: string;
  kickoffAt: Date;
  fixture: string;
  actual: string;
  sixfl: string;
  v3Score: string;
  v3Full: string;
  eloGoals: string;
  ppg: Outcome;
  elo: Outcome;
};

export type PredictorBacktestResult = {
  totalCompletedFixtures: number;
  eligibleFixtures: number;
  skippedTooEarly: number;
  draws: number;
  drawRate: number;
  twoTeamCoinExpectedAccuracy: number;
  methods: PredictorBacktestMethod[];
  bestMethodKey: string | null;
  bestMethodLabel: string | null;
  bestAccuracy: number | null;
  promotionAssessments: PredictorPromotionAssessment[];
  examples: PredictorBacktestExample[];
};

const MAX_SCORE = 12;
const ELO_K = 30;
const ELO_DRAW_THRESHOLD = 34;

const CALIBRATION_BUCKETS = [
  { label: "33–39%", min: 0, max: 0.4 },
  { label: "40–49%", min: 0.4, max: 0.5 },
  { label: "50–59%", min: 0.5, max: 0.6 },
  { label: "60–69%", min: 0.6, max: 0.7 },
  { label: "70%+", min: 0.7, max: Number.POSITIVE_INFINITY },
] as const;

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function normaliseTeamName(value: string) {
  return value
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function canonicalTeamId(input: {
  leagueId: string;
  teamId: string;
  teamName: string;
}) {
  const name = normaliseTeamName(input.teamName);
  return `${input.leagueId}:${name || input.teamId}`;
}

function outcome(home: number, away: number): Outcome {
  if (home > away) return "HOME";
  if (away > home) return "AWAY";
  return "DRAW";
}

function percentageProbability(value: number) {
  return clamp(value / 100, 0, 1);
}

function normaliseProbabilities(input: Probabilities): Probabilities {
  const home = Math.max(0, input.home);
  const draw = Math.max(0, input.draw);
  const away = Math.max(0, input.away);
  const total = home + draw + away;
  if (!Number.isFinite(total) || total <= 0) {
    return { home: 1 / 3, draw: 1 / 3, away: 1 / 3 };
  }
  return { home: home / total, draw: draw / total, away: away / total };
}

function brierScore(probabilities: Probabilities, actual: Outcome) {
  const expected = {
    HOME: { home: 1, draw: 0, away: 0 },
    DRAW: { home: 0, draw: 1, away: 0 },
    AWAY: { home: 0, draw: 0, away: 1 },
  }[actual];

  return (
    (Math.pow(probabilities.home - expected.home, 2) +
      Math.pow(probabilities.draw - expected.draw, 2) +
      Math.pow(probabilities.away - expected.away, 2)) /
    3
  );
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

function poissonOutcomeProbabilities(homeExpected: number, awayExpected: number) {
  let home = 0;
  let draw = 0;
  let away = 0;
  let total = 0;

  for (let homeScore = 0; homeScore <= MAX_SCORE; homeScore += 1) {
    const homeProbability = poissonProbability(homeScore, homeExpected);
    for (let awayScore = 0; awayScore <= MAX_SCORE; awayScore += 1) {
      const probability = homeProbability * poissonProbability(awayScore, awayExpected);
      total += probability;
      if (homeScore > awayScore) home += probability;
      else if (awayScore > homeScore) away += probability;
      else draw += probability;
    }
  }

  if (total <= 0) return { home: 1 / 3, draw: 1 / 3, away: 1 / 3 };
  return { home: home / total, draw: draw / total, away: away / total };
}

function predictedOutcome(probabilities: Probabilities): Outcome {
  if (probabilities.draw >= probabilities.home && probabilities.draw >= probabilities.away) {
    return "DRAW";
  }
  return probabilities.home >= probabilities.away ? "HOME" : "AWAY";
}

function mostLikelyScoreForOutcome(input: {
  homeExpected: number;
  awayExpected: number;
  predictedOutcome: Outcome;
}) {
  let best: { home: number; away: number; probability: number } | null = null;

  for (let home = 0; home <= MAX_SCORE; home += 1) {
    for (let away = 0; away <= MAX_SCORE; away += 1) {
      if (outcome(home, away) !== input.predictedOutcome) continue;
      const probability =
        poissonProbability(home, input.homeExpected) *
        poissonProbability(away, input.awayExpected);
      if (!best || probability > best.probability) {
        best = { home, away, probability };
      }
    }
  }

  return best ?? { home: 0, away: 0 };
}

function emptyTeamStats(): TeamStats {
  return {
    played: 0,
    points: 0,
    goalsFor: 0,
    goalsAgainst: 0,
    recentGoalsFor: [],
    recentGoalsAgainst: [],
  };
}

function buildStats(history: WinChanceFixture[]) {
  const stats = new Map<string, TeamStats>();

  const get = (id: string) => {
    const existing = stats.get(id);
    if (existing) return existing;
    const created = emptyTeamStats();
    stats.set(id, created);
    return created;
  };

  const sorted = [...history].sort(
    (a, b) => new Date(a.kickoffAt ?? 0).getTime() - new Date(b.kickoffAt ?? 0).getTime(),
  );

  for (const fixture of sorted) {
    if (!fixture.result) continue;
    const home = get(fixture.homeTeam.id);
    const away = get(fixture.awayTeam.id);

    home.played += 1;
    away.played += 1;
    home.goalsFor += fixture.result.homeScore;
    home.goalsAgainst += fixture.result.awayScore;
    away.goalsFor += fixture.result.awayScore;
    away.goalsAgainst += fixture.result.homeScore;
    home.recentGoalsFor.push(fixture.result.homeScore);
    home.recentGoalsAgainst.push(fixture.result.awayScore);
    away.recentGoalsFor.push(fixture.result.awayScore);
    away.recentGoalsAgainst.push(fixture.result.homeScore);

    if (fixture.result.homeScore > fixture.result.awayScore) home.points += 3;
    else if (fixture.result.awayScore > fixture.result.homeScore) away.points += 3;
    else {
      home.points += 1;
      away.points += 1;
    }
  }

  return stats;
}

function leagueAverages(stats: Map<string, TeamStats>) {
  let games = 0;
  let points = 0;
  let goals = 0;

  for (const team of stats.values()) {
    games += team.played;
    points += team.points;
    goals += team.goalsFor;
  }

  return {
    pointsPerGame: games > 0 ? points / games : 1.5,
    goalsPerTeamGame: games > 0 ? goals / games : 3.5,
  };
}

function weightedRecent(values: number[], fallback: number) {
  const recent = values.slice(-5);
  if (recent.length === 0) return fallback;
  let total = 0;
  let weightTotal = 0;
  recent.forEach((value, index) => {
    const weight = index + 1;
    total += value * weight;
    weightTotal += weight;
  });
  return total / weightTotal;
}

function smoothedRate(total: number, played: number, leagueAverage: number, priorGames = 1) {
  return (total + leagueAverage * priorGames) / (played + priorGames);
}

function buildEloRatings(history: WinChanceFixture[]) {
  const ratings = new Map<string, number>();
  const get = (id: string) => ratings.get(id) ?? 1500;

  const sorted = [...history].sort(
    (a, b) => new Date(a.kickoffAt ?? 0).getTime() - new Date(b.kickoffAt ?? 0).getTime(),
  );

  for (const fixture of sorted) {
    if (!fixture.result) continue;
    const homeRating = get(fixture.homeTeam.id);
    const awayRating = get(fixture.awayTeam.id);
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

function eloProbabilities(homeRating: number, awayRating: number): Probabilities {
  const difference = homeRating - awayRating;
  const noDrawHome = 1 / (1 + Math.pow(10, -difference / 400));
  const draw = clamp(0.27 - Math.abs(difference) / 950, 0.11, 0.27);
  const remaining = 1 - draw;
  return {
    home: remaining * noDrawHome,
    draw,
    away: remaining * (1 - noDrawHome),
  };
}

function ppgPrediction(input: {
  homeStats: TeamStats | undefined;
  awayStats: TeamStats | undefined;
  leaguePpg: number;
}): ModelPrediction {
  const homePpg = input.homeStats?.played
    ? input.homeStats.points / input.homeStats.played
    : input.leaguePpg;
  const awayPpg = input.awayStats?.played
    ? input.awayStats.points / input.awayStats.played
    : input.leaguePpg;
  const difference = homePpg - awayPpg;

  return {
    outcome: difference > 0.14 ? "HOME" : difference < -0.14 ? "AWAY" : "DRAW",
  };
}

function eloPrediction(homeRating: number, awayRating: number): ModelPrediction {
  const difference = homeRating - awayRating;
  const probabilities = eloProbabilities(homeRating, awayRating);
  return {
    outcome:
      Math.abs(difference) < ELO_DRAW_THRESHOLD
        ? "DRAW"
        : difference > 0
          ? "HOME"
          : "AWAY",
    probabilities,
  };
}

function eloGoalsPrediction(input: {
  homeTeamId: string;
  awayTeamId: string;
  stats: Map<string, TeamStats>;
  ratings: Map<string, number>;
}): ModelPrediction {
  const home = input.stats.get(input.homeTeamId);
  const away = input.stats.get(input.awayTeamId);
  const averages = leagueAverages(input.stats);
  const leagueGoals = clamp(averages.goalsPerTeamGame, 1, 8.5);

  const homeSeasonAttack = smoothedRate(home?.goalsFor ?? 0, home?.played ?? 0, leagueGoals, 1);
  const awaySeasonAttack = smoothedRate(away?.goalsFor ?? 0, away?.played ?? 0, leagueGoals, 1);
  const homeSeasonConcede = smoothedRate(home?.goalsAgainst ?? 0, home?.played ?? 0, leagueGoals, 1);
  const awaySeasonConcede = smoothedRate(away?.goalsAgainst ?? 0, away?.played ?? 0, leagueGoals, 1);

  const homeRecentAttack = weightedRecent(home?.recentGoalsFor ?? [], homeSeasonAttack);
  const awayRecentAttack = weightedRecent(away?.recentGoalsFor ?? [], awaySeasonAttack);
  const homeRecentConcede = weightedRecent(home?.recentGoalsAgainst ?? [], homeSeasonConcede);
  const awayRecentConcede = weightedRecent(away?.recentGoalsAgainst ?? [], awaySeasonConcede);

  const homeAttack = homeSeasonAttack * 0.68 + homeRecentAttack * 0.32;
  const awayAttack = awaySeasonAttack * 0.68 + awayRecentAttack * 0.32;
  const homeConcede = homeSeasonConcede * 0.68 + homeRecentConcede * 0.32;
  const awayConcede = awaySeasonConcede * 0.68 + awayRecentConcede * 0.32;

  const homeRating = input.ratings.get(input.homeTeamId) ?? 1500;
  const awayRating = input.ratings.get(input.awayTeamId) ?? 1500;
  const eloDifference = clamp(homeRating - awayRating, -350, 350);
  const eloHomeMultiplier = Math.exp(eloDifference / 1150);
  const eloAwayMultiplier = Math.exp(-eloDifference / 1150);

  const homeExpected = clamp(
    leagueGoals *
      Math.pow(clamp(homeAttack / leagueGoals, 0.3, 3), 0.62) *
      Math.pow(clamp(awayConcede / leagueGoals, 0.3, 3), 0.38) *
      eloHomeMultiplier,
    0.35,
    10.5,
  );
  const awayExpected = clamp(
    leagueGoals *
      Math.pow(clamp(awayAttack / leagueGoals, 0.3, 3), 0.62) *
      Math.pow(clamp(homeConcede / leagueGoals, 0.3, 3), 0.38) *
      eloAwayMultiplier,
    0.35,
    10.5,
  );

  const probabilities = poissonOutcomeProbabilities(homeExpected, awayExpected);
  const predicted = predictedOutcome(probabilities);
  const score = mostLikelyScoreForOutcome({
    homeExpected,
    awayExpected,
    predictedOutcome: predicted,
  });

  return { outcome: predicted, probabilities, score };
}

function createConfusionMatrix(): OutcomeConfusionMatrix {
  return {
    HOME: { HOME: 0, DRAW: 0, AWAY: 0 },
    DRAW: { HOME: 0, DRAW: 0, AWAY: 0 },
    AWAY: { HOME: 0, DRAW: 0, AWAY: 0 },
  };
}

function createMethod(key: string, label: string, description: string): MutableMethod {
  return {
    key,
    label,
    description,
    calls: 0,
    correct: 0,
    exact: 0,
    scoredCalls: 0,
    totalGoalError: 0,
    predictedGoalsTotal: 0,
    actualGoalsTotal: 0,
    scorelineCounts: new Map<string, number>(),
    brierTotal: 0,
    brierCalls: 0,
    confidenceTotal: 0,
    calibrationBins: CALIBRATION_BUCKETS.map((bucket) => ({
      label: bucket.label,
      calls: 0,
      confidenceTotal: 0,
      correct: 0,
    })),
    confusionMatrix: createConfusionMatrix(),
  };
}

function initialiseMethods(): MutableMethod[] {
  return [
    createMethod(
      "sixfl",
      "Current SIXFL model",
      "The live opponent-adjusted Poisson model, replayed using only pre-kick-off history.",
    ),
    createMethod(
      "v3-score",
      "V3 score model · current result call",
      "Keeps the current home/draw/away probabilities exactly, but replaces the conditional Poisson mode with an overdispersed, pace-aware score model.",
    ),
    createMethod(
      "v3-full",
      "V3 outcome + score candidate",
      "Blends the current result probabilities with neutral-pitch Elo, points, goal difference, recent results and the observed SIXFL draw rate, then uses the V3 score model.",
    ),
    createMethod(
      "elo-goals",
      "Elo + goals candidate",
      "The existing candidate combining opponent-adjusted Elo strength with team scoring, conceding and recent goal rates.",
    ),
    createMethod(
      "ppg",
      "Better PPG baseline",
      "A deliberately simple baseline that calls the team with the better points-per-game record, with a narrow draw band.",
    ),
    createMethod(
      "elo",
      "Elo-only baseline",
      "A neutral-pitch Elo baseline updated after every available historical result, with a small draw band.",
    ),
  ];
}

function recordPrediction(input: {
  method: MutableMethod;
  prediction: ModelPrediction;
  actualOutcome: Outcome;
  actualHome: number;
  actualAway: number;
}) {
  input.method.calls += 1;
  const correct = input.prediction.outcome === input.actualOutcome;
  if (correct) input.method.correct += 1;
  input.method.confusionMatrix[input.actualOutcome][input.prediction.outcome] += 1;

  if (input.prediction.score) {
    input.method.scoredCalls += 1;
    if (
      input.prediction.score.home === input.actualHome &&
      input.prediction.score.away === input.actualAway
    ) {
      input.method.exact += 1;
    }
    input.method.totalGoalError +=
      Math.abs(input.prediction.score.home - input.actualHome) +
      Math.abs(input.prediction.score.away - input.actualAway);
    input.method.predictedGoalsTotal +=
      input.prediction.score.home + input.prediction.score.away;
    input.method.actualGoalsTotal += input.actualHome + input.actualAway;
    const scoreline = `${input.prediction.score.home}–${input.prediction.score.away}`;
    input.method.scorelineCounts.set(
      scoreline,
      (input.method.scorelineCounts.get(scoreline) ?? 0) + 1,
    );
  }

  if (input.prediction.probabilities) {
    const probabilities = normaliseProbabilities(input.prediction.probabilities);
    input.method.brierCalls += 1;
    input.method.brierTotal += brierScore(probabilities, input.actualOutcome);
    const confidence = Math.max(probabilities.home, probabilities.draw, probabilities.away);
    input.method.confidenceTotal += confidence;
    const bucketIndex = CALIBRATION_BUCKETS.findIndex(
      (bucket) => confidence >= bucket.min && confidence < bucket.max,
    );
    const bucket = input.method.calibrationBins[
      bucketIndex >= 0 ? bucketIndex : input.method.calibrationBins.length - 1
    ];
    bucket.calls += 1;
    bucket.confidenceTotal += confidence;
    if (correct) bucket.correct += 1;
  }
}

function toSummary(method: MutableMethod): PredictorBacktestMethod {
  const rankedScorelines = [...method.scorelineCounts.entries()]
    .map(([scoreline, count]) => ({
      scoreline,
      count,
      share: method.scoredCalls > 0 ? count / method.scoredCalls : 0,
    }))
    .sort((first, second) => second.count - first.count || first.scoreline.localeCompare(second.scoreline));
  const mostCommon = rankedScorelines[0] ?? null;
  const calibrationBins = method.calibrationBins.map((bin) => ({
    label: bin.label,
    calls: bin.calls,
    averageConfidence: bin.calls > 0 ? bin.confidenceTotal / bin.calls : null,
    accuracy: bin.calls > 0 ? bin.correct / bin.calls : null,
  }));
  const calibrationError =
    method.brierCalls > 0
      ? calibrationBins.reduce((total, bin) => {
          if (bin.calls === 0 || bin.averageConfidence === null || bin.accuracy === null) {
            return total;
          }
          return (
            total +
            (bin.calls / method.brierCalls) * Math.abs(bin.averageConfidence - bin.accuracy)
          );
        }, 0)
      : null;
  const averagePredictedGoals =
    method.scoredCalls > 0 ? method.predictedGoalsTotal / method.scoredCalls : null;
  const averageActualGoals =
    method.scoredCalls > 0 ? method.actualGoalsTotal / method.scoredCalls : null;

  return {
    key: method.key,
    label: method.label,
    description: method.description,
    calls: method.calls,
    correct: method.correct,
    accuracy: method.calls > 0 ? method.correct / method.calls : 0,
    exact: method.scoredCalls > 0 ? method.exact : null,
    exactAccuracy: method.scoredCalls > 0 ? method.exact / method.scoredCalls : null,
    averageGoalError:
      method.scoredCalls > 0 ? method.totalGoalError / method.scoredCalls : null,
    averagePredictedGoals,
    averageActualGoals,
    goalsBias:
      averagePredictedGoals !== null && averageActualGoals !== null
        ? averagePredictedGoals - averageActualGoals
        : null,
    distinctScorelines: method.scoredCalls > 0 ? method.scorelineCounts.size : null,
    mostCommonScoreline: mostCommon?.scoreline ?? null,
    mostCommonScorelineCount: mostCommon?.count ?? null,
    mostCommonScorelineShare: mostCommon?.share ?? null,
    topFourScorelineShare:
      method.scoredCalls > 0
        ? rankedScorelines.slice(0, 4).reduce((sum, item) => sum + item.count, 0) /
          method.scoredCalls
        : null,
    commonScorelines: rankedScorelines.slice(0, 8),
    brierScore: method.brierCalls > 0 ? method.brierTotal / method.brierCalls : null,
    averageConfidence:
      method.brierCalls > 0 ? method.confidenceTotal / method.brierCalls : null,
    calibrationError,
    calibrationBins,
    confusionMatrix: {
      HOME: { ...method.confusionMatrix.HOME },
      DRAW: { ...method.confusionMatrix.DRAW },
      AWAY: { ...method.confusionMatrix.AWAY },
    },
  };
}

function promotionAssessment(
  current: PredictorBacktestMethod,
  candidate: PredictorBacktestMethod,
): PredictorPromotionAssessment {
  const currentTopFourTarget =
    current.topFourScorelineShare === null
      ? null
      : Math.min(0.55, Math.max(0, current.topFourScorelineShare - 0.05));
  const distinctTarget =
    current.distinctScorelines === null ? null : current.distinctScorelines + 2;
  const goalErrorTarget =
    current.averageGoalError === null ? null : Math.max(0, current.averageGoalError - 0.05);
  const goalBiasTarget =
    current.goalsBias === null ? null : Math.max(0.15, Math.abs(current.goalsBias) - 0.05);
  const calibrationTarget =
    current.calibrationError === null ? null : current.calibrationError + 0.005;

  const checks: PredictorPromotionCheck[] = [
    {
      key: "accuracy",
      label: "Result accuracy does not fall",
      passed: candidate.accuracy + 1e-9 >= current.accuracy,
      currentValue: current.accuracy,
      candidateValue: candidate.accuracy,
      requiredValue: current.accuracy,
      direction: "higher",
    },
    {
      key: "brier",
      label: "Probability quality matches or improves",
      passed:
        candidate.brierScore !== null &&
        current.brierScore !== null &&
        candidate.brierScore <= current.brierScore + 0.0005,
      currentValue: current.brierScore,
      candidateValue: candidate.brierScore,
      requiredValue: current.brierScore,
      direction: "lower",
    },
    {
      key: "goal-error",
      label: "Average score error improves",
      passed:
        candidate.averageGoalError !== null &&
        goalErrorTarget !== null &&
        candidate.averageGoalError <= goalErrorTarget,
      currentValue: current.averageGoalError,
      candidateValue: candidate.averageGoalError,
      requiredValue: goalErrorTarget,
      direction: "lower",
    },
    {
      key: "goal-bias",
      label: "Average total-goals bias moves towards zero",
      passed:
        candidate.goalsBias !== null &&
        goalBiasTarget !== null &&
        Math.abs(candidate.goalsBias) <= goalBiasTarget,
      currentValue: current.goalsBias,
      candidateValue: candidate.goalsBias,
      requiredValue: goalBiasTarget,
      direction: "closer-to-zero",
    },
    {
      key: "top-four-share",
      label: "Top four scorelines stop dominating",
      passed:
        candidate.topFourScorelineShare !== null &&
        currentTopFourTarget !== null &&
        candidate.topFourScorelineShare <= currentTopFourTarget,
      currentValue: current.topFourScorelineShare,
      candidateValue: candidate.topFourScorelineShare,
      requiredValue: currentTopFourTarget,
      direction: "lower",
    },
    {
      key: "distinct-scorelines",
      label: "At least two more scorelines are used",
      passed:
        candidate.distinctScorelines !== null &&
        distinctTarget !== null &&
        candidate.distinctScorelines >= distinctTarget,
      currentValue: current.distinctScorelines,
      candidateValue: candidate.distinctScorelines,
      requiredValue: distinctTarget,
      direction: "higher",
    },
    {
      key: "calibration",
      label: "Confidence calibration does not materially worsen",
      passed:
        candidate.calibrationError !== null &&
        calibrationTarget !== null &&
        candidate.calibrationError <= calibrationTarget,
      currentValue: current.calibrationError,
      candidateValue: candidate.calibrationError,
      requiredValue: calibrationTarget,
      direction: "lower",
    },
  ];

  const passedChecks = checks.filter((check) => check.passed).length;
  return {
    candidateKey: candidate.key,
    candidateLabel: candidate.label,
    ready: passedChecks === checks.length,
    passedChecks,
    totalChecks: checks.length,
    checks,
  };
}

function scoreLabel(prediction: ModelPrediction) {
  return prediction.score
    ? `${prediction.score.home}–${prediction.score.away}`
    : prediction.outcome;
}

export function runPredictorBacktest(rows: PredictorBacktestRow[]): PredictorBacktestResult {
  const sorted = [...rows].sort(
    (a, b) => a.kickoffAt.getTime() - b.kickoffAt.getTime() || a.fixtureId.localeCompare(b.fixtureId),
  );
  const methods = initialiseMethods();
  const methodsByKey = new Map(methods.map((method) => [method.key, method]));
  const examples: PredictorBacktestExample[] = [];
  let eligibleFixtures = 0;
  let skippedTooEarly = 0;
  let draws = 0;

  for (const target of sorted) {
    const targetTime = target.kickoffAt.getTime();
    const leagueRows = sorted.filter(
      (row) =>
        row.leagueId === target.leagueId &&
        row.fixtureId !== target.fixtureId &&
        row.kickoffAt.getTime() < targetTime &&
        row.resultEnteredAt.getTime() < targetTime,
    );

    const history: WinChanceFixture[] = leagueRows.map((row) => ({
      kickoffAt: row.kickoffAt,
      status: "COMPLETED",
      homeTeam: {
        id: canonicalTeamId({
          leagueId: row.leagueId,
          teamId: row.homeTeamId,
          teamName: row.homeTeamName,
        }),
      },
      awayTeam: {
        id: canonicalTeamId({
          leagueId: row.leagueId,
          teamId: row.awayTeamId,
          teamName: row.awayTeamName,
        }),
      },
      result: { homeScore: row.actualHomeScore, awayScore: row.actualAwayScore },
    }));

    const homeTeamId = canonicalTeamId({
      leagueId: target.leagueId,
      teamId: target.homeTeamId,
      teamName: target.homeTeamName,
    });
    const awayTeamId = canonicalTeamId({
      leagueId: target.leagueId,
      teamId: target.awayTeamId,
      teamName: target.awayTeamName,
    });

    const current = calculateFixtureWinChance({ homeTeamId, awayTeamId, fixtures: history });
    if (current.predictedResult.label === "Too early") {
      skippedTooEarly += 1;
      continue;
    }

    eligibleFixtures += 1;
    const actual = outcome(target.actualHomeScore, target.actualAwayScore);
    if (actual === "DRAW") draws += 1;

    const currentProbabilities = normaliseProbabilities({
      home: percentageProbability(current.home),
      draw: percentageProbability(current.draw),
      away: percentageProbability(current.away),
    });
    const sixflPrediction: ModelPrediction = {
      outcome: predictedOutcome(currentProbabilities),
      probabilities: currentProbabilities,
      score: {
        home: current.predictedResult.homeScore,
        away: current.predictedResult.awayScore,
      },
    };
    const v3 = calculatePredictorV3Candidates({
      homeTeamId,
      awayTeamId,
      history,
      currentProbabilities,
    });
    const v3ScorePrediction: ModelPrediction = {
      outcome: v3.scoreOnly.outcome,
      probabilities: v3.scoreOnly.probabilities,
      score: v3.scoreOnly.score,
    };
    const v3FullPrediction: ModelPrediction = {
      outcome: v3.full.outcome,
      probabilities: v3.full.probabilities,
      score: v3.full.score,
    };

    const stats = buildStats(history);
    const averages = leagueAverages(stats);
    const ratings = buildEloRatings(history);
    const eloGoals = eloGoalsPrediction({ homeTeamId, awayTeamId, stats, ratings });
    const ppg = ppgPrediction({
      homeStats: stats.get(homeTeamId),
      awayStats: stats.get(awayTeamId),
      leaguePpg: averages.pointsPerGame,
    });
    const elo = eloPrediction(ratings.get(homeTeamId) ?? 1500, ratings.get(awayTeamId) ?? 1500);

    for (const [key, prediction] of [
      ["sixfl", sixflPrediction],
      ["v3-score", v3ScorePrediction],
      ["v3-full", v3FullPrediction],
      ["elo-goals", eloGoals],
      ["ppg", ppg],
      ["elo", elo],
    ] as const) {
      recordPrediction({
        method: methodsByKey.get(key)!,
        prediction,
        actualOutcome: actual,
        actualHome: target.actualHomeScore,
        actualAway: target.actualAwayScore,
      });
    }

    examples.push({
      fixtureId: target.fixtureId,
      leagueName: target.leagueName,
      kickoffAt: target.kickoffAt,
      fixture: `${target.homeTeamName} v ${target.awayTeamName}`,
      actual: `${target.actualHomeScore}–${target.actualAwayScore}`,
      sixfl: scoreLabel(sixflPrediction),
      v3Score: scoreLabel(v3ScorePrediction),
      v3Full: scoreLabel(v3FullPrediction),
      eloGoals: scoreLabel(eloGoals),
      ppg: ppg.outcome,
      elo: elo.outcome,
    });
  }

  const summaries = methods.map(toSummary);
  const best = summaries
    .filter((method) => method.calls > 0)
    .sort(
      (a, b) =>
        b.accuracy - a.accuracy ||
        (a.brierScore ?? 99) - (b.brierScore ?? 99) ||
        (a.averageGoalError ?? 99) - (b.averageGoalError ?? 99),
    )[0] ?? null;
  const currentSummary = summaries.find((method) => method.key === "sixfl") ?? null;
  const promotionAssessments = currentSummary
    ? summaries
        .filter((method) => method.key === "v3-score" || method.key === "v3-full")
        .map((candidate) => promotionAssessment(currentSummary, candidate))
    : [];
  const nonDrawRate = eligibleFixtures > 0 ? (eligibleFixtures - draws) / eligibleFixtures : 0;

  return {
    totalCompletedFixtures: sorted.length,
    eligibleFixtures,
    skippedTooEarly,
    draws,
    drawRate: eligibleFixtures > 0 ? draws / eligibleFixtures : 0,
    twoTeamCoinExpectedAccuracy: nonDrawRate * 0.5,
    methods: summaries,
    bestMethodKey: best?.key ?? null,
    bestMethodLabel: best?.label ?? null,
    bestAccuracy: best?.accuracy ?? null,
    promotionAssessments,
    examples: examples.slice(-20).reverse(),
  };
}
