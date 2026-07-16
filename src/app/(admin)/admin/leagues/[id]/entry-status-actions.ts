// ========================================
// File: src/app/(admin)/admin/leagues/[id]/entry-status-actions.ts
// ========================================

"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import {
  type PlayerEntryStatus,
  type TeamEntryStatus,
  setLeagueEntryStatuses,
} from "@/lib/leagues/entry-status";
import { requireAdmin } from "@/lib/requireAdmin";

function parseTeamEntryStatus(value: FormDataEntryValue | null): TeamEntryStatus {
  const status = String(value ?? "").trim().toUpperCase();
  if (status === "WAITING_LIST" || status === "CLOSED") return status;
  return "OPEN";
}

function parsePlayerEntryStatus(value: FormDataEntryValue | null): PlayerEntryStatus {
  const status = String(value ?? "").trim().toUpperCase();
  return status === "CLOSED" ? "CLOSED" : "OPEN";
}

export async function updateLeagueEntryStatusAction(formData: FormData) {
  await requireAdmin();

  const leagueId = String(formData.get("leagueId") ?? "").trim();
  if (!leagueId) redirect("/admin/leagues");

  const teamEntryStatus = parseTeamEntryStatus(formData.get("teamEntryStatus"));
  const playerEntryStatus = parsePlayerEntryStatus(formData.get("playerEntryStatus"));

  await setLeagueEntryStatuses({
    leagueId,
    teamEntryStatus,
    playerEntryStatus,
  });

  revalidatePath("/");
  revalidatePath("/register-interest");
  revalidatePath("/admin/leagues");
  revalidatePath(`/admin/leagues/${leagueId}`);
  revalidatePath("/admin/leads");

  redirect(`/admin/leagues/${leagueId}?entryStatus=updated`);
}
