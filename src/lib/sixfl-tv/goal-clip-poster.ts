export function sixflTvGoalClipPosterKey(assetId: string) {
  if (!/^[A-Za-z0-9-]{1,100}$/.test(assetId)) {
    throw new Error("Invalid SIXFL TV clip reference.");
  }
  return `sixfl-tv-goal-clips/v1/${assetId}.jpg`;
}
