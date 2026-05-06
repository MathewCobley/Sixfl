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

function getErrorRedirect(teamid: string, message: string) {
  return `/captain/team/${teamid}/squad?error=${encodeURIComponent(message)}`;
}

function getSuccessRedirect(teamid: string, saved = "player-updated") {
  return `/captain/team/${teamid}/squad?saved=${encodeURIComponent(saved)}`;
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

  if (!access.isAdmin) {
    redirect(getErrorRedirect(teamid, "Only SIXFL admins can edit managed squad player details."));
  }

  if (Number.isNaN(playerMatchFeeOverride)) {
    redirect(getErrorRedirect(teamid, "Player fee override must be a valid amount or left blank."));
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
    redirect(getErrorRedirect(teamid, "Squad member not found."));
  }

  if (membership.team.teamMode !== "MANAGED") {
    redirect(getErrorRedirect(teamid, "Player details can only be edited here for SIXFL-managed teams."));
  }

  if (!displayName && !email) {
    redirect(getErrorRedirect(teamid, "Add at least a player name or email address."));
  }

  if (email && !email.includes("@")) {
    redirect(getErrorRedirect(teamid, "Enter a valid email address."));
  }

  if (email && email !== membership.user.email?.toLowerCase()) {
    const existingEmailUser = await prisma.user.findUnique({
      where: { email },
      select: { id: true },
    });

    if (existingEmailUser && existingEmailUser.id !== membership.userId) {
      redirect(getErrorRedirect(teamid, "That email address is already used by another SIXFL account."));
    }
  }

  const preferredNights = parsePreferredNights(preferredNightsText);
  const preferredNightsJson = preferredNights ? JSON.stringify(preferredNights) : null;
  const profileId = randomUUID();
  const phoneNormalized = normalizePhoneNumber(phone);

  const existingProfiles = await prisma.$queryRaw<
    Array<{ sourceProspectId: string | null }>
  >`
    SELECT "sourceProspectId"
    FROM "TeamMemberProfile"
    WHERE "teamMemberId" = ${membershipId}
    LIMIT 1
  `;
  const sourceProspectId = existingProfiles[0]?.sourceProspectId ?? null;

  await prisma.$transaction(async (tx) => {
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
        ${playerMatchFeeOverride},
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
          managedTeamPlayer: true,
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
          managedTeamPlayer: true,
        },
        lastSyncedAt: new Date(),
      },
    });
  });

  revalidatePath(`/captain/team/${teamid}`);
  revalidatePath(`/captain/team/${teamid}/squad`);
  revalidatePath(`/captain/team/${teamid}/fixtures`);
  revalidatePath(`/captain/team/${teamid}/match-fees`);
  revalidatePath(`/admin/teams/${teamid}`);
  revalidatePath(`/admin/teams/${teamid}/communications`);

  redirect(getSuccessRedirect(teamid));
}
