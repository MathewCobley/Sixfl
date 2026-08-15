"use server";

import { Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import {
  HOMEPAGE_LEAGUE_STAGES,
  type HomepageLeagueStage,
} from "@/lib/leagues/homepage-leagues";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/requireAdmin";

function parseStage(value: FormDataEntryValue | null): HomepageLeagueStage {
  const stage = String(value ?? "").trim().toUpperCase();
  if (!HOMEPAGE_LEAGUE_STAGES.includes(stage as HomepageLeagueStage)) {
    throw new Error("Choose a valid homepage stage.");
  }
  return stage as HomepageLeagueStage;
}

function parsePriority(value: FormDataEntryValue | null) {
  const parsed = Number(String(value ?? "100").trim());
  if (!Number.isInteger(parsed) || parsed < 0 || parsed > 999) {
    throw new Error("Homepage priority must be a whole number between 0 and 999.");
  }
  return parsed;
}

export async function updateHomepageLeagueAction(formData: FormData) {
  await requireAdmin();

  const leagueId = String(formData.get("leagueId") ?? "").trim();
  if (!leagueId) throw new Error("League ID is required.");

  const stage = parseStage(formData.get("homepageStage"));
  const priority = parsePriority(formData.get("homepagePriority"));

  const updated = await prisma.$executeRaw(Prisma.sql`
    UPDATE "League"
    SET
      "homepageStage" = ${stage},
      "homepagePriority" = ${priority},
      "updatedAt" = NOW()
    WHERE "id" = ${leagueId}
  `);

  if (updated !== 1) throw new Error("League not found.");

  revalidatePath("/");
  revalidatePath("/admin/leagues");
  revalidatePath("/admin/leagues/homepage");

  redirect(`/admin/leagues/homepage?updated=${encodeURIComponent(leagueId)}`);
}
