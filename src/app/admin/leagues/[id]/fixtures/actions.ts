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
import { generateRoundRobin } from "@/lib/fixtures/generateRoundRobin";
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
// Update Match
// ========================================

export async function updateMatchAction(formData: FormData) {
  await requireAdmin();

  const matchId = formData.get("matchId") as string;

  await prisma.match.update({
    where: { id: matchId },
    data: {
      homeTeamId: formData.get("homeTeamId") as string,
      awayTeamId: formData.get("awayTeamId") as string,
      round: Number(formData.get("round")),
      kickoffAt: formData.get("kickoffAt")
        ? new Date(formData.get("kickoffAt") as string)
        : null,
      pitch: (formData.get("pitch") as string) || null,
      isManual: true,
    },
  });

  revalidatePath(`/admin/leagues`);
}

// ========================================
// Regenerate Fixtures (ELITE VERSION)
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
  // Existing matches (for preserve logic)
  // ----------------------------------------

  const existingMatches = await prisma.match.findMany({
    where: { leagueId },
  });

  // ----------------------------------------
  // Hard reset if NOT preserving
  // ----------------------------------------

  if (!preserveManual) {
    await prisma.match.deleteMany({
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
      // Preserve manual logic
      // ----------------------------------------

      if (preserveManual) {
        const exists = existingMatches.find((em) =>
          sameFixture(
            em.homeTeamId,
            em.awayTeamId,
            m.home,
            m.away
          )
        );

        if (exists) continue;
      }

      // ----------------------------------------
      // Prevent duplicate teams in same round
      // ----------------------------------------

      const clash = existingMatches.find(
        (em) =>
          em.round === round.round &&
          (em.homeTeamId === m.home ||
            em.awayTeamId === m.home ||
            em.homeTeamId === m.away ||
            em.awayTeamId === m.away)
      );

      if (preserveManual && clash) continue;

      // ----------------------------------------
      // Create match
      // ----------------------------------------

      await prisma.match.create({
        data: {
          leagueId,
          homeTeamId: m.home,
          awayTeamId: m.away,
          round: round.round,
          position: i,
          kickoffAt: slots[i],
          pitch: DEFAULT_PITCHES[i % DEFAULT_PITCHES.length],
          isManual: false,
        },
      });
    }
  }

  // ----------------------------------------
  // Revalidate
  // ----------------------------------------

  revalidatePath(`/admin/leagues/${leagueId}/fixtures`);
}