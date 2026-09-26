export type FixtureSchedulePair = {
  homeId: string;
  awayId: string;
};

function clonePair(pair: FixtureSchedulePair): FixtureSchedulePair {
  return { homeId: pair.homeId, awayId: pair.awayId };
}

function teamCounts(pairs: readonly FixtureSchedulePair[]) {
  const counts = new Map<string, number>();

  for (const pair of pairs) {
    counts.set(pair.homeId, (counts.get(pair.homeId) ?? 0) + 1);
    counts.set(pair.awayId, (counts.get(pair.awayId) ?? 0) + 1);
  }

  return counts;
}

function isFairNight(
  pairs: readonly FixtureSchedulePair[],
  teamIds: ReadonlySet<string>,
) {
  const counts = teamCounts(pairs);

  return Array.from(teamIds).every((teamId) => {
    const count = counts.get(teamId) ?? 0;
    return count >= 1 && count <= 2;
  });
}

function chooseFairHalf(
  pairs: readonly FixtureSchedulePair[],
  gamesPerNight: number,
): FixtureSchedulePair[][] | null {
  if (pairs.length !== gamesPerNight * 2 || pairs.length > 20) return null;

  const teamIds = new Set<string>();
  for (const pair of pairs) {
    teamIds.add(pair.homeId);
    teamIds.add(pair.awayId);
  }

  const chosen: number[] = [];

  function search(startIndex: number): FixtureSchedulePair[][] | null {
    if (chosen.length === gamesPerNight) {
      const chosenSet = new Set(chosen);
      const firstNight = chosen.map((index) => clonePair(pairs[index]));
      const secondNight = pairs
        .filter((_, index) => !chosenSet.has(index))
        .map(clonePair);

      if (
        isFairNight(firstNight, teamIds) &&
        isFairNight(secondNight, teamIds)
      ) {
        return [firstNight, secondNight];
      }

      return null;
    }

    const remainingNeeded = gamesPerNight - chosen.length;
    for (
      let index = startIndex;
      index <= pairs.length - remainingNeeded;
      index += 1
    ) {
      chosen.push(index);
      const result = search(index + 1);
      if (result) return result;
      chosen.pop();
    }

    return null;
  }

  return search(0);
}

function packGreedily(
  pairs: readonly FixtureSchedulePair[],
  gamesPerNight: number,
) {
  const remaining = pairs.map(clonePair);
  const nights: FixtureSchedulePair[][] = [];

  while (remaining.length > 0) {
    const appearances = new Map<string, number>();
    const night: FixtureSchedulePair[] = [];

    for (
      let index = 0;
      index < remaining.length && night.length < gamesPerNight;
    ) {
      const pair = remaining[index];
      const homeCount = appearances.get(pair.homeId) ?? 0;
      const awayCount = appearances.get(pair.awayId) ?? 0;

      if (homeCount < 2 && awayCount < 2) {
        night.push(pair);
        appearances.set(pair.homeId, homeCount + 1);
        appearances.set(pair.awayId, awayCount + 1);
        remaining.splice(index, 1);
      } else {
        index += 1;
      }
    }

    if (night.length === 0) {
      throw new Error("Unable to pack fixture nights without scheduling a team more than twice.");
    }

    nights.push(night);
  }

  return nights;
}

/**
 * Converts round-robin rounds into fixture nights.
 *
 * When free double-headers are enabled, three ordinary rounds are first
 * considered as a block. If their games can be split into two full nights
 * while giving every team one or two games on each night, that fair split is
 * used. This is the 9-team / 6-games-per-night pattern used by Rawdon and
 * means every team plays every week and receives the same number of free
 * second games across a complete double round-robin season.
 *
 * Other shapes fall back to a capacity-aware packer that still prevents any
 * team from being scheduled more than twice on one fixture night.
 */
export function packFixtureRoundsIntoNights(
  rounds: readonly (readonly FixtureSchedulePair[])[],
  gamesPerNight: number,
  allowDoubleHeaders: boolean,
): FixtureSchedulePair[][] {
  if (!Number.isSafeInteger(gamesPerNight) || gamesPerNight < 1) {
    throw new Error("Games per fixture night must be a positive whole number.");
  }

  if (!allowDoubleHeaders) {
    return rounds.flatMap((round) => {
      const pairs = round.map(clonePair);
      const chunks: FixtureSchedulePair[][] = [];

      for (let index = 0; index < pairs.length; index += gamesPerNight) {
        chunks.push(pairs.slice(index, index + gamesPerNight));
      }

      return chunks;
    });
  }

  const fairNights: FixtureSchedulePair[][] = [];
  let roundIndex = 0;

  while (roundIndex + 2 < rounds.length) {
    const block = [
      ...rounds[roundIndex],
      ...rounds[roundIndex + 1],
      ...rounds[roundIndex + 2],
    ];

    const split = chooseFairHalf(block, gamesPerNight);
    if (!split) break;

    fairNights.push(...split);
    roundIndex += 3;
  }

  if (roundIndex === rounds.length) return fairNights;

  const remainingPairs = rounds
    .slice(roundIndex)
    .flatMap((round) => round.map(clonePair));

  return [
    ...fairNights,
    ...packGreedily(remainingPairs, gamesPerNight),
  ];
}

export function getDoubleHeaderFixtureFeePence(input: {
  standardFeePence: number;
  appearancesBeforeThisFixture: number;
  freeDoubleHeaders: boolean;
}) {
  if (!Number.isSafeInteger(input.standardFeePence) || input.standardFeePence < 0) {
    throw new Error("Standard fixture fee must be a non-negative whole number of pence.");
  }

  if (
    !Number.isSafeInteger(input.appearancesBeforeThisFixture) ||
    input.appearancesBeforeThisFixture < 0
  ) {
    throw new Error("Fixture-night appearance count must be a non-negative whole number.");
  }

  return input.freeDoubleHeaders && input.appearancesBeforeThisFixture > 0
    ? 0
    : input.standardFeePence;
}
