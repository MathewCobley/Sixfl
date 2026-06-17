// ========================================
// File: src/app/(admin)/admin/fixtures/issue-actions.ts
// ========================================

"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/requireAdmin";

function getString(value: FormDataEntryValue | null) {
  return String(value ?? "").trim();
}

function getRedirectUrl(input: {
  result: "resolved" | "unavailable" | "error";
  teamName?: string | null;
  leagueId?: string | null;
}) {
  const params = new URLSearchParams();
  params.set("fixtureIssue", input.result);

  if (input.teamName?.trim()) {
    params.set("fixtureIssueTeam", input.teamName.trim());
  }

  if (input.leagueId?.trim()) {
    params.set("leagueId", input.leagueId.trim());
  }

  return `/admin/fixtures?${params.toString()}#fixture-issue-replies`;
}

export async function resolveFixtureConfirmationIssueAction(formData: FormData) {
  await requireAdmin();

  const fixtureId = getString(formData.get("fixtureId"));
  const teamId = getString(formData.get("teamId"));
  let leagueId = getString(formData.get("leagueId")) || null;
  let teamName = "that team";

  if (!fixtureId || !teamId) {
    redirect(getRedirectUrl({ result: "unavailable", leagueId }));
  }

  const fixture = await prisma.fixture.findUnique({
    where: { id: fixtureId },
    select: {
      leagueId: true,
      league: { select: { slug: true } },
      homeTeam: { select: { id: true, name: true } },
      awayTeam: { select: { id: true, name: true } },
    },
  });

  if (!fixture) {
    redirect(getRedirectUrl({ result: "unavailable", leagueId }));
  }

  leagueId = fixture.leagueId ?? leagueId;

  const team =
    fixture.homeTeam.id === teamId
      ? fixture.homeTeam
      : fixture.awayTeam.id === teamId
        ? fixture.awayTeam
        : null;

  if (!team) {
    redirect(getRedirectUrl({ result: "unavailable", leagueId }));
  }

  teamName = team.name;

  const result = await prisma.fixtureCaptainConfirmation.updateMany({
    where: {
      fixtureId,
      teamId,
      status: "ISSUE_RAISED",
    },
    data: {
      status: "PENDING",
      note: null,
      issueRaisedAt: null,
      confirmedAt: null,
      confirmedByUserId: null,
    },
  });

  if (result.count === 0) {
    redirect(getRedirectUrl({ result: "unavailable", teamName, leagueId }));
  }

  revalidatePath("/admin");
  revalidatePath("/admin/fixtures");
  revalidatePath(`/captain/team/${teamId}`);
  revalidatePath(`/captain/team/${teamId}/fixtures`);

  if (leagueId) {
    revalidatePath(`/admin/leagues/${leagueId}`);
    revalidatePath(`/admin/leagues/${leagueId}/fixtures`);
  }

  if (fixture.league?.slug) {
    revalidatePath(`/leagues/${fixture.league.slug}`);
    revalidatePath(`/leagues/${fixture.league.slug}/fixtures`);
  }

  redirect(getRedirectUrl({ result: "resolved", teamName, leagueId }));
}
