// ========================================
// File: src/app/captain/team/[teamid]/squad/status-actions.ts
// ========================================

"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import {
  getTeamMemberSquadStatusMap,
  setTeamMemberSquadStatus,
  type TeamMemberSquadStatus,
} from "@/lib/managed-squad/squadStatus";
import { requireCaptain } from "@/lib/requireCaptain";

function cleanText(value: FormDataEntryValue | null) {
  return String(value ?? "").trim();
}

function getStatusValue(value: FormDataEntryValue | null): TeamMemberSquadStatus {
  const parsed = cleanText(value).toUpperCase();
  if (parsed === "INJURED") return "INJURED";
  if (parsed === "INACTIVE") return "INACTIVE";
  return "ACTIVE";
}

function getCaptainActivityStatus(value: FormDataEntryValue | null): TeamMemberSquadStatus {
  return cleanText(value).toUpperCase() === "INACTIVE" ? "INACTIVE" : "ACTIVE";
}

function getRedirect(teamId: string, saved: string) {
  return `/captain/team/${teamId}/squad?saved=${encodeURIComponent(saved)}`;
}

function getCaptainEditRedirect(teamId: string, membershipId: string, saved: string) {
  return `/captain/team/${teamId}/captain-squad/${membershipId}/edit?saved=${encodeURIComponent(saved)}`;
}

function getErrorRedirect(teamId: string, message: string) {
  return `/captain/team/${teamId}/squad?error=${encodeURIComponent(message)}`;
}

function getCaptainEditErrorRedirect(teamId: string, membershipId: string, message: string) {
  return `/captain/team/${teamId}/captain-squad/${membershipId}/edit?error=${encodeURIComponent(message)}`;
}

function revalidateSquadStatusPaths(teamId: string) {
  const paths = [
    `/captain/team/${teamId}`,
    `/captain/team/${teamId}/squad`,
    `/captain/team/${teamId}/captain-squad`,
    `/captain/team/${teamId}/availability`,
    `/captain/team/${teamId}/fixtures`,
    `/captain/team/${teamId}/player-payments`,
    `/admin/teams/${teamId}`,
    `/admin/teams/${teamId}/squad`,
  ];

  for (const path of paths) {
    try {
      revalidatePath(path);
    } catch (error) {
      console.error(`Squad-status revalidation failed for ${path}`, error);
    }
  }
}

export async function updateManagedSquadMemberStatusAction(formData: FormData) {
  const teamid = cleanText(formData.get("teamid"));
  const membershipId = cleanText(formData.get("membershipId"));
  const status = getStatusValue(formData.get("squadStatus"));
  const note = cleanText(formData.get("note")) || null;

  if (!teamid || !membershipId) redirect("/captain");

  const access = await requireCaptain(teamid);
  if (!access.isAdmin) {
    redirect(getErrorRedirect(teamid, "Only SIXFL admins can change managed squad injury status."));
  }

  let updated = false;
  try {
    updated = await setTeamMemberSquadStatus({
      teamId: teamid,
      membershipId,
      status,
      note,
    });
  } catch (error) {
    console.error("Managed squad status save failed", {
      teamid,
      membershipId,
      status,
      error,
    });
    redirect(getErrorRedirect(teamid, "We could not save that player status. Please try again."));
  }

  if (!updated) {
    redirect(getErrorRedirect(teamid, "Squad member not found."));
  }

  revalidateSquadStatusPaths(teamid);

  const saved =
    status === "INJURED"
      ? "member-marked-injured"
      : status === "INACTIVE"
        ? "member-marked-inactive"
        : "member-marked-active";
  redirect(getRedirect(teamid, saved));
}

export async function updateCaptainSquadMemberActivityAction(formData: FormData) {
  const teamid = cleanText(formData.get("teamid"));
  const membershipId = cleanText(formData.get("membershipId"));
  const status = getCaptainActivityStatus(formData.get("squadStatus"));

  if (!teamid || !membershipId) redirect("/captain");

  const access = await requireCaptain(teamid);

  let currentStatus: TeamMemberSquadStatus | undefined;
  try {
    const statusMap = await getTeamMemberSquadStatusMap(teamid);
    currentStatus = statusMap.get(membershipId)?.squadStatus;
  } catch (error) {
    console.error("Captain squad status read failed", {
      teamid,
      membershipId,
      error,
    });
    redirect(
      getCaptainEditErrorRedirect(
        teamid,
        membershipId,
        "We could not read this player's current status. Please try again.",
      ),
    );
  }

  if (!currentStatus) {
    redirect(getCaptainEditErrorRedirect(teamid, membershipId, "Squad member not found."));
  }

  if (currentStatus === "INJURED" && !access.isAdmin) {
    redirect(
      getCaptainEditErrorRedirect(
        teamid,
        membershipId,
        "This player is currently marked injured by SIXFL. Contact SIXFL before changing their squad status.",
      ),
    );
  }

  const note =
    status === "INACTIVE"
      ? "Historic/former player marked inactive by team captain."
      : null;

  let updated = false;
  try {
    updated = await setTeamMemberSquadStatus({
      teamId: teamid,
      membershipId,
      status,
      note,
    });
  } catch (error) {
    console.error("Captain squad status save failed", {
      teamid,
      membershipId,
      status,
      error,
    });
    redirect(
      getCaptainEditErrorRedirect(
        teamid,
        membershipId,
        "We could not save that player status. Please try again.",
      ),
    );
  }

  if (!updated) {
    redirect(getCaptainEditErrorRedirect(teamid, membershipId, "Squad member not found."));
  }

  revalidateSquadStatusPaths(teamid);

  redirect(
    getCaptainEditRedirect(
      teamid,
      membershipId,
      status === "INACTIVE" ? "player-marked-inactive" : "player-marked-active",
    ),
  );
}
