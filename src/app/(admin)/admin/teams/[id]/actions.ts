// ========================================
// File: src/app/(admin)/admin/teams/[id]/actions.ts
// ========================================

"use server";

import { randomBytes } from "crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { Prisma, TeamMode, TeamRole } from "@prisma/client";

import { sendDashboardLoginEmail } from "@/lib/auth/sendDashboardLoginEmail";
import { upsertTeamNotificationRecipient } from "@/lib/notifications/team-contacts";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/requireAdmin";
import { isValidTeamBroadcastCode, normaliseTeamBroadcastCode } from "@/lib/teams/broadcast-code";

function normaliseNullableString(value: FormDataEntryValue | null) {
  const parsed = String(value ?? "").trim();
  return parsed ? parsed : null;
}

function normaliseNullableInt(value: FormDataEntryValue | null) {
  const parsed = String(value ?? "").trim();

  if (!parsed) {
    return null;
  }

  const asNumber = Number(parsed);

  if (!Number.isInteger(asNumber) || asNumber < 0) {
    return null;
  }

  return asNumber;
}

function normaliseTeamMode(value: FormDataEntryValue | null): TeamMode {
  const parsed = String(value ?? "").trim().toUpperCase();
  return parsed === "MANAGED" ? "MANAGED" : "STANDARD";
}

function buildTeamRedirect(id: string, query: string) {
  return `/admin/teams/${id}${query}`;
}

