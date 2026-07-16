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
import { getPublicSiteUrl } from "@/lib/stripe/client";

const SIXFL_TV_UPLOAD_SOURCE_TYPE = "FIXTURE_SIXFL_TV_UPLOAD";

function getVideoUrls(value: string | null | undefined) {
  return (value ?? "")
    .split(/\n+/)
    .map((item) => item.trim())
    .filter(Boolean);
}

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

function getFixtureTitle(fixture: {
  homeTeam: { name: string };
  awayTeam: { name: string };
  result: { homeScore: number | null; awayScore: number | null } | null;
}) {
  if (fixture.result?.homeScore !== null && fixture.result?.homeScore !== undefined && fixture.result?.awayScore !== null && fixture.result?.awayScore !== undefined) {
    return `${fixture.homeTeam.name} ${fixture.result.homeScore}-${fixture.result.awayScore} ${fixture.awayTeam.name}`;
  }

  return `${fixture.homeTeam.name} vs ${fixture.awayTeam.name}`;
}

function getCaptainTvUrl(teamId: string) {
  return new URL(`/captain/team/${teamId}/tv`, `${getPublicSiteUrl()}/`).toString();
}

function getVideoSummary(videoCount: number) {
  if (videoCount <= 1) return "match highlights";
  if (videoCount === 2) return "match highlights and the full match";
  return `match highlights, the full match and ${videoCount - 2} extra clip${videoCount - 2 === 1 ? "" : "s"}`;
}

export async function queueSixflTvFixtureUploadedEmailsOnce(fixtureId: string) {
  const fixture = await prisma.fixture.findUnique({
    where: { id: fixtureId },
    select: {
      id: true,
      kickoffAt: true,
      publishedAt: true,
      sixflTvUrl: true,
      homeTeamId: true,
      awayTeamId: true,
      homeTeam: { select: { id: true, name: true } },
      awayTeam: { select: { id: true, name: true } },
      league: { select: { name: true, season: true } },
      venue: { select: { name: true } },
      result: { select: { homeScore: true, awayScore: true } },
    },
  });

  if (!fixture || !fixture.publishedAt) {
    return { queued: 0, skipped: true, reason: "fixture_not_published" };
  }

  const videoUrls = getVideoUrls(fixture.sixflTvUrl);
  if (videoUrls.length === 0) {
    return { queued: 0, skipped: true, reason: "no_video_links" };
  }

  const existing = await prisma.notificationDispatch.findFirst({
    where: {
      sourceType: SIXFL_TV_UPLOAD_SOURCE_TYPE,
      sourceId: fixture.id,
    },
    select: { id: true },
  });

  if (existing) {
    return { queued: 0, skipped: true, reason: "already_sent" };
  }

  const fixtureTitle = getFixtureTitle(fixture);
  const leagueLabel = [fixture.league.name, fixture.league.season].filter(Boolean).join(" · ");
  const fixtureDate = formatFixtureDate(fixture.kickoffAt);
  const venueLabel = fixture.venue?.name ?? "Venue TBC";
  const videoSummary = getVideoSummary(videoUrls.length);
  const teams = [fixture.homeTeam, fixture.awayTeam].filter(
    (team, index, all) => all.findIndex((item) => item.id === team.id) === index,
  );

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
      body: `${SIXFL_TV_EMAIL_BRAND_MARKER}\n\nHi ${team.name},\n\nYour SIXFL TV ${videoSummary} for **${fixtureTitle}** is now available.\n\nMatch: **${fixtureTitle}**\nDate: ${fixtureDate}\nVenue: ${venueLabel}\nLeague: ${leagueLabel}\n\nOpen your SIXFL TV tab to watch the match highlights and any full-match/extra clip links.\n\n{{cta}}`,
      emailCta: {
        label: "Watch on SIXFL TV",
        url: captainTvUrl,
      },
      sourceType: SIXFL_TV_UPLOAD_SOURCE_TYPE,
      sourceId: fixture.id,
      metadata: {
        event: "sixfl_tv.fixture_uploaded",
        fixtureId: fixture.id,
        teamId: team.id,
        teamName: team.name,
        videoCount: videoUrls.length,
        videoLabels: videoUrls.map((_, index) => (index === 0 ? "Match highlights" : index === 1 ? "Full match" : `Extra clip ${index - 1}`)),
      } satisfies Prisma.InputJsonValue,
    });

    queued += 1;
  }

  return { queued, skipped: false };
}
