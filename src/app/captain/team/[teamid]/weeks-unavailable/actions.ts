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

function normaliseTime(value: FormDataEntryValue | null) {
  const time = String(value ?? "").trim();
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(time) ? time : null;
}

export async function saveTeamWeekUnavailabilityAction(formData: FormData) {
  const teamId = String(formData.get("teamId") ?? "").trim();
  const weekStartInput = String(formData.get("weekStart") ?? "").trim();
  const restrictionType = String(formData.get("restrictionType") ?? "AVAILABLE").trim();
  const note = normaliseNote(formData.get("note"));
  const earliestKickoff = normaliseTime(formData.get("earliestKickoff"));
  const latestKickoff = normaliseTime(formData.get("latestKickoff"));

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

  if (restrictionType === "UNAVAILABLE") {
    await upsertTeamWeekUnavailability({
      teamId,
      leagueId: currentLeagueId,
      weekStart,
      note,
      restrictionType: "UNAVAILABLE",
      submittedByUserId: access.user?.id ?? null,
    });
  } else if (restrictionType === "TIME_RESTRICTION") {
    if (!earliestKickoff && !latestKickoff) {
      redirectToPage(
        teamId,
        "?error=Choose%20an%20earliest%20or%20latest%20kick-off%20time%20for%20that%20week.",
      );
    }
    if (earliestKickoff && latestKickoff && earliestKickoff > latestKickoff) {
      redirectToPage(
        teamId,
        "?error=The%20earliest%20kick-off%20cannot%20be%20later%20than%20the%20latest%20kick-off.",
      );
    }
    await upsertTeamWeekUnavailability({
      teamId,
      leagueId: currentLeagueId,
      weekStart,
      note,
      restrictionType: "TIME_RESTRICTION",
      earliestKickoff,
      latestKickoff,
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
    restrictionType === "UNAVAILABLE"
      ? "?saved=Team%20unavailability%20saved."
      : restrictionType === "TIME_RESTRICTION"
        ? "?saved=Temporary%20kick-off%20time%20restriction%20saved."
        : "?saved=The%20week%20has%20been%20returned%20to%20normal%20availability.",
  );
}
