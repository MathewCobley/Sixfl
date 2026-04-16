// ========================================
// File: src/app/teams/join/[joinSlug]/actions.ts
// ========================================

"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { prisma } from "@/lib/prisma";

function normaliseNullableString(value: FormDataEntryValue | null) {
  const parsed = String(value ?? "").trim();
  return parsed ? parsed : null;
}

function buildRedirect(joinSlug: string, query: string) {
  return `/teams/join/${joinSlug}${query}`;
}

export async function submitTeamJoinProspectAction(formData: FormData) {
  const joinSlug = String(formData.get("joinSlug") ?? "").trim();

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
  const notes = normaliseNullableString(formData.get("notes"));

  if (!joinSlug) {
    redirect("/teams");
  }

  const team = await prisma.team.findFirst({
    where: {
      joinSlug,
      teamMode: "MANAGED",
      isRecruiting: true,
    },
    select: {
      id: true,
      joinSlug: true,
    },
  });

  if (!team) {
    redirect(buildRedirect(joinSlug, "?error=This%20team%20is%20not%20currently%20accepting%20player%20interest."));
  }

  if (!firstName) {
    redirect(buildRedirect(joinSlug, "?error=First%20name%20is%20required."));
  }

  const existing = await prisma.teamPlayerProspect.findFirst({
    where: {
      teamId: team.id,
      OR: [
        ...(email ? [{ email }] : []),
        ...(phone ? [{ phone }] : []),
      ],
    },
    select: {
      id: true,
      status: true,
    },
  });

  if (existing) {
    redirect(buildRedirect(joinSlug, "?saved=already-registered"));
  }

  await prisma.teamPlayerProspect.create({
    data: {
      teamId: team.id,
      firstName,
      lastName,
      email,
      phone,
      preferredPositions,
      experienceSummary,
      availabilitySummary,
      notes,
      source: "public-join-page",
      status: "NEW",
    },
  });

  revalidatePath(`/teams/join/${joinSlug}`);
  redirect(buildRedirect(joinSlug, "?saved=1"));
}