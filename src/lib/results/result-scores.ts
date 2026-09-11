/** Public score metadata only. Evidence, decision notes and actor data live in
 * the private decision record and must never be passed to public components. */
export type ResultScores = { homeScore: number; awayScore: number };
export type ResultScoreSnapshot = ResultScores & {
  overturnedAt?: Date | string | null;
  originalHomeScore?: number | null;
  originalAwayScore?: number | null;
};

export const RESULT_SCORE_SELECT = {
  homeScore: true, awayScore: true,
  originalHomeScore: true, originalAwayScore: true, overturnedAt: true,
} as const;

const validScore = (value: unknown): value is number =>
  typeof value === "number" && Number.isSafeInteger(value) && value >= 0;

/** The playing result, not the competition award. A missing original on a
 * marked overturn is unusable evidence, never a reason to train on the award.
 * An ordinary 3–0 is still an ordinary result; never infer decisions from scores. */
export function getOnPitchResult(result: ResultScoreSnapshot | null | undefined): ResultScores | null {
  if (!result) return null;
  const homeScore = result.overturnedAt ? result.originalHomeScore : result.homeScore;
  const awayScore = result.overturnedAt ? result.originalAwayScore : result.awayScore;
  return validScore(homeScore) && validScore(awayScore) ? { homeScore, awayScore } : null;
}

export function useOnPitchResults<T extends { result: ResultScoreSnapshot | null }>(fixtures: T[]) {
  return fixtures.map(fixture => ({ ...fixture, result: getOnPitchResult(fixture.result) }));
}

export const OVERTURN_REASONS = [
  { value: "PLAYER_LIMIT", label: "Player-limit breach" },
  { value: "INELIGIBLE_PLAYER", label: "Ineligible player" },
  { value: "COMPETITION_BREACH", label: "Other competition breach" },
] as const;
export type OverturnReason = (typeof OVERTURN_REASONS)[number]["value"];
