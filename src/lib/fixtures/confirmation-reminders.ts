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
import { queueDirectNotification } from "@/lib/notifications/service";
import { upsertTeamOperationalSmsRecipients } from "@/lib/notifications/team-operational-recipients";
import { prisma } from "@/lib/prisma";
import { getFixturePlaceholderTeamIds } from "@/lib/teams/fixture-placeholders";

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

const CANONICAL_SITE_URL = "https://sixfl.co.uk";
const DEFAULT_CONFIRMATION_SMS_BODY =
  "SIXFL: Confirm {{teamName}} v {{opponentName}}, {{kickoffDateTime}} here: {{link}}. Do not reply YES/NO - SMS replies do not confirm the fixture.";
const DEFAULT_URGENT_CONFIRMATION_SMS_BODY =
  "SIXFL URGENT: Confirm {{teamName}} v {{opponentName}}, {{kickoffDateTime}} here now: {{link}}. Do not reply YES/NO - SMS replies do not confirm the fixture.";
const PREVIOUS_DEFAULT_CONFIRMATION_SMS_BODY =
  "SIXFL: Can {{teamName}} play {{opponentName}}, {{kickoffDateTime}}? Choose Yes or No: {{link}}";
const PREVIOUS_DEFAULT_URGENT_CONFIRMATION_SMS_BODY =
  "SIXFL URGENT: Can {{teamName}} play {{opponentName}}, {{kickoffDateTime}}? Choose Yes or No now: {{link}}";
const SEEDED_CONFIRMATION_SMS_BODY =
  "SIXFL: Confirm {{teamName}} v {{opponentName}}, {{kickoffDateTime}}. {{link}}";
const SEEDED_URGENT_CONFIRMATION_SMS_BODY =
  "SIXFL URGENT: Confirm {{teamName}} v {{opponentName}}, {{kickoffDateTime}} now. {{link}}";
const LEGACY_CONFIRMATION_SMS_BODY =
  "SIXFL: Please confirm your fixture for {{teamName}} vs {{opponentName}} on {{kickoffDateTime}}. Confirm here: {{link}}";
const LEGACY_URGENT_CONFIRMATION_SMS_BODY =
  "SIXFL URGENT: We still need fixture confirmation for {{teamName}} vs {{opponentName}} on {{kickoffDateTime}}. Please confirm now: {{link}}";

function getSiteUrl() {
  const configured = (
    process.env.NEXT_PUBLIC_SITE_URL?.trim() ||
    process.env.SITE_URL?.trim() ||
    process.env.NEXT_PUBLIC_APP_URL?.trim() ||
    process.env.APP_URL?.trim() ||
    CANONICAL_SITE_URL
  ).replace(/\/+$/, "");

  return /^https:\/\/www\.sixfl\.co\.uk$/i.test(configured)
    ? CANONICAL_SITE_URL
    : configured;
}

function buildAbsoluteUrl(path: string) {
  return new URL(path, getSiteUrl()).toString();
}

function formatKickoff(date: Date) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/London",
    weekday: "short",
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);

  const partMap = new Map(parts.map((part) => [part.type, part.value]));
  const weekday = partMap.get("weekday") ?? "";
  const day = Number(partMap.get("day") ?? "0");
  const month = partMap.get("month") ?? "";
  const hour = partMap.get("hour") ?? "";
  const minute = partMap.get("minute") ?? "";

  return `${weekday} ${day} ${month} ${hour}:${minute}`.trim();
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

function getBlockingDispatchStatuses(mode: FixtureConfirmationReminderMode) {
  if (mode === "manual") {
    return [
      NotificationDispatchStatus.QUEUED,
      NotificationDispatchStatus.PROCESSING,
    ];
  }

  return [
    NotificationDispatchStatus.QUEUED,
    NotificationDispatchStatus.PROCESSING,
    NotificationDispatchStatus.SENT,
  ];
}

function getTemplateKey(mode: FixtureConfirmationReminderMode) {
  return mode === "auto24h"
    ? "fixture-confirmation-reminder-urgent-sms"
    : "fixture-confirmation-reminder-sms";
}

function getDefaultTemplateBody(mode: FixtureConfirmationReminderMode) {
  return mode === "auto24h"
    ? DEFAULT_URGENT_CONFIRMATION_SMS_BODY
    : DEFAULT_CONFIRMATION_SMS_BODY;
}

