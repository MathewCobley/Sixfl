// ========================================
// File: src/app/captain/team/[teamid]/squad/prospect-actions.ts
// ========================================

"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import {
  moveActiveSquadProspectBackToPipeline,
  moveTeamMemberToProspect,
} from "@/lib/managed-squad/movePlayerToProspect";
import { requireCaptain } from "@/lib/requireCaptain";

function getErrorRedirect(teamid: string, message: string) {
  return `/captain/team/${teamid}/squad?error=${encodeURIComponent(message)}`;
}

function getSuccessRedirect(teamid: string, saved = "moved-to-prospects") {
  return `/captain/team/${teamid}/squad?saved=${encodeURIComponent(saved)}`;
}

function revalidateSquadAndProspectPaths(teamid: string) {
  revalidatePath(`/captain/team/${teamid}`);
  revalidatePath(`/captain/team/${teamid}/squad`);
  revalidatePath(`/captain/team/${teamid}/captain-squad`);
  revalidatePath(`/captain/team/${teamid}/prospects`);
  revalidatePath(`/admin/teams/${teamid}`);
  revalidatePath(`/admin/teams/${teamid}/squad`);
  revalidatePath(`/admin/teams/${teamid}/prospects`);
  revalidatePath("/admin/player-prospects");
}

async function requireAdminSquadAccess(teamid: string) {
  if (!teamid) {
    redirect("/captain");
  }

  const access = await requireCaptain(teamid);

  if (!access.isAdmin) {
    redirect(
      `/captain/team/${teamid}/captain-squad?error=${encodeURIComponent(
        "Only SIXFL admins can move squad players back to prospects.",
      )}`,
    );
  }

  return access;
}

export async function moveSquadMemberToProspectsAction(formData: FormData) {
  const teamid = String(formData.get("teamid") ?? "").trim();
  const membershipId = String(formData.get("membershipId") ?? "").trim();

  await requireAdminSquadAccess(teamid);

  if (!membershipId) {
    redirect("/captain");
  }

  const result = await moveTeamMemberToProspect({
    teamId: teamid,
    membershipId,
  });

  if (!result.ok) {
    redirect(getErrorRedirect(teamid, "Squad member not found."));
  }

  revalidateSquadAndProspectPaths(teamid);
  redirect(getSuccessRedirect(teamid));
}

export async function movePendingSquadProspectToProspectsAction(formData: FormData) {
  const teamid = String(formData.get("teamid") ?? "").trim();
  const prospectId = String(formData.get("prospectId") ?? "").trim();

  await requireAdminSquadAccess(teamid);

  if (!prospectId) {
    redirect("/captain");
  }

  const result = await moveActiveSquadProspectBackToPipeline({
    teamId: teamid,
    prospectId,
  });

  if (!result.ok) {
    redirect(getErrorRedirect(teamid, "Prospect not found."));
  }

  revalidateSquadAndProspectPaths(teamid);
  redirect(getSuccessRedirect(teamid));
}