export async function updateTeamDetailsAction(formData: FormData) {
  await requireAdmin();

  const id = String(formData.get("id") ?? "").trim();
  const name = String(formData.get("name") ?? "").trim();
  const leagueId = normaliseNullableString(formData.get("leagueId"));
  const logoUrl = normaliseNullableString(formData.get("logoUrl"));
  const broadcastCode = normaliseTeamBroadcastCode(formData.get("broadcastCode"), name);
  const latestKickoffTime = normaliseNullableString(
    formData.get("latestKickoffTime"),
  );

  const teamMode = normaliseTeamMode(formData.get("teamMode"));
  const isRecruiting = String(formData.get("isRecruiting") ?? "") === "on";
  const playsOnceDoublePoints =
    String(formData.get("playsOnceDoublePoints") ?? "") === "on";
  const joinSlug = normaliseNullableString(formData.get("joinSlug"));
  const squadTargetSize = normaliseNullableInt(formData.get("squadTargetSize"));
  const matchdayTargetSize = normaliseNullableInt(
    formData.get("matchdayTargetSize"),
  );
  const managerNotes = normaliseNullableString(formData.get("managerNotes"));

  const contactName = normaliseNullableString(formData.get("contactName"));
  const contactEmail = normaliseNullableString(formData.get("contactEmail"));
  const contactPhone = normaliseNullableString(formData.get("contactPhone"));
  const secondaryContactName = normaliseNullableString(
    formData.get("secondaryContactName"),
  );
  const secondaryContactEmail = normaliseNullableString(
    formData.get("secondaryContactEmail"),
  );
  const secondaryContactPhone = normaliseNullableString(
    formData.get("secondaryContactPhone"),
  );

  if (!id) {
    redirect("/admin/teams");
  }

  if (!name) {
    redirect(buildTeamRedirect(id, "?error=missing_name"));
  }

  if (!isValidTeamBroadcastCode(broadcastCode)) {
    redirect(buildTeamRedirect(id, "?error=invalid_broadcast_code"));
  }

  const existingTeam = await prisma.team.findUnique({
    where: { id },
    select: {
      leagueId: true,
      captainUserId: true,
      teamMode: true,
    },
  });

  if (!existingTeam) {
    redirect("/admin/teams");
  }

  const isManagedToStandardConversion =
    existingTeam.teamMode === TeamMode.MANAGED && teamMode === TeamMode.STANDARD;

  const updatedTeam = await prisma.$transaction(async (tx) => {
    const updated = await tx.team.update({
      where: { id },
      data: {
        name,
        leagueId,
        logoUrl,
        broadcastCode,
        latestKickoffTime,
        teamMode,
        isRecruiting,
        playsOnceDoublePoints,
        joinSlug,
        squadTargetSize,
        matchdayTargetSize,
        managerNotes,
        contactName,
        contactEmail,
        contactPhone,
        secondaryContactName,
        secondaryContactEmail,
        secondaryContactPhone,
        divisionId: leagueId ? undefined : null,
      },
      select: {
        captainUserId: true,
      },
    });

    if (isManagedToStandardConversion) {
      // This is the financial cut-off between the two payment models. Keep all
      // historical managed-squad payment records, but do not let them become
      // standard-team credit after the mode change. A later MANAGED -> STANDARD
      // conversion deliberately resets the boundary again.
      await tx.$executeRaw(Prisma.sql`
        UPDATE "Team"
        SET "standardCreditStartedAt" = NOW()
        WHERE "id" = ${id}
      `);
    }

    // Keep every unplayed fixture in step with this admin setting, including a
    // schedule that has already been published. Completed/resulted fixtures keep
    // their snapshot so historical standings cannot be rewritten later.
    await tx.$executeRaw(Prisma.sql`
      UPDATE "Fixture" f
      SET
        "doublePoints" = EXISTS (
          SELECT 1
          FROM "Team" t
          WHERE t."id" IN (f."homeTeamId", f."awayTeamId")
            AND COALESCE(t."playsOnceDoublePoints", false) = true
        ),
        "updatedAt" = NOW()
      WHERE f."status" IN ('SCHEDULED','POSTPONED')
        AND NOT EXISTS (
          SELECT 1 FROM "MatchResult" mr WHERE mr."fixtureId" = f."id"
        )
        AND (${id} = f."homeTeamId" OR ${id} = f."awayTeamId")
    `);

    // A normal details save (including toggling double points) must never
    // rewrite season participation. Only an actual league change is allowed to
    // touch LeagueSeasonTeam rows. When moving between seasons of the same
    // competition, preserve those season memberships; they are independent
    // historical/private-season records.
    if (existingTeam.leagueId !== leagueId) {
      if (leagueId) {
        await tx.$executeRaw(Prisma.sql`
          UPDATE "LeagueSeasonTeam" membership
          SET "isActive" = false, "updatedAt" = NOW()
          FROM "League" season, "League" target
          WHERE membership."teamId" = ${id}
            AND membership."leagueId" = season."id"
            AND target."id" = ${leagueId}
            AND membership."leagueId" <> ${leagueId}
            AND (
              target."competitionId" IS NULL
              OR season."competitionId" IS DISTINCT FROM target."competitionId"
            )
        `);
      } else {
        await tx.$executeRaw(Prisma.sql`
          UPDATE "LeagueSeasonTeam"
          SET "isActive" = false, "updatedAt" = NOW()
          WHERE "teamId" = ${id}
        `);
      }
    }

    return updated;
  });

  if (contactName && updatedTeam.captainUserId) {
    await prisma.user.updateMany({
      where: {
        id: updatedTeam.captainUserId,
        OR: [{ name: null }, { name: "" }],
      },
      data: {
        name: contactName,
      },
    });
  }

  revalidatePath(`/admin/teams/${id}`);
  revalidatePath("/admin/teams");
  revalidatePath("/admin/users");
  revalidatePath("/admin/captains");
  revalidatePath("/admin/fixtures");
  revalidatePath("/admin/fixtures/generate");
  revalidatePath("/admin/payments");
  revalidatePath("/admin/payments/team-credits");

  if (existingTeam.leagueId) {
    revalidatePath(`/admin/leagues/${existingTeam.leagueId}`);
    revalidatePath(`/admin/leagues/${existingTeam.leagueId}/fixtures`);
  }

  if (leagueId) {
    revalidatePath(`/admin/leagues/${leagueId}`);
    revalidatePath(`/admin/leagues/${leagueId}/fixtures`);
  }

  revalidatePath(`/captain/team/${id}`);
  revalidatePath(`/captain/team/${id}/squad`);
  revalidatePath(`/captain/team/${id}/payments`);

  redirect(buildTeamRedirect(id, "?saved=1"));
}

