// ========================================
// File: src/app/(admin)/admin/fixtures/confirmation-actions.ts
// ========================================

"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import {
  queueFixtureConfirmationSmsReminder,
  type QueueFixtureConfirmationSmsResult,
} from "@/lib/fixtures/confirmation-reminders";
import { requireAdmin } from "@/lib/requireAdmin";

function parseRequiredString(value: FormDataEntryValue | null, fieldName: string) {
  const str = String(value ?? "").trim();

  if (!str) {
    throw new Error(`${fieldName} is required.`);
  }

  return str;
}

function buildAdminFixturesHref(input?: {
  notice?: "sms_queued" | "sms_skipped" | "sms_not_available" | "sms_error";
  teamName?: string;
}) {
  const searchParams = new URLSearchParams();

  if (input?.notice) {
    searchParams.set("notice", input.notice);
  }

  if (input?.teamName?.trim()) {
    searchParams.set("teamName", input.teamName.trim());
  }

  const query = searchParams.toString();
  return query ? `/admin/fixtures?${query}` : "/admin/fixtures";
}

function getRedirectFromResult(result: QueueFixtureConfirmationSmsResult) {
  if (result.ok) {
    return buildAdminFixturesHref({
      notice: "sms_queued",
      teamName: result.teamName,
    });
  }

  if (
    result.status === "no_phone" ||
    result.status === "skipped"
  ) {
    return buildAdminFixturesHref({
      notice: "sms_skipped",
      teamName: result.teamName,
    });
  }

  if (
    result.status === "confirmed" ||
    result.status === "issue_raised" ||
    result.status === "not_available"
  ) {
    return buildAdminFixturesHref({
      notice: "sms_not_available",
      teamName: result.teamName,
    });
  }

  return buildAdminFixturesHref({
    notice: "sms_error",
    teamName: result.teamName,
  });
}

export async function chaseFixtureConfirmationSmsAction(formData: FormData) {
  await requireAdmin();

  const fixtureId = parseRequiredString(formData.get("fixtureId"), "Fixture");
  const teamId = parseRequiredString(formData.get("teamId"), "Team");

  const result = await queueFixtureConfirmationSmsReminder({
    fixtureId,
    teamId,
    mode: "manual",
  });

  const fixture = await prisma.fixture.findUnique({
    where: { id: fixtureId },
    select: {
      leagueId: true,
      league: {
        select: {
          slug: true,
        },
      },
    },
  });

  revalidatePath("/admin/fixtures");

  if (fixture?.leagueId) {
    revalidatePath(`/admin/leagues/${fixture.leagueId}`);
    revalidatePath(`/admin/leagues/${fixture.leagueId}/fixtures`);
  }

  revalidatePath(`/captain/team/${teamId}`);
  revalidatePath(`/captain/team/${teamId}/fixtures`);

  if (fixture?.league?.slug) {
    revalidatePath(`/leagues/${fixture.league.slug}`);
    revalidatePath(`/leagues/${fixture.league.slug}/fixtures`);
  }

  redirect(getRedirectFromResult(result));
}