// ========================================
// File: src/app/(admin)/admin/users/actions.ts
// ========================================

"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { TeamRole } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/requireAdmin";
import { upsertTeamMemberProfileFromProspect } from "@/lib/teamMemberProfiles";

function getSafeRedirectPath(value: FormDataEntryValue | null, fallback: string) {
  const text = String(value ?? "").trim();
  return text || fallback;
}

function appendStatusToPath(path: string, key: "saved" | "error", value: string) {
  const separator = path.includes("?") ? "&" : "?";
  return `${path}${separator}${key}=${encodeURIComponent(value)}`;
}

function getDisplayNameFromProspect(input: {
  firstName: string;
  lastName: string | null;
  email: string | null;
}) {
  const fullName = [input.firstName, input.lastName].filter(Boolean).join(" ").trim();
  return fullName || input.email?.trim() || "Squad player";
}

export async function updateAdminUserProfileAction(formData: FormData) {
  await requireAdmin();

  const userId = String(formData.get("userId") ?? "").trim();
  const name = String(formData.get("name") ?? "").trim();
  const usesWhatsapp = formData.get("usesWhatsapp") === "on";
  const from = getSafeRedirectPath(formData.get("from"), "/admin/users");

  if (!userId) {
    redirect(appendStatusToPath(from, "error", "Missing user id."));
  }

  if (!name) {
    redirect(appendStatusToPath(from, "error", "Name is required."));
  }

  await prisma.$transaction(async (tx) => {
    await tx.user.update({
      where: { id: userId },
      data: {
        name,
      },
    });

    await tx.$executeRaw`
      UPDATE "User"
      SET "usesWhatsapp" = ${usesWhatsapp}
      WHERE id = ${userId}
    `;
  });

  revalidatePath("/admin/users");
  revalidatePath("/admin/captains");
  revalidatePath("/admin/teams");
  revalidatePath("/captain");
  redirect(appendStatusToPath(from, "saved", "1"));
}

export async function linkAdminUserToSquadProspectAction(formData: FormData) {
  await requireAdmin();

  const userId = String(formData.get("userId") ?? "").trim();
  const prospectId = String(formData.get("prospectId") ?? "").trim();
  const from = getSafeRedirectPath(formData.get("from"), "/admin/users");

  if (!userId || !prospectId) {
    redirect(appendStatusToPath(from, "error", "Missing user or prospect id."));
  }

  const [user, prospect] = await Promise.all([
    prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        name: true,
        email: true,
      },
    }),
    prisma.teamPlayerProspect.findUnique({
      where: { id: prospectId },
      select: {
        id: true,
        teamId: true,
        firstName: true,
        lastName: true,
        email: true,
        phone: true,
        ageBand: true,
        preferredPositions: true,
        experienceSummary: true,
        availabilityLevel: true,
        preferredNights: true,
        availabilitySummary: true,
        notes: true,
        team: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    }),
  ]);

  if (!user || !prospect) {
    redirect(appendStatusToPath(from, "error", "Could not find the user or prospect."));
  }

  if (!prospect.teamId || !prospect.team) {
    redirect(appendStatusToPath(from, "error", "Assign this prospect to a team before linking a user account."));
  }

  const userEmail = user.email?.trim().toLowerCase() ?? null;
  const prospectEmail = prospect.email?.trim().toLowerCase() ?? null;

  if (!userEmail || !prospectEmail || userEmail !== prospectEmail) {
    redirect(
      appendStatusToPath(
        from,
        "error",
        "The user email must match the prospect email before linking.",
      ),
    );
  }

  const displayName = getDisplayNameFromProspect(prospect);

  const member = await prisma.$transaction(async (tx) => {
    const existingMember = await tx.teamMember.findUnique({
      where: {
        userId_teamId: {
          userId: user.id,
          teamId: prospect.teamId,
        },
      },
      select: {
        id: true,
        role: true,
      },
    });

    const linkedMember = existingMember
      ? existingMember
      : await tx.teamMember.create({
          data: {
            userId: user.id,
            teamId: prospect.teamId,
            role: TeamRole.PLAYER,
          },
          select: {
            id: true,
            role: true,
          },
        });

    await upsertTeamMemberProfileFromProspect({
      client: tx,
      teamMemberId: linkedMember.id,
      prospect,
    });

    await tx.teamPlayerProspect.update({
      where: { id: prospect.id },
      data: {
        status: "ACTIVE_SQUAD",
      },
    });

    if (!user.name?.trim()) {
      await tx.user.update({
        where: { id: user.id },
        data: {
          name: displayName,
        },
      });
    }

    return linkedMember;
  });

  revalidatePath("/admin/users");
  revalidatePath(`/admin/teams/${prospect.teamId}`);
  revalidatePath(`/admin/teams/${prospect.teamId}/prospects`);
  revalidatePath(`/captain/team/${prospect.teamId}`);
  revalidatePath(`/captain/team/${prospect.teamId}/squad`);

  redirect(
    appendStatusToPath(
      from,
      "saved",
      `Linked ${displayName} to ${prospect.team.name} as ${member.role}.`,
    ),
  );
}
