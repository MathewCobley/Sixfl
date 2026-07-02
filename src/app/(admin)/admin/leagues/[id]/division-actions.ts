// ========================================
// File: src/app/(admin)/admin/leagues/[id]/division-actions.ts
// ========================================

"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import {
  createLeagueDivision,
  ensureDefaultLeagueDivisions,
} from "@/lib/league-divisions";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/requireAdmin";

function getTrimmedValue(value: FormDataEntryValue | null) {
  return String(value ?? "").trim();
}

function parseSortOrder(value: FormDataEntryValue | null) {
  const raw = getTrimmedValue(value);
  if (!raw) return 0;

  const parsed = Number(raw);
  return Number.isInteger(parsed) ? parsed : 0;
}

async function getLeagueOrRedirect(leagueId: string) {
  const league = await prisma.league.findUnique({
    where: { id: leagueId },
    select: { id: true, slug: true },
  });

  if (!league) {
    redirect("/admin/leagues");
  }

  return league;
}

function revalidateLeagueDivisionPaths(input: { leagueId: string; slug: string }) {
  revalidatePath("/admin/leagues");
  revalidatePath(`/admin/leagues/${input.leagueId}`);
  revalidatePath(`/leagues/${input.slug}`);
}

export async function createDefaultDivisionsAction(formData: FormData) {
  await requireAdmin();

  const leagueId = getTrimmedValue(formData.get("leagueId"));
  const league = await getLeagueOrRedirect(leagueId);

  await ensureDefaultLeagueDivisions(league.id);
  revalidateLeagueDivisionPaths({ leagueId: league.id, slug: league.slug });

  redirect(`/admin/leagues/${league.id}?divisions=default`);
}

export async function createLeagueDivisionAction(formData: FormData) {
  await requireAdmin();

  const leagueId = getTrimmedValue(formData.get("leagueId"));
  const name = getTrimmedValue(formData.get("name"));
  const slug = getTrimmedValue(formData.get("slug")) || null;
  const sortOrder = parseSortOrder(formData.get("sortOrder"));
  const league = await getLeagueOrRedirect(leagueId);

  if (!name) {
    redirect(`/admin/leagues/${league.id}?divisionError=missing_name`);
  }

  try {
    await createLeagueDivision({
      leagueId: league.id,
      name,
      slug,
      sortOrder,
      isActive: true,
    });
  } catch {
    redirect(`/admin/leagues/${league.id}?divisionError=create_failed`);
  }

  revalidateLeagueDivisionPaths({ leagueId: league.id, slug: league.slug });
  redirect(`/admin/leagues/${league.id}?divisions=created`);
}
