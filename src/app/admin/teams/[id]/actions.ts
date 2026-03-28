// ========================================
// File: src/app/admin/teams/actions.ts
// ========================================

"use server";

import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/requireAdmin";
import { randomBytes } from "crypto";

// ==========================
// Update team
// ==========================
export async function updateTeamDetailsAction(formData: FormData) {
  await requireAdmin();

  const id = formData.get("id") as string;
  const leagueId = formData.get("leagueId") as string;
  const logoUrl = formData.get("logoUrl") as string;

  if (!id) return;

  await prisma.team.update({
    where: { id },
    data: {
      leagueId: leagueId || null,
      logoUrl: logoUrl || null,
    },
  });

  redirect(`/admin/teams?saved=1`);
}

// ==========================
// Regenerate claim code
// ==========================
export async function regenerateClaimCodeAction(formData: FormData) {
  await requireAdmin();

  const id = formData.get("id") as string;

  if (!id) return;

  const newCode = randomBytes(4).toString("hex");

  await prisma.team.update({
    where: { id },
    data: {
      claimCode: newCode,
      members: {
        deleteMany: {
          role: "MANAGER",
        },
      },
    },
  });

  redirect(`/admin/teams?regenerated=1`);
}

// ==========================
// Delete team
// ==========================
export async function deleteTeamAction(formData: FormData) {
  await requireAdmin();

  const id = formData.get("id") as string;

  if (!id) return;

  try {
    await prisma.team.delete({
      where: { id },
    });
  } catch (e) {
    redirect(`/admin/teams/${id}?error=has_fixtures`);
  }

  redirect(`/admin/teams`);
}