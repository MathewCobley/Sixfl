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

type Outcome = "HOME" | "DRAW" | "AWAY";

type Probabilities = {
  home: number;
  draw: number;
  away: number;
};

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

type MutableMethod = {
  key: string;
  label: string;
  description: string;
  calls: number;
  correct: number;
  exact: number;
  scoredCalls: number;
  totalGoalError: number;
  brierTotal: number;
  brierCalls: number;
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
  brierScore: number | null;
};

export type PredictorBacktestExample = {
  fixtureId: string;
  leagueName: string;
  kickoffAt: Date;
  fixture: string;
  actual: string;
  sixfl: string;
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
  examples: PredictorBacktestExample[];
};

const MAX_SCORE = 12;
const ELO_K = 30;
const ELO_DRAW_THRESHOLD = 34;

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

function initialiseMethods(): MutableMethod[] {
  return [
    {
      key: "sixfl",
      label: "Current SIXFL model",
      description: "The live hand-weighted strength model with the current goal model, replayed using only pre-kick-off history.",
      calls: 0,
      correct: 0,
      exact: 0,
      scoredCalls: 0,
      totalGoalError: 0,
      brierTotal: 0,
      brierCalls: 0,
    },
    {
      key: "elo-goals",
      label: "Elo + goals candidate",
      description: "A candidate model combining opponent-adjusted Elo strength with team scoring, conceding and recent goal rates.",
      calls: 0,
      correct: 0,
      exact: 0,
      scoredCalls: 0,
      totalGoalError: 0,
      brierTotal: 0,
      brierCalls: 0,
    },
    {
      key: "ppg",
      label: "Better PPG baseline",
      description: "A deliberately simple baseline that calls the team with the better points-per-game record, with a narrow draw band.",
      calls: 0,
      correct: 0,
      exact: 0,
      scoredCalls: 0,
      totalGoalError: 0,
      brierTotal: 0,
      brierCalls: 0,
    },
    {
      key: "elo",
      label: "Elo-only baseline",
      description: "A neutral-pitch Elo baseline updated after every available historical result, with a small draw band.",
      calls: 0,
      correct: 0,
      exact: 0,
      scoredCalls: 0,
      totalGoalError: 0,
      brierTotal: 0,
      brierCalls: 0,
    },
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
  if (input.prediction.outcome === input.actualOutcome) input.method.correct += 1;

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
  }

  if (input.prediction.probabilities) {
    input.method.brierCalls += 1;
    input.method.brierTotal += brierScore(input.prediction.probabilities, input.actualOutcome);
  }
}

function toSummary(method: MutableMethod): PredictorBacktestMethod {
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
    brierScore: method.brierCalls > 0 ? method.brierTotal / method.brierCalls : null,
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

    const stats = buildStats(history);
    const averages = leagueAverages(stats);
    const ratings = buildEloRatings(history);

    const sixflPrediction: ModelPrediction = {
      outcome: predictedOutcome({
        home: percentageProbability(current.home),
        draw: percentageProbability(current.draw),
        away: percentageProbability(current.away),
      }),
      probabilities: {
        home: percentageProbability(current.home),
        draw: percentageProbability(current.draw),
        away: percentageProbability(current.away),
      },
      score: {
        home: current.predictedResult.homeScore,
        away: current.predictedResult.awayScore,
      },
    };

    const candidate = eloGoalsPrediction({ homeTeamId, awayTeamId, stats, ratings });
    const ppg = ppgPrediction({
      homeStats: stats.get(homeTeamId),
      awayStats: stats.get(awayTeamId),
      leaguePpg: averages.pointsPerGame,
    });
    const elo = eloPrediction(ratings.get(homeTeamId) ?? 1500, ratings.get(awayTeamId) ?? 1500);

    recordPrediction({
      method: methodsByKey.get("sixfl")!,
      prediction: sixflPrediction,
      actualOutcome: actual,
      actualHome: target.actualHomeScore,
      actualAway: target.actualAwayScore,
    });
    recordPrediction({
      method: methodsByKey.get("elo-goals")!,
      prediction: candidate,
      actualOutcome: actual,
      actualHome: target.actualHomeScore,
      actualAway: target.actualAwayScore,
    });
    recordPrediction({
      method: methodsByKey.get("ppg")!,
      prediction: ppg,
      actualOutcome: actual,
      actualHome: target.actualHomeScore,
      actualAway: target.actualAwayScore,
    });
    recordPrediction({
      method: methodsByKey.get("elo")!,
      prediction: elo,
      actualOutcome: actual,
      actualHome: target.actualHomeScore,
      actualAway: target.actualAwayScore,
    });

    examples.push({
      fixtureId: target.fixtureId,
      leagueName: target.leagueName,
      kickoffAt: target.kickoffAt,
      fixture: `${target.homeTeamName} v ${target.awayTeamName}`,
      actual: `${target.actualHomeScore}–${target.actualAwayScore}`,
      sixfl: scoreLabel(sixflPrediction),
      eloGoals: scoreLabel(candidate),
      ppg: ppg.outcome,
      elo: elo.outcome,
    });
  }

  const summaries = methods.map(toSummary);
  const best = summaries
    .filter((method) => method.calls > 0)
    .sort((a, b) => b.accuracy - a.accuracy || (a.brierScore ?? 99) - (b.brierScore ?? 99))[0] ?? null;
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
    examples: examples.slice(-20).reverse(),
  };
}
