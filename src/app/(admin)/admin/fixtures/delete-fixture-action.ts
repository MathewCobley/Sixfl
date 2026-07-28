"use server";

import { NotificationDispatchStatus } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { queueFixtureCancellationEmails } from "@/lib/fixtures/cancellation-notifications";
import { voidFixtureMatchFeeChargesOrThrow } from "@/lib/payments/fixture-match-fees";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/requireAdmin";

const FIXTURE_MESSAGE_SOURCE_TYPES = [
  "FIXTURE_REMINDER",
  "FIXTURE_CONFIRMATION_CHASE_SMS",
  "FIXTURE_CONFIRMATION_AUTO_SMS_72H",
  "FIXTURE_CONFIRMATION_AUTO_SMS_24H",
] as const;

function requiredFixtureId(value: FormDataEntryValue | null) {
  const id = String(value ?? "").trim();
  if (!id) throw new Error("Fixture ID is required.");
  return id;
}

async function cancelQueuedFixtureMessages(fixtureId: string) {
  await prisma.notificationDispatch.updateMany({
    where: {
      sourceType: { in: [...FIXTURE_MESSAGE_SOURCE_TYPES] },
      OR: [
        { sourceId: fixtureId },
        { sourceId: { startsWith: `${fixtureId}:` } },
      ],
      status: NotificationDispatchStatus.QUEUED,
    },
    data: {
      status: NotificationDispatchStatus.CANCELLED,
      cancelledAt: new Date(),
      failureReason: "Fixture deleted before the queued message was sent.",
    },
  });
}

export async function deleteFixtureAction(formData: FormData) {
  await requireAdmin();

  const id = requiredFixtureId(formData.get("id"));
  const fixture = await prisma.fixture.findUnique({
    where: { id },
    select: {
      id: true,
      leagueId: true,
      kickoffAt: true,
      pitch: true,
      venue: { select: { name: true } },
      homeTeam: { select: { id: true, name: true } },
      awayTeam: { select: { id: true, name: true } },
      league: {
        select: { name: true, season: true, slug: true },
      },
    },
  });

  if (!fixture) throw new Error("Fixture not found.");

  await prisma.$transaction(async (tx) => {
    await voidFixtureMatchFeeChargesOrThrow([id], tx);
    await tx.fixture.delete({ where: { id } });
  });

  await cancelQueuedFixtureMessages(id);

  const cancellationResults = await queueFixtureCancellationEmails({
    fixtureId: fixture.id,
    kickoffAt: fixture.kickoffAt,
    pitch: fixture.pitch,
    venueName: fixture.venue?.name ?? null,
    leagueName: fixture.league.name,
    leagueSeason: fixture.league.season,
    homeTeam: fixture.homeTeam,
    awayTeam: fixture.awayTeam,
  });

  for (const result of cancellationResults) {
    if (result.status === "rejected") {
      console.error("Failed to queue fixture cancellation email", {
        fixtureId: id,
        error: result.reason,
      });
    }
  }

  revalidatePath("/admin/fixtures");
  revalidatePath(`/admin/leagues/${fixture.leagueId}/fixtures`);
  revalidatePath(`/admin/leagues/${fixture.leagueId}`);

  if (fixture.league.slug) {
    revalidatePath(`/leagues/${fixture.league.slug}`);
    revalidatePath(`/leagues/${fixture.league.slug}/fixtures`);
  }

  redirect("/admin/fixtures");
}
