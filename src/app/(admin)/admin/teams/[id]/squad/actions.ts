// ========================================
// File: src/app/(admin)/admin/teams/[id]/squad/actions.ts
// ========================================

"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { TeamRole, UserRole } from "@prisma/client";

import { sendDashboardLoginEmail } from "@/lib/auth/sendDashboardLoginEmail";
import { moveTeamMemberToProspect } from "@/lib/managed-squad/movePlayerToProspect";
import { setTeamMemberSquadStatus, type TeamMemberSquadStatus } from "@/lib/managed-squad/squadStatus";
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

function getSquadStatusValue(input: FormDataEntryValue | null): TeamMemberSquadStatus {
  return String(input ?? "").trim().toUpperCase() === "INJURED" ? "INJURED" : "ACTIVE";
}

function buildRedirect(teamId: string, query: string) {
  return `/admin/teams/${teamId}/squad${query}`;
}

function revalidateSquadAndProspectPaths(teamId: string) {
  revalidatePath(`/admin/teams/${teamId}`);
  revalidatePath(`/admin/teams/${teamId}/squad`);
  revalidatePath(`/admin/teams/${teamId}/prospects`);
  revalidatePath(`/captain/team/${teamId}`);
  revalidatePath(`/captain/team/${teamId}/squad`);
  revalidatePath(`/captain/team/${teamId}/prospects`);
  revalidatePath("/admin/player-prospects");
}

function cleanText(value: FormDataEntryValue | null) {
  return String(value ?? "").trim();
}

function cleanEmail(value: FormDataEntryValue | null) {
  return cleanText(value).toLowerCase();
}

function getPlayerDisplayName(input: { name: string | null; email: string | null }) {
  return input.name?.trim() || input.email?.trim() || "Player";
}

