// ========================================
// File: src/app/captain/team/[teamid]/squad/status-actions.ts
// ========================================

"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { setTeamMemberSquadStatus, type TeamMemberSquadStatus } from "@/lib/managed-squad/squadStatus";
import { requireCaptain } from "@/lib/requireCaptain";

function cleanText(value: FormDataEntryValue | null) {
  return String(value ?? "").trim();
}

function getStatusValue(value: FormDataEntryValue | null): TeamMemberSquadStatus {
  return cleanText(value).toUpperCase() === "INJURED" ? "INJURED" : "ACTIVE";
}

function getRedirect(teamId: string, saved: string) {
  return `/captain/team/${teamId}/squad?saved=${encodeURIComponent(saved)}`;
}

function getErrorRedirect(teamId: string, message: string) {
  return `/captain/team/${teamId}/squad?error=${encodeURIComponent(message)}`;
}

export async function updateManagedSquadMemberStatusAction(formData: FormData) {
  const teamid = cleanText(formData.get("teamid"));
  const membershipId = cleanText(formData.get("membershipId"));
  const status = getStatusValue(formData.get("squadStatus"));
  const note = cleanText(formData.get("note")) || null;

  if (!teamid || !membershipId) redirect("/captain");

  const access = await requireCaptain(teamid);
  if (!access.isAdmin) {
    redirect(getErrorRedirect(teamid, "Only SIXFL admins can change injury status."));
  }

  const updated = await setTeamMemberSquadStatus({
    teamId: teamid,
    membershipId,
    status,
    note,
  });

  if (!updated) {
    redirect(getErrorRedirect(teamid, "Squad member not found."));
  }

  revalidatePath(`/captain/team/${teamid}`);
  revalidatePath(`/captain/team/${teamid}/squad`);
  revalidatePath(`/captain/team/${teamid}/captain-squad`);
  revalidatePath(`/admin/teams/${teamid}`);
  revalidatePath(`/admin/teams/${teamid}/squad`);

  redirect(getRedirect(teamid, status === "INJURED" ? "member-marked-injured" : "member-marked-active"));
}
