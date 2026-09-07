/** Shared fixture fee inheritance. Never derive one side from its opponent. */
export const DEFAULT_FIXTURE_MATCH_FEE_PENCE = 4000;

type TeamFee = { standardMatchFeePence?: number | null };
type FixtureFee = {
  matchFeePence?: number | null;
  homeMatchFeePence?: number | null;
  awayMatchFeePence?: number | null;
  homeTeam: TeamFee & { id: string };
  awayTeam: TeamFee & { id: string };
};

/** An explicit fixture-side fee (including £0) wins, then the team's standard,
 * then the legacy shared fallback. Null means missing, not a free fixture. */
export function resolveTeamFixtureFeePence(
  fixtureSideFee: number | null | undefined,
  standardFee: number | null | undefined,
  legacyFee: number | null | undefined,
): number {
  const fee = fixtureSideFee ?? standardFee ?? legacyFee ?? DEFAULT_FIXTURE_MATCH_FEE_PENCE;
  if (!Number.isSafeInteger(fee) || fee < 0) {
    throw new Error("The fixture match fee must be a non-negative whole number of pence.");
  }
  return fee;
}

/** Snapshot the team agreements when a new fixture is created. The shared
 * value remains for old display consumers, never as the other team's price. */
export function snapshotFixtureMatchFees(homeTeam: TeamFee, awayTeam: TeamFee) {
  const homeMatchFeePence = resolveTeamFixtureFeePence(null, homeTeam.standardMatchFeePence, null);
  const awayMatchFeePence = resolveTeamFixtureFeePence(null, awayTeam.standardMatchFeePence, null);
  return { homeMatchFeePence, awayMatchFeePence, matchFeePence: Math.max(homeMatchFeePence, awayMatchFeePence) };
}

/** Publishing and explicitly requested repairs use exactly the same policy.
 * Placeholder teams never receive a charge, even if a legacy value exists. */
export function resolveFixtureMatchFees(fixture: FixtureFee, placeholderTeamIds: ReadonlySet<string>) {
  return {
    homeMatchFeePence: placeholderTeamIds.has(fixture.homeTeam.id) ? null : resolveTeamFixtureFeePence(
      fixture.homeMatchFeePence, fixture.homeTeam.standardMatchFeePence, fixture.matchFeePence,
    ),
    awayMatchFeePence: placeholderTeamIds.has(fixture.awayTeam.id) ? null : resolveTeamFixtureFeePence(
      fixture.awayMatchFeePence, fixture.awayTeam.standardMatchFeePence, fixture.matchFeePence,
    ),
  };
}