export async function addAdminSquadMemberAction(formData: FormData) {
  await requireAdmin();

  const teamId = String(formData.get("teamId") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const role = getRoleValue(formData.get("role"));
  const squadNumberRaw = String(formData.get("squadNumber") ?? "").trim();
  const squadNumber = squadNumberRaw ? Number(squadNumberRaw) : null;

  if (!teamId) {
    redirect("/admin/teams");
  }

  if (!email) {
    redirect(buildRedirect(teamId, "?error=Email%20is%20required."));
  }

  if (squadNumber !== null && (!Number.isInteger(squadNumber) || squadNumber < 1 || squadNumber > 99)) {
    redirect(buildRedirect(teamId, "?error=Squad%20number%20must%20be%20between%201%20and%2099%20or%20left%20blank."));
  }

  const team = await prisma.team.findUnique({
    where: { id: teamId },
    select: { id: true, name: true },
  });

  if (!team) {
    redirect("/admin/teams");
  }

  const user = await prisma.user.findUnique({
    where: { email },
    select: {
      id: true,
      name: true,
      email: true,
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

  if (squadNumber !== null) {
    const duplicate = await prisma.$queryRaw<Array<{ id: string }>>`
      SELECT tm."id"
      FROM "TeamMember" tm
      JOIN "TeamMemberProfile" p ON p."teamMemberId" = tm."id"
      WHERE tm."teamId" = ${teamId}
        AND p."squadNumber" = ${squadNumber}
      LIMIT 1
    `;
    if (duplicate[0]) {
      redirect(buildRedirect(teamId, `?error=${encodeURIComponent(`Squad number ${squadNumber} is already used by another player.`)}`));
    }
  }

  const member = await prisma.teamMember.create({
    data: {
      teamId,
      userId: user.id,
      role,
    },
    select: { id: true },
  });

  if (squadNumber !== null) {
    await prisma.$executeRawUnsafe(`
      ALTER TABLE "TeamMemberProfile"
        ADD COLUMN IF NOT EXISTS "squadNumber" INTEGER;
    `);
    await prisma.$executeRaw`
      INSERT INTO "TeamMemberProfile" ("id","teamMemberId","squadNumber","updatedAt")
      VALUES (${randomUUID()},${member.id},${squadNumber},NOW())
      ON CONFLICT ("teamMemberId") DO UPDATE SET
        "squadNumber"=EXCLUDED."squadNumber",
        "updatedAt"=NOW()
    `;
  }

  await sendDashboardLoginEmail({
    email: user.email?.trim().toLowerCase() || email,
    displayName: getPlayerDisplayName(user),
    teamName: team.name,
    callbackPath: `/player/team/${teamId}`,
  });

  revalidatePath(`/admin/teams/${teamId}`);
  revalidatePath(`/admin/teams/${teamId}/squad`);
  redirect(buildRedirect(teamId, "?saved=member-added-login-email"));
}

export async function grantAdminCaptainAccessAction(formData: FormData) {
  await requireAdmin();

  const teamId = cleanText(formData.get("teamId"));
  const email = cleanEmail(formData.get("email"));
  const name = cleanText(formData.get("name")) || null;

  if (!teamId) redirect("/admin/teams");

  if (!email) {
    redirect(buildRedirect(teamId, "?error=Captain%20email%20is%20required."));
  }

  const team = await prisma.team.findUnique({
    where: { id: teamId },
    select: {
      id: true,
      name: true,
      contactName: true,
      contactEmail: true,
      captainUserId: true,
    },
  });

  if (!team) redirect("/admin/teams");

  const now = new Date();

  await prisma.$transaction(async (tx) => {
    const user = await tx.user.upsert({
      where: { email },
      update: name ? { name } : {},
      create: {
        email,
        name: name ?? team.contactName ?? null,
      },
      select: { id: true },
    });

    await tx.teamMember.upsert({
      where: {
        userId_teamId: {
          userId: user.id,
          teamId: team.id,
        },
      },
      update: {
        role: TeamRole.CAPTAIN,
      },
      create: {
        userId: user.id,
        teamId: team.id,
        role: TeamRole.CAPTAIN,
      },
    });

    await tx.team.update({
      where: { id: team.id },
      data: {
        contactEmail: team.contactEmail?.trim() || email,
        contactName: team.contactName?.trim() || name,
        captainUserId: user.id,
        captainLinkedAt: now,
        captainLinkedSource: "ADMIN_CAPTAIN_ACCESS_OVERRIDE",
        captainInviteSentTo: email,
        captainClaimedAt: now,
        captainClaimSource: "ADMIN_CAPTAIN_ACCESS_OVERRIDE",
      },
    });
  });

  revalidatePath(`/admin/teams/${teamId}`);
  revalidatePath(`/admin/teams/${teamId}/squad`);
  revalidatePath(`/captain/team/${teamId}`);
  revalidatePath(`/captain/team/${teamId}/fixtures`);
  revalidatePath(`/captain/team/${teamId}/squad`);
  revalidatePath("/admin/captains");

  redirect(buildRedirect(teamId, "?saved=captain-access-granted"));
}

export async function blockAdminPlayerAccessAction(formData: FormData) {
  const { user: adminUser } = await requireAdmin();

  const teamId = cleanText(formData.get("teamId"));
  const membershipId = cleanText(formData.get("membershipId"));
  const reason = cleanText(formData.get("reason")).slice(0, 500) || null;

  if (!teamId || !membershipId) {
    redirect("/admin/teams");
  }

  const membership = await prisma.teamMember.findFirst({
    where: {
      id: membershipId,
      teamId,
    },
    select: {
      user: {
        select: {
          id: true,
          email: true,
          role: true,
          accessBlockedAt: true,
        },
      },
    },
  });

  if (!membership) {
    redirect(buildRedirect(teamId, "?error=Squad%20member%20not%20found."));
  }

  if (membership.user.role === UserRole.ADMIN) {
    redirect(
      buildRedirect(
        teamId,
        "?error=Administrator%20accounts%20cannot%20be%20blocked%20from%20a%20team%20squad%20page.",
      ),
    );
  }

  if (adminUser?.id && membership.user.id === adminUser.id) {
    redirect(
      buildRedirect(
        teamId,
        "?error=You%20cannot%20block%20your%20own%20SIXFL%20account.",
      ),
    );
  }

  const blockedAt = new Date();
  const blockedByName =
    adminUser?.name?.trim() ||
    adminUser?.email?.trim() ||
    "SIXFL admin";

  await prisma.$transaction(async (tx) => {
    await tx.user.update({
      where: { id: membership.user.id },
      data: {
        accessBlockedAt: blockedAt,
        accessBlockedReason: reason,
        accessBlockedByUserId: adminUser?.id ?? null,
        accessBlockedByName: blockedByName,
      },
    });

    // Database sessions are the live sign-in authority. Removing them signs the
    // player out immediately on every device without deleting any football,
    // payment or account history.
    await tx.session.deleteMany({
      where: { userId: membership.user.id },
    });

    // Invalidate any unused magic links that were issued before the block.
    const email = membership.user.email?.trim().toLowerCase();
    if (email) {
      await tx.verificationToken.deleteMany({
        where: { identifier: email },
      });
    }
  });

  revalidateSquadAndProspectPaths(teamId);
  revalidatePath(`/admin/teams/${teamId}/players/${membershipId}/preview`);
  redirect(buildRedirect(teamId, "?saved=player-access-blocked"));
}

export async function restoreAdminPlayerAccessAction(formData: FormData) {
  await requireAdmin();

  const teamId = cleanText(formData.get("teamId"));
  const membershipId = cleanText(formData.get("membershipId"));

  if (!teamId || !membershipId) {
    redirect("/admin/teams");
  }

  const membership = await prisma.teamMember.findFirst({
    where: {
      id: membershipId,
      teamId,
    },
    select: {
      userId: true,
    },
  });

  if (!membership) {
    redirect(buildRedirect(teamId, "?error=Squad%20member%20not%20found."));
  }

  await prisma.user.update({
    where: { id: membership.userId },
    data: {
      accessBlockedAt: null,
      accessBlockedReason: null,
      accessBlockedByUserId: null,
      accessBlockedByName: null,
    },
  });

  revalidateSquadAndProspectPaths(teamId);
  revalidatePath(`/admin/teams/${teamId}/players/${membershipId}/preview`);
  redirect(buildRedirect(teamId, "?saved=player-access-restored"));
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

    if (role === "CAPTAIN" && !membership.team.captainUserId) {
      // Granting captain access should not silently replace an existing primary
      // captain. The dedicated "Change primary captain" control owns that job.
      await tx.team.update({
        where: { id: teamId },
        data: {
          captainUserId: membership.userId,
          captainLinkedAt: new Date(),
          captainLinkedSource: "admin-squad-page-first-captain",
        },
      });
    } else if (
      membership.role === "CAPTAIN" &&
      membership.team.captainUserId === membership.userId &&
      role !== "CAPTAIN"
    ) {
      const replacement = await tx.teamMember.findFirst({
        where: {
          teamId,
          id: { not: membershipId },
          role: TeamRole.CAPTAIN,
        },
        orderBy: { createdAt: "asc" },
        select: { userId: true },
      });

      await tx.team.update({
        where: { id: teamId },
        data: {
          captainUserId: replacement?.userId ?? null,
          captainLinkedAt: replacement ? new Date() : null,
          captainLinkedSource: replacement ? "admin-squad-page-fallback-captain" : null,
        },
      });
    }
  });

  revalidatePath(`/admin/teams/${teamId}`);
  revalidatePath(`/admin/teams/${teamId}/squad`);
  redirect(buildRedirect(teamId, "?saved=role-updated"));
}

export async function updateAdminSquadMemberStatusAction(formData: FormData) {
  await requireAdmin();

  const teamId = cleanText(formData.get("teamId"));
  const membershipId = cleanText(formData.get("membershipId"));
  const status = getSquadStatusValue(formData.get("squadStatus"));
  const note = cleanText(formData.get("note")) || null;

  if (!teamId || !membershipId) {
    redirect("/admin/teams");
  }

  const updated = await setTeamMemberSquadStatus({
    teamId,
    membershipId,
    status,
    note,
  });

  if (!updated) {
    redirect(buildRedirect(teamId, "?error=Squad%20member%20not%20found."));
  }

  revalidateSquadAndProspectPaths(teamId);
  redirect(buildRedirect(teamId, status === "INJURED" ? "?saved=member-marked-injured" : "?saved=member-marked-active"));
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

export async function moveAdminSquadMemberToProspectsAction(formData: FormData) {
  await requireAdmin();

  const teamId = String(formData.get("teamId") ?? "").trim();
  const membershipId = String(formData.get("membershipId") ?? "").trim();

  if (!teamId || !membershipId) {
    redirect("/admin/teams");
  }

  const result = await moveTeamMemberToProspect({
    teamId,
    membershipId,
  });

  if (!result.ok) {
    redirect(buildRedirect(teamId, "?error=Squad%20member%20not%20found."));
  }

  revalidateSquadAndProspectPaths(teamId);
  redirect(buildRedirect(teamId, "?saved=moved-to-prospects"));
}
