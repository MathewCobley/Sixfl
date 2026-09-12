/** Official scores remain on MatchResult. Only prediction/accuracy consumers use
 * this resolver; never use it for league standings. No inference from a 3–0. */
export type PredictorResultSource = {
  homeScore: number;
  awayScore: number;
  overturn?: { originalHomeScore: number | null; originalAwayScore: number | null } | null;
};

export const RESULT_OVERTURN_SUMMARY_SELECT = {
  originalHomeScore: true, originalAwayScore: true,
  awardedHomeScore: true, awardedAwayScore: true, reasonCode: true, decidedAt: true,
} as const;

export const PREDICTOR_RESULT_SELECT = {
  homeScore: true, awayScore: true,
  overturn: { select: RESULT_OVERTURN_SUMMARY_SELECT },
} as const;

export const RESULT_OVERTURN_REASONS = [
  { value: "PLAYER_LIMIT", label: "Player-limit breach" },
  { value: "INELIGIBLE_PLAYER", label: "Ineligible player" },
  { value: "OTHER_COMPETITION_BREACH", label: "Other competition breach" },
] as const;

export function getPredictorResult(result: PredictorResultSource | null | undefined) {
  if (!result) return null;
  const homeScore = result.overturn ? result.overturn.originalHomeScore : result.homeScore;
  const awayScore = result.overturn ? result.overturn.originalAwayScore : result.awayScore;
  // Missing/invalid original evidence must not become an invented awarded score.
  if (typeof homeScore !== "number" || typeof awayScore !== "number" ||
      !Number.isSafeInteger(homeScore) || !Number.isSafeInteger(awayScore) ||
      homeScore < 0 || awayScore < 0) return null;
  return { homeScore, awayScore };
}

/** Only public structured fields are accepted. Never render a private decision note. */
export type OverturnedScoreSummary = {
  originalHomeScore: number;
  originalAwayScore: number;
  awardedHomeScore: number;
  awardedAwayScore: number;
  reasonCode: string;
};

export function describeResultOverturn(
  result: OverturnedScoreSummary,
  homeName: string,
  awayName: string,
) {
  const scores = [result.originalHomeScore, result.originalAwayScore,
    result.awardedHomeScore, result.awardedAwayScore];
  if (!scores.every(score => Number.isSafeInteger(score) && score >= 0) ||
      !((result.awardedHomeScore === 3 && result.awardedAwayScore === 0) ||
        (result.awardedHomeScore === 0 && result.awardedAwayScore === 3))) {
    throw new Error("A valid original score and recorded default win are required.");
  }
  const home = homeName.replace(/\s+/g, " ").trim();
  const away = awayName.replace(/\s+/g, " ").trim();
  if (!home || !away) throw new Error("Both team names are required.");
  return {
    original: `${home} ${result.originalHomeScore}–${result.originalAwayScore} ${away}`,
    awarded: `${home} ${result.awardedHomeScore}–${result.awardedAwayScore} ${away}`,
    winner: result.awardedHomeScore === 3 ? home : away,
    reason: RESULT_OVERTURN_REASONS.find(item => item.value === result.reasonCode)?.label ?? "Rule breach",
  };
}
