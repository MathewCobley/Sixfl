// ========================================
// File: src/app/(admin)/admin/teams/[id]/managed-squad/actions.ts
// ========================================

"use server";

import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/requireAdmin";
import { queueTuesdayManagedSquadInvites } from "@/lib/managed-squads/invitations";

function getString(value: FormDataEntryValue | null) {
  return String(value ?? "").trim();
}

export async function sendTeamTuesdayManagedSquadInvitesAction(
  formData: FormData,
) {
  const { user } = await requireAdmin();
  const teamId = getString(formData.get("teamId"));

  if (!teamId) {
    redirect("/admin/managed-squads?error=missing-team");
  }

  try {
    const result = await queueTuesdayManagedSquadInvites({
      teamId,
      createdByUserId: user?.id ?? null,
    });

    redirect(
      `/admin/teams/${teamId}/managed-squad?sent=1&queued=${result.queued}&skipped=${result.skipped}&candidates=${result.totalCandidates}`,
    );
  } catch (error) {
    console.error("Failed to queue team managed squad invites", error);
    redirect(`/admin/teams/${teamId}/managed-squad?error=send-failed`);
  }
}
