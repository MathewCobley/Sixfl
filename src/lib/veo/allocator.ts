/** Pure, deterministic allocation. Only exchange pitches in the same venue/time slot. */
export const VEO_SUPPLEMENT_PENCE = 500;
export type VeoFixture = {
  id: string; kickoffMs: number; durationMinutes: number; venueId: string | null;
  pitch: string | null; homeTeamId: string; awayTeamId: string;
  homePriority: boolean; awayPriority: boolean; locked: boolean; eligible: boolean;
  filmed: boolean;
};
export type VeoHistory = Record<string, { count: number; lastMs: number }>;
export type VeoSettings = { enabled: boolean; pitch: string; venueId: string | null; maxMatches: number };
export type VeoChoice = { fixtureId: string; swapWithId: string | null; pitch: string };
export function normaliseVeoPitch(value: string | null): string {
  return (value ?? '').trim().toLowerCase().replace(/^(?:pitch\s*)+/, '').trim();
}
export function veoFee(basePence: number, priority: boolean, allocated: boolean) {
  if (!Number.isSafeInteger(basePence) || basePence < 0) throw new Error('Invalid base match fee.');
  // Explicit free matches remain free, including replacement/promotional fixtures.
  const supplementPence = priority && allocated && basePence > 0 ? VEO_SUPPLEMENT_PENCE : 0;
  if (!Number.isSafeInteger(basePence + supplementPence)) throw new Error('Invalid total match fee.');
  return { basePence, supplementPence, totalPence: basePence + supplementPence };
}
function overlaps(a: VeoFixture, b: VeoFixture) {
  return a.kickoffMs < b.kickoffMs + b.durationMinutes * 60000 && b.kickoffMs < a.kickoffMs + a.durationMinutes * 60000;
}
type Ranked = { fixture: VeoFixture; anchor: VeoFixture; score: number[] };
function compareScore(a: number[], b: number[]) {
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return a[i] - b[i];
  return 0;
}
function rank(f: VeoFixture, history: VeoHistory): number[] {
  const ids = [f.homeTeamId, f.awayTeamId];
  const priorityIds = ids.filter((_, i) => i === 0 ? f.homePriority : f.awayPriority);
  const fairIds = priorityIds.length ? priorityIds : ids;
  return [priorityIds.length, priorityIds.length === 2 ? 1 : 0, 1,
    -fairIds.reduce((sum, id) => sum + (history[id]?.count ?? 0), 0),
    -fairIds.reduce((sum, id) => sum + (history[id]?.lastMs ?? 0), 0)];
}
/** One call represents ONE London calendar night. Published/billed fixtures are never moved. */
export function allocateVeoNight(fixtures: VeoFixture[], settings: VeoSettings, history: VeoHistory = {}): VeoChoice[] {
  if (!settings.enabled) return [];
  if (!normaliseVeoPitch(settings.pitch) || !Number.isInteger(settings.maxMatches) || settings.maxMatches < 1 || settings.maxMatches > 12) {
    throw new Error('Choose a Veo pitch and a capacity between 1 and 12.');
  }
  if (new Set(fixtures.map(f => f.id)).size !== fixtures.length) throw new Error('Duplicate fixture IDs.');
  if (fixtures.some(f => !Number.isFinite(f.kickoffMs) || !Number.isInteger(f.durationMinutes) || f.durationMinutes < 1 || f.durationMinutes > 180)) {
    throw new Error('Invalid fixture timing.');
  }
  const atVenue = fixtures.filter(f => f.venueId === settings.venueId);
  const anchors = atVenue.filter(f => normaliseVeoPitch(f.pitch) === normaliseVeoPitch(settings.pitch));
  if (new Set(anchors.map(f => f.kickoffMs)).size !== anchors.length) throw new Error('The Veo pitch is double-booked. Fix the fixtures before publishing.');
  const fixed = anchors.filter(f => f.locked);
  const capacity = Math.max(0, settings.maxMatches - fixed.filter(f => f.filmed).length);
  if (!capacity) return [];
  const options: Ranked[] = [];
  for (const anchor of anchors) {
    if (anchor.locked || fixed.some(f => overlaps(f, anchor))) continue;
    const candidates = atVenue.filter(f => !f.locked && f.eligible && normaliseVeoPitch(f.pitch)
      && f.kickoffMs === anchor.kickoffMs && f.durationMinutes === anchor.durationMinutes);
    candidates.sort((a, b) => compareScore(rank(b, history), rank(a, history)) || a.id.localeCompare(b.id));
    if (candidates[0]) options.push({ fixture: candidates[0], anchor, score: rank(candidates[0], history) });
  }
  options.sort((a, b) => (a.anchor.kickoffMs + a.anchor.durationMinutes * 60000)
    - (b.anchor.kickoffMs + b.anchor.durationMinutes * 60000) || a.fixture.id.localeCompare(b.fixture.id));
  // Capacity-limited weighted interval scheduling, not a greedy choice that can lose two slots.
  type Plan = { score: number[]; picks: Ranked[] };
  const zero = (): Plan => ({ score: [0, 0, 0, 0, 0], picks: [] });
  const dp: Plan[][] = Array.from({ length: options.length + 1 }, () => Array.from({ length: capacity + 1 }, zero));
  for (let i = 1; i <= options.length; i++) {
    const option = options[i - 1];
    let previous = i - 1;
    while (previous > 0 && overlaps(options[previous - 1].anchor, option.anchor)) previous--;
    for (let k = 1; k <= capacity; k++) {
      const prior = dp[previous][k - 1];
      const take = { score: option.score.map((v, n) => v + prior.score[n]), picks: [...prior.picks, option] };
      const skip = dp[i - 1][k];
      dp[i][k] = compareScore(take.score, skip.score) > 0 ? take : skip;
    }
  }
  return dp[options.length][capacity].picks.map(({ fixture, anchor }) => ({
    fixtureId: fixture.id, swapWithId: fixture.id === anchor.id ? null : anchor.id, pitch: anchor.pitch!,
  }));
}
