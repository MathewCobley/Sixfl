import assert from "node:assert/strict";

import {
  calculateFixtureWinChance,
  type WinChanceFixture,
} from "../src/lib/fixtures/winChance";

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

function predictedOutcome(prediction: ReturnType<typeof calculateFixtureWinChance>) {
  if (prediction.predictedResult.homeScore > prediction.predictedResult.awayScore) return "home";
  if (prediction.predictedResult.awayScore > prediction.predictedResult.homeScore) return "away";
  return "draw";
}

function strongestOutcome(prediction: ReturnType<typeof calculateFixtureWinChance>) {
  if (prediction.draw >= prediction.home && prediction.draw >= prediction.away) return "draw";
  return prediction.home >= prediction.away ? "home" : "away";
}

const noHistory = calculateFixtureWinChance({
  homeTeamId: "A",
  awayTeamId: "B",
  fixtures: [],
});
assert.equal(noHistory.predictedResult.label, "Too early");

// A and B have the same raw record, goals for and goals against. The distinguishing
// evidence is who produced those results against the shared opponent C. A hammered
// C; B lost heavily to C. Their compensating opposite results came against different
// opponents, so common-opponent/opponent-quality analysis should favour A over B.
const commonOpponentHistory: WinChanceFixture[] = [
  game("A", "C", 6, 1, 1),
  game("X", "A", 6, 1, 2),
  game("B", "C", 1, 6, 3),
  game("B", "Y", 6, 1, 4),
  game("C", "Z", 5, 2, 5),
];
const commonOpponentPrediction = calculateFixtureWinChance({
  homeTeamId: "A",
  awayTeamId: "B",
  fixtures: commonOpponentHistory,
});
assert.ok(
  commonOpponentPrediction.home > commonOpponentPrediction.away,
  `Expected common-opponent evidence to favour A, got ${JSON.stringify(commonOpponentPrediction)}`,
);

// Reverse the shared-opponent evidence while preserving the broad shape of the
// teams' records. The direction should reverse as well.
const reverseCommonOpponentHistory: WinChanceFixture[] = [
  game("A", "C", 1, 6, 1),
  game("A", "X", 6, 1, 2),
  game("B", "C", 6, 1, 3),
  game("Y", "B", 6, 1, 4),
  game("C", "Z", 5, 2, 5),
];
const reverseCommonOpponentPrediction = calculateFixtureWinChance({
  homeTeamId: "A",
  awayTeamId: "B",
  fixtures: reverseCommonOpponentHistory,
});
assert.ok(
  reverseCommonOpponentPrediction.away > reverseCommonOpponentPrediction.home,
  `Expected reversed common-opponent evidence to favour B, got ${JSON.stringify(reverseCommonOpponentPrediction)}`,
);

// Direct meetings remain matchup-specific evidence, but the new result call and
// score must come from one Poisson score matrix rather than two conflicting models.
const headToHeadHistory: WinChanceFixture[] = [
  game("A", "B", 6, 2, 1),
  game("C", "A", 3, 3, 2),
  game("B", "D", 3, 3, 3),
  game("A", "E", 4, 2, 4),
  game("F", "B", 4, 2, 5),
];
const headToHeadPrediction = calculateFixtureWinChance({
  homeTeamId: "A",
  awayTeamId: "B",
  fixtures: headToHeadHistory,
});
assert.ok(headToHeadPrediction.home > headToHeadPrediction.away);
assert.equal(predictedOutcome(headToHeadPrediction), strongestOutcome(headToHeadPrediction));
assert.equal(
  headToHeadPrediction.home + headToHeadPrediction.draw + headToHeadPrediction.away,
  100,
);

// Distinct scoring profiles should not collapse automatically to one canned 3-2
// scoreline. This guards the regression that surfaced in the 19 Aug 2026 audit.
const highScoring = calculateFixtureWinChance({
  homeTeamId: "H",
  awayTeamId: "I",
  fixtures: [
    game("H", "J", 8, 5, 1),
    game("K", "H", 5, 7, 2),
    game("I", "J", 6, 6, 3),
    game("K", "I", 7, 5, 4),
  ],
});
const lowScoring = calculateFixtureWinChance({
  homeTeamId: "L",
  awayTeamId: "M",
  fixtures: [
    game("L", "N", 1, 0, 1),
    game("O", "L", 1, 1, 2),
    game("M", "N", 0, 1, 3),
    game("O", "M", 1, 0, 4),
  ],
});
assert.notEqual(
  highScoring.predictedResult.label,
  lowScoring.predictedResult.label,
  "Different scoring environments should not collapse to the same stock scoreline.",
);

console.log("Opponent-adjusted Poisson predictor contract passed.");
