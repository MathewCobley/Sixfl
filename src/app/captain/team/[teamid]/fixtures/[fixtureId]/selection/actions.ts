// ========================================
// File: src/app/captain/team/[teamid]/fixtures/[fixtureId]/selection/actions.ts
// ========================================

"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { prisma } from "@/lib/prisma";
import { requireCaptain } from "@/lib/requireCaptain";

const ALLOWED_SELECTION_STATUSES = ["SELECTED", "BACKUP", "NOT_SELECTED"] as const;
type SelectionStatus = (typeof ALLOWED_SELECTION_STATUSES)[number];

function getSelectionStatus(value: FormDataEntryValue | null): SelectionStatus {
  const parsed = String(value ?? "").trim().toUpperCase();

  if (ALLOWED_SELECTION_STATUSES.includes(parsed as SelectionStatus)) {
    return parsed as SelectionStatus;
  }

  return "NOT_SELECTED";
}

function buildSelectionRedirect(teamid: string, fixtureId: string, query: string) {
  return `/captain/team/${teamid}/fixtures/${fixtureId}/selection${query}`;
}

export async function updateFixtureSelectionAction(formData: FormData) {
  const teamid = String(formData.get("teamid") ?? "").trim();
  const fixtureId = String(formData.get("fixtureId") ?? "").trim();
  const teamMemberId = String(formData.get("teamMemberId") ?? "").trim();
  const selectionStatus = getSelectionStatus(formData.get("selectionStatus"));
  const isCaptain = String(formData.get("isCaptain") ?? "") === "on";
  const isGoalkeeper = String(formData.get("isGoalkeeper") ?? "") === "on";
  const note = String(formData.get("note") ?? "").trim() || null;

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
    redirect(buildSelectionRedirect(teamid, fixtureId, "?error=Fixture%20not%20found."));
  }

  if (!membership) {
    redirect(buildSelectionRedirect(teamid, fixtureId, "?error=Team%20member%20not%20found."));
  }

  await prisma.$transaction(async (tx) => {
    if (isCaptain) {
      await tx.fixtureSelection.updateMany({
        where: {
          fixtureId,
          isCaptain: true,
        },
        data: {
          isCaptain: false,
        },
      });
    }

    await tx.fixtureSelection.upsert({
      where: {
        fixtureId_teamMemberId: {
          fixtureId,
          teamMemberId,
        },
      },
      update: {
        selectionStatus,
        isCaptain,
        isGoalkeeper,
        note,
      },
      create: {
        fixtureId,
        teamMemberId,
        selectionStatus,
        isCaptain,
        isGoalkeeper,
        note,
      },
    });
  });

  revalidatePath(`/captain/team/${teamid}/availability`);
  revalidatePath(`/captain/team/${teamid}/fixtures`);
  revalidatePath(`/captain/team/${teamid}/fixtures/${fixtureId}/selection`);
  redirect(buildSelectionRedirect(teamid, fixtureId, "?saved=selection-updated"));
}