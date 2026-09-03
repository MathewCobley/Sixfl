import {
  NotificationAudience,
  NotificationChannel,
  Prisma,
} from "@prisma/client";

import { SIXFL_TV_EMAIL_BRAND_MARKER } from "@/lib/email/buildEmail";
import { formatDateTimeInLondon } from "@/lib/datetime/london";
import { queueDirectNotification } from "@/lib/notifications/service";
import { upsertTeamNotificationRecipient } from "@/lib/notifications/team-contacts";
import { prisma } from "@/lib/prisma";
import { getSixflTvVideos } from "@/lib/sixfl-tv/videos";
import { getPublicSiteUrl } from "@/lib/stripe/client";

const SIXFL_TV_UPLOAD_SOURCE_TYPE = "FIXTURE_SIXFL_TV_UPLOAD";

type SixflTvFixtureEmailRow = {
  id: string;
  kickoffAt: Date;
  publishedAt: Date | null;
  sixflTvUrl: string | null;
  homeTeamId: string;
  awayTeamId: string;
  homeTeamName: string;
  awayTeamName: string;
  leagueName: string;
  leagueSeason: string | null;
  venueName: string | null;
  homeScore: number | null;
  awayScore: number | null;
};

function formatFixtureDate(value: Date) {
  return formatDateTimeInLondon(value, {
    weekday: "short",
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function getFixtureTitle(fixture: SixflTvFixtureEmailRow) {
  if (fixture.homeScore !== null && fixture.awayScore !== null) {
    return `${fixture.homeTeamName} ${fixture.homeScore}-${fixture.awayScore} ${fixture.awayTeamName}`;
  }
  return `${fixture.homeTeamName} vs ${fixture.awayTeamName}`;
}

function getCaptainTvUrl(teamId: string) {
  return new URL(`/captain/team/${teamId}/tv`, `${getPublicSiteUrl()}/`).toString();
}

function joinVideoLabels(labels: string[]) {
  if (labels.length === 1) return labels[0].toLowerCase();
  if (labels.length === 2) return `${labels[0].toLowerCase()} and ${labels[1].toLowerCase()}`;
  return `${labels.slice(0, -1).map((label) => label.toLowerCase()).join(", ")} and ${labels.at(-1)?.toLowerCase()}`;
}

async function getFixtureEmailRow(fixtureId: string) {
  const rows = await prisma.$queryRaw<SixflTvFixtureEmailRow[]>(Prisma.sql`
    SELECT
      f."id",
      f."kickoffAt",
      f."publishedAt",
      f."sixflTvUrl",
      f."homeTeamId",
      f."awayTeamId",
      home."name" AS "homeTeamName",
      away."name" AS "awayTeamName",
      league."name" AS "leagueName",
      league."season" AS "leagueSeason",
      COALESCE(venue."name", league."venueName") AS "venueName",
      result."homeScore" AS "homeScore",
      result."awayScore" AS "awayScore"
    FROM "Fixture" f
    JOIN "Team" home ON home."id" = f."homeTeamId"
    JOIN "Team" away ON away."id" = f."awayTeamId"
    JOIN "League" league ON league."id" = f."leagueId"
    LEFT JOIN "Venue" venue ON venue."id" = f."venueId"
    LEFT JOIN "MatchResult" result ON result."fixtureId" = f."id"
    WHERE f."id" = ${fixtureId}
    LIMIT 1
  `);
  return rows[0] ?? null;
}

export async function queueSixflTvFixtureUploadedEmailsOnce(fixtureId: string) {
  const fixture = await getFixtureEmailRow(fixtureId);

  if (!fixture || !fixture.publishedAt) {
    return { queued: 0, skipped: true, reason: "fixture_not_published" };
  }

  const videos = getSixflTvVideos(fixture.sixflTvUrl);
  if (videos.length === 0) {
    return { queued: 0, skipped: true, reason: "no_video_links" };
  }

  const existing = await prisma.notificationDispatch.findFirst({
    where: { sourceType: SIXFL_TV_UPLOAD_SOURCE_TYPE, sourceId: fixture.id },
    select: { id: true },
  });

  if (existing) {
    return { queued: 0, skipped: true, reason: "already_sent" };
  }

  const fixtureTitle = getFixtureTitle(fixture);
  const leagueLabel = [fixture.leagueName, fixture.leagueSeason].filter(Boolean).join(" · ");
  const fixtureDate = formatFixtureDate(fixture.kickoffAt);
  const venueLabel = fixture.venueName ?? "Venue TBC";
  const videoSummary = joinVideoLabels(videos.map((video) => video.label));
  const teams = [
    { id: fixture.homeTeamId, name: fixture.homeTeamName },
    { id: fixture.awayTeamId, name: fixture.awayTeamName },
  ].filter((team, index, all) => all.findIndex((item) => item.id === team.id) === index);

  let queued = 0;

  for (const team of teams) {
    const { recipient } = await upsertTeamNotificationRecipient(team.id);
    const captainTvUrl = getCaptainTvUrl(team.id);

    await queueDirectNotification({
      recipientId: recipient.id,
      channel: NotificationChannel.EMAIL,
      audience: NotificationAudience.TEAM,
      isTransactional: true,
      subject: `SIXFL TV is ready: ${fixtureTitle}`,
      body: `${SIXFL_TV_EMAIL_BRAND_MARKER}\n\nHi ${team.name},\n\nYour SIXFL TV ${videoSummary} for **${fixtureTitle}** is now available.\n\nMatch: **${fixtureTitle}**\nDate: ${fixtureDate}\nVenue: ${venueLabel}\nLeague: ${leagueLabel}\n\nOpen your SIXFL TV tab to watch the available videos.\n\n{{cta}}`,
      emailCta: { label: "Watch on SIXFL TV", url: captainTvUrl },
      sourceType: SIXFL_TV_UPLOAD_SOURCE_TYPE,
      sourceId: fixture.id,
      metadata: {
        event: "sixfl_tv.fixture_uploaded",
        fixtureId: fixture.id,
        teamId: team.id,
        teamName: team.name,
        videoCount: videos.length,
        videoLabels: videos.map((video) => video.label),
      } satisfies Prisma.InputJsonValue,
    });

    queued += 1;
  }

  return { queued, skipped: false };
}
