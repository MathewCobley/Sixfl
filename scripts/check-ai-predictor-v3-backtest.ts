import assert from "node:assert/strict";
import fs from "node:fs";

import {
  calculatePredictorV3Candidates,
  type PredictorV3Prediction,
} from "../src/lib/fixtures/predictorV3Candidate";
import {
  runPredictorBacktest,
  type PredictorBacktestRow,
} from "../src/lib/fixtures/predictorBacktest";
import type { WinChanceFixture } from "../src/lib/fixtures/winChance";

function game(
  homeTeamId: string,
  awayTeamId: string,
  homeScore: number,
  awayScore: number,
  day: number,
): WinChanceFixture {
  return {
    kickoffAt: new Date(Date.UTC(2026, 0, day, 20, 0, 0)),
    status: "COMPLETED",
    homeTeam: { id: homeTeamId },
    awayTeam: { id: awayTeamId },
    result: { homeScore, awayScore },
  };
}

function predictionOutcome(prediction: PredictorV3Prediction) {
  if (prediction.score.home > prediction.score.away) return "HOME";
  if (prediction.score.away > prediction.score.home) return "AWAY";
  return "DRAW";
}

function strongestOutcome(prediction: PredictorV3Prediction) {
  if (
    prediction.probabilities.draw >= prediction.probabilities.home &&
    prediction.probabilities.draw >= prediction.probabilities.away
  ) {
    return "DRAW";
  }
  return prediction.probabilities.home >= prediction.probabilities.away ? "HOME" : "AWAY";
}

const currentProbabilities = { home: 0.52, draw: 0.13, away: 0.35 };
const lowScoringHistory: WinChanceFixture[] = [
  game("A", "C", 1, 0, 1),
  game("D", "A", 1, 1, 2),
  game("B", "C", 0, 1, 3),
  game("D", "B", 1, 0, 4),
  game("A", "D", 2, 1, 5),
  game("C", "B", 0, 0, 6),
];
const highScoringHistory: WinChanceFixture[] = [
  game("A", "C", 8, 5, 1),
  game("D", "A", 5, 7, 2),
  game("B", "C", 6, 6, 3),
  game("D", "B", 7, 5, 4),
  game("A", "D", 9, 4, 5),
  game("C", "B", 4, 8, 6),
];

const lowScoring = calculatePredictorV3Candidates({
  homeTeamId: "A",
  awayTeamId: "B",
  history: lowScoringHistory,
  currentProbabilities,
});
const highScoring = calculatePredictorV3Candidates({
  homeTeamId: "A",
  awayTeamId: "B",
  history: highScoringHistory,
  currentProbabilities,
});
const highScoringRepeat = calculatePredictorV3Candidates({
  homeTeamId: "A",
  awayTeamId: "B",
  history: highScoringHistory,
  currentProbabilities,
});

assert.deepEqual(
  lowScoring.scoreOnly.probabilities,
  currentProbabilities,
  "The score-only candidate must preserve the live result probabilities exactly.",
);
assert.equal(
  predictionOutcome(lowScoring.scoreOnly),
  strongestOutcome(lowScoring.scoreOnly),
  "The V3 score must agree with its result call.",
);
assert.equal(
  predictionOutcome(highScoring.full),
  strongestOutcome(highScoring.full),
  "The full V3 score must agree with its result call.",
);
assert.ok(
  highScoring.scoreOnly.score.home + highScoring.scoreOnly.score.away >
    lowScoring.scoreOnly.score.home + lowScoring.scoreOnly.score.away,
  "High- and low-scoring environments must not collapse to the same central score family.",
);
assert.notDeepEqual(
  highScoring.scoreOnly.score,
  lowScoring.scoreOnly.score,
  "Different scoring environments must produce different V3 scorelines.",
);
assert.deepEqual(
  highScoring,
  highScoringRepeat,
  "The V3 candidate must be deterministic and must not add cosmetic randomness.",
);
assert.ok(
  Math.abs(
    highScoring.full.probabilities.home +
      highScoring.full.probabilities.draw +
      highScoring.full.probabilities.away -
      1,
  ) < 1e-9,
  "V3 outcome probabilities must sum to one.",
);

