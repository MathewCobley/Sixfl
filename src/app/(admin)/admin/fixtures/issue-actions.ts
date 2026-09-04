// ========================================
// File: src/app/(admin)/admin/fixtures/issue-actions.ts
// ========================================

"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/requireAdmin";

type FixtureIssueResolutionResult = "resolved" | "unavailable" | "error";

function getString(value: FormDataEntryValue | null) {
  return String(value ?? "").trim();
}

function getNightBoardNotice(result: FixtureIssueResolutionResult) {
  if (result === "resolved") return "issue_resolved";
  if (result === "error") return "issue_error";
  return "issue_not_found";
}

function buildNightBoardRedirect(input: {
  returnTo?: string | null;
  result: FixtureIssueResolutionResult;
  teamName?: string | null;
}) {
  const rawReturnTo = input.returnTo?.trim();
  if (!rawReturnTo?.startsWith("/admin/night-board")) return null;

  try {
    const url = new URL(rawReturnTo, "https://sixfl.local");
    if (url.pathname !== "/admin/night-board") return null;

    url.searchParams.set("issueReply", getNightBoardNotice(input.result));

    if (input.teamName?.trim()) {
      url.searchParams.set("issueTeam", input.teamName.trim());
    } else {
      url.searchParams.delete("issueTeam");
    }

    const query = url.searchParams.toString();
    return `${url.pathname}${query ? `?${query}` : ""}`;
  } catch {
    return null;
  }
}

function getRedirectUrl(input: {
  result: FixtureIssueResolutionResult;
  teamName?: string | null;
  leagueId?: string | null;
  returnTo?: string | null;
}) {
  const nightBoardRedirect = buildNightBoardRedirect(input);
  if (nightBoardRedirect) return nightBoardRedirect;

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
  const returnTo = getString(formData.get("returnTo"));
  let leagueId = getString(formData.get("leagueId")) || null;
  let teamName = "that team";

  if (!fixtureId || !teamId) {
    redirect(
      getRedirectUrl({
        result: "unavailable",
        leagueId,
        returnTo,
      }),
    );
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
    redirect(
      getRedirectUrl({
        result: "unavailable",
        leagueId,
        returnTo,
      }),
    );
  }

  leagueId = fixture.leagueId ?? leagueId;

  const team =
    fixture.homeTeam.id === teamId
      ? fixture.homeTeam
      : fixture.awayTeam.id === teamId
        ? fixture.awayTeam
        : null;

  if (!team) {
    redirect(
      getRedirectUrl({
        result: "unavailable",
        leagueId,
        returnTo,
      }),
    );
  }

  teamName = team.name;

  let result;

  try {
    result = await prisma.fixtureCaptainConfirmation.updateMany({
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
  } catch {
    redirect(
      getRedirectUrl({
        result: "error",
        teamName,
        leagueId,
        returnTo,
      }),
    );
  }

  if (result.count === 0) {
    redirect(
      getRedirectUrl({
        result: "unavailable",
        teamName,
        leagueId,
        returnTo,
      }),
    );
  }

  revalidatePath("/admin");
  revalidatePath("/admin/fixtures");
  revalidatePath("/admin/fixtures/issues");
  revalidatePath("/admin/night-board");
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

  redirect(
    getRedirectUrl({
      result: "resolved",
      teamName,
      leagueId,
      returnTo,
    }),
  );
}
