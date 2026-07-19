// ========================================
// File: src/app/captain/team/[teamid]/prospects/workflow-actions.ts
// ========================================

"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import {
  queueManagedSquadJoinChaseEmail,
  queueManagedSquadJoinConfirmationEmail,
} from "@/lib/managed-squad/prospectJoinConfirmation";
import { prisma } from "@/lib/prisma";
import { requireCaptain } from "@/lib/requireCaptain";

function prospectsRedirect(teamid: string, query: string) {
  return `/captain/team/${teamid}/prospects${query}`;
}

async function loadProspect(teamid: string, prospectId: string) {
  return prisma.teamPlayerProspect.findFirst({
    where: {
      id: prospectId,
      teamId: teamid,
    },
    select: {
      id: true,
      email: true,
      status: true,
    },
  });
}

export async function sendProspectSquadActivationAction(formData: FormData) {
  const teamid = String(formData.get("teamid") ?? "").trim();
  const prospectId = String(formData.get("prospectId") ?? "").trim();

  const { user } = await requireCaptain(teamid);

  if (!teamid || !prospectId) {
    redirect("/captain");
  }

  const prospect = await loadProspect(teamid, prospectId);

  if (!prospect) {
    redirect(prospectsRedirect(teamid, "?error=Prospect%20not%20found."));
  }

  if (prospect.status === "DECLINED") {
    redirect(
      prospectsRedirect(
        teamid,
        "?error=This%20prospect%20is%20marked%20as%20declined.%20Change%20their%20status%20before%20sending%20an%20invite.",
      ),
    );
  }

  if (!prospect.email?.trim()) {
    redirect(
      prospectsRedirect(
        teamid,
        "?error=Add%20and%20save%20the%20player%27s%20email%20address%20before%20sending%20the%20squad%20activation%20email.",
      ),
    );
  }

  const result = await queueManagedSquadJoinConfirmationEmail({
    prospectId,
    createdByUserId: user?.id ?? null,
  });

  revalidatePath(`/captain/team/${teamid}/prospects`);

  if (result.status === "already_sent") {
    redirect(prospectsRedirect(teamid, "?saved=email-sent"));
  }

  if (!result.ok) {
    redirect(
      prospectsRedirect(
        teamid,
        `?error=${encodeURIComponent("The squad activation email could not be queued.")}`,
      ),
    );
  }

  redirect(prospectsRedirect(teamid, "?saved=email-sent"));
}

export async function sendProspectSquadActivationReminderAction(formData: FormData) {
  const teamid = String(formData.get("teamid") ?? "").trim();
  const prospectId = String(formData.get("prospectId") ?? "").trim();

  const { user } = await requireCaptain(teamid);

  if (!teamid || !prospectId) {
    redirect("/captain");
  }

  const prospect = await loadProspect(teamid, prospectId);

  if (!prospect) {
    redirect(prospectsRedirect(teamid, "?error=Prospect%20not%20found."));
  }

  if (!prospect.email?.trim()) {
    redirect(
      prospectsRedirect(
        teamid,
        "?error=This%20prospect%20does%20not%20have%20an%20email%20address.",
      ),
    );
  }

  const result = await queueManagedSquadJoinChaseEmail({
    prospectId,
    chaseType: "CHASE",
    createdByUserId: user?.id ?? null,
  });

  revalidatePath(`/captain/team/${teamid}/prospects`);

  if (!result.ok) {
    redirect(
      prospectsRedirect(
        teamid,
        `?error=${encodeURIComponent("The squad activation reminder could not be queued.")}`,
      ),
    );
  }

  redirect(prospectsRedirect(teamid, "?saved=email-sent"));
}
