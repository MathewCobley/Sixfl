// ========================================
// File: src/app/captain/team/[teamid]/onboarding/actions.ts
// ========================================

"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { CAPTAIN_AGREEMENT_VERSION } from "@/lib/captain/onboarding";
import { prisma } from "@/lib/prisma";
import { requireCaptain } from "@/lib/requireCaptain";

function getTeamId(formData: FormData) {
  return String(formData.get("teamid") ?? "").trim();
}

function isAccepted(value: FormDataEntryValue | null) {
  return value === "on" || value === "true" || value === "accepted";
}

export async function acceptCaptainAgreementAction(formData: FormData) {
  const teamid = getTeamId(formData);

  if (!teamid) {
    redirect("/captain");
  }

  const access = await requireCaptain(teamid);

  if (!isAccepted(formData.get("accepted"))) {
    redirect(`/captain/team/${teamid}/guide`);
  }

  const userId = access.user?.id ?? null;

  await prisma.$executeRaw`
    UPDATE "Team"
    SET
      "captainAgreementAcceptedAt" = COALESCE("captainAgreementAcceptedAt", NOW()),
      "captainAgreementAcceptedById" = COALESCE("captainAgreementAcceptedById", ${userId}),
      "captainAgreementVersion" = COALESCE("captainAgreementVersion", ${CAPTAIN_AGREEMENT_VERSION}),
      "onboardingCompletedAt" = COALESCE("onboardingCompletedAt", NOW())
    WHERE "id" = ${teamid}
  `;

  revalidatePath(`/captain/team/${teamid}`);
  revalidatePath(`/captain/team/${teamid}/guide`);
  revalidatePath("/admin/teams");
  revalidatePath("/admin/teams/onboarding");

  redirect(`/captain/team/${teamid}?onboarding=agreement-accepted`);
}
