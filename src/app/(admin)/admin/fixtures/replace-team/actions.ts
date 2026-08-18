// ========================================
// File: src/app/(admin)/admin/fixtures/replace-team/actions.ts
// ========================================

"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { Prisma } from "@prisma/client";

import { refreshStoredAiPreviewForFixture } from "@/lib/fixtures/storedAiPredictions";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/requireAdmin";

function buildRedirect(params: Record<string, string | number | null | undefined>) {
  const query = new URLSearchParams();

  for (const [key, value] of Object.entries(params)) {
    if (value === null || value === undefined || value === "") continue;
    query.set(key, String(value));
  }

  const suffix = query.toString();
  return `/admin/fixtures/replace-team${suffix ? `?${suffix}` : ""}`;
}

export async function replaceTeamInFutureFixturesAction(formData: FormData) {
  await requireAdmin();

  const fromTeamId = String(formData.get("fromTeamId") ?? "").trim();
  const toTeamId = String(formData.get("toTeamId") ?? "").trim();

  if (!fromTeamId || !toTeamId) {
    redirect(buildRedirect({ error: "missing_teams" }));
  }

  if (fromTeamId === toTeamId) {
    redirect(buildRedirect({ error: "same_team" }));
  }

  const [fromTeam, toTeam] = await Promise.all([
    prisma.team.findUnique({
      where: { id: fromTeamId },
      select: {
        id: true,
        name: true,
        leagueId: true,
        league: { select: { id: true, name: true, season: true } },
        members: { select: { id: true } },
      },
    }),
    prisma.team.findUnique({
      where: { id: toTeamId },
      select: {
        id: true,
        name: true,
        leagueId: true,
        league: { select: { id: true, name: true, season: true } },
      },
    }),
  ]);

  if (!fromTeam || !toTeam) {
    redirect(buildRedirect({ error: "team_not_found" }));
  }

  if (!fromTeam.leagueId || !toTeam.leagueId || fromTeam.leagueId !== toTeam.leagueId) {
    redirect(
      buildRedirect({
        error: "league_mismatch",
        fromTeamId,
        toTeamId,
      }),
    );
  }

  const now = new Date();
  const targetFixtures = await prisma.fixture.findMany({
    where: {
      status: "SCHEDULED",
      kickoffAt: { gte: now },
      OR: [{ homeTeamId: fromTeam.id }, { awayTeamId: fromTeam.id }],
    },
    select: {
      id: true,
      leagueId: true,
      homeTeamId: true,
      awayTeamId: true,
      kickoffAt: true,
      publishedAt: true,
    },
    orderBy: [{ kickoffAt: "asc" }],
  });

  if (targetFixtures.length === 0) {
    redirect(buildRedirect({ error: "no_future_fixtures", fromTeamId, toTeamId }));
  }

  const invalidLeagueFixture = targetFixtures.find((fixture) => fixture.leagueId !== fromTeam.leagueId);
  if (invalidLeagueFixture) {
    redirect(buildRedirect({ error: "fixture_league_mismatch", fromTeamId, toTeamId }));
  }

  const selfFixture = targetFixtures.find(
    (fixture) => fixture.homeTeamId === toTeam.id || fixture.awayTeamId === toTeam.id,
  );

  if (selfFixture) {
    redirect(buildRedirect({ error: "replacement_already_in_fixture", fromTeamId, toTeamId }));
  }

  const fixtureIds = targetFixtures.map((fixture) => fixture.id);
  const fromTeamMemberIds = fromTeam.members.map((member) => member.id);

  await prisma.$transaction(async (tx) => {
    for (const fixture of targetFixtures) {
      await tx.fixture.update({
        where: { id: fixture.id },
        data:
          fixture.homeTeamId === fromTeam.id
            ? { homeTeamId: toTeam.id }
            : { awayTeamId: toTeam.id },
      });

      await tx.fixtureCaptainConfirmation.deleteMany({
        where: {
          fixtureId: fixture.id,
          teamId: fromTeam.id,
        },
      });

      await tx.fixtureCaptainConfirmation.upsert({
        where: {
          fixtureId_teamId: {
            fixtureId: fixture.id,
            teamId: toTeam.id,
          },
        },
        update: {
          status: "PENDING",
          note: null,
          confirmedAt: null,
          issueRaisedAt: null,
          confirmedByUserId: null,
        },
        create: {
          fixtureId: fixture.id,
          teamId: toTeam.id,
          status: "PENDING",
        },
      });
    }

    if (fromTeamMemberIds.length > 0) {
      await tx.fixtureAvailability.deleteMany({
        where: {
          fixtureId: { in: fixtureIds },
          teamMemberId: { in: fromTeamMemberIds },
        },
      });

      await tx.fixtureSelection.deleteMany({
        where: {
          fixtureId: { in: fixtureIds },
          teamMemberId: { in: fromTeamMemberIds },
        },
      });
    }

    await tx.playerMatchFee.updateMany({
      where: {
        fixtureId: { in: fixtureIds },
        teamId: fromTeam.id,
        status: "OPEN",
      },
      data: {
        status: "CANCELLED",
        cancelledAt: new Date(),
      },
    });

    await tx.paymentCharge.updateMany({
      where: {
        fixtureId: { in: fixtureIds },
        teamId: fromTeam.id,
        status: "OPEN",
      },
      data: {
        status: "VOID",
      },
    });
  });

  for (const fixture of targetFixtures) {
    if (!fixture.publishedAt) continue;
    try {
      await refreshStoredAiPreviewForFixture(fixture.id, { force: true });
    } catch (predictionError) {
      console.error("Failed to regenerate AI prediction after future team replacement", {
        fixtureId: fixture.id,
        error: predictionError,
      });
    }
  }

  revalidatePath("/admin/fixtures");
  revalidatePath("/admin/fixtures/replace-team");
  revalidatePath("/admin/fixtures/generate");
  revalidatePath("/admin/fixtures/backfill");
  revalidatePath(`/admin/teams/${fromTeam.id}`);
  revalidatePath(`/admin/teams/${toTeam.id}`);
  revalidatePath(`/captain/team/${fromTeam.id}`);
  revalidatePath(`/captain/team/${toTeam.id}`);

  if (fromTeam.leagueId) {
    revalidatePath(`/admin/leagues/${fromTeam.leagueId}`);
  }

  redirect(
    buildRedirect({
      replaced: targetFixtures.length,
      fromTeamId: fromTeam.id,
      toTeamId: toTeam.id,
    }),
  );
}
