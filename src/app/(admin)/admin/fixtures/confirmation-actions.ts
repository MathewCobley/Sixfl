// ========================================
// File: src/app/(admin)/admin/fixtures/confirmation-actions.ts
// ========================================

"use server";

import {
  FixtureCaptainConfirmationStatus,
  NotificationAudience,
  NotificationChannel,
  NotificationDispatchStatus,
} from "@prisma/client";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { formatDateTimeInLondon } from "@/lib/datetime/london";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/requireAdmin";
import { queueDirectNotification } from "@/lib/notifications/service";
import { upsertTeamNotificationRecipient } from "@/lib/notifications/team-contacts";

function parseRequiredString(value: FormDataEntryValue | null, fieldName: string) {
  const str = String(value ?? "").trim();

  if (!str) {
    throw new Error(`${fieldName} is required.`);
  }

  return str;
}

function getSiteUrl() {
  return (
    process.env.NEXT_PUBLIC_SITE_URL?.trim() ||
    process.env.SITE_URL?.trim() ||
    process.env.NEXT_PUBLIC_APP_URL?.trim() ||
    process.env.APP_URL?.trim() ||
    "https://www.sixfl.co.uk"
  );
}

function buildAbsoluteUrl(path: string) {
  return new URL(path, getSiteUrl()).toString();
}

function formatKickoff(date: Date) {
  return formatDateTimeInLondon(date, {
    weekday: "short",
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
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

function isQueuedDispatch(status: NotificationDispatchStatus) {
  return status === NotificationDispatchStatus.QUEUED;
}

export async function chaseFixtureConfirmationSmsAction(formData: FormData) {
  await requireAdmin();

  const fixtureId = parseRequiredString(formData.get("fixtureId"), "Fixture");
  const teamId = parseRequiredString(formData.get("teamId"), "Team");

  const fixture = await prisma.fixture.findUnique({
    where: { id: fixtureId },
    select: {
      id: true,
      kickoffAt: true,
      status: true,
      leagueId: true,
      league: {
        select: {
          id: true,
          name: true,
          season: true,
          slug: true,
        },
      },
      homeTeam: {
        select: {
          id: true,
          name: true,
          logoUrl: true,
        },
      },
      awayTeam: {
        select: {
          id: true,
          name: true,
          logoUrl: true,
        },
      },
      captainConfirmations: {
        where: {
          teamId,
        },
        select: {
          id: true,
          status: true,
        },
        take: 1,
      },
    },
  });

  if (!fixture) {
    redirect(buildAdminFixturesHref({ notice: "sms_error" }));
  }

  const isHome = fixture.homeTeam.id === teamId;
  const isAway = fixture.awayTeam.id === teamId;

  if (!isHome && !isAway) {
    redirect(buildAdminFixturesHref({ notice: "sms_error" }));
  }

  const team = isHome ? fixture.homeTeam : fixture.awayTeam;
  const opponent = isHome ? fixture.awayTeam : fixture.homeTeam;

  if (fixture.status !== "SCHEDULED" || fixture.kickoffAt <= new Date()) {
    redirect(
      buildAdminFixturesHref({
        notice: "sms_not_available",
        teamName: team.name,
      }),
    );
  }

  const existingConfirmation = fixture.captainConfirmations[0] ?? null;

  if (existingConfirmation?.status === FixtureCaptainConfirmationStatus.CONFIRMED) {
    redirect(
      buildAdminFixturesHref({
        notice: "sms_not_available",
        teamName: team.name,
      }),
    );
  }

  if (existingConfirmation?.status === FixtureCaptainConfirmationStatus.ISSUE_RAISED) {
    redirect(
      buildAdminFixturesHref({
        notice: "sms_not_available",
        teamName: team.name,
      }),
    );
  }

  const { recipient } = await upsertTeamNotificationRecipient(teamId);

  if (!recipient.phone?.trim()) {
    redirect(
      buildAdminFixturesHref({
        notice: "sms_skipped",
        teamName: team.name,
      }),
    );
  }

  const captainFixturesUrl = buildAbsoluteUrl(`/captain/team/${teamId}/fixtures`);

  const dispatch = await queueDirectNotification({
    recipientId: recipient.id,
    channel: NotificationChannel.SMS,
    audience: NotificationAudience.TEAM,
    body: [
      `SIXFL: Please confirm your fixture.`,
      `${team.name} vs ${opponent.name}`,
      `${formatKickoff(fixture.kickoffAt)}`,
      `Confirm here: ${captainFixturesUrl}`,
    ].join("\n"),
    isTransactional: true,
    sourceType: "FIXTURE_CONFIRMATION_CHASE_SMS",
    sourceId: fixture.id,
    metadata: {
      kind: "fixture_confirmation_chase_sms",
      fixtureId: fixture.id,
      leagueId: fixture.leagueId,
      teamId,
      teamName: team.name,
      opponentName: opponent.name,
    },
  });

  if (isQueuedDispatch(dispatch.status)) {
    await prisma.fixtureCaptainConfirmation.upsert({
      where: {
        fixtureId_teamId: {
          fixtureId: fixture.id,
          teamId,
        },
      },
      update: {
        lastChasedAt: new Date(),
      },
      create: {
        fixtureId: fixture.id,
        teamId,
        status: FixtureCaptainConfirmationStatus.PENDING,
        lastChasedAt: new Date(),
      },
    });

    revalidatePath("/admin/fixtures");
    revalidatePath(`/admin/leagues/${fixture.leagueId}`);
    revalidatePath(`/admin/leagues/${fixture.leagueId}/fixtures`);
    revalidatePath(`/captain/team/${teamId}`);
    revalidatePath(`/captain/team/${teamId}/fixtures`);

    if (fixture.league.slug) {
      revalidatePath(`/leagues/${fixture.league.slug}`);
      revalidatePath(`/leagues/${fixture.league.slug}/fixtures`);
    }

    redirect(
      buildAdminFixturesHref({
        notice: "sms_queued",
        teamName: team.name,
      }),
    );
  }

  redirect(
    buildAdminFixturesHref({
      notice: "sms_skipped",
      teamName: team.name,
    }),
  );
}