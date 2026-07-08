// ========================================
// File: src/app/(admin)/admin/fixtures/actions-with-kickoff-rules.ts
// ========================================

"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import {
  refreshStoredAiPreviewForFixture,
  refreshStoredAiPreviewsForLeague,
} from "@/lib/fixtures/storedAiPredictions";
import {
  voidFixtureMatchFeeChargesOrThrow,
} from "@/lib/payments/fixture-match-fees";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/requireAdmin";
import {
  createFixtureAction as createFixtureActionWithoutKickoffRules,
  deleteFixtureAction,
  submitResultAction,
  updateFixtureAction as updateFixtureActionWithoutKickoffRules,
} from "./actions";

export { deleteFixtureAction, submitResultAction };

function getString(value: FormDataEntryValue | null) {
  return String(value ?? "").trim();
}

function getRequiredString(value: FormDataEntryValue | null, fieldName: string) {
  const parsed = getString(value);

  if (!parsed) {
    throw new Error(`${fieldName} is required.`);
  }

  return parsed;
}

async function refreshFixtureAiPreviewSafely(fixtureId: string | null) {
  if (!fixtureId) return;

  try {
    await refreshStoredAiPreviewForFixture(fixtureId, { force: true });
  } catch (error) {
    console.error("Failed to generate stored fixture AI preview", error);
  }
}

async function refreshLeagueAiPreviewsSafely(leagueId: string | null) {
  if (!leagueId) return;

  try {
    await refreshStoredAiPreviewsForLeague(leagueId, { force: true });
  } catch (error) {
    console.error("Failed to generate stored league AI previews", error);
  }
}

export async function createFixtureAction(formData: FormData) {
  await requireAdmin();

  const leagueId = getString(formData.get("leagueId"));

  try {
    return await createFixtureActionWithoutKickoffRules(formData);
  } finally {
    await refreshLeagueAiPreviewsSafely(leagueId);
  }
}

export async function updateFixtureAction(formData: FormData) {
  await requireAdmin();

  const fixtureId = getString(formData.get("fixtureId"));

  try {
    return await updateFixtureActionWithoutKickoffRules(formData);
  } finally {
    await refreshFixtureAiPreviewSafely(fixtureId);
  }
}

export async function deleteLeagueFixturesAction(formData: FormData) {
  await requireAdmin();

  const leagueId = getRequiredString(formData.get("leagueId"), "League");
  const league = await prisma.league.findUnique({
    where: { id: leagueId },
    select: { id: true, slug: true },
  });

  if (!league) {
    throw new Error("League not found.");
  }

  const fixtures = await prisma.fixture.findMany({
    where: { leagueId },
    select: { id: true },
  });
  const fixtureIds = fixtures.map((fixture) => fixture.id);

  await prisma.$transaction(async (tx) => {
    await voidFixtureMatchFeeChargesOrThrow(fixtureIds, tx);
    await tx.fixture.deleteMany({ where: { leagueId } });
  });

  revalidatePath("/admin/fixtures");
  revalidatePath(`/admin/leagues/${leagueId}/fixtures`);
  revalidatePath(`/admin/leagues/${leagueId}`);

  if (league.slug) {
    revalidatePath(`/leagues/${league.slug}`);
    revalidatePath(`/leagues/${league.slug}/fixtures`);
  }

  redirect("/admin/fixtures");
}

export async function generateFixtures() {
  await requireAdmin();

  redirect("/admin/fixtures/generate");
}
