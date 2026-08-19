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
  revalidatePath(`/captain/team/${teamId}`);
  revalidatePath(`/captain/team/${teamId}/squad`);
  revalidatePath(`/captain/team/${teamId}/captain-squad`);
  revalidatePath(`/captain/team/${teamId}/availability`);
  revalidatePath(`/captain/team/${teamId}/fixtures`);
  revalidatePath(`/captain/team/${teamId}/player-payments`);
  revalidatePath(`/admin/teams/${teamId}`);
  revalidatePath(`/admin/teams/${teamId}/squad`);
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

  const updated = await setTeamMemberSquadStatus({
    teamId: teamid,
    membershipId,
    status,
    note,
  });

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
  const statusMap = await getTeamMemberSquadStatusMap(teamid);
  const currentStatus = statusMap.get(membershipId)?.squadStatus;

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

  const updated = await setTeamMemberSquadStatus({
    teamId: teamid,
    membershipId,
    status,
    note,
  });

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
