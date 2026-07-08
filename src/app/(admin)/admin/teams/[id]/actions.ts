// ========================================
// File: src/app/(admin)/admin/teams/[id]/actions.ts
// ========================================

"use server";

import { randomBytes } from "crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { TeamMode } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/requireAdmin";

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
  const latestKickoffTime = normaliseNullableString(
    formData.get("latestKickoffTime"),
  );

  const teamMode = normaliseTeamMode(formData.get("teamMode"));
  const isRecruiting = String(formData.get("isRecruiting") ?? "") === "on";
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

  const existingTeam = await prisma.team.findUnique({
    where: { id },
    select: {
      leagueId: true,
      captainUserId: true,
    },
  });

  if (!existingTeam) {
    redirect("/admin/teams");
  }

  const updatedTeam = await prisma.$transaction(async (tx) => {
    const updated = await tx.team.update({
      where: { id },
      data: {
        name,
        leagueId,
        logoUrl,
        latestKickoffTime,
        teamMode,
        isRecruiting,
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

    if (leagueId) {
      await tx.leagueSeasonTeam.updateMany({
        where: {
          teamId: id,
          leagueId: {
            not: leagueId,
          },
        },
        data: {
          isActive: false,
        },
      });
    } else {
      await tx.leagueSeasonTeam.updateMany({
        where: { teamId: id },
        data: {
          isActive: false,
        },
      });
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

  redirect(buildTeamRedirect(id, "?saved=1"));
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
