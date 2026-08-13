"use server";

import { FixtureStatus, NotificationDispatchStatus } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/requireAdmin";

const RETURN_TO = "/admin/audits/stale-fixtures";

function messageUrl(kind: "fixed" | "error", message: string) {
  const params = new URLSearchParams({ [kind]: message });
  return `${RETURN_TO}?${params.toString()}`;
}

export async function markStaleFixtureCompletedAction(formData: FormData) {
  await requireAdmin();

  const fixtureId = String(formData.get("fixtureId") ?? "").trim();
  if (!fixtureId) redirect(messageUrl("error", "Fixture ID is missing."));

  const fixture = await prisma.fixture.findUnique({
    where: { id: fixtureId },
    select: {
      id: true,
      status: true,
      kickoffAt: true,
      leagueId: true,
      homeTeam: { select: { name: true } },
      awayTeam: { select: { name: true } },
      result: { select: { id: true, homeScore: true, awayScore: true } },
      league: { select: { slug: true } },
    },
  });

  if (!fixture) redirect(messageUrl("error", "Fixture could not be found."));
  if (fixture.status !== FixtureStatus.SCHEDULED) {
    redirect(messageUrl("error", "That fixture is no longer marked as scheduled."));
  }
  if (fixture.kickoffAt >= new Date()) {
    redirect(messageUrl("error", "Future fixtures cannot be repaired from the stale fixture audit."));
  }
  if (!fixture.result) {
    redirect(messageUrl("error", "A fixture can only be marked completed here when a result already exists."));
  }

  await prisma.$transaction(async (tx) => {
    await tx.fixture.update({
      where: { id: fixture.id },
      data: { status: FixtureStatus.COMPLETED },
    });

    await tx.notificationDispatch.updateMany({
      where: {
        status: NotificationDispatchStatus.QUEUED,
        sourceType: {
          in: [
            "FIXTURE_REMINDER",
            "FIXTURE_CONFIRMATION_CHASE_SMS",
            "FIXTURE_CONFIRMATION_AUTO_SMS_72H",
            "FIXTURE_CONFIRMATION_AUTO_SMS_24H",
          ],
        },
        OR: [
          { sourceId: fixture.id },
          { sourceId: { startsWith: `${fixture.id}:` } },
        ],
      },
      data: {
        status: NotificationDispatchStatus.CANCELLED,
        cancelledAt: new Date(),
        failureReason: "Historical fixture repaired as completed by stale fixture audit.",
      },
    });
  });

  revalidatePath(RETURN_TO);
  revalidatePath("/admin/fixtures");
  revalidatePath(`/admin/leagues/${fixture.leagueId}`);
  revalidatePath(`/admin/leagues/${fixture.leagueId}/fixtures`);
  if (fixture.league.slug) {
    revalidatePath(`/leagues/${fixture.league.slug}`);
    revalidatePath(`/leagues/${fixture.league.slug}/fixtures`);
  }

  redirect(
    messageUrl(
      "fixed",
      `${fixture.homeTeam.name} v ${fixture.awayTeam.name} marked completed (${fixture.result.homeScore}-${fixture.result.awayScore}).`,
    ),
  );
}