const scorePattern = [
  [6, 2],
  [2, 5],
  [4, 4],
  [7, 3],
  [5, 1],
  [2, 6],
  [3, 2],
  [1, 4],
  [8, 5],
  [0, 2],
  [5, 5],
  [6, 3],
] as const;
const pairPattern = [
  ["A", "B"],
  ["C", "D"],
  ["A", "C"],
  ["B", "D"],
  ["A", "D"],
  ["B", "C"],
] as const;

const rows: PredictorBacktestRow[] = Array.from({ length: 36 }, (_, index) => {
  const pair = pairPattern[index % pairPattern.length];
  const score = scorePattern[index % scorePattern.length];
  const kickoffAt = new Date(Date.UTC(2026, 1, index + 1, 20, 0, 0));
  return {
    fixtureId: `fixture-${index + 1}`,
    leagueId: "league-test",
    leagueName: "Test League",
    kickoffAt,
    resultEnteredAt: new Date(kickoffAt.getTime() + 60 * 60 * 1000),
    homeTeamId: pair[0],
    homeTeamName: `Team ${pair[0]}`,
    awayTeamId: pair[1],
    awayTeamName: `Team ${pair[1]}`,
    actualHomeScore: score[0],
    actualAwayScore: score[1],
  };
});

const backtest = runPredictorBacktest(rows);
const current = backtest.methods.find((method) => method.key === "sixfl");
const v3Score = backtest.methods.find((method) => method.key === "v3-score");
const v3Full = backtest.methods.find((method) => method.key === "v3-full");

if (!current || !v3Score || !v3Full) {
  throw new Error("Both V3 candidates must be present in the back-test.");
}
assert.equal(v3Score.calls, current.calls);
assert.equal(
  v3Score.correct,
  current.correct,
  "The score-only candidate must isolate score changes by preserving every current result call.",
);
assert.ok(
  current.brierScore !== null &&
    v3Score.brierScore !== null &&
    Math.abs(v3Score.brierScore - current.brierScore) < 1e-12,
  "The score-only candidate must preserve current probability quality exactly.",
);
assert.ok(v3Score.averagePredictedGoals !== null);
assert.ok(v3Score.averageActualGoals !== null);
assert.ok(v3Score.distinctScorelines !== null);
assert.ok(v3Score.topFourScorelineShare !== null);
assert.ok(v3Score.calibrationError !== null);
assert.equal(
  v3Full.calibrationBins.reduce((total, bin) => total + bin.calls, 0),
  v3Full.calls,
  "Every probabilistic V3 call must be included in calibration monitoring.",
);
assert.equal(
  Object.values(v3Full.confusionMatrix).reduce(
    (total, row) => total + Object.values(row).reduce((sum, value) => sum + value, 0),
    0,
  ),
  v3Full.calls,
  "The V3 confusion matrix must account for every call.",
);
assert.deepEqual(
  backtest.promotionAssessments.map((assessment) => assessment.candidateKey).sort(),
  ["v3-full", "v3-score"],
  "Both V3 candidates must be assessed against the live control before promotion.",
);
assert.ok(backtest.examples.every((example) => example.v3Score && example.v3Full));

const integritySource = fs.readFileSync("src/lib/fixtures/aiPredictionIntegrity.ts", "utf8");
const storedPredictionSource = fs.readFileSync(
  "src/lib/fixtures/storedAiPredictions.ts",
  "utf8",
);
const pageSource = fs.readFileSync(
  "src/app/(admin)/admin/ai-predictor/backtest/page.tsx",
  "utf8",
);

assert.match(integritySource, /opponent-adjusted-poisson-v2/);
assert.doesNotMatch(
  storedPredictionSource,
  /predictorV3Candidate/,
  "The laboratory candidate must not silently replace live stored predictions.",
);
assert.match(pageSource, /Laboratory only:/);
assert.match(pageSource, /does not rewrite stored predictions/);

console.log("AI Predictor V3 laboratory contract passed.");
