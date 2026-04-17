// ========================================
// File: src/app/(admin)/admin/fixtures/publish-actions.ts
// ========================================

"use server";

import {
  NotificationAudience,
  NotificationChannel,
  NotificationDispatchStatus,
  Prisma,
} from "@prisma/client";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { formatDateTimeInLondon } from "@/lib/datetime/london";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/requireAdmin";
import { queueDirectNotification } from "@/lib/notifications/service";
import { upsertTeamNotificationRecipient } from "@/lib/notifications/team-contacts";
import { getEmailReplyDomain } from "@/lib/resend/client";

type PublishFixtureRecord = {
  id: string;
  kickoffAt: Date;
  pitch: string | null;
  homeTeam: {
    id: string;
    name: string;
    logoUrl: string | null;
  };
  awayTeam: {
    id: string;
    name: string;
    logoUrl: string | null;
  };
  venue: {
    name: string;
  } | null;
};

const SERIALIZABLE_RETRY_LIMIT = 3;
const PUBLISH_RETRY_ERROR = "fixture_publish_retry_conflict";

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
  publish: "success" | "none" | "error";
  leagueId: string;
  published?: number;
  digestQueued?: number;
  digestSkipped?: number;
  reminderQueued?: number;
  reminderSkipped?: number;
  publishError?: string;
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

  if (input.publishError?.trim()) {
    searchParams.set("publishError", input.publishError.trim());
  }

  return `/admin/fixtures?${searchParams.toString()}`;
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

function unique(values: string[]) {
  return Array.from(new Set(values.filter(Boolean)));
}

function buildFixtureLine(fixture: {
  kickoffAt: Date;
  pitch: string | null;
  homeTeam: { id: string; name: string };
  awayTeam: { id: string; name: string };
  venue: { name: string } | null;
}) {
  return `${formatKickoff(fixture.kickoffAt)} — ${fixture.homeTeam.name} vs ${fixture.awayTeam.name} — ${fixture.pitch ?? "Pitch TBC"} — ${fixture.venue?.name ?? "Venue TBC"}`;
}

function isQueuedDispatch(status: NotificationDispatchStatus) {
  return status === NotificationDispatchStatus.QUEUED;
}

function getLeagueDisplayName(league: { name: string; season: string | null }) {
  return league.season ? `${league.name} — ${league.season}` : league.name;
}

function getTeamDetailsForFixture(
  fixture: {
    homeTeam: { id: string; name: string; logoUrl: string | null };
    awayTeam: { id: string; name: string; logoUrl: string | null };
  },
  teamId: string,
) {
  return fixture.homeTeam.id === teamId ? fixture.homeTeam : fixture.awayTeam;
}

function buildDigestSourceId(input: { leagueId: string; teamId: string }) {
  return `${input.leagueId}:${input.teamId}`;
}

function buildReminderSourceId(input: {
  fixtureId: string;
  teamId: string;
  scheduledFor: Date;
}) {
  return `${input.fixtureId}:${input.teamId}:${input.scheduledFor.toISOString()}`;
}

function isRetryablePublishError(error: unknown) {
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    return error.code === "P2034";
  }

  return error instanceof Error && error.message === PUBLISH_RETRY_ERROR;
}

async function withSerializableRetry<T>(callback: () => Promise<T>): Promise<T> {
  let attempt = 0;

  while (attempt < SERIALIZABLE_RETRY_LIMIT) {
    try {
      return await callback();
    } catch (error) {
      attempt += 1;

      if (!isRetryablePublishError(error) || attempt >= SERIALIZABLE_RETRY_LIMIT) {
        throw error;
      }
    }
  }

  throw new Error("Unable to complete fixture publish.");
}

async function claimUnpublishedLeagueFixtures(
  leagueId: string,
): Promise<PublishFixtureRecord[]> {
  return withSerializableRetry(async () => {
    return prisma.$transaction(
      async (tx) => {
        const unpublishedFixtures = await tx.fixture.findMany({
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
            venue: {
              select: {
                name: true,
              },
            },
          },
        });

        if (unpublishedFixtures.length === 0) {
          return [];
        }

        const fixtureIds = unpublishedFixtures.map((fixture) => fixture.id);
        const publishedAt = new Date();

        const updateResult = await tx.fixture.updateMany({
          where: {
            id: {
              in: fixtureIds,
            },
            leagueId,
            publishedAt: null,
          },
          data: {
            publishedAt,
          },
        });

        if (updateResult.count !== fixtureIds.length) {
          throw new Error(PUBLISH_RETRY_ERROR);
        }

        return unpublishedFixtures;
      },
      {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      },
    );
  });
}

