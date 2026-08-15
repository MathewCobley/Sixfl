// ========================================
// File: src/app/captain/team/[teamid]/squad/edit-actions.ts
// ========================================

"use server";

import { randomUUID } from "crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { NotificationAudience, NotificationRecipientSourceType } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { requireCaptain } from "@/lib/requireCaptain";
import { normalizePhoneNumber } from "@/lib/messaging/phone";

function getSquadReturnPath(teamid: string, isAdmin: boolean) {
  return isAdmin
    ? `/captain/team/${teamid}/squad`
    : `/captain/team/${teamid}/captain-squad`;
}

function getErrorRedirect(teamid: string, message: string, isAdmin: boolean) {
  return `${getSquadReturnPath(teamid, isAdmin)}?error=${encodeURIComponent(message)}`;
}

function getSuccessRedirect(teamid: string, isAdmin: boolean, saved = "player-updated") {
  return `${getSquadReturnPath(teamid, isAdmin)}?saved=${encodeURIComponent(saved)}`;
}

function getNullableString(value: FormDataEntryValue | null) {
  const parsed = String(value ?? "").trim();
  return parsed || null;
}

function getEmailValue(value: FormDataEntryValue | null) {
  const parsed = String(value ?? "").trim().toLowerCase();
  return parsed || null;
}

function parsePreferredNights(value: string | null) {
  if (!value) return null;

  const nights = value
    .split(/[\n,]+/)
    .map((item) => item.trim().toUpperCase())
    .filter(Boolean);

  return nights.length > 0 ? nights : null;
}

function parsePlayerMatchFeeOverride(value: FormDataEntryValue | null) {
  const rawValue = String(value ?? "").replace(/[£,\s]/g, "").trim();

  if (!rawValue) return null;

  const parsed = Number(rawValue);

  if (!Number.isFinite(parsed) || parsed < 0) {
    return Number.NaN;
  }

  return Math.round(parsed * 100);
}

