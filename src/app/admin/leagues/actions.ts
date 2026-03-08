// src/app/admin/leagues/actions.ts

"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/requireAdmin";

function parseRequiredString(
  value: FormDataEntryValue | null,
  fieldName: string
) {
  const str = String(value ?? "").trim();

  if (!str) {
    throw new Error(`${fieldName} is required.`);
  }

  return str;
}

function parseOptionalString(value: FormDataEntryValue | null) {
  const str = String(value ?? "").trim();
  return str.length > 0 ? str : null;
}

export async function createLeagueAction(formData: FormData) {
  await requireAdmin();

  const name = parseRequiredString(formData.get("name"), "League name");
  const season = parseOptionalString(formData.get("season"));
  const isActive = String(formData.get("isActive") ?? "") === "on";

  await prisma.league.create({
    data: {
      name,
      season,
      isActive,
    },
  });

  revalidatePath("/admin/leagues");
  revalidatePath("/admin/fixtures");
  revalidatePath("/leagues");

  redirect("/admin/leagues");
}

export async function toggleLeagueActiveAction(formData: FormData) {
  await requireAdmin();

  const id = parseRequiredString(formData.get("id"), "League ID");

  const league = await prisma.league.findUnique({
    where: { id },
    select: {
      id: true,
      isActive: true,
    },
  });

  if (!league) {
    throw new Error("League not found.");
  }

  await prisma.league.update({
    where: { id },
    data: {
      isActive: !league.isActive,
    },
  });

  revalidatePath("/admin/leagues");
  revalidatePath("/admin/fixtures");
  revalidatePath("/leagues");
  revalidatePath(`/leagues/${id}`);

  redirect("/admin/leagues");
}

export async function deleteLeagueAction(formData: FormData) {
  await requireAdmin();

  const id = parseRequiredString(formData.get("id"), "League ID");

  const league = await prisma.league.findUnique({
    where: { id },
    select: {
      id: true,
      teams: {
        select: { id: true },
        take: 1,
      },
      fixtures: {
        select: { id: true },
        take: 1,
      },
    },
  });

  if (!league) {
    throw new Error("League not found.");
  }

  if (league.teams.length > 0) {
    redirect("/admin/leagues?error=has_teams");
  }

  if (league.fixtures.length > 0) {
    redirect("/admin/leagues?error=has_fixtures");
  }

  await prisma.league.delete({
    where: { id },
  });

  revalidatePath("/admin/leagues");
  revalidatePath("/admin/fixtures");
  revalidatePath("/leagues");

  redirect("/admin/leagues?deleted=1");
}