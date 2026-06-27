// ========================================
// File: src/app/(admin)/admin/player-prospects/actions.ts
// ========================================

"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { queueManagedSquadJoinConfirmationEmail } from "@/lib/managed-squad/prospectJoinConfirmation";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/requireAdmin";

function buildRedirect(query: string) {
  return `/admin/player-prospects${query}`;
}

function buildRedirectWithParams(params: Record<string, string | null | undefined>) {
  const search = new URLSearchParams();

  for (const [key, value] of Object.entries(params)) {
    if (value) search.set(key, value);
  }

  const query = search.toString();
  return `/admin/player-prospects${query ? `?${query}` : ""}`;
}

export async function assignPlayerProspectToTeamAction(formData: FormData) {
  await requireAdmin();

  const prospectId = String(formData.get("prospectId") ?? "").trim();
  const teamId = String(formData.get("teamId") ?? "").trim();

  if (!prospectId || !teamId) {
    redirect(buildRedirect("?error=Choose%20a%20team%20for%20the%20prospect."));
  }

  const [prospect, team] = await Promise.all([
    prisma.teamPlayerProspect.findUnique({
      where: { id: prospectId },
      select: { id: true },
    }),
    prisma.team.findUnique({
      where: { id: teamId },
      select: { id: true },
    }),
  ]);

  if (!prospect) {
    redirect(buildRedirect("?error=Prospect%20not%20found."));
  }

  if (!team) {
    redirect(buildRedirect("?error=Team%20not%20found."));
  }

  await prisma.teamPlayerProspect.update({
    where: { id: prospectId },
    data: {
      teamId,
    },
  });

  revalidatePath("/admin/player-prospects");
  revalidatePath(`/admin/player-prospects/${prospectId}/communications`);
  revalidatePath(`/admin/teams/${teamId}/prospects`);
  revalidatePath(`/captain/team/${teamId}/prospects`);
  redirect(buildRedirect("?saved=assigned"));
}

export async function sendPlayerProspectSquadInviteAction(formData: FormData) {
  const { user } = await requireAdmin();

  const prospectId = String(formData.get("prospectId") ?? "").trim();
  const leagueId = String(formData.get("leagueId") ?? "").trim();

  if (!prospectId) {
    redirect(buildRedirectWithParams({ error: "Prospect not found.", leagueId }));
  }

  const prospect = await prisma.teamPlayerProspect.findUnique({
    where: { id: prospectId },
    select: {
      id: true,
      email: true,
      teamId: true,
    },
  });

  if (!prospect) {
    redirect(buildRedirectWithParams({ error: "Prospect not found.", leagueId }));
  }

  if (!prospect.teamId) {
    redirect(buildRedirectWithParams({ error: "Assign the prospect to a team before sending a squad invite.", leagueId }));
  }

  if (!prospect.email?.trim()) {
    redirect(buildRedirectWithParams({ error: "This prospect needs an email address before you can send a squad invite.", leagueId }));
  }

  const result = await queueManagedSquadJoinConfirmationEmail({
    prospectId: prospect.id,
    createdByUserId: user?.id ?? null,
  });

  revalidatePath("/admin/player-prospects");
  revalidatePath(`/admin/player-prospects/${prospect.id}/communications`);
  revalidatePath(`/admin/teams/${prospect.teamId}`);
  revalidatePath(`/admin/teams/${prospect.teamId}/squad`);
  revalidatePath(`/admin/teams/${prospect.teamId}/prospects`);
  revalidatePath("/admin/messaging");

  redirect(
    buildRedirectWithParams({
      saved: result.status === "already_sent" ? "squad-invite-already-sent" : "squad-invite-queued",
      leagueId,
    }),
  );
}
