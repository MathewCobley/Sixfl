// ========================================
// File: src/app/api/admin/fixtures/generate-next-week/route.ts
// ========================================

import { randomUUID } from "crypto";
import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";
import { FixtureStatus, Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/requireAdmin";

type TeamSeed = {
  id: string;
  name: string;
};

type Pair = {
  homeTeamId: string;
  awayTeamId: string;
};

type FixtureSeed = {
  homeTeamId: string;
  awayTeamId: string;
  kickoffAt: Date;
  round: number | null;
};

function addDays(value: Date, days: number) {
  const next = new Date(value);
  next.setDate(next.getDate() + days);
  return next;
}

function addMinutes(value: Date, minutes: number) {
  const next = new Date(value);
  next.setMinutes(next.getMinutes() + minutes);
  return next;
}

function pairKey(a: string, b: string) {
  return [a, b].sort().join("::");
}

function getFallbackKickoff() {
  const value = new Date();
  value.setDate(value.getDate() + 7);
  value.setHours(20, 0, 0, 0);
  return value;
}

function chooseFixtures(input: {
  teams: TeamSeed[];
  existingFixtures: FixtureSeed[];
}) {
  const pairCounts = new Map<string, number>();
  const pairLatestRound = new Map<string, number>();
  const homeCounts = new Map<string, number>();
  const awayCounts = new Map<string, number>();
  const playedCounts = new Map<string, number>();
  const maxRound = Math.max(
    0,
    ...input.existingFixtures
      .map((fixture) => fixture.round ?? 0)
      .filter((round) => Number.isFinite(round)),
  );

  for (const fixture of input.existingFixtures) {
    const key = pairKey(fixture.homeTeamId, fixture.awayTeamId);
    pairCounts.set(key, (pairCounts.get(key) ?? 0) + 1);
    pairLatestRound.set(
      key,
      Math.max(pairLatestRound.get(key) ?? 0, fixture.round ?? 0),
    );
    homeCounts.set(
      fixture.homeTeamId,
      (homeCounts.get(fixture.homeTeamId) ?? 0) + 1,
    );
    awayCounts.set(
      fixture.awayTeamId,
      (awayCounts.get(fixture.awayTeamId) ?? 0) + 1,
    );
    playedCounts.set(
      fixture.homeTeamId,
      (playedCounts.get(fixture.homeTeamId) ?? 0) + 1,
    );
    playedCounts.set(
      fixture.awayTeamId,
      (playedCounts.get(fixture.awayTeamId) ?? 0) + 1,
    );
  }

  const remaining = [...input.teams].sort((a, b) => {
    const playedDifference =
      (playedCounts.get(a.id) ?? 0) - (playedCounts.get(b.id) ?? 0);
    return playedDifference || a.name.localeCompare(b.name);
  });

  if (remaining.length % 2 === 1) {
    let byeIndex = 0;

    for (let index = 1; index < remaining.length; index += 1) {
      const currentPlayed = playedCounts.get(remaining[index].id) ?? 0;
      const selectedPlayed = playedCounts.get(remaining[byeIndex].id) ?? 0;

      if (
        currentPlayed > selectedPlayed ||
        (currentPlayed === selectedPlayed &&
          remaining[index].name.localeCompare(remaining[byeIndex].name) > 0)
      ) {
        byeIndex = index;
      }
    }

    remaining.splice(byeIndex, 1);
  }

  const pairs: Pair[] = [];

  while (remaining.length >= 2) {
    const first = remaining.shift();
    if (!first) break;

    let bestOpponentIndex = 0;
    let bestScore = Number.POSITIVE_INFINITY;

    for (let index = 0; index < remaining.length; index += 1) {
      const opponent = remaining[index];
      const key = pairKey(first.id, opponent.id);
      const count = pairCounts.get(key) ?? 0;
      const latestRound = pairLatestRound.get(key) ?? 0;
      const recentPenalty =
        latestRound >= maxRound
          ? 5_000
          : latestRound >= maxRound - 1
            ? 1_500
            : latestRound >= maxRound - 2
              ? 300
              : 0;
      const gameBalancePenalty =
        Math.abs(
          (playedCounts.get(first.id) ?? 0) -
            (playedCounts.get(opponent.id) ?? 0),
        ) * 10;
      const score = count * 10_000 + recentPenalty + gameBalancePenalty + index;

      if (score < bestScore) {
        bestScore = score;
        bestOpponentIndex = index;
      }
    }

    const opponent = remaining.splice(bestOpponentIndex, 1)[0];
    if (!opponent) break;

    const firstBalance =
      (homeCounts.get(first.id) ?? 0) - (awayCounts.get(first.id) ?? 0);
    const opponentBalance =
      (homeCounts.get(opponent.id) ?? 0) -
      (awayCounts.get(opponent.id) ?? 0);

    if (firstBalance <= opponentBalance) {
      pairs.push({ homeTeamId: first.id, awayTeamId: opponent.id });
    } else {
      pairs.push({ homeTeamId: opponent.id, awayTeamId: first.id });
    }
  }

  return pairs;
}

async function getRequestLeagueId(request: Request) {
  const body = (await request.json().catch(() => null)) as {
    leagueId?: unknown;
  } | null;
  return String(body?.leagueId ?? "").trim();
}

function getFriendlyGenerationError(error: unknown) {
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    switch (error.code) {
      case "P2003":
        return "A team, venue or league record used by this schedule is no longer valid. Refresh the page and check the selected league setup.";
      case "P2002":
        return "A conflicting fixture already exists for the generated week. Refresh the fixture list before trying again.";
      case "P2025":
        return "A league or team used by this schedule could not be found. Refresh the page and try again.";
      default:
        return `The fixture database rejected the schedule (${error.code}).`;
    }
  }

  if (error instanceof Error && error.message.trim()) {
    if (error.message === "NEXT_REDIRECT") {
      return "Your admin session could not be confirmed. Refresh the page and sign in again.";
    }

    return error.message;
  }

  return "Could not generate next week fixtures.";
}