export async function updateManagedSquadMemberDetailsAction(formData: FormData) {
  const teamid = String(formData.get("teamid") ?? "").trim();
  const membershipId = String(formData.get("membershipId") ?? "").trim();
  const displayName = getNullableString(formData.get("displayName"));
  const email = getEmailValue(formData.get("email"));
  const phone = getNullableString(formData.get("phone"));
  const usesWhatsapp = formData.get("usesWhatsapp") === "on";
  const playerMatchFeeOverride = parsePlayerMatchFeeOverride(
    formData.get("playerMatchFeeOverride"),
  );
  const preferredPositions = getNullableString(formData.get("preferredPositions"));
  const experienceSummary = getNullableString(formData.get("experienceSummary"));
  const availabilityLevel = getNullableString(formData.get("availabilityLevel"));
  const preferredNightsText = getNullableString(formData.get("preferredNights"));
  const availabilitySummary = getNullableString(formData.get("availabilitySummary"));
  const notes = getNullableString(formData.get("notes"));

  const access = await requireCaptain(teamid);

  if (!teamid || !membershipId) {
    redirect("/captain");
  }

  if (access.isAdmin && Number.isNaN(playerMatchFeeOverride)) {
    redirect(getErrorRedirect(teamid, "Player fee override must be a valid amount or left blank.", access.isAdmin));
  }

  const membership = await prisma.teamMember.findFirst({
    where: {
      id: membershipId,
      teamId: teamid,
    },
    select: {
      id: true,
      userId: true,
      user: {
        select: {
          id: true,
          name: true,
          email: true,
        },
      },
      team: {
        select: {
          id: true,
          name: true,
          teamMode: true,
        },
      },
    },
  });

  if (!membership) {
    redirect(getErrorRedirect(teamid, "Squad member not found.", access.isAdmin));
  }

  if (!displayName && !email) {
    redirect(getErrorRedirect(teamid, "Add at least a player name or email address.", access.isAdmin));
  }

  if (email && !email.includes("@")) {
    redirect(getErrorRedirect(teamid, "Enter a valid email address.", access.isAdmin));
  }

  if (email && email !== membership.user.email?.toLowerCase()) {
    const existingEmailUser = await prisma.user.findUnique({
      where: { email },
      select: { id: true },
    });

    if (existingEmailUser && existingEmailUser.id !== membership.userId) {
      redirect(getErrorRedirect(teamid, "That email address is already used by another SIXFL account.", access.isAdmin));
    }
  }

  const preferredNights = parsePreferredNights(preferredNightsText);
  const preferredNightsJson = preferredNights ? JSON.stringify(preferredNights) : null;
  const profileId = randomUUID();
  const phoneNormalized = normalizePhoneNumber(phone);

  const existingProfiles = await prisma.$queryRaw<
    Array<{
      sourceProspectId: string | null;
      playerMatchFeePenceOverride: number | null;
    }>
  >`
    SELECT "sourceProspectId", "playerMatchFeePenceOverride"
    FROM "TeamMemberProfile"
    WHERE "teamMemberId" = ${membershipId}
    LIMIT 1
  `;
  const sourceProspectId = existingProfiles[0]?.sourceProspectId ?? null;
  const existingPlayerMatchFeeOverride =
    existingProfiles[0]?.playerMatchFeePenceOverride ?? null;
  const nextPlayerMatchFeeOverride = access.isAdmin
    ? playerMatchFeeOverride
    : existingPlayerMatchFeeOverride;
  const playerMatchFeeOverrideChanged =
    access.isAdmin &&
    existingPlayerMatchFeeOverride !== nextPlayerMatchFeeOverride;

  await prisma.$transaction(async (tx) => {
    await tx.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "TeamMemberProfile" (
        "id" TEXT NOT NULL,
        "teamMemberId" TEXT NOT NULL,
        "sourceProspectId" TEXT,
        "phone" TEXT,
        "ageBand" TEXT,
        "preferredPositions" TEXT,
        "experienceSummary" TEXT,
        "availabilityLevel" TEXT,
        "preferredNights" JSONB,
        "availabilitySummary" TEXT,
        "notes" TEXT,
        "playerMatchFeePenceOverride" INTEGER,
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "TeamMemberProfile_pkey" PRIMARY KEY ("id")
      );
    `);

    await tx.$executeRawUnsafe(`
      CREATE UNIQUE INDEX IF NOT EXISTS "TeamMemberProfile_teamMemberId_key"
      ON "TeamMemberProfile"("teamMemberId");
    `);

    await tx.$executeRawUnsafe(`
      ALTER TABLE "TeamMemberProfile"
        ADD COLUMN IF NOT EXISTS "playerMatchFeePenceOverride" INTEGER;
    `);

    await tx.user.update({
      where: { id: membership.userId },
      data: {
        name: displayName,
        email,
      },
    });

    await tx.$executeRaw`
      UPDATE "User"
      SET "usesWhatsapp" = ${usesWhatsapp}
      WHERE id = ${membership.userId}
    `;

    await tx.$executeRaw`
      INSERT INTO "TeamMemberProfile" (
        "id",
        "teamMemberId",
        "phone",
        "playerMatchFeePenceOverride",
        "preferredPositions",
        "experienceSummary",
        "availabilityLevel",
        "preferredNights",
        "availabilitySummary",
        "notes",
        "updatedAt"
      ) VALUES (
        ${profileId},
        ${membershipId},
        ${phone},
        ${nextPlayerMatchFeeOverride},
        ${preferredPositions},
        ${experienceSummary},
        ${availabilityLevel},
        CAST(${preferredNightsJson} AS jsonb),
        ${availabilitySummary},
        ${notes},
        NOW()
      )
      ON CONFLICT ("teamMemberId") DO UPDATE SET
        "phone" = EXCLUDED."phone",
        "playerMatchFeePenceOverride" = EXCLUDED."playerMatchFeePenceOverride",
        "preferredPositions" = EXCLUDED."preferredPositions",
        "experienceSummary" = EXCLUDED."experienceSummary",
        "availabilityLevel" = EXCLUDED."availabilityLevel",
        "preferredNights" = EXCLUDED."preferredNights",
        "availabilitySummary" = EXCLUDED."availabilitySummary",
        "notes" = EXCLUDED."notes",
        "updatedAt" = NOW()
    `;

    if (playerMatchFeeOverrideChanged) {
      await tx.$executeRawUnsafe(`
        CREATE TABLE IF NOT EXISTS "TeamMemberFeeOverrideAudit" (
          "id" TEXT NOT NULL,
          "teamMemberId" TEXT NOT NULL,
          "teamId" TEXT NOT NULL,
          "oldAmountPence" INTEGER,
          "newAmountPence" INTEGER,
          "changedByUserId" TEXT,
          "changedByEmail" TEXT,
          "source" TEXT NOT NULL,
          "reason" TEXT,
          "changedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
          CONSTRAINT "TeamMemberFeeOverrideAudit_pkey" PRIMARY KEY ("id")
        );
      `);

      await tx.$executeRaw`
        INSERT INTO "TeamMemberFeeOverrideAudit" (
          "id",
          "teamMemberId",
          "teamId",
          "oldAmountPence",
          "newAmountPence",
          "changedByUserId",
          "changedByEmail",
          "source",
          "reason",
          "changedAt"
        ) VALUES (
          ${randomUUID()},
          ${membershipId},
          ${teamid},
          ${existingPlayerMatchFeeOverride},
          ${nextPlayerMatchFeeOverride},
          ${access.user?.id ?? null},
          ${access.user?.email ?? null},
          ${"ADMIN_PLAYER_EDIT"},
          ${"Administrator changed player match fee override"},
          NOW()
        )
      `;
    }

    if (sourceProspectId) {
      const splitName = (displayName ?? "").split(/\s+/).filter(Boolean);
      const firstName = splitName[0] ?? displayName ?? "Player";
      const lastName = splitName.length > 1 ? splitName.slice(1).join(" ") : null;

      await tx.teamPlayerProspect.updateMany({
        where: {
          id: sourceProspectId,
          teamId: teamid,
        },
        data: {
          firstName,
          lastName,
          email,
          phone,
          preferredPositions,
          experienceSummary,
          availabilityLevel,
          preferredNights: preferredNights ?? undefined,
          availabilitySummary,
          notes,
        },
      });
    }

    await tx.notificationRecipient.upsert({
      where: {
        sourceType_sourceId: {
          sourceType: NotificationRecipientSourceType.USER,
          sourceId: membership.userId,
        },
      },
      update: {
        audience: NotificationAudience.USER,
        displayName,
        email,
        emailNormalized: email,
        phone,
        phoneNormalized,
        transactionalEmailOptIn: true,
        transactionalSmsOptIn: true,
        metadata: {
          teamId: teamid,
          teamName: membership.team.name,
          userId: membership.userId,
          managedTeamPlayer: membership.team.teamMode === "MANAGED",
          updatedByCaptain: !access.isAdmin,
          usesWhatsapp,
        },
        lastSyncedAt: new Date(),
      },
      create: {
        sourceType: NotificationRecipientSourceType.USER,
        sourceId: membership.userId,
        audience: NotificationAudience.USER,
        displayName,
        email,
        emailNormalized: email,
        phone,
        phoneNormalized,
        transactionalEmailOptIn: true,
        transactionalSmsOptIn: true,
        metadata: {
          teamId: teamid,
          teamName: membership.team.name,
          userId: membership.userId,
          managedTeamPlayer: membership.team.teamMode === "MANAGED",
          updatedByCaptain: !access.isAdmin,
          usesWhatsapp,
        },
        lastSyncedAt: new Date(),
      },
    });
  });

  revalidatePath(`/captain/team/${teamid}`);
  revalidatePath(`/captain/team/${teamid}/squad`);
  revalidatePath(`/captain/team/${teamid}/captain-squad`);
  revalidatePath(`/captain/team/${teamid}/fixtures`);
  revalidatePath(`/captain/team/${teamid}/match-fees`);
  revalidatePath(`/captain/team/${teamid}/player-payments`);
  revalidatePath(`/admin/teams/${teamid}`);
  revalidatePath(`/admin/teams/${teamid}/squad`);
  revalidatePath(`/admin/teams/${teamid}/communications`);
  revalidatePath("/admin/users");

  redirect(getSuccessRedirect(teamid, access.isAdmin));
}
