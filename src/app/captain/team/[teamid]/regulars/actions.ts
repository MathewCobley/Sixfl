"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { prisma } from "@/lib/prisma";
import { requireCaptain } from "@/lib/requireCaptain";

function asBool(value: FormDataEntryValue | null) {
  return String(value ?? "").trim() === "true";
}

export async function setSquadMemberRegularAction(formData: FormData) {
  const teamid = String(formData.get("teamid") ?? "").trim();
  const membershipId = String(formData.get("membershipId") ?? "").trim();
  const isRegular = asBool(formData.get("isRegular"));
  const returnTo = String(formData.get("returnTo") ?? "").trim();

  if (!teamid || !membershipId) {
    redirect("/captain");
  }

  const access = await requireCaptain(teamid);

  if (!access.isAdmin && !access.isCaptain) {
    redirect(`/captain/team/${teamid}`);
  }

  const membership = await prisma.teamMember.findFirst({
    where: { id: membershipId, teamId: teamid },
    select: { id: true },
  });

  if (!membership) {
    redirect(`/captain/team/${teamid}`);
  }

  await prisma.teamMember.update({
    where: { id: membership.id },
    data: { isRegular },
  });

  revalidatePath(`/captain/team/${teamid}/captain-squad`);
  revalidatePath(`/captain/team/${teamid}/squad`);
  revalidatePath(`/captain/team/${teamid}/chat`);

  const safeReturn =
    returnTo === "squad"
      ? `/captain/team/${teamid}/squad`
      : `/captain/team/${teamid}/captain-squad`;

  redirect(
    `${safeReturn}?saved=${isRegular ? "regular-added" : "regular-removed"}`,
  );
}
