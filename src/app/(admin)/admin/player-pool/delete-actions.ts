// ========================================
// File: src/app/(admin)/admin/player-pool/delete-actions.ts
// ========================================

"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { ensurePlayerPoolTables } from "@/lib/player-pool/storage";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/requireAdmin";

type ProfileDeleteRow = {
  id: string;
  leadId: string | null;
};

type RequestTeamRow = {
  teamId: string;
};

function adminPath(query = "") {
  return `/admin/player-pool${query}`;
}

export async function deletePlayerPoolProfileAction(formData: FormData) {
  await requireAdmin();
  await ensurePlayerPoolTables();

  const profileId = String(formData.get("profileId") ?? "").trim();
  if (!profileId) {
    redirect(adminPath("?error=PlayerPool%20profile%20not%20found."));
  }

  const profiles = await prisma.$queryRaw<ProfileDeleteRow[]>`
    SELECT "id", "leadId"
    FROM "PlayerPoolProfile"
    WHERE "id" = ${profileId}
    LIMIT 1
  `;
  const profile = profiles[0] ?? null;

  if (!profile) {
    redirect(adminPath("?error=PlayerPool%20profile%20not%20found."));
  }

  const requestTeams = await prisma.$queryRaw<RequestTeamRow[]>`
    SELECT DISTINCT "teamId"
    FROM "PlayerPoolIntroductionRequest"
    WHERE "profileId" = ${profileId}
  `;

  // Introduction requests are removed automatically by the database cascade.
  // The original InterestLead and TeamPlayerProspect are intentionally retained.
  await prisma.$executeRaw`
    DELETE FROM "PlayerPoolProfile"
    WHERE "id" = ${profileId}
  `;

  revalidatePath("/admin/player-pool");
  revalidatePath("/admin/leads");
  revalidatePath("/admin/player-prospects");

  for (const request of requestTeams) {
    revalidatePath(`/captain/team/${request.teamId}/player-pool`);
  }

  redirect(adminPath("?saved=deleted"));
}
