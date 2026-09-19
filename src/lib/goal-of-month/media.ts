const CANDIDATE_ID = /^[A-Za-z0-9_-]{1,120}$/;

export function goalOfMonthPromoVideoKey(candidateId: string) {
  if (!CANDIDATE_ID.test(candidateId)) {
    throw new Error("Invalid Goal of the Month candidate reference.");
  }

  return `goal-of-month-nominations/v1/${candidateId}.mp4`;
}

export function goalOfMonthPromoThumbnailKey(candidateId: string) {
  if (!CANDIDATE_ID.test(candidateId)) {
    throw new Error("Invalid Goal of the Month candidate reference.");
  }

  return `goal-of-month-nominations/v1/${candidateId}.png`;
}
