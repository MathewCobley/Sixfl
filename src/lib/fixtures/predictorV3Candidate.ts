import type { WinChanceFixture } from "@/lib/fixtures/winChance";

export type PredictorV3Outcome = "HOME" | "DRAW" | "AWAY";

export type PredictorV3Probabilities = {
  home: number;
  draw: number;
  away: number;
};

export type PredictorV3Score = {
  home: number;
  away: number;
};

export type PredictorV3Prediction = {
  outcome: PredictorV3Outcome;
  probabilities: PredictorV3Probabilities;
  score: PredictorV3Score;
  expectedHomeGoals: number;
  expectedAwayGoals: number;
};

export type PredictorV3CandidateSet = {
  scoreOnly: PredictorV3Prediction;
  full: PredictorV3Prediction;
};

type TeamStats = {
  played: number;
  points: number;
  goalsFor: number;
  goalsAgainst: number;
  goalsForSamples: number[];
  goalsAgainstSamples: number[];
  resultPoints: number[];
  matchTotals: number[];
};

type LeagueProfile = {
  played: number;
  drawRate: number;
  pointsPerGame: number;
  goalsPerTeamGame: number;
  teamGoalSamples: number[];
  matchTotalSamples: number[];
};

type JointScoreCell = {
  home: number;
  away: number;
  probability: number;
};

const MAX_SCORE = 12;
const ELO_K = 30;
const SCORE_PRIOR_GAMES = 2.25;
const RECENT_WINDOW = 5;
const MIN_DISPERSION = 0.7;
const MAX_DISPERSION = 24;

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function normaliseProbabilities(input: PredictorV3Probabilities): PredictorV3Probabilities {
  const home = Math.max(0, input.home);
  const draw = Math.max(0, input.draw);
  const away = Math.max(0, input.away);
  const total = home + draw + away;

  if (!Number.isFinite(total) || total <= 0) {
    return { home: 1 / 3, draw: 1 / 3, away: 1 / 3 };
  }

  return {
    home: home / total,
    draw: draw / total,
    away: away / total,
  };
}

function outcomeFromProbabilities(probabilities: PredictorV3Probabilities): PredictorV3Outcome {
  if (probabilities.draw >= probabilities.home && probabilities.draw >= probabilities.away) {
    return "DRAW";
  }
  return probabilities.home >= probabilities.away ? "HOME" : "AWAY";
}

function scoreOutcome(home: number, away: number): PredictorV3Outcome {
  if (home > away) return "HOME";
  if (away > home) return "AWAY";
  return "DRAW";
}

function emptyStats(): TeamStats {
  return {
    played: 0,
    points: 0,
    goalsFor: 0,
    goalsAgainst: 0,
    goalsForSamples: [],
    goalsAgainstSamples: [],
    resultPoints: [],
    matchTotals: [],
  };
}

function buildStats(history: WinChanceFixture[]) {
  const stats = new Map<string, TeamStats>();
  const get = (teamId: string) => {
    const existing = stats.get(teamId);
    if (existing) return existing;
    const created = emptyStats();
    stats.set(teamId, created);
    return created;
  };

  const sorted = [...history].sort(
    (a, b) => new Date(a.kickoffAt ?? 0).getTime() - new Date(b.kickoffAt ?? 0).getTime(),
  );

  for (const fixture of sorted) {
    if (!fixture.result) continue;

    const home = get(fixture.homeTeam.id);
    const away = get(fixture.awayTeam.id);
    const totalGoals = fixture.result.homeScore + fixture.result.awayScore;

    home.played += 1;
    away.played += 1;
    home.goalsFor += fixture.result.homeScore;
    home.goalsAgainst += fixture.result.awayScore;
    away.goalsFor += fixture.result.awayScore;
    away.goalsAgainst += fixture.result.homeScore;
    home.goalsForSamples.push(fixture.result.homeScore);
    home.goalsAgainstSamples.push(fixture.result.awayScore);
    away.goalsForSamples.push(fixture.result.awayScore);
    away.goalsAgainstSamples.push(fixture.result.homeScore);
    home.matchTotals.push(totalGoals);
    away.matchTotals.push(totalGoals);

    if (fixture.result.homeScore > fixture.result.awayScore) {
      home.points += 3;
      home.resultPoints.push(3);
      away.resultPoints.push(0);
    } else if (fixture.result.awayScore > fixture.result.homeScore) {
      away.points += 3;
      home.resultPoints.push(0);
      away.resultPoints.push(3);
    } else {
      home.points += 1;
      away.points += 1;
      home.resultPoints.push(1);
      away.resultPoints.push(1);
    }
  }

  return stats;
}