export async function changePrimaryCaptainAction(formData: FormData) {
  await requireAdmin();

  const teamId = String(formData.get("teamId") ?? "").trim();
  const membershipId = String(formData.get("membershipId") ?? "").trim();
  const keepPreviousCaptain =
    String(formData.get("keepPreviousCaptain") ?? "") === "on";

  if (!teamId) {
    redirect("/admin/teams");
  }

  if (!membershipId) {
    redirect(buildTeamRedirect(teamId, "?error=missing_primary_captain"));
  }

  const [team, selectedMember] = await Promise.all([
    prisma.team.findUnique({
      where: { id: teamId },
      select: {
        id: true,
        captainUserId: true,
      },
    }),
    prisma.teamMember.findFirst({
      where: {
        id: membershipId,
        teamId,
      },
      select: {
        id: true,
        userId: true,
        role: true,
        user: {
          select: {
            name: true,
            email: true,
          },
        },
      },
    }),
  ]);

  if (!team || !selectedMember) {
    redirect(buildTeamRedirect(teamId, "?error=primary_captain_not_found"));
  }

  const captainEmail = selectedMember.user.email?.trim().toLowerCase() ?? "";
  if (!captainEmail) {
    redirect(buildTeamRedirect(teamId, "?error=primary_captain_missing_email"));
  }

  const phoneRows = await prisma.$queryRaw<Array<{ phone: string | null }>>(Prisma.sql`
    SELECT "phone"
    FROM "TeamMemberProfile"
    WHERE "teamMemberId" = ${selectedMember.id}
    LIMIT 1
  `).catch(() => []);
  const captainPhone = phoneRows[0]?.phone?.trim() || null;
  const now = new Date();

  await prisma.$transaction(async (tx) => {
    const previousPrimary =
      team.captainUserId && team.captainUserId !== selectedMember.userId
        ? await tx.teamMember.findUnique({
            where: {
              userId_teamId: {
                userId: team.captainUserId,
                teamId,
              },
            },
            select: {
              id: true,
              role: true,
            },
          })
        : null;

    if (
      previousPrimary?.role === TeamRole.CAPTAIN &&
      !keepPreviousCaptain
    ) {
      await tx.teamMember.update({
        where: { id: previousPrimary.id },
        data: { role: TeamRole.PLAYER },
      });
    }

    if (selectedMember.role !== TeamRole.CAPTAIN) {
      await tx.teamMember.update({
        where: { id: selectedMember.id },
        data: { role: TeamRole.CAPTAIN },
      });
    }

    await tx.team.update({
      where: { id: teamId },
      data: {
        captainUserId: selectedMember.userId,
        captainLinkedAt: now,
        captainLinkedSource: "ADMIN_PRIMARY_CAPTAIN_CHANGE",
        captainInviteSentAt: null,
        captainInviteSentTo: null,
        captainClaimedAt: null,
        captainClaimSource: null,
        contactName:
          selectedMember.user.name?.trim() || captainEmail,
        contactEmail: captainEmail,
        contactPhone: captainPhone,
      },
    });
  });

  // Keep email/SMS routing aligned with the newly selected primary captain.
  // The redirected team page also re-syncs this, so a transient messaging
  // failure must not make an already-completed captain change look unsuccessful.
  await upsertTeamNotificationRecipient(teamId).catch((error) => {
    console.error("Could not immediately sync the new primary captain to team messaging", {
      teamId,
      error,
    });
  });

  let captainSignin = "sent";
  try {
    await sendDashboardLoginEmail({
      email: captainEmail,
      displayName: selectedMember.user.name,
      callbackPath: `/captain/team/${teamId}`,
    });
  } catch (error) {
    captainSignin = "failed";
    console.error("Primary captain changed but sign-in email could not be sent", {
      teamId,
      error,
    });
  }

  revalidatePath(`/admin/teams/${teamId}`);
  revalidatePath(`/admin/teams/${teamId}/squad`);
  revalidatePath(`/captain/team/${teamId}`);
  revalidatePath(`/captain/team/${teamId}/fixtures`);
  revalidatePath(`/captain/team/${teamId}/squad`);
  revalidatePath(`/captain/team/${teamId}/payments`);
  revalidatePath("/admin/teams");
  revalidatePath("/admin/captains");
  revalidatePath("/admin/messaging");

  redirect(buildTeamRedirect(teamId, `?captainChanged=1&captainSignin=${encodeURIComponent(captainSignin)}`));
}

export async function regenerateClaimCodeAction(formData: FormData) {
  await requireAdmin();

  const id = String(formData.get("id") ?? "").trim();

  if (!id) {
    redirect("/admin/teams");
  }

  const newCode = randomBytes(4).toString("hex");

  await prisma.team.update({
    where: { id },
    data: {
      claimCode: newCode,
      captainUserId: null,
      captainLinkedAt: null,
      captainLinkedSource: null,
      captainInviteSentAt: null,
      captainInviteSentTo: null,
      captainClaimedAt: null,
      captainClaimSource: null,
      members: {
        deleteMany: {
          role: "MANAGER",
        },
      },
    },
  });

  revalidatePath(`/admin/teams/${id}`);
  revalidatePath(`/captain/team/${id}`);
  redirect(buildTeamRedirect(id, "?regenerated=1"));
}

export async function deleteTeamAction(formData: FormData) {
  await requireAdmin();

  const id = String(formData.get("id") ?? "").trim();

  if (!id) {
    redirect("/admin/teams");
  }

  try {
    await prisma.team.delete({
      where: { id },
    });
  } catch {
    redirect(buildTeamRedirect(id, "?error=has_fixtures"));
  }

  revalidatePath("/admin/teams");
  redirect("/admin/teams");
}
