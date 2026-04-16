// ========================================
// File: src/app/(admin)/admin/teams/[id]/squad/actions.ts
// ========================================

"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { TeamRole } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/requireAdmin";

const ALLOWED_ROLES: TeamRole[] = [
  "CAPTAIN",
  "MANAGER",
  "PLAYER",
  "COACH",
  "VICE_CAPTAIN",
  "BACKUP_PLAYER",
];

function getRoleValue(input: FormDataEntryValue | null): TeamRole {
  const value = String(input ?? "").trim().toUpperCase();

  if (ALLOWED_ROLES.includes(value as TeamRole)) {
    return value as TeamRole;
  }

  return "PLAYER";
}

function buildRedirect(teamId: string, query: string) {
  return `/admin/teams/${teamId}/squad${query}`;
}

export async function addAdminSquadMemberAction(formData: FormData) {
  await requireAdmin();

  const teamId = String(formData.get("teamId") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const role = getRoleValue(formData.get("role"));

  if (!teamId) {
    redirect("/admin/teams");
  }

  if (!email) {
    redirect(buildRedirect(teamId, "?error=Email%20is%20required."));
  }

  const user = await prisma.user.findUnique({
    where: { email },
    select: {
      id: true,
    },
  });

  if (!user) {
    redirect(
      buildRedirect(
        teamId,
        "?error=No%20existing%20SIXFL%20user%20was%20found%20for%20that%20email.",
      ),
    );
  }

  const existingMembership = await prisma.teamMember.findUnique({
    where: {
      userId_teamId: {
        userId: user.id,
        teamId,
      },
    },
    select: {
      id: true,
    },
  });

  if (existingMembership) {
    redirect(buildRedirect(teamId, "?error=That%20user%20is%20already%20in%20the%20squad."));
  }

  await prisma.teamMember.create({
    data: {
      teamId,
      userId: user.id,
      role,
    },
  });

  revalidatePath(`/admin/teams/${teamId}`);
  revalidatePath(`/admin/teams/${teamId}/squad`);
  redirect(buildRedirect(teamId, "?saved=member-added"));
}

export async function updateAdminSquadMemberRoleAction(formData: FormData) {
  await requireAdmin();

  const teamId = String(formData.get("teamId") ?? "").trim();
  const membershipId = String(formData.get("membershipId") ?? "").trim();
  const role = getRoleValue(formData.get("role"));

  if (!teamId || !membershipId) {
    redirect("/admin/teams");
  }

  const membership = await prisma.teamMember.findFirst({
    where: {
      id: membershipId,
      teamId,
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
    redirect(buildRedirect(teamId, "?error=Squad%20member%20not%20found."));
  }

  await prisma.$transaction(async (tx) => {
    await tx.teamMember.update({
      where: { id: membershipId },
      data: { role },
    });

    if (role === "CAPTAIN") {
      await tx.team.update({
        where: { id: teamId },
        data: {
          captainUserId: membership.userId,
          captainLinkedAt: new Date(),
          captainLinkedSource: "admin-squad-page",
        },
      });
    } else if (
      membership.role === "CAPTAIN" &&
      membership.team.captainUserId === membership.userId
    ) {
      await tx.team.update({
        where: { id: teamId },
        data: {
          captainUserId: null,
        },
      });
    }
  });

  revalidatePath(`/admin/teams/${teamId}`);
  revalidatePath(`/admin/teams/${teamId}/squad`);
  redirect(buildRedirect(teamId, "?saved=role-updated"));
}

export async function removeAdminSquadMemberAction(formData: FormData) {
  await requireAdmin();

  const teamId = String(formData.get("teamId") ?? "").trim();
  const membershipId = String(formData.get("membershipId") ?? "").trim();

  if (!teamId || !membershipId) {
    redirect("/admin/teams");
  }

  const membership = await prisma.teamMember.findFirst({
    where: {
      id: membershipId,
      teamId,
    },
    select: {
      id: true,
      userId: true,
      team: {
        select: {
          captainUserId: true,
        },
      },
    },
  });

  if (!membership) {
    redirect(buildRedirect(teamId, "?error=Squad%20member%20not%20found."));
  }

  await prisma.$transaction(async (tx) => {
    await tx.teamMember.delete({
      where: { id: membershipId },
    });

    if (membership.team.captainUserId === membership.userId) {
      await tx.team.update({
        where: { id: teamId },
        data: {
          captainUserId: null,
        },
      });
    }
  });

  revalidatePath(`/admin/teams/${teamId}`);
  revalidatePath(`/admin/teams/${teamId}/squad`);
  redirect(buildRedirect(teamId, "?saved=member-removed"));
}