function buildLeagueProfile(stats: Map<string, TeamStats>, history: WinChanceFixture[]): LeagueProfile {
  let teamGames = 0;
  let points = 0;
  let teamGoals = 0;
  let played = 0;
  let draws = 0;
  const teamGoalSamples: number[] = [];
  const matchTotalSamples: number[] = [];

  for (const team of stats.values()) {
    teamGames += team.played;
    points += team.points;
    teamGoals += team.goalsFor;
    teamGoalSamples.push(...team.goalsForSamples);
  }

  for (const fixture of history) {
    if (!fixture.result) continue;
    played += 1;
    if (fixture.result.homeScore === fixture.result.awayScore) draws += 1;
    matchTotalSamples.push(fixture.result.homeScore + fixture.result.awayScore);
  }

  return {
    played,
    drawRate: (draws + 1.2) / (played + 12),
    pointsPerGame: teamGames > 0 ? points / teamGames : 1.5,
    goalsPerTeamGame: teamGames > 0 ? teamGoals / teamGames : 3.25,
    teamGoalSamples,
    matchTotalSamples,
  };
}

function weightedRecent(values: number[], fallback: number) {
  const recent = values.slice(-RECENT_WINDOW);
  if (recent.length === 0) return fallback;

  let total = 0;
  let weightTotal = 0;
  recent.forEach((value, index) => {
    const weight = index + 1;
    total += value * weight;
    weightTotal += weight;
  });

  return weightTotal > 0 ? total / weightTotal : fallback;
}

