"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/requireAdmin";
import {
  isTeamMoveConfirmationStatus,
  type TeamMoveConfirmationResult,
} from "@/lib/teams/move-confirmation";

export async function saveTeamMoveConfirmation(input: {
  teamId: string;
  status: string;
  previousStatus: string;
}): Promise<TeamMoveConfirmationResult> {
  const { user } = await requireAdmin();
  // Do not allow the development auth bypass to write unattributed responses.
  if (!user?.id) return { ok: false, error: "A signed-in administrator is required." };
  if (!input || typeof input.teamId !== "string" || !input.teamId.trim()
    || input.teamId.length > 200 || !isTeamMoveConfirmationStatus(input.status)
    || !isTeamMoveConfirmationStatus(input.previousStatus)) {
    return { ok: false, error: "Choose a valid move confirmation status." };
  }

  const teamId = input.teamId.trim();
  const updatedAt = new Date();
  const updatedBy = user.name?.trim() || user.email?.trim() || user.id;
  try {
    // Target the exact Team id on the card. Never match or update other teams
    // by name, and never overwrite a different response saved by another admin.
    const result = await prisma.team.updateMany({
      where: { id: teamId, moveConfirmationStatus: input.previousStatus },
      data: {
        moveConfirmationStatus: input.status,
        moveConfirmationUpdatedAt: updatedAt,
        moveConfirmationUpdatedBy: updatedBy,
      },
    });
    if (result.count !== 1) {
      return { ok: false, error: "This team changed or was removed. Reload the page before trying again." };
    }
  } catch {
    return { ok: false, error: "Could not save the move confirmation. Please try again." };
  }

  // A cache refresh failure must not misreport a successful database write.
  try {
    revalidatePath("/admin/teams");
    revalidatePath(`/admin/teams/${teamId}`);
  } catch {
    console.warn("Move confirmation saved, but admin page revalidation failed.");
  }
  return { ok: true, status: input.status, updatedAt: updatedAt.toISOString(), updatedBy };
}
