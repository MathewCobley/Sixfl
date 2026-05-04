// ========================================
// File: src/app/(admin)/admin/teams/[id]/prospects/actions.ts
// ========================================

"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/requireAdmin";

const ALLOWED_PROSPECT_STATUSES = [
  "NEW",
  "CONTACTED",
  "TRIAL",
  "ACTIVE_SQUAD",
  "BACKUP",
  "DECLINED",
] as const;

type ProspectStatus = (typeof ALLOWED_PROSPECT_STATUSES)[number];

function normaliseNullableString(value: FormDataEntryValue | null) {
  const parsed = String(value ?? "").trim();
  return parsed ? parsed : null;
}

function getProspectStatus(value: FormDataEntryValue | null): ProspectStatus {
  const parsed = String(value ?? "").trim().toUpperCase();

  if (ALLOWED_PROSPECT_STATUSES.includes(parsed as ProspectStatus)) {
    return parsed as ProspectStatus;
  }

  return "NEW";
}

function buildRedirect(teamId: string, query: string) {
  return `/admin/teams/${teamId}/prospects${query}`;
}

export async function addAdminProspectAction(formData: FormData) {
  await requireAdmin();

  const teamId = String(formData.get("teamId") ?? "").trim();
  const firstName = String(formData.get("firstName") ?? "").trim();
  const lastName = normaliseNullableString(formData.get("lastName"));
  const email =
    normaliseNullableString(formData.get("email"))?.toLowerCase() ?? null;
  const phone = normaliseNullableString(formData.get("phone"));
  const preferredPositions = normaliseNullableString(
    formData.get("preferredPositions"),
  );
  const experienceSummary = normaliseNullableString(
    formData.get("experienceSummary"),
  );
  const availabilitySummary = normaliseNullableString(
    formData.get("availabilitySummary"),
  );
  const source = normaliseNullableString(formData.get("source"));
  const notes = normaliseNullableString(formData.get("notes"));

  if (!teamId) {
    redirect("/admin/teams");
  }

  if (!firstName) {
    redirect(buildRedirect(teamId, "?error=First%20name%20is%20required."));
  }

  await prisma.teamPlayerProspect.create({
    data: {
      teamId,
      firstName,
      lastName,
      email,
      phone,
      preferredPositions,
      experienceSummary,
      availabilitySummary,
      source,
      notes,
      status: "NEW",
    },
  });

  revalidatePath(`/admin/teams/${teamId}`);
  revalidatePath(`/admin/teams/${teamId}/prospects`);
  redirect(buildRedirect(teamId, "?saved=prospect-added"));
}

export async function updateAdminProspectDetailsAction(formData: FormData) {
  await requireAdmin();

  const teamId = String(formData.get("teamId") ?? "").trim();
  const prospectId = String(formData.get("prospectId") ?? "").trim();
  const firstName = String(formData.get("firstName") ?? "").trim();
  const lastName = normaliseNullableString(formData.get("lastName"));
  const email =
    normaliseNullableString(formData.get("email"))?.toLowerCase() ?? null;
  const phone = normaliseNullableString(formData.get("phone"));

  if (!teamId || !prospectId) {
    redirect("/admin/teams");
  }

  if (!firstName) {
    redirect(buildRedirect(teamId, "?error=First%20name%20is%20required."));
  }

  const prospect = await prisma.teamPlayerProspect.findFirst({
    where: {
      id: prospectId,
      teamId,
    },
    select: {
      id: true,
    },
  });

  if (!prospect) {
    redirect(buildRedirect(teamId, "?error=Prospect%20not%20found."));
  }

  await prisma.teamPlayerProspect.update({
    where: { id: prospectId },
    data: {
      firstName,
      lastName,
      email,
      phone,
    },
  });

  revalidatePath(`/admin/teams/${teamId}`);
  revalidatePath(`/admin/teams/${teamId}/prospects`);
  redirect(buildRedirect(teamId, "?saved=details-updated"));
}

export async function updateAdminProspectStatusAction(formData: FormData) {
  await requireAdmin();

  const teamId = String(formData.get("teamId") ?? "").trim();
  const prospectId = String(formData.get("prospectId") ?? "").trim();
  const status = getProspectStatus(formData.get("status"));

  if (!teamId || !prospectId) {
    redirect("/admin/teams");
  }

  const prospect = await prisma.teamPlayerProspect.findFirst({
    where: {
      id: prospectId,
      teamId,
    },
    select: {
      id: true,
    },
  });

  if (!prospect) {
    redirect(buildRedirect(teamId, "?error=Prospect%20not%20found."));
  }

  await prisma.teamPlayerProspect.update({
    where: { id: prospectId },
    data: {
      status,
      lastContactedAt:
        status === "CONTACTED" || status === "TRIAL" ? new Date() : undefined,
    },
  });

  revalidatePath(`/admin/teams/${teamId}`);
  revalidatePath(`/admin/teams/${teamId}/prospects`);
  redirect(buildRedirect(teamId, "?saved=status-updated"));
}