function resolveFixtureConfirmationTemplateBody(input: {
  mode: FixtureConfirmationReminderMode;
  body: string;
}) {
  const body = input.body.trim();

  if (!body) {
    return getDefaultTemplateBody(input.mode);
  }

  if (
    body === PREVIOUS_DEFAULT_CONFIRMATION_SMS_BODY ||
    body === PREVIOUS_DEFAULT_URGENT_CONFIRMATION_SMS_BODY ||
    body === SEEDED_CONFIRMATION_SMS_BODY ||
    body === SEEDED_URGENT_CONFIRMATION_SMS_BODY ||
    body === LEGACY_CONFIRMATION_SMS_BODY ||
    body === LEGACY_URGENT_CONFIRMATION_SMS_BODY
  ) {
    return getDefaultTemplateBody(input.mode);
  }

  return body;
}

function renderTemplateText(body: string, replacements: Record<string, string>) {
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
  const templateBody = resolveFixtureConfirmationTemplateBody({
    mode: input.mode,
    body: template.body,
  });
  const rendered = renderTemplateText(templateBody, {
    teamName: input.teamName,
    opponentName: input.opponentName,
    kickoffDateTime: formatKickoff(input.kickoffAt),
    captainFixturesUrl: input.captainFixturesUrl,
    link: resolvedLink,
  }).trim();

  if (!rendered) {
    return null;
  }

  if (/{{\s*link\s*}}/i.test(templateBody)) {
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
      publishedAt: true,
      leagueId: true,
      updatedAt: true,
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
  const placeholderTeamIds = await getFixturePlaceholderTeamIds([
    fixture.homeTeam.id,
    fixture.awayTeam.id,
  ]);

  if (placeholderTeamIds.size > 0) {
    return { ok: false, status: "not_available", teamName: team.name };
  }

  if (fixture.publishedAt === null || fixture.status !== "SCHEDULED" || fixture.kickoffAt <= new Date()) {
    return { ok: false, status: "not_available", teamName: team.name };
  }

  const existingConfirmation = fixture.captainConfirmations[0] ?? null;

  if (existingConfirmation?.status === FixtureCaptainConfirmationStatus.CONFIRMED) {
    return { ok: false, status: "confirmed", teamName: team.name };
  }

  if (existingConfirmation?.status === FixtureCaptainConfirmationStatus.ISSUE_RAISED) {
    return { ok: false, status: "issue_raised", teamName: team.name };
  }

  const sourceType = getSourceType(input.mode);
  const sourceId = getSourceId({ fixtureId: fixture.id, teamId: input.teamId, mode: input.mode });

  const existingDispatches = await prisma.notificationDispatch.findMany({
    where: {
      sourceType,
      sourceId,
      status: {
        in: getBlockingDispatchStatuses(input.mode),
      },
    },
    select: {
      id: true,
      recipientId: true,
      status: true,
      createdAt: true,
    },
    orderBy: {
      createdAt: "desc",
    },
  });

  const staleQueuedDispatchIds = existingDispatches
    .filter(
      (dispatch) =>
        dispatch.status === NotificationDispatchStatus.QUEUED &&
        fixture.updatedAt.getTime() > dispatch.createdAt.getTime(),
    )
    .map((dispatch) => dispatch.id);

  if (staleQueuedDispatchIds.length > 0) {
    await prisma.notificationDispatch.updateMany({
      where: {
        id: { in: staleQueuedDispatchIds },
        status: NotificationDispatchStatus.QUEUED,
      },
      data: {
        status: NotificationDispatchStatus.CANCELLED,
        cancelledAt: new Date(),
        failureReason: "Fixture was changed before queued confirmation SMS was sent.",
      },
    });
  }

  const recipients = await upsertTeamOperationalSmsRecipients(input.teamId);

  if (recipients.length === 0) {
    return { ok: false, status: "no_phone", teamName: team.name };
  }

  const captainFixturesUrl = buildAbsoluteUrl(
    `/captain/team/${input.teamId}/fixtures?fixtureId=${encodeURIComponent(fixture.id)}`,
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

  let queued = 0;
  let existing = 0;

  for (const recipient of recipients) {
    const activeExistingDispatch = existingDispatches.find((dispatch) => {
      if (dispatch.recipientId !== recipient.id) return false;
      if (staleQueuedDispatchIds.includes(dispatch.id)) return false;
      return fixture.updatedAt.getTime() <= dispatch.createdAt.getTime();
    });

    if (activeExistingDispatch) {
      existing += 1;
      continue;
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
        operationalCaptainCopy: true,
      },
    });

    if (dispatch.status === NotificationDispatchStatus.QUEUED) {
      queued += 1;
    }
  }

  if (queued > 0) {
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

  if (existing > 0) {
    return { ok: true, status: "already_sent", teamName: team.name };
  }

  return { ok: false, status: "skipped", teamName: team.name };
}
