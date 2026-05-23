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

function getSafeReturnTo(value: FormDataEntryValue | null) {
  const parsed = getString(value);

  if (!parsed.startsWith("/admin/")) {
    return "/admin/managed-squads";
  }

  return parsed;
}

function redirectWithManagedSquadResult(
  returnTo: string,
  params: Record<string, string | number>,
): never {
  const query = new URLSearchParams(
    Object.entries(params).map(([key, value]) => [key, String(value)]),
  );

  redirect(`${returnTo}?${query.toString()}`);
}

export async function sendTuesdayManagedSquadInvitesAction(formData: FormData) {
  const { user } = await requireAdmin();
  const teamId = getString(formData.get("teamId"));
  const returnTo = getSafeReturnTo(formData.get("returnTo"));

  if (!teamId) {
    redirectWithManagedSquadResult(returnTo, {
      managedSquadError: "missing-team",
    });
  }

  try {
    const result = await queueTuesdayManagedSquadInvites({
      teamId,
      createdByUserId: user?.id ?? null,
    });

    redirectWithManagedSquadResult(returnTo, {
      managedSquadSent: 1,
      managedSquadQueued: result.queued,
      managedSquadSkipped: result.skipped,
      managedSquadCandidates: result.totalCandidates,
    });
  } catch (error) {
    console.error("Failed to queue Tuesday managed squad invites", error);
    redirectWithManagedSquadResult(returnTo, {
      managedSquadError: "send-failed",
    });
  }
}