export async function updateAdminProspectNotesAction(formData: FormData) {
  await requireAdmin();

  const teamId = String(formData.get("teamId") ?? "").trim();
  const prospectId = String(formData.get("prospectId") ?? "").trim();
  const notes = normaliseNullableString(formData.get("notes"));

  if (!teamId || !prospectId) {
    redirect("/admin/teams");
  }

  const prospect = await prisma.teamPlayerProspect.findFirst({
    where: {
      id: prospectId,
      teamId,
    },
    select: {
      id: true,
    },
  });

  if (!prospect) {
    redirect(buildRedirect(teamId, "?error=Prospect%20not%20found."));
  }

  await prisma.teamPlayerProspect.update({
    where: { id: prospectId },
    data: { notes },
  });

  revalidatePath(`/admin/teams/${teamId}`);
  revalidatePath(`/admin/teams/${teamId}/prospects`);
  redirect(buildRedirect(teamId, "?saved=notes-updated"));
}

export async function moveAdminProspectToTeamAction(formData: FormData) {
  await requireAdmin();

  const teamId = String(formData.get("teamId") ?? "").trim();
  const prospectId = String(formData.get("prospectId") ?? "").trim();
  const targetTeamId = String(formData.get("targetTeamId") ?? "").trim();

  if (!teamId || !prospectId) {
    redirect("/admin/teams");
  }

  if (!targetTeamId || targetTeamId === teamId) {
    redirect(buildRedirect(teamId, "?error=Choose%20a%20different%20managed%20team."));
  }

  const [prospect, targetTeam] = await Promise.all([
    prisma.teamPlayerProspect.findFirst({
      where: {
        id: prospectId,
        teamId,
      },
      select: {
        id: true,
      },
    }),
    prisma.team.findFirst({
      where: {
        id: targetTeamId,
        teamMode: "MANAGED",
      },
      select: {
        id: true,
      },
    }),
  ]);

  if (!prospect) {
    redirect(buildRedirect(teamId, "?error=Prospect%20not%20found."));
  }

  if (!targetTeam) {
    redirect(buildRedirect(teamId, "?error=Target%20managed%20team%20not%20found."));
  }

  await prisma.teamPlayerProspect.update({
    where: { id: prospect.id },
    data: { teamId: targetTeam.id },
  });

  revalidatePath(`/admin/teams/${teamId}`);
  revalidatePath(`/admin/teams/${teamId}/prospects`);
  revalidatePath(`/admin/teams/${targetTeam.id}`);
  revalidatePath(`/admin/teams/${targetTeam.id}/prospects`);
  revalidatePath(`/captain/team/${teamId}/prospects`);
  revalidatePath(`/captain/team/${targetTeam.id}/prospects`);
  redirect(buildRedirect(teamId, "?saved=prospect-moved"));
}

export async function convertAdminProspectToMemberAction(formData: FormData) {
  await requireAdmin();

  const teamId = String(formData.get("teamId") ?? "").trim();
  const prospectId = String(formData.get("prospectId") ?? "").trim();

  if (!teamId || !prospectId) {
    redirect("/admin/teams");
  }

  const prospect = await prisma.teamPlayerProspect.findFirst({
    where: {
      id: prospectId,
      teamId,
    },
    select: {
      id: true,
      email: true,
      firstName: true,
      lastName: true,
      status: true,
    },
  });

  if (!prospect) {
    redirect(buildRedirect(teamId, "?error=Prospect%20not%20found."));
  }

  const normalizedEmail = prospect.email?.trim().toLowerCase() ?? null;

  const user = normalizedEmail
    ? await prisma.user.findUnique({
        where: { email: normalizedEmail },
        select: {
          id: true,
          email: true,
        },
      })
    : null;

  const existingMembership = user
    ? await prisma.teamMember.findUnique({
        where: {
          userId_teamId: {
            userId: user.id,
            teamId,
          },
        },
        select: {
          id: true,
        },
      })
    : null;

  await prisma.$transaction(async (tx) => {
    if (user && !existingMembership) {
      await tx.teamMember.create({
        data: {
          teamId,
          userId: user.id,
          role: "PLAYER",
        },
      });
    }

    await tx.teamPlayerProspect.update({
      where: { id: prospect.id },
      data: {
        status: "ACTIVE_SQUAD",
        lastContactedAt: new Date(),
      },
    });
  });

  revalidatePath(`/admin/teams/${teamId}`);
  revalidatePath(`/admin/teams/${teamId}/squad`);
  revalidatePath(`/admin/teams/${teamId}/prospects`);
  revalidatePath(`/captain/team/${teamId}/squad`);
  revalidatePath(`/captain/team/${teamId}/prospects`);
  redirect(buildRedirect(teamId, "?saved=promoted"));
}
