// ========================================
// File: src/app/(admin)/admin/managed-squads/actions.ts
// ========================================

"use server";

import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/requireAdmin";
import { queueTuesdayManagedSquadInvites } from "@/lib/managed-squads/invitations";

function getString(value: FormDataEntryValue | null) {
  return String(value ?? "").trim();
}

export async function sendTuesdayManagedSquadInvitesAction(formData: FormData) {
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
      `/admin/managed-squads?sent=1&queued=${result.queued}&skipped=${result.skipped}&candidates=${result.totalCandidates}`,
    );
  } catch (error) {
    console.error("Failed to queue Tuesday managed squad invites", error);
    redirect("/admin/managed-squads?error=send-failed");
  }
}