async function queueDirectNotificationOnce(input: {
  recipientId: string;
  channel: NotificationChannel;
  audience: NotificationAudience;
  subject?: string | null;
  body: string;
  isTransactional?: boolean;
  sourceType?: string | null;
  sourceId?: string | null;
  metadata?: Prisma.InputJsonValue;
  variables?: Prisma.InputJsonValue;
  emailBranding?: {
    teamName?: string | null;
    teamLogoUrl?: string | null;
    leagueName?: string | null;
  };
  emailCta?: {
    label: string;
    url: string;
  };
  scheduledFor?: Date;
  createdByUserId?: string | null;
}) {
  const sourceType = input.sourceType?.trim() || null;
  const sourceId = input.sourceId?.trim() || null;

  if (sourceType && sourceId) {
    const existingDispatch = await prisma.notificationDispatch.findFirst({
      where: {
        sourceType,
        sourceId,
        status: {
          in: [
            NotificationDispatchStatus.QUEUED,
            NotificationDispatchStatus.PROCESSING,
            NotificationDispatchStatus.SENT,
          ],
        },
      },
      select: {
        id: true,
      },
    });

    if (existingDispatch) {
      return {
        status: NotificationDispatchStatus.SKIPPED,
      } as const;
    }
  }

  const dispatch = await queueDirectNotification({
    recipientId: input.recipientId,
    channel: input.channel,
    audience: input.audience,
    subject: input.subject,
    body: input.body,
    isTransactional: input.isTransactional,
    sourceType,
    sourceId,
    metadata: input.metadata,
    variables: input.variables,
    emailBranding: input.emailBranding,
    emailCta: input.emailCta,
    scheduledFor: input.scheduledFor,
    createdByUserId: input.createdByUserId,
  });

  return {
    status: dispatch.status,
  } as const;
}

export async function publishAndEmailLeagueFixturesAction(formData: FormData) {
  await requireAdmin();

  const leagueId = parseRequiredString(formData.get("leagueId"), "League");

  try {
    getEmailReplyDomain();
  } catch {
    redirect(
      buildAdminFixturesHref({
        publish: "error",
        leagueId,
        publishError: "reply_not_configured",
      }),
    );
  }

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

  const unpublishedFixtures = await claimUnpublishedLeagueFixtures(leagueId);

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

  const teamIds = unique(
    unpublishedFixtures.flatMap((fixture) => [fixture.homeTeam.id, fixture.awayTeam.id]),
  );

  const fixturesUrl = buildAbsoluteUrl(`/leagues/${league.slug}/fixtures`);
  const leagueDisplayName = getLeagueDisplayName(league);

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

    const teamDetails = getTeamDetailsForFixture(teamFixtures[0], teamId);

    const digestDispatch = await queueDirectNotificationOnce({
      recipientId: recipient.id,
      channel: NotificationChannel.EMAIL,
      audience: NotificationAudience.TEAM,
      subject: `${league.name} fixtures are live`,
      body: [
        `Hi ${snapshot.primaryContact.name ?? snapshot.teamName},`,
        "",
        `Your fixtures for ${league.name}${league.season ? ` (${league.season})` : ""} are now live.`,
        "",
        ...teamFixtures.map((fixture) => buildFixtureLine(fixture)),
        "",
        "You will also receive automatic reminders before kickoff.",
      ].join("\n"),
      isTransactional: true,
      sourceType: "LEAGUE_FIXTURE_DIGEST",
      sourceId: buildDigestSourceId({
        leagueId: league.id,
        teamId,
      }),
      metadata: {
        kind: "fixture_publish_digest",
        teamId,
        leagueId: league.id,
      },
      emailBranding: {
        teamName: snapshot.teamName || teamDetails.name,
        teamLogoUrl: teamDetails.logoUrl ?? null,
        leagueName: leagueDisplayName,
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
      const teamDetails = getTeamDetailsForFixture(fixture, teamId);

      const reminderTimes = [
        new Date(fixture.kickoffAt.getTime() - 48 * 60 * 60 * 1000),
        new Date(fixture.kickoffAt.getTime() - 6 * 60 * 60 * 1000),
      ].filter((date) => date.getTime() > Date.now());

      for (const scheduledFor of reminderTimes) {
        const reminderDispatch = await queueDirectNotificationOnce({
          recipientId: recipient.id,
          channel: NotificationChannel.EMAIL,
          audience: NotificationAudience.TEAM,
          subject: `${league.name} fixture reminder`,
          body: [
            `Hi ${recipient.displayName?.trim() || teamDetails.name},`,
            "",
            `Reminder: ${buildFixtureLine(fixture)}`,
            "",
            "Please make sure your team is ready for kickoff.",
          ].join("\n"),
          isTransactional: true,
          sourceType: "FIXTURE_REMINDER",
          sourceId: buildReminderSourceId({
            fixtureId: fixture.id,
            teamId,
            scheduledFor,
          }),
          metadata: {
            kind: "fixture_reminder",
            teamId,
            leagueId: league.id,
          },
          scheduledFor,
          emailBranding: {
            teamName: teamDetails.name,
            teamLogoUrl: teamDetails.logoUrl ?? null,
            leagueName: leagueDisplayName,
          },
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