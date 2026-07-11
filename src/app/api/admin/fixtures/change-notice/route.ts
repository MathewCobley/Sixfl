// ========================================
// File: src/app/api/admin/fixtures/change-notice/route.ts
// ========================================

import { createHash } from "crypto";
import {
  FixtureCaptainConfirmationStatus,
  FixtureStatus,
  NotificationAudience,
  NotificationChannel,
  NotificationDispatchStatus,
} from "@prisma/client";
import { NextResponse } from "next/server";

import { formatDateTimeInLondon, parseLondonDateTime } from "@/lib/datetime/london";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/requireAdmin";
import { queueDirectNotification } from "@/lib/notifications/service";
import { upsertTeamNotificationRecipient } from "@/lib/notifications/team-contacts";

const RECONFIRM_SOURCE_TYPE = "FIXTURE_CHANGE_NOTICE";
const STATUS_SOURCE_TYPE = "FIXTURE_STATUS_NOTICE";

function getString(value: unknown) {
  const parsed = String(value ?? "").trim();
  return parsed || null;
}

function getSiteUrl() {
  return (
    process.env.NEXT_PUBLIC_SITE_URL?.trim() ||
    process.env.SITE_URL?.trim() ||
    process.env.NEXT_PUBLIC_APP_URL?.trim() ||
    process.env.APP_URL?.trim() ||
    "https://www.sixfl.co.uk"
  ).replace(/\/+$/, "");
}

function buildCaptainFixturesUrl(teamId: string, fixtureId: string) {
  return `${getSiteUrl()}/captain/team/${teamId}/fixtures?fixtureId=${encodeURIComponent(fixtureId)}`;
}

