// ========================================
// File: src/app/captain/team/[teamid]/squad/actions.ts
// ========================================

"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { TeamRole } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { requireCaptain } from "@/lib/requireCaptain";

const ALLOWED_ROLES: TeamRole[] = [
  "CAPTAIN",
  "MANAGER",
  "PLAYER",
  "COACH",
];

function getRoleValue(input: FormDataEntryValue | null): TeamRole {
  const value = String(input ?? "").trim().toUpperCase();

  if (ALLOWED_ROLES.includes(value as TeamRole)) {
    return value as TeamRole;
  }

  return "PLAYER";
}

function getErrorRedirect(teamid: string, message: string) {
  return `/captain/team/${teamid}/squad?error=${encodeURIComponent(message)}`;
}

function getSuccessRedirect(teamid: string, saved = "1") {
  return `/captain/team/${teamid}/squad?saved=${encodeURIComponent(saved)}`;
}

export async function addSquadMemberAction(formData: FormData) {
  const teamid = String(formData.get("teamid") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const role = getRoleValue(formData.get("role"));

  await requireCaptain(teamid);

  if (!teamid) {
    redirect("/captain");
  }

  if (!email) {
    redirect(getErrorRedirect(teamid, "Enter an email address."));
  }

  const user = await prisma.user.findUnique({
    where: { email },
    select: {
      id: true,
      email: true,
      name: true,
    },
  });

  if (!user) {
    redirect(
      getErrorRedirect(
        teamid,
        "No user exists with that email yet. Ask them to sign in or register first.",
      ),
    );
  }

  const existingMember = await prisma.teamMember.findUnique({
    where: {
      userId_teamId: {
        userId: user.id,
        teamId: teamid,
      },
    },
    select: { id: true },
  });

  if (existingMember) {
    redirect(getErrorRedirect(teamid, "That user is already in this team squad."));
  }

  await prisma.teamMember.create({
    data: {
      teamId: teamid,
      userId: user.id,
      role,
    },
  });

  revalidatePath(`/captain/team/${teamid}`);
  revalidatePath(`/captain/team/${teamid}/squad`);
  redirect(getSuccessRedirect(teamid, "member-added"));
}

export async function updateSquadMemberRoleAction(formData: FormData) {
  const teamid = String(formData.get("teamid") ?? "").trim();
  const membershipId = String(formData.get("membershipId") ?? "").trim();
  const role = getRoleValue(formData.get("role"));

  await requireCaptain(teamid);

  if (!teamid || !membershipId) {
    redirect("/captain");
  }

  const membership = await prisma.teamMember.findFirst({
    where: {
      id: membershipId,
      teamId: teamid,
    },
    select: {
      id: true,
      userId: true,
      role: true,
      team: {
        select: {
          captainUserId: true,
        },
      },
    },
  });

  if (!membership) {
    redirect(getErrorRedirect(teamid, "Squad member not found."));
  }

  await prisma.$transaction(async (tx) => {
    await tx.teamMember.update({
      where: { id: membershipId },
      data: { role },
    });

    if (role === "CAPTAIN") {
      await tx.team.update({
        where: { id: teamid },
        data: {
          captainUserId: membership.userId,
          captainLinkedAt: new Date(),
          captainLinkedSource: "captain-squad-page",
        },
      });
    } else if (
      membership.role === "CAPTAIN" &&
      membership.team.captainUserId === membership.userId
    ) {
      await tx.team.update({
        where: { id: teamid },
        data: {
          captainUserId: null,
        },
      });
    }
  });

  revalidatePath(`/captain/team/${teamid}`);
  revalidatePath(`/captain/team/${teamid}/squad`);
  redirect(getSuccessRedirect(teamid, "role-updated"));
}

export async function removeSquadMemberAction(formData: FormData) {
  const teamid = String(formData.get("teamid") ?? "").trim();
  const membershipId = String(formData.get("membershipId") ?? "").trim();

  await requireCaptain(teamid);

  if (!teamid || !membershipId) {
    redirect("/captain");
  }

  const membership = await prisma.teamMember.findFirst({
    where: {
      id: membershipId,
      teamId: teamid,
    },
    select: {
      id: true,
      userId: true,
      role: true,
      team: {
        select: {
          captainUserId: true,
        },
      },
    },
  });

  if (!membership) {
    redirect(getErrorRedirect(teamid, "Squad member not found."));
  }

  await prisma.$transaction(async (tx) => {
    await tx.teamMember.delete({
      where: { id: membershipId },
    });

    if (membership.team.captainUserId === membership.userId) {
      await tx.team.update({
        where: { id: teamid },
        data: {
          captainUserId: null,
        },
      });
    }
  });

  revalidatePath(`/captain/team/${teamid}`);
  revalidatePath(`/captain/team/${teamid}/squad`);
  redirect(getSuccessRedirect(teamid, "member-removed"));
}