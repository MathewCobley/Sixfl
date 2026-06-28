// ========================================
// File: src/app/(admin)/admin/player-prospects/actions.ts
// ========================================

"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import {
  queueManagedSquadJoinChaseEmail,
  queueManagedSquadJoinConfirmationEmail,
} from "@/lib/managed-squad/prospectJoinConfirmation";
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

async function revalidateProspectSurfaces(input: { prospectId: string; teamId: string | null }) {
  revalidatePath("/admin/player-prospects");
  revalidatePath(`/admin/player-prospects/${input.prospectId}/communications`);
  revalidatePath("/admin/messaging");

  if (input.teamId) {
    revalidatePath(`/admin/teams/${input.teamId}`);
    revalidatePath(`/admin/teams/${input.teamId}/squad`);
    revalidatePath(`/admin/teams/${input.teamId}/prospects`);
    revalidatePath(`/admin/teams/${input.teamId}/communications`);
  }
}

async function getOpenProspectForSquadEmail(prospectId: string) {
  if (!prospectId) return { ok: false as const, error: "Prospect not found." };

  const prospect = await prisma.teamPlayerProspect.findUnique({
    where: { id: prospectId },
    select: {
      id: true,
      email: true,
      teamId: true,
      status: true,
    },
  });

  if (!prospect) return { ok: false as const, error: "Prospect not found." };
  if (prospect.status === "DECLINED" || prospect.status === "DUPLICATE") {
    return { ok: false as const, error: "This prospect is closed and cannot be messaged from the open pipeline." };
  }
  if (!prospect.teamId) {
    return { ok: false as const, error: "Assign the prospect to a team first." };
  }
  if (!prospect.email?.trim()) {
    return { ok: false as const, error: "This prospect needs an email address first." };
  }

  return { ok: true as const, prospect };
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

  const validation = await getOpenProspectForSquadEmail(prospectId);

  if (!validation.ok) {
    redirect(buildRedirectWithParams({ error: validation.error, leagueId }));
  }

  const result = await queueManagedSquadJoinConfirmationEmail({
    prospectId: validation.prospect.id,
    createdByUserId: user?.id ?? null,
  });

  await revalidateProspectSurfaces({ prospectId: validation.prospect.id, teamId: validation.prospect.teamId });

  redirect(
    buildRedirectWithParams({
      saved: result.status === "already_sent" ? "squad-invite-already-sent" : "squad-invite-queued",
      leagueId,
    }),
  );
}

async function queueSquadInviteChase(input: {
  prospectId: string;
  chaseType: "CHASE" | "FINAL";
  createdByUserId?: string | null;
}) {
  const validation = await getOpenProspectForSquadEmail(input.prospectId);

  if (!validation.ok) {
    return { ok: false as const, error: validation.error };
  }

  const result = await queueManagedSquadJoinChaseEmail({
    prospectId: validation.prospect.id,
    chaseType: input.chaseType,
    createdByUserId: input.createdByUserId ?? null,
  });

  await revalidateProspectSurfaces({
    prospectId: validation.prospect.id,
    teamId: validation.prospect.teamId,
  });

  if (!result.ok) {
    return { ok: false as const, error: "The chase email could not be queued." };
  }

  return { ok: true as const, prospectId: validation.prospect.id, status: result.status };
}

async function sendSquadInviteChase(input: {
  formData: FormData;
  chaseType: "CHASE" | "FINAL";
}) {
  const { user } = await requireAdmin();

  const prospectId = String(input.formData.get("prospectId") ?? "").trim();
  const leagueId = String(input.formData.get("leagueId") ?? "").trim();

  const result = await queueSquadInviteChase({
    prospectId,
    chaseType: input.chaseType,
    createdByUserId: user?.id ?? null,
  });

  redirect(
    buildRedirectWithParams({
      saved: result.ok
        ? input.chaseType === "FINAL"
          ? "squad-final-chase-queued"
          : "squad-chase-queued"
        : null,
      error: result.ok ? null : result.error,
      leagueId,
    }),
  );
}

export async function sendPlayerProspectSquadInviteChaseAction(formData: FormData) {
  await sendSquadInviteChase({ formData, chaseType: "CHASE" });
}

export async function sendPlayerProspectSquadInviteFinalChaseAction(formData: FormData) {
  await sendSquadInviteChase({ formData, chaseType: "FINAL" });
}

export async function queuePlayerProspectSquadInviteChaseAction(formData: FormData) {
  const { user } = await requireAdmin();
  const prospectId = String(formData.get("prospectId") ?? "").trim();

  return queueSquadInviteChase({
    prospectId,
    chaseType: "CHASE",
    createdByUserId: user?.id ?? null,
  });
}

export async function queuePlayerProspectSquadInviteFinalChaseAction(formData: FormData) {
  const { user } = await requireAdmin();
  const prospectId = String(formData.get("prospectId") ?? "").trim();

  return queueSquadInviteChase({
    prospectId,
    chaseType: "FINAL",
    createdByUserId: user?.id ?? null,
  });
}