function formatKickoff(value: Date) {
  return formatDateTimeInLondon(value, {
    weekday: "short",
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatStatus(value: FixtureStatus) {
  return value.charAt(0) + value.slice(1).toLowerCase();
}

function valuesDiffer(a: string | null | undefined, b: string | null | undefined) {
  return (a ?? "") !== (b ?? "");
}

function getChangeHash(input: unknown) {
  return createHash("sha1").update(JSON.stringify(input)).digest("hex").slice(0, 16);
}

function shouldSendReconfirmNoticeForStatus(status: FixtureStatus) {
  return status === FixtureStatus.SCHEDULED || status === FixtureStatus.COMPLETED;
}

function shouldSendStatusNoticeForStatus(status: FixtureStatus) {
  return status === FixtureStatus.POSTPONED || status === FixtureStatus.CANCELLED;
}

function getStatusNoticeCopy(status: FixtureStatus) {
  if (status === FixtureStatus.CANCELLED) {
    return {
      adjective: "cancelled",
      title: "Fixture cancelled",
      subjectPrefix: "SIXFL fixture cancelled",
      intro: "This fixture has been cancelled by SIXFL.",
      smsAction: "has been cancelled",
      noReconfirm: "No reconfirmation is needed.",
      feeLine: "Any match fees already paid will be reviewed and either carried forward or dealt with by SIXFL as appropriate.",
    };
  }

  return {
    adjective: "postponed",
    title: "Fixture postponed",
    subjectPrefix: "SIXFL fixture postponed",
    intro: "This fixture has been postponed by SIXFL.",
    smsAction: "has been postponed",
    noReconfirm: "No reconfirmation is needed until a new date is confirmed.",
    feeLine: "Any match fees already paid will be carried forward or reviewed by SIXFL as appropriate.",
  };
}

function describeFixture(input: {
  homeTeamName: string;
  awayTeamName: string;
  kickoffAt: Date;
  venueName: string | null;
  pitch: string | null;
  status: FixtureStatus;
}) {
  const venuePart = input.venueName ? `\nVenue: ${input.venueName}` : "";
  const pitchPart = input.pitch ? `\nPitch: ${input.pitch}` : "";

  return `${input.homeTeamName} vs ${input.awayTeamName}\nKick-off: ${formatKickoff(input.kickoffAt)}${venuePart}${pitchPart}\nStatus: ${formatStatus(input.status)}`;
}

function buildMaterialChangeLines(input: {
  oldFixture: {
    homeTeamName: string;
    awayTeamName: string;
    kickoffAt: Date;
    venueName: string | null;
    status: FixtureStatus;
  };
  nextFixture: {
    homeTeamName: string;
    awayTeamName: string;
    kickoffAt: Date;
    venueName: string | null;
    status: FixtureStatus;
  };
}) {
  const lines: string[] = [];

  if (
    input.oldFixture.homeTeamName !== input.nextFixture.homeTeamName ||
    input.oldFixture.awayTeamName !== input.nextFixture.awayTeamName
  ) {
    lines.push(
      `Fixture: ${input.oldFixture.homeTeamName} vs ${input.oldFixture.awayTeamName} → ${input.nextFixture.homeTeamName} vs ${input.nextFixture.awayTeamName}`,
    );
  }

  if (input.oldFixture.kickoffAt.getTime() !== input.nextFixture.kickoffAt.getTime()) {
    lines.push(
      `Kick-off: ${formatKickoff(input.oldFixture.kickoffAt)} → ${formatKickoff(input.nextFixture.kickoffAt)}`,
    );
  }

  if (valuesDiffer(input.oldFixture.venueName, input.nextFixture.venueName)) {
    lines.push(
      `Venue: ${input.oldFixture.venueName ?? "TBC"} → ${input.nextFixture.venueName ?? "TBC"}`,
    );
  }

  if (input.oldFixture.status !== input.nextFixture.status) {
    lines.push(
      `Status: ${formatStatus(input.oldFixture.status)} → ${formatStatus(input.nextFixture.status)}`,
    );
  }

  return lines;
}

function pitchChanged(input: {
  oldPitch: string | null;
  nextPitch: string | null;
}) {
  return valuesDiffer(input.oldPitch, input.nextPitch);
}

function getExistingDispatchWhere(input: { sourceType: string; sourceId: string }) {
  return {
    sourceType: input.sourceType,
    sourceId: input.sourceId,
    status: {
      in: [
        NotificationDispatchStatus.QUEUED,
        NotificationDispatchStatus.PROCESSING,
        NotificationDispatchStatus.SENT,
      ],
    },
  };
}

export async function POST(request: Request) {
  await requireAdmin();

  const body = await request.json().catch(() => null);

  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  const fixtureId = getString((body as { fixtureId?: unknown }).fixtureId);
  const leagueId = getString((body as { leagueId?: unknown }).leagueId);
  const homeTeamId = getString((body as { homeTeamId?: unknown }).homeTeamId);
  const awayTeamId = getString((body as { awayTeamId?: unknown }).awayTeamId);
  const venueId = getString((body as { venueId?: unknown }).venueId);
  const kickoffDate = getString((body as { kickoffDate?: unknown }).kickoffDate);
  const kickoffTime = getString((body as { kickoffTime?: unknown }).kickoffTime);
  const pitch = getString((body as { pitch?: unknown }).pitch);
  const rawStatus = getString((body as { status?: unknown }).status) ?? FixtureStatus.SCHEDULED;

  if (!fixtureId || !leagueId || !homeTeamId || !awayTeamId || !kickoffDate || !kickoffTime) {
    return NextResponse.json({ error: "Missing fixture details." }, { status: 400 });
  }

  if (!Object.values(FixtureStatus).includes(rawStatus as FixtureStatus)) {
    return NextResponse.json({ error: "Invalid fixture status." }, { status: 400 });
  }

  const status = rawStatus as FixtureStatus;
  const nextKickoffAt = parseLondonDateTime(kickoffDate, kickoffTime);

  const [fixture, league, nextHomeTeam, nextAwayTeam, nextVenue] = await Promise.all([
    prisma.fixture.findUnique({
      where: { id: fixtureId },
      select: {
        id: true,
        leagueId: true,
        homeTeamId: true,
        awayTeamId: true,
        venueId: true,
        kickoffAt: true,
        pitch: true,
        status: true,
        publishedAt: true,
        homeTeam: { select: { id: true, name: true } },
        awayTeam: { select: { id: true, name: true } },
        venue: { select: { name: true } },
      },
    }),
    prisma.league.findUnique({
      where: { id: leagueId },
      select: { name: true, season: true },
    }),
    prisma.team.findUnique({ where: { id: homeTeamId }, select: { id: true, name: true } }),
    prisma.team.findUnique({ where: { id: awayTeamId }, select: { id: true, name: true } }),
    venueId ? prisma.venue.findUnique({ where: { id: venueId }, select: { name: true } }) : Promise.resolve(null),
  ]);

  if (!fixture || !league || !nextHomeTeam || !nextAwayTeam) {
    return NextResponse.json({ error: "Fixture or team not found." }, { status: 404 });
  }

  if (!fixture.publishedAt) {
    return NextResponse.json({
      queued: 0,
      reason: "Draft fixture changes are not emailed until fixtures have been published.",
    });
  }

  const changeLines = buildMaterialChangeLines({
    oldFixture: {
      homeTeamName: fixture.homeTeam.name,
      awayTeamName: fixture.awayTeam.name,
      kickoffAt: fixture.kickoffAt,
      venueName: fixture.venue?.name ?? null,
      status: fixture.status,
    },
    nextFixture: {
      homeTeamName: nextHomeTeam.name,
      awayTeamName: nextAwayTeam.name,
      kickoffAt: nextKickoffAt,
      venueName: nextVenue?.name ?? null,
      status,
    },
  });

  if (changeLines.length === 0) {
    return NextResponse.json({
      queued: 0,
      reason: pitchChanged({ oldPitch: fixture.pitch, nextPitch: pitch })
        ? "Pitch-only changes are admin/night-board changes and are not emailed."
        : "No material fixture changes.",
    });
  }

  const affectedTeamIds = Array.from(new Set([fixture.homeTeamId, fixture.awayTeamId, homeTeamId, awayTeamId]));
  const leagueLabel = `${league.name}${league.season ? ` · ${league.season}` : ""}`;
  const newFixtureSummary = describeFixture({
    homeTeamName: nextHomeTeam.name,
    awayTeamName: nextAwayTeam.name,
    kickoffAt: nextKickoffAt,
    venueName: nextVenue?.name ?? null,
    pitch,
    status,
  });

  if (shouldSendStatusNoticeForStatus(status)) {
    const copy = getStatusNoticeCopy(status);
    const sourceId = `${fixture.id}:${status}:${getChangeHash({
      oldHomeTeamId: fixture.homeTeamId,
      oldAwayTeamId: fixture.awayTeamId,
      oldVenueId: fixture.venueId,
      oldKickoffAt: fixture.kickoffAt.toISOString(),
      oldStatus: fixture.status,
      homeTeamId,
      awayTeamId,
      venueId,
      kickoffAt: nextKickoffAt.toISOString(),
      status,
    })}`;

    const existingDispatch = await prisma.notificationDispatch.findFirst({
      where: getExistingDispatchWhere({ sourceType: STATUS_SOURCE_TYPE, sourceId }),
      select: { id: true },
    });

    if (existingDispatch) {
      return NextResponse.json({ queued: 0, reason: `${copy.title} notice already queued.` });
    }

    await prisma.fixtureCaptainConfirmation.updateMany({
      where: {
        fixtureId: fixture.id,
        teamId: { in: affectedTeamIds },
        status: FixtureCaptainConfirmationStatus.CONFIRMED,
      },
      data: {
        status: FixtureCaptainConfirmationStatus.PENDING,
        confirmedAt: null,
        confirmedByUserId: null,
        note: `Fixture ${copy.adjective} by SIXFL. No reconfirmation required.`,
      },
    });

    let queued = 0;

    for (const teamId of affectedTeamIds) {
      const { recipient, snapshot } = await upsertTeamNotificationRecipient(teamId);
      const dashboardUrl = buildCaptainFixturesUrl(teamId, fixture.id);
      const emailBody = [
        `Hi ${snapshot.primaryContact.name ?? snapshot.teamName},`,
        "",
        copy.intro,
        "",
        "Fixture:",
        newFixtureSummary,
        "",
        copy.noReconfirm,
        copy.feeLine,
        "",
        "{{cta}}",
        "",
        "If you have any questions, please contact SIXFL directly so we can manage it properly.",
      ].join("\n");

      const emailDispatch = await queueDirectNotification({
        recipientId: recipient.id,
        channel: NotificationChannel.EMAIL,
        audience: NotificationAudience.TEAM,
        subject: `${copy.subjectPrefix}: ${nextHomeTeam.name} vs ${nextAwayTeam.name}`,
        body: emailBody,
        isTransactional: true,
        sourceType: STATUS_SOURCE_TYPE,
        sourceId,
        emailCta: { label: "Open fixture", url: dashboardUrl },
        metadata: {
          fixtureId: fixture.id,
          teamId,
          leagueId,
          leagueLabel,
          status,
          changeLines,
        },
      });

      const smsDispatch = await queueDirectNotification({
        recipientId: recipient.id,
        channel: NotificationChannel.SMS,
        audience: NotificationAudience.TEAM,
        body: `SIXFL: ${nextHomeTeam.name} vs ${nextAwayTeam.name} on ${formatKickoff(nextKickoffAt)} ${copy.smsAction}. ${copy.noReconfirm}`,
        isTransactional: true,
        sourceType: STATUS_SOURCE_TYPE,
        sourceId,
        metadata: {
          fixtureId: fixture.id,
          teamId,
          leagueId,
          leagueLabel,
          status,
          changeLines,
        },
      });

      if (emailDispatch.status === NotificationDispatchStatus.QUEUED) queued += 1;
      if (smsDispatch.status === NotificationDispatchStatus.QUEUED) queued += 1;
    }

    return NextResponse.json({ queued, kind: copy.adjective });
  }

  if (!shouldSendReconfirmNoticeForStatus(status)) {
    return NextResponse.json({
      queued: 0,
      reason: "No reconfirmation notice sent for this fixture status.",
    });
  }

  const sourceId = `${fixture.id}:${getChangeHash({
    oldHomeTeamId: fixture.homeTeamId,
    oldAwayTeamId: fixture.awayTeamId,
    oldVenueId: fixture.venueId,
    oldKickoffAt: fixture.kickoffAt.toISOString(),
    oldStatus: fixture.status,
    homeTeamId,
    awayTeamId,
    venueId,
    kickoffAt: nextKickoffAt.toISOString(),
    status,
  })}`;

  const existingDispatch = await prisma.notificationDispatch.findFirst({
    where: getExistingDispatchWhere({ sourceType: RECONFIRM_SOURCE_TYPE, sourceId }),
    select: { id: true },
  });

  if (existingDispatch) {
    return NextResponse.json({ queued: 0, reason: "Change notice already queued." });
  }

  await prisma.fixtureCaptainConfirmation.updateMany({
    where: {
      fixtureId: fixture.id,
      teamId: { in: affectedTeamIds },
      status: FixtureCaptainConfirmationStatus.CONFIRMED,
    },
    data: {
      status: FixtureCaptainConfirmationStatus.PENDING,
      confirmedAt: null,
      confirmedByUserId: null,
      note: "Fixture changed after previous confirmation. Team needs to reconfirm.",
    },
  });

  let queued = 0;

  for (const teamId of affectedTeamIds) {
    const { recipient, snapshot } = await upsertTeamNotificationRecipient(teamId);
    const dashboardUrl = buildCaptainFixturesUrl(teamId, fixture.id);
    const emailBody = [
      `Hi ${snapshot.primaryContact.name ?? snapshot.teamName},`,
      "",
      "A SIXFL fixture involving your team has been updated.",
      "",
      "What changed:",
      ...changeLines.map((line) => `- ${line}`),
      "",
      "Updated fixture:",
      newFixtureSummary,
      "",
      "Please check your SIXFL dashboard and reconfirm the fixture if required.",
      "",
      "{{cta}}",
      "",
      "If this creates a problem, contact SIXFL rather than the other team so we can manage it properly.",
    ].join("\n");

    const emailDispatch = await queueDirectNotification({
      recipientId: recipient.id,
      channel: NotificationChannel.EMAIL,
      audience: NotificationAudience.TEAM,
      subject: `SIXFL fixture update: ${nextHomeTeam.name} vs ${nextAwayTeam.name}`,
      body: emailBody,
      isTransactional: true,
      sourceType: RECONFIRM_SOURCE_TYPE,
      sourceId,
      emailCta: { label: "Open fixture", url: dashboardUrl },
      metadata: { fixtureId: fixture.id, teamId, leagueId, leagueLabel, changeLines },
    });

    const smsDispatch = await queueDirectNotification({
      recipientId: recipient.id,
      channel: NotificationChannel.SMS,
      audience: NotificationAudience.TEAM,
      body: `SIXFL fixture update: ${nextHomeTeam.name} vs ${nextAwayTeam.name} is now ${formatKickoff(nextKickoffAt)}. Please check and reconfirm if needed: ${dashboardUrl}`,
      isTransactional: true,
      sourceType: RECONFIRM_SOURCE_TYPE,
      sourceId,
      metadata: { fixtureId: fixture.id, teamId, leagueId, leagueLabel, changeLines },
    });

    if (emailDispatch.status === NotificationDispatchStatus.QUEUED) queued += 1;
    if (smsDispatch.status === NotificationDispatchStatus.QUEUED) queued += 1;
  }

  return NextResponse.json({ queued });
}
