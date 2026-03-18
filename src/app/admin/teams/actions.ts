// ========================================
// File: src/app/admin/teams/actions.ts
// ========================================

"use server";

import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/requireAdmin";
import { TeamRole } from "@prisma/client";

function generateClaimCode(length = 8) {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let result = "";

  for (let i = 0; i < length; i += 1) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }

  return result;
}

async function generateUniqueClaimCode() {
  for (let attempt = 0; attempt < 10; attempt += 1) {
    const code = generateClaimCode();

    const existing = await prisma.team.findUnique({
      where: { claimCode: code },
      select: { id: true },
    });

    if (!existing) return code;
  }

  throw new Error("Failed to generate unique claim code.");
}

export async function createTeamAction(formData: FormData) {
  await requireAdmin();

  const name = String(formData.get("name") ?? "").trim();
  const leagueIdRaw = String(formData.get("leagueId") ?? "").trim();
  const logoUrlRaw = String(formData.get("logoUrl") ?? "").trim();

  const leagueId = leagueIdRaw || null;
  const logoUrl = logoUrlRaw || null;

  if (!name) {
    redirect("/admin/teams/new");
  }

  const claimCode = await generateUniqueClaimCode();

  await prisma.team.create({
    data: {
      name,
      claimCode,
      leagueId,
      logoUrl,
    },
  });

  redirect("/admin/teams");
}

export async function updateTeamDetailsAction(formData: FormData) {
  await requireAdmin();

  const id = String(formData.get("id") ?? "").trim();
  const leagueIdRaw = String(formData.get("leagueId") ?? "").trim();
  const logoUrlRaw = String(formData.get("logoUrl") ?? "").trim();

  if (!id) {
    redirect("/admin/teams?error=missing_id");
  }

  const leagueId = leagueIdRaw || null;
  const logoUrl = logoUrlRaw || null;

  await prisma.team.update({
    where: { id },
    data: {
      leagueId,
      logoUrl,
    },
  });

  redirect(`/admin/teams/${id}/edit?saved=1`);
}

export async function regenerateClaimCodeAction(formData: FormData) {
  await requireAdmin();

  const id = String(formData.get("id") ?? "").trim();
  const from = String(formData.get("from") ?? "/admin/teams").trim();

  if (!id) {
    redirect(`${from}?error=missing_id`);
  }

  const newClaimCode = await generateUniqueClaimCode();

  await prisma.$transaction([
    // ✅ REMOVE CURRENT CAPTAIN (unclaim team)
    prisma.teamMember.deleteMany({
      where: {
        teamId: id,
        role: TeamRole.CAPTAIN,
      },
    }),

    // ✅ UPDATE CLAIM CODE
    prisma.team.update({
      where: { id },
      data: {
        claimCode: newClaimCode,
      },
    }),
  ]);

  redirect(`${from}?regenerated=1`);
}

export async function deleteTeamAction(formData: FormData) {
  await requireAdmin();

  const id = String(formData.get("id") ?? "").trim();
  const from = String(formData.get("from") ?? "/admin/teams").trim();

  if (!id) {
    redirect(`${from}?error=missing_id`);
  }

  const fixtureCount = await prisma.fixture.count({
    where: {
      OR: [{ homeTeamId: id }, { awayTeamId: id }],
    },
  });

  if (fixtureCount > 0) {
    redirect(`${from}?error=has_fixtures`);
  }

  await prisma.team.delete({
    where: { id },
  });

  redirect(`${from}?deleted=1`);
}