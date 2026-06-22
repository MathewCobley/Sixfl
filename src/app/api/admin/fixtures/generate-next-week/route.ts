// ========================================
// File: src/app/api/admin/fixtures/generate-next-week/route.ts
// ========================================

import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";
import { FixtureStatus } from "@prisma/client";

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

function getAllMatchings(teamIds: string[]) {
  const results: string[][][] = [];

  function walk(remaining: string[], pairs: string[][]) {
    if (remaining.length < 2) {
      results.push(pairs);
      return;
    }

    const first = remaining[0];
    const rest = remaining.slice(1);

    if (remaining.length % 2 === 1) {
      walk(rest, pairs);
    }

    for (let index = 0; index < rest.length; index += 1) {
      const opponent = rest[index];
      walk(
        rest.filter((_, restIndex) => restIndex !== index),
        [...pairs, [first, opponent]],
      );
    }
  }

  walk(teamIds, []);
  return results;
}

function chooseFixtures(input: {
  teams: TeamSeed[];
  existingFixtures: FixtureSeed[];
}) {
  const teamIds = input.teams.map((team) => team.id);
  const pairCounts = new Map<string, number>();
  const pairLatestRound = new Map<string, number>();
  const homeCounts = new Map<string, number>();
  const awayCounts = new Map<string, number>();
  const maxRound = Math.max(
    0,
    ...input.existingFixtures
      .map((fixture) => fixture.round ?? 0)
      .filter((round) => Number.isFinite(round)),
  );

  for (const fixture of input.existingFixtures) {
    const key = pairKey(fixture.homeTeamId, fixture.awayTeamId);
    pairCounts.set(key, (pairCounts.get(key) ?? 0) + 1);
    pairLatestRound.set(key, Math.max(pairLatestRound.get(key) ?? 0, fixture.round ?? 0));
    homeCounts.set(fixture.homeTeamId, (homeCounts.get(fixture.homeTeamId) ?? 0) + 1);
    awayCounts.set(fixture.awayTeamId, (awayCounts.get(fixture.awayTeamId) ?? 0) + 1);
  }

  const matchings = getAllMatchings(teamIds);
  let best = matchings[0] ?? [];
  let bestScore = Number.POSITIVE_INFINITY;

  for (const matching of matchings) {
    const score = matching.reduce((total, [a, b]) => {
      const key = pairKey(a, b);
      const count = pairCounts.get(key) ?? 0;
      const latestRound = pairLatestRound.get(key) ?? 0;
      const recentPenalty = latestRound >= maxRound ? 500 : latestRound >= maxRound - 1 ? 150 : 0;
      return total + count * 1000 + recentPenalty;
    }, 0);

    if (score < bestScore) {
      best = matching;
      bestScore = score;
    }
  }

  return best.map(([a, b]) => {
    const aBalance = (homeCounts.get(a) ?? 0) - (awayCounts.get(a) ?? 0);
    const bBalance = (homeCounts.get(b) ?? 0) - (awayCounts.get(b) ?? 0);

    if (aBalance <= bBalance) {
      return { homeTeamId: a, awayTeamId: b };
    }

    return { homeTeamId: b, awayTeamId: a };
  });
}

async function getRequestLeagueId(request: Request) {
  const body = (await request.json().catch(() => null)) as { leagueId?: unknown } | null;
  return String(body?.leagueId ?? "").trim();
}

export async function POST(request: Request) {
  try {
    await requireAdmin();

    const leagueId = await getRequestLeagueId(request);

    if (!leagueId) {
      return NextResponse.json({ error: "Choose a league first." }, { status: 400 });
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
      return NextResponse.json({ error: "League not found." }, { status: 404 });
    }

    if (teams.length < 2) {
      return NextResponse.json(
        { error: "This league needs at least two teams before fixtures can be generated." },
        { status: 400 },
      );
    }

    const latestFixture = existingFixtures.at(-1) ?? null;
    const latestRound = Math.max(0, ...existingFixtures.map((fixture) => fixture.round ?? 0));
    const kickoffBase = latestFixture ? addDays(latestFixture.kickoffAt, 7) : getFallbackKickoff();
    const round = latestRound + 1;
    const venueId = latestFixture?.venueId ?? null;
    const pitchCount = Math.max(
      1,
      ...existingFixtures
        .map((fixture) => Number(String(fixture.pitch ?? "").match(/\d+/)?.[0] ?? 0))
        .filter((value) => Number.isFinite(value)),
    );
    const slotMinutes = 40;

    const pairs = chooseFixtures({ teams, existingFixtures });

    if (pairs.length === 0) {
      return NextResponse.json({ error: "No fixture pairings could be generated." }, { status: 400 });
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

    return NextResponse.json({ ok: true, created: pairs.length, round });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not generate next week fixtures." },
      { status: 500 },
    );
  }
}
