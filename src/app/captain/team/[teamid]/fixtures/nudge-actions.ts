"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { getCaptainRelatedTeamContext } from "@/lib/captain/related-teams";
import { prisma } from "@/lib/prisma";
import { requireCaptain } from "@/lib/requireCaptain";
import { fixtureHasPlaceholderTeam } from "@/lib/teams/fixture-placeholders";

function friendlyConfirmationError(error: unknown) {
  if (error instanceof Error) {
    if (error.message.includes("Fixture not found")) {
      return "That fixture could not be found.";
    }
    if (error.message.includes("not linked")) {
      return "That fixture is not linked to this team.";
    }
    if (error.message.includes("not available")) {
      return "This fixture is no longer available for confirmation.";
    }
    if (error.message.includes("provisional")) {
      return "The opponent is still being confirmed, so you do not need to confirm this fixture yet.";
    }
  }

  return "We could not confirm the fixture just now. Please try again or raise an issue from the fixtures page.";
}

function fixturesErrorRedirect(teamId: string, fixtureId: string, message: string) {
  const params = new URLSearchParams({
    fixtureId,
    error: message,
  });
  return `/captain/team/${teamId}/fixtures?${params.toString()}`;
}

export async function confirmFixtureFromNudgeAction(formData: FormData) {
  const teamId = String(formData.get("teamId") ?? "").trim();
  const fixtureId = String(formData.get("fixtureId") ?? "").trim();

  await requireCaptain(teamId);

  let errorMessage: string | null = null;

  try {
    const [context, fixture] = await Promise.all([
      getCaptainRelatedTeamContext(teamId),
      prisma.fixture.findUnique({
        where: { id: fixtureId },
        select: {
          id: true,
          kickoffAt: true,
          status: true,
          publishedAt: true,
          homeTeamId: true,
          awayTeamId: true,
        },
      }),
    ]);

    if (!context || !fixture) throw new Error("Fixture not found.");

    const confirmationTeamId = context.relatedTeamIds.includes(fixture.homeTeamId)
      ? fixture.homeTeamId
      : context.relatedTeamIds.includes(fixture.awayTeamId)
        ? fixture.awayTeamId
        : null;

    if (!confirmationTeamId) {
      throw new Error("Fixture is not linked to this team.");
    }

    if (
      fixture.publishedAt === null ||
      fixture.status !== "SCHEDULED" ||
      fixture.kickoffAt <= new Date()
    ) {
      throw new Error("Fixture is not available for confirmation.");
    }

    if (await fixtureHasPlaceholderTeam(fixture.id)) {
      throw new Error("Fixture is still provisional.");
    }

    const access = await requireCaptain(teamId);
    const confirmedAt = new Date();

    await prisma.fixtureCaptainConfirmation.upsert({
      where: {
        fixtureId_teamId: {
          fixtureId: fixture.id,
          teamId: confirmationTeamId,
        },
      },
      update: {
        status: "CONFIRMED",
        note: null,
        confirmedAt,
        issueRaisedAt: null,
        confirmedByUserId: access.user?.id ?? null,
      },
      create: {
        fixtureId: fixture.id,
        teamId: confirmationTeamId,
        status: "CONFIRMED",
        confirmedAt,
        confirmedByUserId: access.user?.id ?? null,
      },
    });

    revalidatePath(`/captain/team/${teamId}`);
    revalidatePath(`/captain/team/${teamId}/fixtures`);
    revalidatePath(`/captain/team/${confirmationTeamId}`);
    revalidatePath(`/captain/team/${confirmationTeamId}/fixtures`);
    revalidatePath("/admin/fixtures");
  } catch (error) {
    console.error("Captain fixture nudge confirmation failed", {
      teamId,
      fixtureId,
      error,
    });
    errorMessage = friendlyConfirmationError(error);
  }

  if (errorMessage) {
    redirect(fixturesErrorRedirect(teamId, fixtureId, errorMessage));
  }

  redirect(`/captain/team/${teamId}`);
}
