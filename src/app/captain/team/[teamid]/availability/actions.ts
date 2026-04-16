// ========================================
// File: src/app/captain/team/[teamid]/availability/actions.ts
// ========================================

"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { prisma } from "@/lib/prisma";
import { requireCaptain } from "@/lib/requireCaptain";

const ALLOWED_RESPONSES = ["AVAILABLE", "UNAVAILABLE", "MAYBE", "NO_RESPONSE"] as const;
type AvailabilityResponse = (typeof ALLOWED_RESPONSES)[number];

function getResponseValue(value: FormDataEntryValue | null): AvailabilityResponse {
  const parsed = String(value ?? "").trim().toUpperCase();

  if (ALLOWED_RESPONSES.includes(parsed as AvailabilityResponse)) {
    return parsed as AvailabilityResponse;
  }

  return "NO_RESPONSE";
}

function normaliseNullableString(value: FormDataEntryValue | null) {
  const parsed = String(value ?? "").trim();
  return parsed ? parsed : null;
}

function buildAvailabilityRedirect(teamid: string, query: string) {
  return `/captain/team/${teamid}/availability${query}`;
}

export async function updateFixtureAvailabilityAction(formData: FormData) {
  const teamid = String(formData.get("teamid") ?? "").trim();
  const fixtureId = String(formData.get("fixtureId") ?? "").trim();
  const teamMemberId = String(formData.get("teamMemberId") ?? "").trim();
  const response = getResponseValue(formData.get("response"));
  const note = normaliseNullableString(formData.get("note"));

  await requireCaptain(teamid);

  if (!teamid || !fixtureId || !teamMemberId) {
    redirect("/captain");
  }

  const [fixture, membership] = await Promise.all([
    prisma.fixture.findFirst({
      where: {
        id: fixtureId,
        OR: [{ homeTeamId: teamid }, { awayTeamId: teamid }],
      },
      select: { id: true },
    }),
    prisma.teamMember.findFirst({
      where: {
        id: teamMemberId,
        teamId: teamid,
      },
      select: { id: true },
    }),
  ]);

  if (!fixture) {
    redirect(buildAvailabilityRedirect(teamid, "?error=Fixture%20not%20found."));
  }

  if (!membership) {
    redirect(buildAvailabilityRedirect(teamid, "?error=Team%20member%20not%20found."));
  }

  await prisma.fixtureAvailability.upsert({
    where: {
      fixtureId_teamMemberId: {
        fixtureId,
        teamMemberId,
      },
    },
    update: {
      response,
      note,
      respondedAt: response === "NO_RESPONSE" ? null : new Date(),
    },
    create: {
      fixtureId,
      teamMemberId,
      response,
      note,
      respondedAt: response === "NO_RESPONSE" ? null : new Date(),
    },
  });

  revalidatePath(`/captain/team/${teamid}/availability`);
  revalidatePath(`/captain/team/${teamid}/fixtures`);
  revalidatePath(`/captain/team/${teamid}/fixtures/${fixtureId}/selection`);
  redirect(buildAvailabilityRedirect(teamid, "?saved=availability-updated"));
}