export async function POST(request: Request) {
  const requestId = randomUUID().slice(0, 8);

  try {
    await requireAdmin();

    const leagueId = await getRequestLeagueId(request);

    if (!leagueId) {
      return NextResponse.json(
        { error: "Choose a league first.", requestId },
        { status: 400 },
      );
    }

    const [league, teams, existingFixtures] = await Promise.all([
      prisma.league.findUnique({
        where: { id: leagueId },
        select: { id: true, slug: true },
      }),
      prisma.team.findMany({
        where: { leagueId },
        orderBy: { name: "asc" },
        select: { id: true, name: true },
      }),
      prisma.fixture.findMany({
        where: { leagueId },
        orderBy: [{ kickoffAt: "asc" }, { position: "asc" }],
        select: {
          homeTeamId: true,
          awayTeamId: true,
          kickoffAt: true,
          round: true,
          venueId: true,
          pitch: true,
        },
      }),
    ]);

    if (!league) {
      return NextResponse.json(
        { error: "League not found. Refresh the page and choose it again.", requestId },
        { status: 404 },
      );
    }

    if (teams.length < 2) {
      return NextResponse.json(
        {
          error:
            "This league needs at least two linked teams before fixtures can be generated.",
          requestId,
        },
        { status: 400 },
      );
    }

    const latestFixture = existingFixtures.at(-1) ?? null;
    const latestRound = Math.max(
      0,
      ...existingFixtures.map((fixture) => fixture.round ?? 0),
    );
    const kickoffBase = latestFixture
      ? addDays(latestFixture.kickoffAt, 7)
      : getFallbackKickoff();
    const round = latestRound + 1;
    const venueId = latestFixture?.venueId ?? null;
    const pitchCount = Math.max(
      1,
      ...existingFixtures
        .map((fixture) =>
          Number(String(fixture.pitch ?? "").match(/\d+/)?.[0] ?? 0),
        )
        .filter((value) => Number.isFinite(value)),
    );
    const slotMinutes = 40;

    const pairs = chooseFixtures({ teams, existingFixtures });
    const expectedPairCount = Math.floor(teams.length / 2);

    if (pairs.length !== expectedPairCount) {
      return NextResponse.json(
        {
          error: `Only ${pairs.length} of ${expectedPairCount} required pairings could be prepared. No fixtures were created.`,
          requestId,
        },
        { status: 400 },
      );
    }

    await prisma.fixture.createMany({
      data: pairs.map((pair, index) => {
        const batch = Math.floor(index / pitchCount);
        const pitchNumber = (index % pitchCount) + 1;

        return {
          leagueId,
          homeTeamId: pair.homeTeamId,
          awayTeamId: pair.awayTeamId,
          venueId,
          kickoffAt: addMinutes(kickoffBase, batch * slotMinutes),
          round,
          position: index + 1,
          pitch: `Pitch ${pitchNumber}`,
          status: FixtureStatus.SCHEDULED,
        };
      }),
    });

    revalidatePath("/admin/fixtures");
    revalidatePath(`/admin/leagues/${leagueId}/fixtures`);
    revalidatePath(`/admin/leagues/${leagueId}`);

    if (league.slug) {
      revalidatePath(`/leagues/${league.slug}`);
      revalidatePath(`/leagues/${league.slug}/fixtures`);
    }

    return NextResponse.json({
      ok: true,
      created: pairs.length,
      round,
      requestId,
    });
  } catch (error) {
    console.error("Next-week fixture generation failed", {
      requestId,
      error,
    });

    return NextResponse.json(
      {
        error: getFriendlyGenerationError(error),
        requestId,
      },
      { status: 500 },
    );
  }
}
