// ========================================
// File: src/app/player/team/[teamid]/availability/actions.ts
// ========================================

"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";

import { authOptions } from "@/auth";
import { prisma } from "@/lib/prisma";

const VALID_RESPONSES = new Set(["AVAILABLE", "MAYBE", "UNAVAILABLE"]);

function getString(formData: FormData, key: string) {
  return String(formData.get(key) ?? "").trim();
}

function getAvailabilityPath(teamId: string, fixtureId?: string, saved?: string) {
  const params = new URLSearchParams();
  if (fixtureId) params.set("fixtureId", fixtureId);
  if (saved) params.set("saved", saved);
  const query = params.toString();
  return `/player/team/${teamId}/availability${query ? `?${query}` : ""}`;
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

  if (!teamId || !fixtureId || !VALID_RESPONSES.has(response)) {
    redirect(getAvailabilityPath(teamId, fixtureId, "invalid"));
  }

  const user = await prisma.user.findUnique({
    where: { email: session.user.email.trim().toLowerCase() },
    select: {
      id: true,
      teamMembers: {
        where: { teamId },
        select: { id: true },
        take: 1,
      },
    },
  });

  const teamMember = user?.teamMembers[0] ?? null;

  if (!teamMember) {
    redirect(getAvailabilityPath(teamId, fixtureId, "not-linked"));
  }

  const fixture = await prisma.fixture.findFirst({
    where: {
      id: fixtureId,
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
    redirect(getAvailabilityPath(teamId, fixtureId, "fixture-not-found"));
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
    redirect(getAvailabilityPath(teamId, fixtureId, "squad-full"));
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
  revalidatePath(getAvailabilityPath(teamId, fixtureId));
  revalidatePath(`/admin/teams/${teamId}/availability`);
  revalidatePath(`/captain/team/${teamId}/availability`);

  redirect(getAvailabilityPath(teamId, fixtureId, "availability-updated"));
}
