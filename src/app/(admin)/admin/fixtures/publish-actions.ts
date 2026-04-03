// ========================================
// File: src/app/(admin)/admin/fixtures/publish-actions.ts
// ========================================

"use server";

import {
  NotificationAudience,
  NotificationChannel,
  NotificationDispatchStatus,
} from "@prisma/client";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
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

function buildAdminFixturesHref(input: {
  publish: "success" | "none";
  leagueId: string;
  published?: number;
  digestQueued?: number;
  digestSkipped?: number;
  reminderQueued?: number;
  reminderSkipped?: number;
}) {
  const searchParams = new URLSearchParams();
  searchParams.set("publish", input.publish);
  searchParams.set("leagueId", input.leagueId);

  if (typeof input.published === "number") {
    searchParams.set("published", String(input.published));
  }

  if (typeof input.digestQueued === "number") {
    searchParams.set("digestQueued", String(input.digestQueued));
  }

  if (typeof input.digestSkipped === "number") {
    searchParams.set("digestSkipped", String(input.digestSkipped));
  }

  if (typeof input.reminderQueued === "number") {
    searchParams.set("reminderQueued", String(input.reminderQueued));
  }

  if (typeof input.reminderSkipped === "number") {
    searchParams.set("reminderSkipped", String(input.reminderSkipped));
  }

  return `/admin/fixtures?${searchParams.toString()}`;
}

