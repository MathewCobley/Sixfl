// ========================================
// File: src/app/captain/team/[teamid]/weeks-unavailable/actions.ts
// ========================================

"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { getCaptainRelatedTeamContext } from "@/lib/captain/related-teams";
import { prisma } from "@/lib/prisma";
import { requireCaptain } from "@/lib/requireCaptain";
import {
  addWeeks,
  deleteTeamWeekUnavailability,
  getCurrentWeekStart,
  isMondayWeekStart,
  parseDateInput,
  upsertTeamWeekUnavailability,
} from "@/lib/team-week-unavailability";

function redirectToPage(teamId: string, query: string): never {
  redirect(`/captain/team/${teamId}/weeks-unavailable${query}`);
}

function normaliseNote(value: FormDataEntryValue | null) {
  const note = String(value ?? "").trim();
  return note ? note.slice(0, 500) : null;
}

export async function saveTeamWeekUnavailabilityAction(formData: FormData) {
  const teamId = String(formData.get("teamId") ?? "").trim();
  const weekStartInput = String(formData.get("weekStart") ?? "").trim();
  const unavailable = formData.get("unavailable") === "on";
  const note = normaliseNote(formData.get("note"));

  if (!teamId) redirect("/captain");

  const access = await requireCaptain(teamId);
  const context = await getCaptainRelatedTeamContext(teamId);
  if (!context) redirect("/captain");

  const weekStart = parseDateInput(weekStartInput);
  const currentWeekStart = getCurrentWeekStart();
  const latestAllowedWeek = addWeeks(currentWeekStart, 52);

  if (
    !weekStart ||
    !isMondayWeekStart(weekStart) ||
    weekStart < currentWeekStart ||
    weekStart > latestAllowedWeek
  ) {
    redirectToPage(teamId, "?error=That%20week%20could%20not%20be%20saved.");
  }

  const weekEnd = addWeeks(weekStart, 1);
  const currentLeagueId = context.currentLeagueId;
  const publishedFixtureCount = currentLeagueId
    ? await prisma.fixture.count({
        where: {
          leagueId: currentLeagueId,
          publishedAt: { not: null },
          kickoffAt: { gte: weekStart, lt: weekEnd },
          status: { in: ["SCHEDULED", "COMPLETED"] },
        },
      })
    : 0;

  if (publishedFixtureCount > 0) {
    redirectToPage(
      teamId,
      "?error=Fixtures%20for%20that%20week%20have%20already%20been%20published.%20Please%20contact%20SIXFL%20instead.",
    );
  }

  if (unavailable) {
    await upsertTeamWeekUnavailability({
      teamId,
      leagueId: currentLeagueId,
      weekStart,
      note,
      submittedByUserId: access.user?.id ?? null,
    });
  } else {
    await deleteTeamWeekUnavailability({ teamId, weekStart });
  }

  revalidatePath(`/captain/team/${teamId}`);
  revalidatePath(`/captain/team/${teamId}/weeks-unavailable`);
  revalidatePath("/admin/team-unavailability");
  revalidatePath("/admin/fixtures/generate");
  revalidatePath("/admin/night-board");

  redirectToPage(
    teamId,
    unavailable
      ? "?saved=Team%20unavailability%20saved."
      : "?saved=The%20week%20has%20been%20removed%20from%20team%20unavailability.",
  );
}
