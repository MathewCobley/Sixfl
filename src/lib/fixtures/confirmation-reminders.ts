// ========================================
// File: src/lib/fixtures/confirmation-reminders.ts
// ========================================

import {
  FixtureCaptainConfirmationStatus,
  NotificationAudience,
  NotificationChannel,
  NotificationDispatchStatus,
  NotificationTemplateKind,
} from "@prisma/client";
import { formatDateTimeInLondon } from "@/lib/datetime/london";
import { prisma } from "@/lib/prisma";
import { queueDirectNotification } from "@/lib/notifications/service";
import { upsertTeamNotificationRecipient } from "@/lib/notifications/team-contacts";

export type FixtureConfirmationReminderMode =
  | "manual"
  | "auto72h"
  | "auto24h";

export type QueueFixtureConfirmationSmsResult =
  | { ok: true; status: "queued" | "already_sent"; teamName: string }
  | {
      ok: false;
      status:
        | "fixture_not_found"
        | "team_not_in_fixture"
        | "not_available"
        | "confirmed"
        | "issue_raised"
        | "no_phone"
        | "template_missing"
        | "skipped";
      teamName?: string;
    };

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

function getSourceType(mode: FixtureConfirmationReminderMode) {
  switch (mode) {
    case "manual":
      return "FIXTURE_CONFIRMATION_CHASE_SMS";
    case "auto72h":
      return "FIXTURE_CONFIRMATION_AUTO_SMS_72H";
    case "auto24h":
      return "FIXTURE_CONFIRMATION_AUTO_SMS_24H";
  }
}

function getSourceId(input: {
  fixtureId: string;
  teamId: string;
  mode: FixtureConfirmationReminderMode;
}) {
  return `${input.fixtureId}:${input.teamId}:${input.mode}`;
}

function getTemplateKey(mode: FixtureConfirmationReminderMode) {
  return mode === "auto24h"
    ? "fixture-confirmation-reminder-urgent-sms"
    : "fixture-confirmation-reminder-sms";
}

function renderTemplateText(
  body: string,
  replacements: Record<string, string>,
) {
  return Object.entries(replacements).reduce((output, [token, value]) => {
    const pattern = new RegExp(`{{\\s*${token}\\s*}}`, "gi");
    return output.replace(pattern, value);
  }, body);
}

async function buildSmsBody(input: {
  mode: FixtureConfirmationReminderMode;
  teamName: string;
  opponentName: string;
  kickoffAt: Date;
  captainFixturesUrl: string;
}) {
  const template = await prisma.notificationTemplate.findFirst({
    where: {
      key: getTemplateKey(input.mode),
      kind: NotificationTemplateKind.TRANSACTIONAL,
      channel: NotificationChannel.SMS,
      isActive: true,
    },
    select: {
      body: true,
      ctaUrlKey: true,
    },
  });

  if (!template?.body?.trim()) {
    return null;
  }

  const resolvedLink = input.captainFixturesUrl;
  const rendered = renderTemplateText(template.body, {
    teamName: input.teamName,
    opponentName: input.opponentName,
    kickoffDateTime: formatKickoff(input.kickoffAt),
    captainFixturesUrl: input.captainFixturesUrl,
    link: resolvedLink,
  }).trim();

  if (!rendered) {
    return null;
  }

  if (/{{\s*link\s*}}/i.test(template.body)) {
    return rendered;
  }

  return `${rendered}\n${resolvedLink}`.trim();
}

export async function queueFixtureConfirmationSmsReminder(input: {
  fixtureId: string;
  teamId: string;
  mode: FixtureConfirmationReminderMode;
}): Promise<QueueFixtureConfirmationSmsResult> {
  const fixture = await prisma.fixture.findUnique({
    where: { id: input.fixtureId },
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
          teamId: input.teamId,
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
    return { ok: false, status: "fixture_not_found" };
  }

  const isHome = fixture.homeTeam.id === input.teamId;
  const isAway = fixture.awayTeam.id === input.teamId;

  if (!isHome && !isAway) {
    return { ok: false, status: "team_not_in_fixture" };
  }

  const team = isHome ? fixture.homeTeam : fixture.awayTeam;
  const opponent = isHome ? fixture.awayTeam : fixture.homeTeam;

  if (fixture.status !== "SCHEDULED" || fixture.kickoffAt <= new Date()) {
    return { ok: false, status: "not_available", teamName: team.name };
  }

  const existingConfirmation = fixture.captainConfirmations[0] ?? null;

  if (existingConfirmation?.status === FixtureCaptainConfirmationStatus.CONFIRMED) {
    return { ok: false, status: "confirmed", teamName: team.name };
  }

  if (
    existingConfirmation?.status === FixtureCaptainConfirmationStatus.ISSUE_RAISED
  ) {
    return { ok: false, status: "issue_raised", teamName: team.name };
  }

  const sourceType = getSourceType(input.mode);
  const sourceId = getSourceId({
    fixtureId: fixture.id,
    teamId: input.teamId,
    mode: input.mode,
  });

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
    return { ok: true, status: "already_sent", teamName: team.name };
  }

  const { recipient } = await upsertTeamNotificationRecipient(input.teamId);

  if (!recipient.phone?.trim()) {
    return { ok: false, status: "no_phone", teamName: team.name };
  }

  const captainFixturesUrl = buildAbsoluteUrl(
    `/captain/team/${input.teamId}/fixtures`,
  );

  const smsBody = await buildSmsBody({
    mode: input.mode,
    teamName: team.name,
    opponentName: opponent.name,
    kickoffAt: fixture.kickoffAt,
    captainFixturesUrl,
  });

  if (!smsBody) {
    return { ok: false, status: "template_missing", teamName: team.name };
  }

  const dispatch = await queueDirectNotification({
    recipientId: recipient.id,
    channel: NotificationChannel.SMS,
    audience: NotificationAudience.TEAM,
    body: smsBody,
    isTransactional: true,
    sourceType,
    sourceId,
    metadata: {
      kind: "fixture_confirmation_sms",
      mode: input.mode,
      fixtureId: fixture.id,
      leagueId: fixture.leagueId,
      teamId: input.teamId,
      teamName: team.name,
      opponentName: opponent.name,
      templateKey: getTemplateKey(input.mode),
    },
  });

  if (dispatch.status !== NotificationDispatchStatus.QUEUED) {
    return { ok: false, status: "skipped", teamName: team.name };
  }

  await prisma.fixtureCaptainConfirmation.upsert({
    where: {
      fixtureId_teamId: {
        fixtureId: fixture.id,
        teamId: input.teamId,
      },
    },
    update: {
      lastChasedAt: new Date(),
    },
    create: {
      fixtureId: fixture.id,
      teamId: input.teamId,
      status: FixtureCaptainConfirmationStatus.PENDING,
      lastChasedAt: new Date(),
    },
  });

  return { ok: true, status: "queued", teamName: team.name };
}
