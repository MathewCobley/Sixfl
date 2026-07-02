// ========================================
// File: src/app/(admin)/admin/leagues/[id]/team-division-actions.ts
// ========================================

"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { updateTeamDivision } from "@/lib/league-divisions";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/requireAdmin";

function getTrimmedValue(value: FormDataEntryValue | null) {
  return String(value ?? "").trim();
}

export async function updateTeamDivisionAction(formData: FormData) {
  await requireAdmin();

  const teamId = getTrimmedValue(formData.get("teamId"));
  const leagueId = getTrimmedValue(formData.get("leagueId"));
  const divisionId = getTrimmedValue(formData.get("divisionId")) || null;

  if (!teamId || !leagueId) {
    redirect("/admin/leagues");
  }

  const league = await prisma.league.findUnique({
    where: { id: leagueId },
    select: { id: true, slug: true },
  });

  if (!league) {
    redirect("/admin/leagues");
  }

  try {
    await updateTeamDivision({
      teamId,
      leagueId: league.id,
      divisionId,
    });
  } catch {
    redirect(`/admin/leagues/${league.id}?divisionError=team_assignment_failed`);
  }

  revalidatePath(`/admin/leagues/${league.id}`);
  revalidatePath(`/admin/teams/${teamId}`);
  revalidatePath(`/leagues/${league.slug}`);

  redirect(`/admin/leagues/${league.id}?divisions=team_updated`);
}