function formatKickoff(date: Date) {
  return new Intl.DateTimeFormat("en-GB", {
    weekday: "short",
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(date));
}

function unique(values: string[]) {
  return Array.from(new Set(values.filter(Boolean)));
}

function buildFixtureLine(
  fixture: {
    kickoffAt: Date;
    pitch: string | null;
    homeTeam: { id: string; name: string };
    awayTeam: { id: string; name: string };
    venue: { name: string } | null;
  },
  teamId: string,
) {
  const isHome = fixture.homeTeam.id === teamId;
  const opponent = isHome ? fixture.awayTeam.name : fixture.homeTeam.name;

  return `${formatKickoff(fixture.kickoffAt)} — ${
    isHome ? `Home vs ${opponent}` : `Away at ${opponent}`
  } — ${fixture.pitch ?? "Pitch TBC"} — ${fixture.venue?.name ?? "Venue TBC"}`;
}

function isQueuedDispatch(status: NotificationDispatchStatus) {
  return status === NotificationDispatchStatus.QUEUED;
}

export async function publishAndEmailLeagueFixturesAction(formData: FormData) {
  await requireAdmin();

  const leagueId = parseRequiredString(formData.get("leagueId"), "League");

  const league = await prisma.league.findUnique({
    where: { id: leagueId },
    select: {
      id: true,
      name: true,
      slug: true,
      season: true,
    },
  });

  if (!league) {
    throw new Error("League not found.");
  }

  const unpublishedFixtures = await prisma.fixture.findMany({
    where: {
      leagueId,
      publishedAt: null,
    },
    orderBy: {
      kickoffAt: "asc",
    },
    select: {
      id: true,
      kickoffAt: true,
      pitch: true,
      homeTeam: {
        select: {
          id: true,
          name: true,
        },
      },
      awayTeam: {
        select: {
          id: true,
          name: true,
        },
      },
      venue: {
        select: {
          name: true,
        },
      },
    },
  });

  if (unpublishedFixtures.length === 0) {
    revalidatePath("/admin/fixtures");
    revalidatePath(`/admin/leagues/${leagueId}`);
    revalidatePath(`/admin/leagues/${leagueId}/fixtures`);

    if (league.slug) {
      revalidatePath(`/leagues/${league.slug}`);
      revalidatePath(`/leagues/${league.slug}/fixtures`);
    }

    redirect(
      buildAdminFixturesHref({
        publish: "none",
        leagueId,
      }),
    );
  }

  const publishedAt = new Date();

  await prisma.fixture.updateMany({
    where: {
      leagueId,
      publishedAt: null,
    },
    data: {
      publishedAt,
    },
  });

  const teamIds = unique(
    unpublishedFixtures.flatMap((fixture) => [fixture.homeTeam.id, fixture.awayTeam.id]),
  );

  const fixturesUrl = buildAbsoluteUrl(`/leagues/${league.slug}/fixtures`);

  let digestQueued = 0;
  let digestSkipped = 0;
  let reminderQueued = 0;
  let reminderSkipped = 0;

  for (const teamId of teamIds) {
    const { snapshot, recipient } = await upsertTeamNotificationRecipient(teamId);
    const teamFixtures = unpublishedFixtures.filter(
      (fixture) =>
        fixture.homeTeam.id === teamId || fixture.awayTeam.id === teamId,
    );

    if (teamFixtures.length === 0) continue;

    const digestDispatch = await queueDirectNotification({
      recipientId: recipient.id,
      channel: NotificationChannel.EMAIL,
      audience: NotificationAudience.TEAM,
      subject: `${league.name} fixtures are live`,
      body: [
        `Hi ${snapshot.primaryContact.name ?? snapshot.teamName},`,
        "",
        `Your fixtures for ${league.name}${league.season ? ` (${league.season})` : ""} are now live.`,
        "",
        ...teamFixtures.map((fixture) => buildFixtureLine(fixture, teamId)),
        "",
        "You will also receive automatic reminders before kickoff.",
      ].join("\n"),
      isTransactional: true,
      sourceType: "LEAGUE_FIXTURE_DIGEST",
      sourceId: league.id,
      metadata: {
        kind: "fixture_publish_digest",
        teamId,
        leagueId: league.id,
      },
      emailCta: {
        label: "View fixtures",
        url: fixturesUrl,
      },
    });

    if (isQueuedDispatch(digestDispatch.status)) {
      digestQueued += 1;
    } else {
      digestSkipped += 1;
    }
  }

  for (const fixture of unpublishedFixtures) {
    for (const teamId of [fixture.homeTeam.id, fixture.awayTeam.id]) {
      const { recipient } = await upsertTeamNotificationRecipient(teamId);

      const reminderTimes = [
        new Date(fixture.kickoffAt.getTime() - 48 * 60 * 60 * 1000),
        new Date(fixture.kickoffAt.getTime() - 6 * 60 * 60 * 1000),
      ].filter((date) => date.getTime() > Date.now());

      for (const scheduledFor of reminderTimes) {
        const reminderDispatch = await queueDirectNotification({
          recipientId: recipient.id,
          channel: NotificationChannel.EMAIL,
          audience: NotificationAudience.TEAM,
          subject: `${league.name} fixture reminder`,
          body: [
            "Hi,",
            "",
            `Reminder: ${buildFixtureLine(fixture, teamId)}`,
            "",
            "Please make sure your team is ready for kickoff.",
          ].join("\n"),
          isTransactional: true,
          sourceType: "FIXTURE_REMINDER",
          sourceId: fixture.id,
          metadata: {
            kind: "fixture_reminder",
            teamId,
            leagueId: league.id,
          },
          scheduledFor,
          emailCta: {
            label: "View fixtures",
            url: fixturesUrl,
          },
        });

        if (isQueuedDispatch(reminderDispatch.status)) {
          reminderQueued += 1;
        } else {
          reminderSkipped += 1;
        }
      }
    }
  }

  revalidatePath("/admin/fixtures");
  revalidatePath(`/admin/leagues/${leagueId}`);
  revalidatePath(`/admin/leagues/${leagueId}/fixtures`);

  if (league.slug) {
    revalidatePath(`/leagues/${league.slug}`);
    revalidatePath(`/leagues/${league.slug}/fixtures`);
  }

  redirect(
    buildAdminFixturesHref({
      publish: "success",
      leagueId,
      published: unpublishedFixtures.length,
      digestQueued,
      digestSkipped,
      reminderQueued,
      reminderSkipped,
    }),
  );
}
