// ========================================
// File: src/app/player/team/[teamid]/availability/actions.ts
// ========================================

"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { UserRole } from "@prisma/client";

import { authOptions } from "@/auth";
import { prisma } from "@/lib/prisma";

const VALID_RESPONSES = new Set(["AVAILABLE", "MAYBE", "UNAVAILABLE"]);

function getString(formData: FormData, key: string) {
  return String(formData.get(key) ?? "").trim();
}

function getAvailabilityPath(input: {
  teamId: string;
  fixtureId?: string;
  saved?: string;
  previewMembershipId?: string | null;
}) {
  const params = new URLSearchParams();
  if (input.fixtureId) params.set("fixtureId", input.fixtureId);
  if (input.saved) params.set("saved", input.saved);
  if (input.previewMembershipId) {
    params.set("previewMembershipId", input.previewMembershipId);
  }

  const query = params.toString();
  return `/player/team/${input.teamId}/availability${query ? `?${query}` : ""}`;
}

export async function updatePlayerFixtureAvailabilityAction(formData: FormData) {
  const session = await getServerSession(authOptions);

  if (!session?.user?.email) {
    redirect("/login");
  }

  const teamId = getString(formData, "teamId");
  const fixtureId = getString(formData, "fixtureId");
  const response = getString(formData, "response");
  const note = getString(formData, "note") || null;
  const requestedPreviewMembershipId = getString(formData, "previewMembershipId") || null;

  const redirectPath = (saved?: string) =>
    getAvailabilityPath({
      teamId,
      fixtureId,
      saved,
      previewMembershipId: requestedPreviewMembershipId,
    });

  if (!teamId || !fixtureId || !VALID_RESPONSES.has(response)) {
    redirect(redirectPath("invalid"));
  }

  const user = await prisma.user.findUnique({
    where: { email: session.user.email.trim().toLowerCase() },
    select: {
      id: true,
      role: true,
      teamMembers: {
        where: { teamId },
        select: { id: true },
        take: 1,
      },
    },
  });

  const previewMembership =
    requestedPreviewMembershipId && user?.role === UserRole.ADMIN
      ? await prisma.teamMember.findFirst({
          where: {
            id: requestedPreviewMembershipId,
            teamId,
          },
          select: { id: true },
        })
      : null;
  const teamMember = previewMembership ?? user?.teamMembers[0] ?? null;

  if (!teamMember) {
    redirect(redirectPath("not-linked"));
  }

  const fixture = await prisma.fixture.findFirst({
    where: {
      id: fixtureId,
      publishedAt: { not: null },
      OR: [{ homeTeamId: teamId }, { awayTeamId: teamId }],
    },
    select: {
      id: true,
      homeTeamId: true,
      awayTeamId: true,
      homeTeam: {
        select: {
          matchdayTargetSize: true,
        },
      },
      awayTeam: {
        select: {
          matchdayTargetSize: true,
        },
      },
      playerMatchFees: {
        where: {
          teamId,
          status: {
            not: "CANCELLED",
          },
        },
        select: {
          teamMemberId: true,
        },
      },
    },
  });

  if (!fixture) {
    redirect(redirectPath("fixture-not-found"));
  }

  const targetSize =
    fixture.homeTeamId === teamId
      ? fixture.homeTeam.matchdayTargetSize ?? 0
      : fixture.awayTeam.matchdayTargetSize ?? 0;
  const selectedMemberIds = new Set(
    fixture.playerMatchFees
      .map((fee) => fee.teamMemberId)
      .filter((id): id is string => Boolean(id)),
  );
  const squadIsFull = targetSize > 0 && selectedMemberIds.size >= targetSize;
  const playerAlreadySelected = selectedMemberIds.has(teamMember.id);

  if (response === "AVAILABLE" && squadIsFull && !playerAlreadySelected) {
    redirect(redirectPath("squad-full"));
  }

  await prisma.fixtureAvailability.upsert({
    where: {
      fixtureId_teamMemberId: {
        fixtureId,
        teamMemberId: teamMember.id,
      },
    },
    update: {
      response,
      note,
      respondedAt: new Date(),
    },
    create: {
      fixtureId,
      teamMemberId: teamMember.id,
      response,
      note,
      respondedAt: new Date(),
    },
  });

  revalidatePath(`/player/team/${teamId}`);
  revalidatePath(getAvailabilityPath({ teamId, fixtureId }));
  revalidatePath(`/admin/teams/${teamId}/availability`);
  revalidatePath(`/captain/team/${teamId}/availability`);

  redirect(redirectPath("availability-updated"));
}
