// ========================================
// File: src/app/admin/leagues/[id]/fixtures/actions.ts
// ========================================

"use server";

// ========================================
// Imports
// ========================================

import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/requireAdmin";
import { revalidatePath } from "next/cache";
import generateRoundRobin from "@/lib/fixtures/generateRoundRobin";
import { generateTimeSlots } from "@/lib/fixtures/generateTimeSlots";

// ========================================
// Constants
// ========================================

const DEFAULT_START_TIME = "18:30";
const MATCH_DURATION_MINUTES = 40;
const DEFAULT_PITCHES = ["Pitch 1", "Pitch 2", "Pitch 3"];

// ========================================
// Helpers
// ========================================

function sameFixture(
  aHome: string,
  aAway: string,
  bHome: string,
  bAway: string
) {
  return (
    (aHome === bHome && aAway === bAway) ||
    (aHome === bAway && aAway === bHome)
  );
}

// ========================================
// Update Fixture
// ========================================

export async function updateMatchAction(formData: FormData) {
  await requireAdmin();

  const fixtureId = String(formData.get("matchId") ?? "").trim();
  const homeTeamId = String(formData.get("homeTeamId") ?? "").trim();
  const awayTeamId = String(formData.get("awayTeamId") ?? "").trim();
  const roundValue = String(formData.get("round") ?? "").trim();
  const kickoffAtValue = String(formData.get("kickoffAt") ?? "").trim();
  const pitchValue = String(formData.get("pitch") ?? "").trim();

  if (!fixtureId) {
    throw new Error("Missing fixture id.");
  }

  if (!homeTeamId || !awayTeamId) {
    throw new Error("Both teams are required.");
  }

  if (!kickoffAtValue) {
    throw new Error("Kickoff date/time is required.");
  }

  const kickoffAt = new Date(kickoffAtValue);

  if (Number.isNaN(kickoffAt.getTime())) {
    throw new Error("Invalid kickoff date/time.");
  }

  await prisma.fixture.update({
    where: { id: fixtureId },
    data: {
      homeTeamId,
      awayTeamId,
      round: roundValue ? Number(roundValue) : null,
      kickoffAt,
      pitch: pitchValue || null,
    },
  });

  revalidatePath(`/admin/leagues`);
}

// ========================================
// Regenerate Fixtures
// ========================================

export async function regenerateFixtures(
  leagueId: string,
  preserveManual: boolean
) {
  await requireAdmin();

  // ----------------------------------------
  // Get teams
  // ----------------------------------------

  const teams = await prisma.team.findMany({
    where: { leagueId },
    select: { id: true },
  });

  if (teams.length < 2) {
    throw new Error("Not enough teams to generate fixtures");
  }

  const teamIds = teams.map((t) => t.id);

  // ----------------------------------------
  // Generate round robin
  // ----------------------------------------

  const rounds = generateRoundRobin(teamIds);

  // ----------------------------------------
  // Existing fixtures
  // ----------------------------------------

  const existingFixtures = await prisma.fixture.findMany({
    where: { leagueId },
  });

  // ----------------------------------------
  // Hard reset if NOT preserving
  // ----------------------------------------

  if (!preserveManual) {
    await prisma.fixture.deleteMany({
      where: { leagueId },
    });
  }

  // ----------------------------------------
  // Generate fixtures
  // ----------------------------------------

  for (const round of rounds) {
    const slots = generateTimeSlots(
      DEFAULT_START_TIME,
      MATCH_DURATION_MINUTES,
      round.matches.length
    );

    for (let i = 0; i < round.matches.length; i++) {
      const m = round.matches[i];

      // ----------------------------------------
      // Preserve existing logic
      // ----------------------------------------

      if (preserveManual) {
        const exists = existingFixtures.find((fixture) =>
          sameFixture(
            fixture.homeTeamId,
            fixture.awayTeamId,
            m.home,
            m.away
          )
        );

        if (exists) continue;
      }

      // ----------------------------------------
      // Prevent duplicate teams in same round
      // ----------------------------------------

      const clash = existingFixtures.find(
        (fixture) =>
          fixture.round === round.round &&
          (fixture.homeTeamId === m.home ||
            fixture.awayTeamId === m.home ||
            fixture.homeTeamId === m.away ||
            fixture.awayTeamId === m.away)
      );

      if (preserveManual && clash) continue;

      // ----------------------------------------
      // Create fixture
      // ----------------------------------------

      await prisma.fixture.create({
        data: {
          leagueId,
          homeTeamId: m.home,
          awayTeamId: m.away,
          round: round.round,
          position: i,
          kickoffAt: slots[i],
          pitch: DEFAULT_PITCHES[i % DEFAULT_PITCHES.length],
        },
      });
    }
  }

  // ----------------------------------------
  // Revalidate
  // ----------------------------------------

  revalidatePath(`/admin/leagues/${leagueId}/fixtures`);
}