function mean(values: number[], fallback: number) {
  if (values.length === 0) return fallback;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function sampleVariance(values: number[], fallback = 0) {
  if (values.length < 2) return fallback;
  const average = mean(values, 0);
  const squared = values.reduce((sum, value) => sum + Math.pow(value - average, 2), 0);
  return squared / (values.length - 1);
}

function smoothedRate(total: number, played: number, leagueAverage: number, priorGames = SCORE_PRIOR_GAMES) {
  return (total + leagueAverage * priorGames) / (played + priorGames);
}

function blendedRate(input: {
  total: number;
  played: number;
  recent: number[];
  leagueAverage: number;
}) {
  const season = smoothedRate(input.total, input.played, input.leagueAverage);
  const recent = weightedRecent(input.recent, season);
  const recentWeight = Math.min(0.38, (input.played / (input.played + 4)) * 0.5);
  return season * (1 - recentWeight) + recent * recentWeight;
}

function buildEloRatings(history: WinChanceFixture[]) {
  const ratings = new Map<string, number>();
  const get = (teamId: string) => ratings.get(teamId) ?? 1500;

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

function recentPointsPerGame(stats: TeamStats | undefined, fallback: number) {
  if (!stats) return fallback;
  return weightedRecent(stats.resultPoints, stats.played > 0 ? stats.points / stats.played : fallback);
}

function goalDifferencePerGame(stats: TeamStats | undefined) {
  if (!stats?.played) return 0;
  return (stats.goalsFor - stats.goalsAgainst) / stats.played;
}

function buildV3OutcomeProbabilities(input: {
  homeTeamId: string;
  awayTeamId: string;
  stats: Map<string, TeamStats>;
  profile: LeagueProfile;
  ratings: Map<string, number>;
  currentProbabilities: PredictorV3Probabilities;
}) {
  const current = normaliseProbabilities(input.currentProbabilities);
  const home = input.stats.get(input.homeTeamId);
  const away = input.stats.get(input.awayTeamId);

  const homePpg = home?.played ? home.points / home.played : input.profile.pointsPerGame;
  const awayPpg = away?.played ? away.points / away.played : input.profile.pointsPerGame;
  const ppgSignal = clamp((homePpg - awayPpg) / 0.9, -2.2, 2.2);

  const recentSignal = clamp(
    (recentPointsPerGame(home, input.profile.pointsPerGame) -
      recentPointsPerGame(away, input.profile.pointsPerGame)) /
      1.05,
    -2.2,
    2.2,
  );
  const goalDifferenceSignal = clamp(
    (goalDifferencePerGame(home) - goalDifferencePerGame(away)) / 3.2,
    -2.2,
    2.2,
  );
  const eloDifference = clamp(
    (input.ratings.get(input.homeTeamId) ?? 1500) -
      (input.ratings.get(input.awayTeamId) ?? 1500),
    -400,
    400,
  );
  const eloSignal = eloDifference / 190;

  const strengthSignal = clamp(
    ppgSignal * 0.28 + recentSignal * 0.18 + goalDifferenceSignal * 0.22 + eloSignal * 0.32,
    -2.8,
    2.8,
  );
  const structuralHomeShare = 1 / (1 + Math.exp(-strengthSignal));
  const leastExperienced = Math.min(home?.played ?? 0, away?.played ?? 0);
  const evidence = leastExperienced / (leastExperienced + 4);
  const structuralWeight = 0.3 + evidence * 0.2;

  const currentNoDrawTotal = Math.max(current.home + current.away, 0.0001);
  const currentHomeShare = current.home / currentNoDrawTotal;
  const homeShare = clamp(
    currentHomeShare * (1 - structuralWeight) + structuralHomeShare * structuralWeight,
    0.04,
    0.96,
  );

  const empiricalDraw = clamp(input.profile.drawRate, 0.07, 0.18);
  const structuralDraw = clamp(empiricalDraw * Math.exp(-Math.abs(strengthSignal) * 0.2), 0.055, 0.18);
  const draw = clamp(current.draw * 0.35 + structuralDraw * 0.65, 0.055, 0.2);
  const remaining = 1 - draw;

  return normaliseProbabilities({
    home: remaining * homeShare,
    draw,
    away: remaining * (1 - homeShare),
  });
}

function estimateDispersion(expectedGoals: number, samples: number[]) {
  if (samples.length < 4) return 5;
  const variance = sampleVariance(samples, expectedGoals);
  if (variance <= expectedGoals + 0.05) return MAX_DISPERSION;
  return clamp(
    Math.pow(expectedGoals, 2) / Math.max(variance - expectedGoals, 0.05),
    MIN_DISPERSION,
    MAX_DISPERSION,
  );
}

function logFactorial(value: number) {
  let total = 0;
  for (let index = 2; index <= value; index += 1) total += Math.log(index);
  return total;
}

function logGamma(value: number): number {
  const coefficients = [
    676.5203681218851,
    -1259.1392167224028,
    771.3234287776531,
    -176.6150291621406,
    12.507343278686905,
    -0.13857109526572012,
    9.984369578019572e-6,
    1.5056327351493116e-7,
  ];

  if (value < 0.5) {
    return Math.log(Math.PI) - Math.log(Math.sin(Math.PI * value)) - logGamma(1 - value);
  }

  const adjusted = value - 1;
  let series = 0.9999999999998099;
  coefficients.forEach((coefficient, index) => {
    series += coefficient / (adjusted + index + 1);
  });
  const shifted = adjusted + coefficients.length - 0.5;

  return (
    0.5 * Math.log(2 * Math.PI) +
    (adjusted + 0.5) * Math.log(shifted) -
    shifted +
    Math.log(series)
  );
}

function negativeBinomialProbability(score: number, expectedGoals: number, dispersion: number) {
  const meanGoals = Math.max(expectedGoals, 0.01);
  const shape = clamp(dispersion, MIN_DISPERSION, MAX_DISPERSION);
  const successProbability = shape / (shape + meanGoals);
  const logProbability =
    logGamma(score + shape) -
    logGamma(shape) -
    logFactorial(score) +
    shape * Math.log(successProbability) +
    score * Math.log(1 - successProbability);

  return Math.exp(logProbability);
}

function buildScoreGrid(input: {
  homeExpected: number;
  awayExpected: number;
  homeDispersion: number;
  awayDispersion: number;
  paceSpread: number;
}) {
  const spread = clamp(input.paceSpread, 0.12, 0.5);
  const paceStates = [
    { multiplier: clamp(1 - spread, 0.52, 0.9), weight: 0.24 },
    { multiplier: 1, weight: 0.52 },
    { multiplier: clamp(1 + spread, 1.1, 1.75), weight: 0.24 },
  ];
  const cells: JointScoreCell[] = [];
  let total = 0;

  for (let home = 0; home <= MAX_SCORE; home += 1) {
    for (let away = 0; away <= MAX_SCORE; away += 1) {
      let probability = 0;
      for (const state of paceStates) {
        probability +=
          state.weight *
          negativeBinomialProbability(
            home,
            input.homeExpected * state.multiplier,
            input.homeDispersion,
          ) *
          negativeBinomialProbability(
            away,
            input.awayExpected * state.multiplier,
            input.awayDispersion,
          );
      }
      cells.push({ home, away, probability });
      total += probability;
    }
  }

  if (total <= 0) return cells;
  return cells.map((cell) => ({ ...cell, probability: cell.probability / total }));
}

function enforceOutcome(score: PredictorV3Score, predictedOutcome: PredictorV3Outcome) {
  let home = clamp(Math.round(score.home), 0, MAX_SCORE);
  let away = clamp(Math.round(score.away), 0, MAX_SCORE);

  if (predictedOutcome === "DRAW") {
    const level = clamp(Math.round((home + away) / 2), 0, MAX_SCORE);
    return { home: level, away: level };
  }

  if (predictedOutcome === "HOME" && home <= away) {
    if (home < MAX_SCORE) home = away + 1;
    else away = Math.max(0, home - 1);
  }

  if (predictedOutcome === "AWAY" && away <= home) {
    if (away < MAX_SCORE) away = home + 1;
    else home = Math.max(0, away - 1);
  }

  return { home, away };
}

function conditionalCentralScore(cells: JointScoreCell[], predictedOutcome: PredictorV3Outcome) {
  const matching = cells.filter((cell) => scoreOutcome(cell.home, cell.away) === predictedOutcome);
  const mass = matching.reduce((sum, cell) => sum + cell.probability, 0);

  if (mass <= 0 || matching.length === 0) return null;

  const expectedHome = matching.reduce(
    (sum, cell) => sum + cell.home * cell.probability,
    0,
  ) / mass;
  const expectedAway = matching.reduce(
    (sum, cell) => sum + cell.away * cell.probability,
    0,
  ) / mass;
  const expectedTotal = expectedHome + expectedAway;
  const maxProbability = Math.max(...matching.map((cell) => cell.probability), 1e-12);

  const best = [...matching].sort((first, second) => {
    const cost = (cell: JointScoreCell) => {
      const distance =
        Math.pow(cell.home - expectedHome, 2) +
        Math.pow(cell.away - expectedAway, 2) +
        Math.pow(cell.home + cell.away - expectedTotal, 2) * 0.2;
      const probabilityPenalty =
        -Math.log(Math.max(cell.probability / maxProbability, 1e-12)) * 0.14;
      return distance + probabilityPenalty;
    };

    return cost(first) - cost(second) || second.probability - first.probability;
  })[0];

  return best ? { home: best.home, away: best.away } : null;
}

function expectedGoalsAndGrid(input: {
  homeTeamId: string;
  awayTeamId: string;
  stats: Map<string, TeamStats>;
  profile: LeagueProfile;
  probabilities: PredictorV3Probabilities;
}) {
  const home = input.stats.get(input.homeTeamId);
  const away = input.stats.get(input.awayTeamId);
  const leagueGoals = clamp(input.profile.goalsPerTeamGame, 0.75, 8.5);
  const leagueTotal = leagueGoals * 2;

  const homeAttack = blendedRate({
    total: home?.goalsFor ?? 0,
    played: home?.played ?? 0,
    recent: home?.goalsForSamples ?? [],
    leagueAverage: leagueGoals,
  });
  const awayAttack = blendedRate({
    total: away?.goalsFor ?? 0,
    played: away?.played ?? 0,
    recent: away?.goalsForSamples ?? [],
    leagueAverage: leagueGoals,
  });
  const homeConceding = blendedRate({
    total: home?.goalsAgainst ?? 0,
    played: home?.played ?? 0,
    recent: home?.goalsAgainstSamples ?? [],
    leagueAverage: leagueGoals,
  });
  const awayConceding = blendedRate({
    total: away?.goalsAgainst ?? 0,
    played: away?.played ?? 0,
    recent: away?.goalsAgainstSamples ?? [],
    leagueAverage: leagueGoals,
  });

  const rawHome =
    leagueGoals *
    Math.pow(clamp(homeAttack / leagueGoals, 0.25, 3.2), 0.6) *
    Math.pow(clamp(awayConceding / leagueGoals, 0.25, 3.2), 0.4);
  const rawAway =
    leagueGoals *
    Math.pow(clamp(awayAttack / leagueGoals, 0.25, 3.2), 0.6) *
    Math.pow(clamp(homeConceding / leagueGoals, 0.25, 3.2), 0.4);

  const homeSeasonPace = smoothedRate(
    (home?.matchTotals ?? []).reduce((sum, value) => sum + value, 0),
    home?.played ?? 0,
    leagueTotal,
    3,
  );
  const awaySeasonPace = smoothedRate(
    (away?.matchTotals ?? []).reduce((sum, value) => sum + value, 0),
    away?.played ?? 0,
    leagueTotal,
    3,
  );
  const homePace =
    homeSeasonPace * 0.65 + weightedRecent(home?.matchTotals ?? [], homeSeasonPace) * 0.35;
  const awayPace =
    awaySeasonPace * 0.65 + weightedRecent(away?.matchTotals ?? [], awaySeasonPace) * 0.35;
  const targetTotal = clamp(
    leagueTotal * 0.34 + homePace * 0.33 + awayPace * 0.33,
    1.4,
    16,
  );

  const rawTotal = Math.max(rawHome + rawAway, 0.01);
  let homeExpected = (rawHome / rawTotal) * targetTotal;
  let awayExpected = (rawAway / rawTotal) * targetTotal;
  const strengthShift = clamp(
    (input.probabilities.home - input.probabilities.away) * 0.95,
    -0.75,
    0.75,
  );
  homeExpected = Math.max(0.25, homeExpected + strengthShift);
  awayExpected = Math.max(0.25, awayExpected - strengthShift);

  const adjustedTotal = homeExpected + awayExpected;
  const totalScale = targetTotal / Math.max(adjustedTotal, 0.01);
  homeExpected = clamp(homeExpected * totalScale, 0.25, 11.5);
  awayExpected = clamp(awayExpected * totalScale, 0.25, 11.5);

  const leagueDispersion = estimateDispersion(leagueGoals, input.profile.teamGoalSamples);
  const homeSamples = [
    ...(home?.goalsForSamples ?? []),
    ...(away?.goalsAgainstSamples ?? []),
  ];
  const awaySamples = [
    ...(away?.goalsForSamples ?? []),
    ...(home?.goalsAgainstSamples ?? []),
  ];
  const homeDispersion = clamp(
    estimateDispersion(homeExpected, homeSamples) * 0.65 + leagueDispersion * 0.35,
    MIN_DISPERSION,
    MAX_DISPERSION,
  );
  const awayDispersion = clamp(
    estimateDispersion(awayExpected, awaySamples) * 0.65 + leagueDispersion * 0.35,
    MIN_DISPERSION,
    MAX_DISPERSION,
  );
  const totalMean = mean(input.profile.matchTotalSamples, targetTotal);
  const totalVariance = sampleVariance(input.profile.matchTotalSamples, targetTotal);
  const relativeSpread =
    totalMean > 0 ? Math.sqrt(Math.max(totalVariance, 0)) / totalMean : 0.3;
  const paceSpread = clamp(relativeSpread * 0.58, 0.14, 0.48);

  return {
    homeExpected,
    awayExpected,
    cells: buildScoreGrid({
      homeExpected,
      awayExpected,
      homeDispersion,
      awayDispersion,
      paceSpread,
    }),
  };
}

function buildV3Prediction(input: {
  homeTeamId: string;
  awayTeamId: string;
  stats: Map<string, TeamStats>;
  profile: LeagueProfile;
  probabilities: PredictorV3Probabilities;
}) {
  const probabilities = normaliseProbabilities(input.probabilities);
  const predictedOutcome = outcomeFromProbabilities(probabilities);
  const scoreModel = expectedGoalsAndGrid({
    homeTeamId: input.homeTeamId,
    awayTeamId: input.awayTeamId,
    stats: input.stats,
    profile: input.profile,
    probabilities,
  });
  const score = enforceOutcome(
    conditionalCentralScore(scoreModel.cells, predictedOutcome) ?? {
      home: scoreModel.homeExpected,
      away: scoreModel.awayExpected,
    },
    predictedOutcome,
  );

  return {
    outcome: predictedOutcome,
    probabilities,
    score,
    expectedHomeGoals: scoreModel.homeExpected,
    expectedAwayGoals: scoreModel.awayExpected,
  } satisfies PredictorV3Prediction;
}

export function calculatePredictorV3Candidates(input: {
  homeTeamId: string;
  awayTeamId: string;
  history: WinChanceFixture[];
  currentProbabilities: PredictorV3Probabilities;
}): PredictorV3CandidateSet {
  const stats = buildStats(input.history);
  const profile = buildLeagueProfile(stats, input.history);
  const ratings = buildEloRatings(input.history);
  const currentProbabilities = normaliseProbabilities(input.currentProbabilities);
  const fullProbabilities = buildV3OutcomeProbabilities({
    homeTeamId: input.homeTeamId,
    awayTeamId: input.awayTeamId,
    stats,
    profile,
    ratings,
    currentProbabilities,
  });

  return {
    scoreOnly: buildV3Prediction({
      homeTeamId: input.homeTeamId,
      awayTeamId: input.awayTeamId,
      stats,
      profile,
      probabilities: currentProbabilities,
    }),
    full: buildV3Prediction({
      homeTeamId: input.homeTeamId,
      awayTeamId: input.awayTeamId,
      stats,
      profile,
      probabilities: fullProbabilities,
    }),
  };
}
