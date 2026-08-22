"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/requireAdmin";
import { recordParticipationAudit } from "@/lib/participation/controls";

function text(formData: FormData, key: string) {
  return String(formData.get(key) ?? "").trim();
}

function redirectWith(query: string) {
  redirect(`/admin/participation-controls${query}`);
}

function parseUntil(value: string) {
  if (!value) return null;
  const parsed = new Date(`${value}T23:59:59.999Z`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

async function getActorUserId() {
  const { user } = await requireAdmin();
  return user?.id ?? null;
}

async function ensureNonAdminUser(userId: string) {
  const rows = await prisma.$queryRawUnsafe<Array<{ role: string }>>(
    `SELECT "role"::text AS "role" FROM "User" WHERE "id" = $1 LIMIT 1`,
    userId,
  );

  if (!rows[0]) redirectWith("?error=user_not_found");
  if (rows[0].role === "ADMIN") redirectWith("?error=admin_protected");
}

export async function blockTeamRegistrationAction(formData: FormData) {
  const actorUserId = await getActorUserId();
  const teamId = text(formData, "teamId");
  const reason = text(formData, "reason");
  const restrictCaptain = text(formData, "restrictCaptain") === "on";

  if (!teamId || !reason) redirectWith("?error=team_reason_required");

  const teamRows = await prisma.$queryRawUnsafe<
    Array<{ id: string; name: string; captainUserId: string | null }>
  >(
    `
      SELECT
        team."id",
        team."name",
        COALESCE(
          team."captainUserId",
          (
            SELECT member."userId"
            FROM "TeamMember" member
            WHERE member."teamId" = team."id"
              AND member."role"::text = 'CAPTAIN'
            ORDER BY member."createdAt" ASC
            LIMIT 1
          )
        ) AS "captainUserId"
      FROM "Team" team
      WHERE team."id" = $1
      LIMIT 1
    `,
    teamId,
  );

  const team = teamRows[0];
  if (!team) redirectWith("?error=team_not_found");

  await prisma.$transaction(async (tx) => {
    await tx.$executeRawUnsafe(
      `
        UPDATE "Team"
        SET
          "registrationBlocked" = true,
          "registrationBlockedAt" = NOW(),
          "registrationBlockedReason" = $2,
          "registrationReviewRequired" = false,
          "registrationReviewReason" = NULL,
          "registrationReviewSourceTeamId" = NULL,
          "registrationReviewApprovedAt" = NULL,
          "isRecruiting" = false
        WHERE "id" = $1
      `,
      teamId,
      reason,
    );

    if (restrictCaptain && team.captainUserId) {
      const protectedRows = await tx.$queryRawUnsafe<Array<{ role: string }>>(
        `SELECT "role"::text AS "role" FROM "User" WHERE "id" = $1 LIMIT 1`,
        team.captainUserId,
      );

      if (protectedRows[0]?.role !== "ADMIN") {
        await tx.$executeRawUnsafe(
          `
            UPDATE "User"
            SET
              "teamManagementRestricted" = true,
              "teamManagementRestrictedAt" = NOW(),
              "teamManagementRestrictionReason" = $2
            WHERE "id" = $1
          `,
          team.captainUserId,
          `Linked to blocked team ${team.name}. ${reason}`,
        );
      }
    }
  });

  await recordParticipationAudit({
    subjectType: "TEAM",
    subjectId: teamId,
    action: "BLOCK_TEAM_REGISTRATION",
    reason,
    createdByUserId: actorUserId,
  });

  if (restrictCaptain && team.captainUserId) {
    await recordParticipationAudit({
      subjectType: "USER",
      subjectId: team.captainUserId,
      action: "RESTRICT_TEAM_MANAGEMENT_FROM_BLOCKED_TEAM",
      reason: `Linked to blocked team ${team.name}. ${reason}`,
      createdByUserId: actorUserId,
    });
  }

  revalidatePath("/admin/participation-controls");
  revalidatePath(`/admin/teams/${teamId}`);
  revalidatePath("/admin/teams");
  redirectWith("?saved=team_blocked");
}

export async function clearTeamRegistrationBlockAction(formData: FormData) {
  const actorUserId = await getActorUserId();
  const teamId = text(formData, "teamId");
  const reason = text(formData, "reason") || "Block cleared by SIXFL admin.";

  if (!teamId) redirectWith("?error=team_not_found");

  await prisma.$executeRawUnsafe(
    `
      UPDATE "Team"
      SET
        "registrationBlocked" = false,
        "registrationBlockedAt" = NULL,
        "registrationBlockedReason" = NULL
      WHERE "id" = $1
    `,
    teamId,
  );

  await recordParticipationAudit({
    subjectType: "TEAM",
    subjectId: teamId,
    action: "CLEAR_TEAM_REGISTRATION_BLOCK",
    reason,
    createdByUserId: actorUserId,
  });

  revalidatePath("/admin/participation-controls");
  revalidatePath(`/admin/teams/${teamId}`);
  redirectWith("?saved=team_cleared");
}

export async function approveTeamRegistrationReviewAction(formData: FormData) {
  const actorUserId = await getActorUserId();
  const teamId = text(formData, "teamId");
  const reason = text(formData, "reason") || "Registration overlap reviewed and approved by SIXFL admin.";

  if (!teamId) redirectWith("?error=team_not_found");

  await prisma.$executeRawUnsafe(
    `
      UPDATE "Team"
      SET
        "registrationReviewRequired" = false,
        "registrationReviewApprovedAt" = NOW(),
        "registrationReviewReason" = NULL,
        "registrationReviewSourceTeamId" = NULL
      WHERE "id" = $1
    `,
    teamId,
  );

  await recordParticipationAudit({
    subjectType: "TEAM",
    subjectId: teamId,
    action: "APPROVE_REFORMED_TEAM_REVIEW",
    reason,
    createdByUserId: actorUserId,
  });

  revalidatePath("/admin/participation-controls");
  revalidatePath(`/admin/teams/${teamId}`);
  redirectWith("?saved=review_approved");
}

export async function restrictTeamManagementAction(formData: FormData) {
  const actorUserId = await getActorUserId();
  const userId = text(formData, "userId");
  const reason = text(formData, "reason");

  if (!userId || !reason) redirectWith("?error=user_reason_required");
  await ensureNonAdminUser(userId);

  await prisma.$executeRawUnsafe(
    `
      UPDATE "User"
      SET
        "teamManagementRestricted" = true,
        "teamManagementRestrictedAt" = NOW(),
        "teamManagementRestrictionReason" = $2
      WHERE "id" = $1
    `,
    userId,
    reason,
  );

  await recordParticipationAudit({
    subjectType: "USER",
    subjectId: userId,
    action: "RESTRICT_TEAM_MANAGEMENT",
    reason,
    createdByUserId: actorUserId,
  });

  revalidatePath("/admin/participation-controls");
  redirectWith("?saved=management_restricted");
}

export async function clearTeamManagementRestrictionAction(formData: FormData) {
  const actorUserId = await getActorUserId();
  const userId = text(formData, "userId");
  const reason = text(formData, "reason") || "Team-management restriction cleared by SIXFL admin.";

  if (!userId) redirectWith("?error=user_not_found");

  await prisma.$executeRawUnsafe(
    `
      UPDATE "User"
      SET
        "teamManagementRestricted" = false,
        "teamManagementRestrictedAt" = NULL,
        "teamManagementRestrictionReason" = NULL
      WHERE "id" = $1
    `,
    userId,
  );

  await recordParticipationAudit({
    subjectType: "USER",
    subjectId: userId,
    action: "CLEAR_TEAM_MANAGEMENT_RESTRICTION",
    reason,
    createdByUserId: actorUserId,
  });

  revalidatePath("/admin/participation-controls");
  redirectWith("?saved=management_cleared");
}

export async function suspendPlayerAction(formData: FormData) {
  const actorUserId = await getActorUserId();
  const userId = text(formData, "userId");
  const reason = text(formData, "reason");
  const until = parseUntil(text(formData, "until"));

  if (!userId || !reason) redirectWith("?error=user_reason_required");
  await ensureNonAdminUser(userId);

  await prisma.$executeRawUnsafe(
    `
      UPDATE "User"
      SET
        "playingRestricted" = true,
        "playingRestrictedAt" = NOW(),
        "playingRestrictedUntil" = $2,
        "playingRestrictionReason" = $3
      WHERE "id" = $1
    `,
    userId,
    until,
    reason,
  );

  await recordParticipationAudit({
    subjectType: "USER",
    subjectId: userId,
    action: "SUSPEND_PLAYER",
    reason,
    until,
    createdByUserId: actorUserId,
  });

  revalidatePath("/admin/participation-controls");
  redirectWith("?saved=player_suspended");
}

export async function clearPlayerSuspensionAction(formData: FormData) {
  const actorUserId = await getActorUserId();
  const userId = text(formData, "userId");
  const reason = text(formData, "reason") || "Player suspension cleared by SIXFL admin.";

  if (!userId) redirectWith("?error=user_not_found");

  await prisma.$executeRawUnsafe(
    `
      UPDATE "User"
      SET
        "playingRestricted" = false,
        "playingRestrictedAt" = NULL,
        "playingRestrictedUntil" = NULL,
        "playingRestrictionReason" = NULL
      WHERE "id" = $1
    `,
    userId,
  );

  await recordParticipationAudit({
    subjectType: "USER",
    subjectId: userId,
    action: "CLEAR_PLAYER_SUSPENSION",
    reason,
    createdByUserId: actorUserId,
  });

  revalidatePath("/admin/participation-controls");
  redirectWith("?saved=player_cleared");
}
