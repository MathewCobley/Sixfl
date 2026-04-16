// ========================================
// File: src/app/captain/team/[teamid]/prospects/actions.ts
// ========================================

"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { prisma } from "@/lib/prisma";
import { requireCaptain } from "@/lib/requireCaptain";

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

  if (
    ALLOWED_PROSPECT_STATUSES.includes(parsed as ProspectStatus)
  ) {
    return parsed as ProspectStatus;
  }

  return "NEW";
}

function buildProspectsRedirect(teamid: string, query: string) {
  return `/captain/team/${teamid}/prospects${query}`;
}

export async function addProspectAction(formData: FormData) {
  const teamid = String(formData.get("teamid") ?? "").trim();

  await requireCaptain(teamid);

  const firstName = String(formData.get("firstName") ?? "").trim();
  const lastName = normaliseNullableString(formData.get("lastName"));
  const email = normaliseNullableString(formData.get("email"))?.toLowerCase() ?? null;
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

  if (!teamid) {
    redirect("/captain");
  }

  if (!firstName) {
    redirect(buildProspectsRedirect(teamid, "?error=First%20name%20is%20required."));
  }

  await prisma.teamPlayerProspect.create({
    data: {
      teamId: teamid,
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

  revalidatePath(`/captain/team/${teamid}/prospects`);
  redirect(buildProspectsRedirect(teamid, "?saved=prospect-added"));
}

export async function updateProspectStatusAction(formData: FormData) {
  const teamid = String(formData.get("teamid") ?? "").trim();
  const prospectId = String(formData.get("prospectId") ?? "").trim();
  const status = getProspectStatus(formData.get("status"));

  await requireCaptain(teamid);

  if (!teamid || !prospectId) {
    redirect("/captain");
  }

  const existing = await prisma.teamPlayerProspect.findFirst({
    where: {
      id: prospectId,
      teamId: teamid,
    },
    select: { id: true },
  });

  if (!existing) {
    redirect(buildProspectsRedirect(teamid, "?error=Prospect%20not%20found."));
  }

  await prisma.teamPlayerProspect.update({
    where: { id: prospectId },
    data: {
      status,
      lastContactedAt:
        status === "CONTACTED" || status === "TRIAL" ? new Date() : undefined,
    },
  });

  revalidatePath(`/captain/team/${teamid}/prospects`);
  redirect(buildProspectsRedirect(teamid, "?saved=status-updated"));
}

export async function updateProspectNotesAction(formData: FormData) {
  const teamid = String(formData.get("teamid") ?? "").trim();
  const prospectId = String(formData.get("prospectId") ?? "").trim();
  const notes = normaliseNullableString(formData.get("notes"));

  await requireCaptain(teamid);

  if (!teamid || !prospectId) {
    redirect("/captain");
  }

  const existing = await prisma.teamPlayerProspect.findFirst({
    where: {
      id: prospectId,
      teamId: teamid,
    },
    select: { id: true },
  });

  if (!existing) {
    redirect(buildProspectsRedirect(teamid, "?error=Prospect%20not%20found."));
  }

  await prisma.teamPlayerProspect.update({
    where: { id: prospectId },
    data: { notes },
  });

  revalidatePath(`/captain/team/${teamid}/prospects`);
  redirect(buildProspectsRedirect(teamid, "?saved=notes-updated"));
}

export async function convertProspectToMemberAction(formData: FormData) {
  const teamid = String(formData.get("teamid") ?? "").trim();
  const prospectId = String(formData.get("prospectId") ?? "").trim();

  await requireCaptain(teamid);

  if (!teamid || !prospectId) {
    redirect("/captain");
  }

  const prospect = await prisma.teamPlayerProspect.findFirst({
    where: {
      id: prospectId,
      teamId: teamid,
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
    redirect(buildProspectsRedirect(teamid, "?error=Prospect%20not%20found."));
  }

  if (!prospect.email) {
    redirect(
      buildProspectsRedirect(
        teamid,
        "?error=Prospect%20needs%20an%20email%20linked%20to%20a%20SIXFL%20account%20before%20promotion.",
      ),
    );
  }

  const user = await prisma.user.findUnique({
    where: { email: prospect.email.toLowerCase() },
    select: {
      id: true,
      email: true,
    },
  });

  if (!user) {
    redirect(
      buildProspectsRedirect(
        teamid,
        "?error=No%20existing%20SIXFL%20user%20was%20found%20for%20that%20email.",
      ),
    );
  }

  const existingMembership = await prisma.teamMember.findUnique({
    where: {
      userId_teamId: {
        userId: user.id,
        teamId: teamid,
      },
    },
    select: { id: true },
  });

  await prisma.$transaction(async (tx) => {
    if (!existingMembership) {
      await tx.teamMember.create({
        data: {
          teamId: teamid,
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

  revalidatePath(`/captain/team/${teamid}/squad`);
  revalidatePath(`/captain/team/${teamid}/prospects`);
  redirect(buildProspectsRedirect(teamid, "?saved=promoted"));
}