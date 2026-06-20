// ========================================
// File: src/app/(admin)/admin/player-prospects/actions.ts
// ========================================

"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/requireAdmin";

function buildRedirect(query: string) {
  return `/admin/player-prospects${query}`;
}

export async function assignPlayerProspectToTeamAction(formData: FormData) {
  await requireAdmin();

  const prospectId = String(formData.get("prospectId") ?? "").trim();
  const teamId = String(formData.get("teamId") ?? "").trim();

  if (!prospectId || !teamId) {
    redirect(buildRedirect("?error=Choose%20a%20team%20for%20the%20prospect."));
  }

  const [prospect, team] = await Promise.all([
    prisma.teamPlayerProspect.findUnique({
      where: { id: prospectId },
      select: { id: true },
    }),
    prisma.team.findUnique({
      where: { id: teamId },
      select: { id: true },
    }),
  ]);

  if (!prospect) {
    redirect(buildRedirect("?error=Prospect%20not%20found."));
  }

  if (!team) {
    redirect(buildRedirect("?error=Team%20not%20found."));
  }

  await prisma.teamPlayerProspect.update({
    where: { id: prospectId },
    data: {
      teamId,
    },
  });

  revalidatePath("/admin/player-prospects");
  revalidatePath(`/admin/teams/${teamId}/prospects`);
  revalidatePath(`/captain/team/${teamId}/prospects`);
  redirect(buildRedirect("?saved=assigned"));
}
