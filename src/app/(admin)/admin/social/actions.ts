// ========================================
// File: src/app/(admin)/admin/social/actions.ts
// ========================================

"use server";

import { SocialPostStatus } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/requireAdmin";

function parseRequiredString(
  value: FormDataEntryValue | null,
  fieldName: string,
) {
  const str = String(value ?? "").trim();

  if (!str) {
    throw new Error(`${fieldName} is required.`);
  }

  return str;
}

function revalidateSocialPaths(input: {
  leagueId: string;
  leagueSlug: string | null;
}) {
  revalidatePath("/admin/social");
  revalidatePath("/admin/fixtures");
  revalidatePath(`/admin/leagues/${input.leagueId}`);
  revalidatePath(`/admin/leagues/${input.leagueId}/fixtures`);

  if (input.leagueSlug) {
    revalidatePath(`/leagues/${input.leagueSlug}`);
    revalidatePath(`/leagues/${input.leagueSlug}/fixtures`);
  }
}

export async function markFixtureSocialPublishedAction(formData: FormData) {
  await requireAdmin();

  const fixtureId = parseRequiredString(formData.get("fixtureId"), "Fixture ID");

  const fixture = await prisma.fixture.findUnique({
    where: { id: fixtureId },
    select: {
      id: true,
      leagueId: true,
      league: {
        select: {
          slug: true,
        },
      },
    },
  });

  if (!fixture) {
    throw new Error("Fixture not found.");
  }

  await prisma.fixture.update({
    where: { id: fixture.id },
    data: {
      socialPostStatus: SocialPostStatus.PUBLISHED,
      socialPublishedAt: new Date(),
      socialLastError: null,
    },
  });

  revalidateSocialPaths({
    leagueId: fixture.leagueId,
    leagueSlug: fixture.league.slug ?? null,
  });
}

export async function markFixtureSocialDraftedAction(formData: FormData) {
  await requireAdmin();

  const fixtureId = parseRequiredString(formData.get("fixtureId"), "Fixture ID");

  const fixture = await prisma.fixture.findUnique({
    where: { id: fixtureId },
    select: {
      id: true,
      leagueId: true,
      league: {
        select: {
          slug: true,
        },
      },
    },
  });

  if (!fixture) {
    throw new Error("Fixture not found.");
  }

  await prisma.fixture.update({
    where: { id: fixture.id },
    data: {
      socialPostStatus: SocialPostStatus.DRAFTED,
      socialPublishedAt: null,
      socialLastError: null,
    },
  });

  revalidateSocialPaths({
    leagueId: fixture.leagueId,
    leagueSlug: fixture.league.slug ?? null,
  });
}