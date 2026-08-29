// ========================================
// File: src/lib/fixtures/night-board-change-notifications.ts
// ========================================

import { createHash } from "node:crypto";
import {
  FixtureCaptainConfirmationStatus,
  FixtureStatus,
  NotificationAudience,
  NotificationChannel,
  NotificationDispatchStatus,
  NotificationRecipientSourceType,
  Prisma,
} from "@prisma/client";

import { formatDateTimeInLondon } from "@/lib/datetime/london";
import {
  queueDirectNotification,
  queueNotificationFromTemplate,
} from "@/lib/notifications/service";
import { upsertNotificationRecipient } from "@/lib/notifications/recipients";
import { upsertTeamNotificationRecipient } from "@/lib/notifications/team-contacts";
import { prisma } from "@/lib/prisma";
import { getRefereeProfileByUserId } from "@/lib/referees/profile";
import { getPublicSiteUrl } from "@/lib/stripe/client";
import { getFixturePlaceholderTeamIds } from "@/lib/teams/fixture-placeholders";

const TEAM_CHANGE_SOURCE_TYPE = "FIXTURE_NIGHT_BOARD_CHANGE_NOTICE";
const TEAM_STATUS_SOURCE_TYPE = "FIXTURE_NIGHT_BOARD_STATUS_NOTICE";
const REFEREE_CHANGE_SOURCE_TYPE = "FIXTURE_NIGHT_BOARD_REFEREE_NOTICE";

const STALE_CONFIRMATION_SOURCE_TYPES = [
  "FIXTURE_CONFIRMATION_INITIAL_EMAIL",
  "FIXTURE_CONFIRMATION_AUTO_EMAIL_72H",
  "FIXTURE_CONFIRMATION_AUTO_EMAIL_24H",
  "FIXTURE_CONFIRMATION_CHASE_SMS",
  "FIXTURE_CONFIRMATION_AUTO_SMS_72H",
  "FIXTURE_CONFIRMATION_AUTO_SMS_24H",
] as const;

export type NightBoardNotificationReferee = {
  id: string;
  name: string | null;
  email: string | null;
  createdFromLeadId: string | null;
};

export type NightBoardFixtureNotificationState = {
  kickoffAt: Date;
  venueId: string | null;
  venueName: string | null;
  pitch: string | null;
  status: FixtureStatus;
  referee: NightBoardNotificationReferee | null;
};

export type NightBoardNotificationTeam = {
  id: string;
  name: string;
  logoUrl: string | null;
};

export type NightBoardNotificationDeliveryCounts = {
  emailQueued: number;
  emailSkipped: number;
  emailExisting: number;
  emailFailed: number;
  smsQueued: number;
  smsSkipped: number;
  smsExisting: number;
  smsFailed: number;
};

export type NightBoardFixtureNotificationSummary = {
  kind:
    | "none"
    | "change"
    | "cancelled"
    | "postponed"
    | "completed"
    | "referee";
  reason: string | null;
  teamChangeLines: string[];
  refereeChangeLines: string[];
  team: NightBoardNotificationDeliveryCounts;
  referee: NightBoardNotificationDeliveryCounts;
  remindersQueued: number;
  remindersSkipped: number;
};

type DeliveryOutcome = "queued" | "skipped" | "existing" | "failed";
type RefereeNoticeAction = "assigned" | "removed" | "updated";

function emptyDeliveryCounts(): NightBoardNotificationDeliveryCounts {
  return {
    emailQueued: 0,
    emailSkipped: 0,
    emailExisting: 0,
    emailFailed: 0,
    smsQueued: 0,
    smsSkipped: 0,
    smsExisting: 0,
    smsFailed: 0,
  };
}

function recordOutcome(
  counts: NightBoardNotificationDeliveryCounts,
  channel: NotificationChannel,
  outcome: DeliveryOutcome,
) {
  const prefix = channel === NotificationChannel.EMAIL ? "email" : "sms";
  const suffix = outcome.charAt(0).toUpperCase() + outcome.slice(1);
  const key = `${prefix}${suffix}` as keyof NightBoardNotificationDeliveryCounts;
  counts[key] += 1;
}

function cleanOptional(value: string | null | undefined) {
  return value?.trim() || null;
}

function valuesDiffer(
  left: string | null | undefined,
  right: string | null | undefined,
) {
  return cleanOptional(left) !== cleanOptional(right);
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

function formatStatus(status: FixtureStatus) {
  return status.charAt(0) + status.slice(1).toLowerCase();
}

function leagueLabel(input: {
  leagueName: string;
  leagueSeason: string | null;
}) {
  return input.leagueSeason
    ? `${input.leagueName} · ${input.leagueSeason}`
    : input.leagueName;
}

function fixtureSummary(input: {
  homeTeamName: string;
  awayTeamName: string;
  state: NightBoardFixtureNotificationState;
}) {
  return [
    `${input.homeTeamName} vs ${input.awayTeamName}`,
    `Kick-off: ${formatKickoff(input.state.kickoffAt)}`,
    `Venue: ${input.state.venueName || "TBC"}`,
    `Pitch: ${input.state.pitch?.trim() || "TBC"}`,
    `Status: ${formatStatus(input.state.status)}`,
  ].join("\n");
}

function buildTeamChangeLines(input: {
  before: NightBoardFixtureNotificationState;
  after: NightBoardFixtureNotificationState;
}) {
  const lines: string[] = [];

  if (input.before.kickoffAt.getTime() !== input.after.kickoffAt.getTime()) {
    lines.push(
      `Kick-off: ${formatKickoff(input.before.kickoffAt)} → ${formatKickoff(
        input.after.kickoffAt,
      )}`,
    );
  }

  if (
    valuesDiffer(input.before.venueId, input.after.venueId) ||
    valuesDiffer(input.before.venueName, input.after.venueName)
  ) {
    lines.push(
      `Venue: ${input.before.venueName || "TBC"} → ${
        input.after.venueName || "TBC"
      }`,
    );
  }

  if (input.before.status !== input.after.status) {
    lines.push(
      `Status: ${formatStatus(input.before.status)} → ${formatStatus(
        input.after.status,
      )}`,
    );
  }

  return lines;
}

function buildRefereeChangeLines(input: {
  before: NightBoardFixtureNotificationState;
  after: NightBoardFixtureNotificationState;
  teamChangeLines: string[];
}) {
  const lines = [...input.teamChangeLines];

  if (valuesDiffer(input.before.pitch, input.after.pitch)) {
    lines.push(
      `Pitch: ${input.before.pitch?.trim() || "TBC"} → ${
        input.after.pitch?.trim() || "TBC"
      }`,
    );
  }

  if (input.before.referee?.id !== input.after.referee?.id) {
    lines.push(
      `Referee: ${
        input.before.referee?.name ||
        input.before.referee?.email ||
        "Unassigned"
      } → ${
        input.after.referee?.name ||
        input.after.referee?.email ||
        "Unassigned"
      }`,
    );
  }

  return lines;
}

function changeHash(input: {
  fixtureId: string;
  before: NightBoardFixtureNotificationState;
  after: NightBoardFixtureNotificationState;
}) {
  return createHash("sha1")
    .update(
      JSON.stringify({
        fixtureId: input.fixtureId,
        before: {
          kickoffAt: input.before.kickoffAt.toISOString(),
          venueId: input.before.venueId,
          pitch: cleanOptional(input.before.pitch),
          status: input.before.status,
          refereeId: input.before.referee?.id ?? null,
        },
        after: {
          kickoffAt: input.after.kickoffAt.toISOString(),
          venueId: input.after.venueId,
          pitch: cleanOptional(input.after.pitch),
          status: input.after.status,
          refereeId: input.after.referee?.id ?? null,
        },
      }),
    )
    .digest("hex")
    .slice(0, 16);
}

function captainFixtureUrl(teamId: string, fixtureId: string) {
  return new URL(
    `/captain/team/${teamId}/fixtures?fixtureId=${encodeURIComponent(
      fixtureId,
    )}`,
    `${getPublicSiteUrl()}/`,
  ).toString();
}

function refereeDashboardUrl() {
  return new URL("/referee", `${getPublicSiteUrl()}/`).toString();
}

async function cancelQueuedStaleFixtureMessages(fixtureId: string) {
  await Promise.all([
    prisma.notificationDispatch.updateMany({
      where: {
        sourceType: { in: [...STALE_CONFIRMATION_SOURCE_TYPES] },
        sourceId: { startsWith: `${fixtureId}:` },
        status: NotificationDispatchStatus.QUEUED,
      },
      data: {
        status: NotificationDispatchStatus.CANCELLED,
        cancelledAt: new Date(),
        failureReason:
          "Fixture details changed on the Night Board before this confirmation message was sent.",
      },
    }),
    prisma.notificationDispatch.updateMany({
      where: {
        sourceType: "FIXTURE_REMINDER",
        OR: [
          { sourceId: fixtureId },
          { sourceId: { startsWith: `${fixtureId}:` } },
        ],
        status: NotificationDispatchStatus.QUEUED,
      },
      data: {
        status: NotificationDispatchStatus.CANCELLED,
        cancelledAt: new Date(),
        failureReason:
          "Fixture details changed on the Night Board before this reminder was sent.",
      },
    }),
  ]);
}

async function resetConfirmedTeams(input: {
  fixtureId: string;
  teamIds: string[];
  status: FixtureStatus;
}) {
  const note =
    input.status === FixtureStatus.SCHEDULED
      ? "Fixture changed on the Night Board after the previous confirmation. Team needs to reconfirm."
      : input.status === FixtureStatus.CANCELLED
        ? "Fixture cancelled on the Night Board. No reconfirmation is required."
        : "Fixture postponed on the Night Board. No reconfirmation is required until a replacement is confirmed.";

  await prisma.fixtureCaptainConfirmation.updateMany({
    where: {
      fixtureId: input.fixtureId,
      teamId: { in: input.teamIds },
      status: FixtureCaptainConfirmationStatus.CONFIRMED,
    },
    data: {
      status: FixtureCaptainConfirmationStatus.PENDING,
      confirmedAt: null,
      confirmedByUserId: null,
      note,
    },
  });
}

async function queueOnce(input: {
  recipientId: string;
  channel: NotificationChannel;
  audience: NotificationAudience;
  subject?: string | null;
  body: string;
  sourceType: string;
  sourceId: string;
  metadata: Prisma.InputJsonValue;
  emailBranding?: {
    teamName?: string | null;
    teamLogoUrl?: string | null;
    leagueName?: string | null;
  };
  emailCta?: { label: string; url: string };
  createdByUserId?: string | null;
}): Promise<DeliveryOutcome> {
  const existing = await prisma.notificationDispatch.findFirst({
    where: {
      recipientId: input.recipientId,
      channel: input.channel,
      sourceType: input.sourceType,
      sourceId: input.sourceId,
      status: {
        in: [
          NotificationDispatchStatus.QUEUED,
          NotificationDispatchStatus.PROCESSING,
          NotificationDispatchStatus.SENT,
        ],
      },
    },
    select: { id: true },
  });

  if (existing) return "existing";

  try {
    const dispatch = await queueDirectNotification({
      recipientId: input.recipientId,
      channel: input.channel,
      audience: input.audience,
      subject: input.subject,
      body: input.body,
      isTransactional: true,
      sourceType: input.sourceType,
      sourceId: input.sourceId,
      metadata: input.metadata,
      emailBranding: input.emailBranding,
      emailCta: input.emailCta,
      createdByUserId: input.createdByUserId,
    });

    return dispatch.status === NotificationDispatchStatus.QUEUED
      ? "queued"
      : "skipped";
  } catch (error) {
    console.error("Could not queue Night Board fixture-change notification", {
      recipientId: input.recipientId,
      channel: input.channel,
      sourceType: input.sourceType,
      sourceId: input.sourceId,
      error,
    });
    return "failed";
  }
}

async function upsertRefereeRecipient(
  referee: NightBoardNotificationReferee,
) {
  const [profile, lead] = await Promise.all([
    getRefereeProfileByUserId(referee.id).catch((error) => {
      console.warn("Could not load referee profile for fixture-change notice", {
        refereeId: referee.id,
        error,
      });
      return null;
    }),
    referee.createdFromLeadId
      ? prisma.interestLead.findUnique({
          where: { id: referee.createdFromLeadId },
          select: { phone: true },
        })
      : Promise.resolve(null),
  ]);

  return upsertNotificationRecipient({
    sourceType: NotificationRecipientSourceType.REFEREE,
    sourceId: referee.id,
    audience: NotificationAudience.REFEREE,
    displayName: referee.name || referee.email || "Referee",
    email: referee.email,
    phone: profile?.phone ?? lead?.phone ?? null,
    marketingEmailOptIn: true,
    marketingSmsOptIn: true,
    transactionalEmailOptIn: true,
    transactionalSmsOptIn: true,
    metadata: {
      userId: referee.id,
      entityType: "REFEREE",
      origin: "night_board_fixture_change",
    },
  });
}

function teamEmailCopy(input: {
  status: FixtureStatus;
  contactName: string;
  homeTeamName: string;
  awayTeamName: string;
  changeLines: string[];
  currentFixture: string;
}) {
  if (
    input.status === FixtureStatus.CANCELLED ||
    input.status === FixtureStatus.POSTPONED
  ) {
    const adjective =
      input.status === FixtureStatus.CANCELLED ? "cancelled" : "postponed";
    const nextStep =
      input.status === FixtureStatus.CANCELLED
        ? "No reconfirmation is needed."
        : "No reconfirmation is needed until a replacement is confirmed.";

    return {
      subject: `SIXFL fixture ${adjective}: ${input.homeTeamName} vs ${input.awayTeamName}`,
      body: [
        `Hi ${input.contactName},`,
        "",
        `IMPORTANT: this SIXFL fixture has been ${adjective}.`,
        "",
        "This update replaces the previous fixture details.",
        "",
        "What changed:",
        ...input.changeLines.map((line) => `- ${line}`),
        "",
        "Current fixture:",
        input.currentFixture,
        "",
        nextStep,
        "",
        "{{cta}}",
        "",
        "Please contact SIXFL directly if you have any questions.",
      ].join("\n"),
      ctaLabel: "Open fixture",
    };
  }

  return {
    subject: `IMPORTANT fixture update: ${input.homeTeamName} vs ${input.awayTeamName}`,
    body: [
      `Hi ${input.contactName},`,
      "",
      "IMPORTANT: the details of a SIXFL fixture involving your team have changed.",
      "",
      "The updated details below replace the previous fixture information.",
      "",
      "What changed:",
      ...input.changeLines.map((line) => `- ${line}`),
      "",
      "Updated fixture:",
      input.currentFixture,
      "",
      "Please check your SIXFL dashboard and confirm the updated fixture.",
      "",
      "{{cta}}",
      "",
      "If this creates a problem, contact SIXFL rather than the other team so we can manage it properly.",
    ].join("\n"),
    ctaLabel: "Open updated fixture",
  };
}

function teamSmsCopy(input: {
  status: FixtureStatus;
  homeTeamName: string;
  awayTeamName: string;
  after: NightBoardFixtureNotificationState;
  dashboardUrl: string;
}) {
  const fixtureName = `${input.homeTeamName} vs ${input.awayTeamName}`;

  if (input.status === FixtureStatus.CANCELLED) {
    return `SIXFL: ${fixtureName}, scheduled for ${formatKickoff(
      input.after.kickoffAt,
    )}, has been cancelled. This replaces the previous fixture details. ${input.dashboardUrl}`;
  }

  if (input.status === FixtureStatus.POSTPONED) {
    return `SIXFL: ${fixtureName}, scheduled for ${formatKickoff(
      input.after.kickoffAt,
    )}, has been postponed. This replaces the previous fixture details. ${input.dashboardUrl}`;
  }

  return `SIXFL fixture update: ${fixtureName} is now ${formatKickoff(
    input.after.kickoffAt,
  )} at ${input.after.venueName || "venue TBC"}. Please review and confirm: ${
    input.dashboardUrl
  }`;
}

function refereeCopy(input: {
  action: RefereeNoticeAction;
  firstName: string;
  homeTeamName: string;
  awayTeamName: string;
  before: NightBoardFixtureNotificationState;
  after: NightBoardFixtureNotificationState;
  changeLines: string[];
  dashboardUrl: string;
}) {
  const fixtureName = `${input.homeTeamName} vs ${input.awayTeamName}`;

  if (input.action === "removed") {
    return {
      subject: `SIXFL referee assignment removed: ${fixtureName}`,
      body: [
        `Hi ${input.firstName},`,
        "",
        `You are no longer assigned to referee ${fixtureName}.`,
        "",
        "Previous fixture details:",
        fixtureSummary({
          homeTeamName: input.homeTeamName,
          awayTeamName: input.awayTeamName,
          state: input.before,
        }),
        "",
        "Please check your SIXFL referee dashboard for your current assignments.",
        "",
        "{{cta}}",
      ].join("\n"),
      sms: `SIXFL referee update: you are no longer assigned to ${fixtureName} on ${formatKickoff(
        input.before.kickoffAt,
      )}. Check your dashboard: ${input.dashboardUrl}`,
      ctaLabel: "Open referee dashboard",
    };
  }

  if (input.action === "assigned") {
    return {
      subject: `SIXFL referee assignment: ${fixtureName}`,
      body: [
        `Hi ${input.firstName},`,
        "",
        `You have been assigned to referee ${fixtureName}.`,
        "",
        "Fixture details:",
        fixtureSummary({
          homeTeamName: input.homeTeamName,
          awayTeamName: input.awayTeamName,
          state: input.after,
        }),
        "",
        "Please check your SIXFL referee dashboard.",
        "",
        "{{cta}}",
      ].join("\n"),
      sms: `SIXFL referee assignment: ${fixtureName}, ${formatKickoff(
        input.after.kickoffAt,
      )}, ${input.after.venueName || "venue TBC"}, ${
        input.after.pitch?.trim() || "pitch TBC"
      }. Check your dashboard: ${input.dashboardUrl}`,
      ctaLabel: "Open referee dashboard",
    };
  }

  const statusSentence =
    input.after.status === FixtureStatus.CANCELLED
      ? "This fixture has been cancelled."
      : input.after.status === FixtureStatus.POSTPONED
        ? "This fixture has been postponed."
        : "The details of one of your assigned fixtures have changed.";

  return {
    subject: `SIXFL referee fixture update: ${fixtureName}`,
    body: [
      `Hi ${input.firstName},`,
      "",
      statusSentence,
      "",
      "What changed:",
      ...input.changeLines.map((line) => `- ${line}`),
      "",
      "Current fixture:",
      fixtureSummary({
        homeTeamName: input.homeTeamName,
        awayTeamName: input.awayTeamName,
        state: input.after,
      }),
      "",
      "Please check your SIXFL referee dashboard.",
      "",
      "{{cta}}",
    ].join("\n"),
    sms: `SIXFL referee update: ${fixtureName} is now ${formatKickoff(
      input.after.kickoffAt,
    )}, ${input.after.venueName || "venue TBC"}, ${
      input.after.pitch?.trim() || "pitch TBC"
    } (${formatStatus(input.after.status)}). Check your dashboard: ${
      input.dashboardUrl
    }`,
    ctaLabel: "Open referee dashboard",
  };
}

async function rescheduleFixtureReminderEmails(input: {
  fixtureId: string;
  leagueId: string;
  leagueName: string;
  leagueSeason: string | null;
  leagueSlug: string | null;
  kickoffAt: Date;
  homeTeam: NightBoardNotificationTeam;
  awayTeam: NightBoardNotificationTeam;
  teamIds: string[];
  createdByUserId?: string | null;
}) {
  let queued = 0;
  let skipped = 0;
  const now = Date.now();
  const schedules = [48, 6]
    .map(
      (hoursBeforeKickoff) =>
        new Date(input.kickoffAt.getTime() - hoursBeforeKickoff * 60 * 60 * 1000),
    )
    .filter((scheduledFor) => scheduledFor.getTime() > now);

  if (schedules.length === 0) return { queued, skipped };

  const fixturesUrl = input.leagueSlug
    ? new URL(`/leagues/${input.leagueSlug}/fixtures`, `${getPublicSiteUrl()}/`).toString()
    : new URL("/leagues", `${getPublicSiteUrl()}/`).toString();
  const fixtureName = `${input.homeTeam.name} vs ${input.awayTeam.name}`;
  const displayLeague = leagueLabel(input);

  for (const teamId of input.teamIds) {
    const currentTeam =
      teamId === input.homeTeam.id ? input.homeTeam : input.awayTeam;
    const { recipient } = await upsertTeamNotificationRecipient(teamId);

    for (const scheduledFor of schedules) {
      const sourceId = `${input.fixtureId}:${teamId}:${scheduledFor.toISOString()}`;
      const existing = await prisma.notificationDispatch.findFirst({
        where: {
          recipientId: recipient.id,
          channel: NotificationChannel.EMAIL,
          sourceType: "FIXTURE_REMINDER",
          sourceId,
          status: {
            in: [
              NotificationDispatchStatus.QUEUED,
              NotificationDispatchStatus.PROCESSING,
              NotificationDispatchStatus.SENT,
            ],
          },
        },
        select: { id: true },
      });

      if (existing) {
        skipped += 1;
        continue;
      }

      try {
        const dispatch = await queueNotificationFromTemplate({
          templateKey: "fixture-reminder-email",
          recipientId: recipient.id,
          sourceType: "FIXTURE_REMINDER",
          sourceId,
          scheduledFor,
          createdByUserId: input.createdByUserId,
          metadata: {
            kind: "fixture_reminder",
            trigger: "night_board_fixture_change",
            fixtureId: input.fixtureId,
            leagueId: input.leagueId,
            teamId,
            fixtureName,
          },
          variables: {
            firstName: recipient.displayName?.trim() || currentTeam.name,
            leagueName: input.leagueName,
            fixtureName,
            kickoffLabel: formatKickoff(input.kickoffAt),
            fixturesUrl,
          },
          emailBranding: {
            teamName: currentTeam.name,
            teamLogoUrl: currentTeam.logoUrl,
            leagueName: displayLeague,
          },
        });

        if (dispatch.status === NotificationDispatchStatus.QUEUED) {
          queued += 1;
        } else {
          skipped += 1;
        }
      } catch (error) {
        skipped += 1;
        console.error("Could not reschedule fixture reminder after Night Board change", {
          fixtureId: input.fixtureId,
          teamId,
          scheduledFor,
          error,
        });
      }
    }
  }

  return { queued, skipped };
}

export async function queueNightBoardFixtureChangeNotifications(input: {
  fixtureId: string;
  leagueId: string;
  leagueName: string;
  leagueSeason: string | null;
  leagueSlug: string | null;
  publishedAt: Date | null;
  homeTeam: NightBoardNotificationTeam;
  awayTeam: NightBoardNotificationTeam;
  before: NightBoardFixtureNotificationState;
  after: NightBoardFixtureNotificationState;
  createdByUserId?: string | null;
}): Promise<NightBoardFixtureNotificationSummary> {
  const team = emptyDeliveryCounts();
  const referee = emptyDeliveryCounts();
  const teamChangeLines = buildTeamChangeLines(input);
  const refereeChangeLines = buildRefereeChangeLines({
    before: input.before,
    after: input.after,
    teamChangeLines,
  });
  const summary: NightBoardFixtureNotificationSummary = {
    kind: "none",
    reason: null,
    teamChangeLines,
    refereeChangeLines,
    team,
    referee,
    remindersQueued: 0,
    remindersSkipped: 0,
  };

  if (!input.publishedAt) {
    summary.reason =
      "Draft fixture changes are not sent until the fixture has been published.";
    return summary;
  }

  if (teamChangeLines.length === 0 && refereeChangeLines.length === 0) {
    summary.reason = "No fixture details changed, so no notifications were needed.";
    return summary;
  }

  if (input.after.status === FixtureStatus.CANCELLED) {
    summary.kind = "cancelled";
  } else if (input.after.status === FixtureStatus.POSTPONED) {
    summary.kind = "postponed";
  } else if (input.after.status === FixtureStatus.COMPLETED) {
    summary.kind = "completed";
  } else if (teamChangeLines.length > 0) {
    summary.kind = "change";
  } else {
    summary.kind = "referee";
  }

  const hash = changeHash({
    fixtureId: input.fixtureId,
    before: input.before,
    after: input.after,
  });
  const allTeamIds = [input.homeTeam.id, input.awayTeam.id];
  const placeholderTeamIds = await getFixturePlaceholderTeamIds(allTeamIds);
  const teamIds = allTeamIds.filter((teamId) => !placeholderTeamIds.has(teamId));
  const shouldNotifyTeams =
    teamChangeLines.length > 0 &&
    input.after.status !== FixtureStatus.COMPLETED &&
    teamIds.length > 0;

  if (teamChangeLines.length > 0) {
    await cancelQueuedStaleFixtureMessages(input.fixtureId);
  }

  if (shouldNotifyTeams) {
    await resetConfirmedTeams({
      fixtureId: input.fixtureId,
      teamIds,
      status: input.after.status,
    });

    const currentFixture = fixtureSummary({
      homeTeamName: input.homeTeam.name,
      awayTeamName: input.awayTeam.name,
      state: input.after,
    });
    const sourceType =
      input.after.status === FixtureStatus.CANCELLED ||
      input.after.status === FixtureStatus.POSTPONED
        ? TEAM_STATUS_SOURCE_TYPE
        : TEAM_CHANGE_SOURCE_TYPE;
    const sourceId = `${input.fixtureId}:${hash}`;
    const brandingLeague = leagueLabel(input);

    for (const teamId of teamIds) {
      const currentTeam =
        teamId === input.homeTeam.id ? input.homeTeam : input.awayTeam;
      const { recipient, snapshot } =
        await upsertTeamNotificationRecipient(teamId);
      const dashboardUrl = captainFixtureUrl(teamId, input.fixtureId);
      const emailCopy = teamEmailCopy({
        status: input.after.status,
        contactName: snapshot.primaryContact.name ?? currentTeam.name,
        homeTeamName: input.homeTeam.name,
        awayTeamName: input.awayTeam.name,
        changeLines: teamChangeLines,
        currentFixture,
      });
      const metadata = {
        kind: "night_board_fixture_change",
        fixtureId: input.fixtureId,
        leagueId: input.leagueId,
        teamId,
        changeHash: hash,
        changeLines: teamChangeLines,
        status: input.after.status,
      };

      recordOutcome(
        team,
        NotificationChannel.EMAIL,
        await queueOnce({
          recipientId: recipient.id,
          channel: NotificationChannel.EMAIL,
          audience: NotificationAudience.TEAM,
          subject: emailCopy.subject,
          body: emailCopy.body,
          sourceType,
          sourceId,
          metadata,
          emailBranding: {
            teamName: currentTeam.name,
            teamLogoUrl: currentTeam.logoUrl,
            leagueName: brandingLeague,
          },
          emailCta: { label: emailCopy.ctaLabel, url: dashboardUrl },
          createdByUserId: input.createdByUserId,
        }),
      );

      recordOutcome(
        team,
        NotificationChannel.SMS,
        await queueOnce({
          recipientId: recipient.id,
          channel: NotificationChannel.SMS,
          audience: NotificationAudience.TEAM,
          body: teamSmsCopy({
            status: input.after.status,
            homeTeamName: input.homeTeam.name,
            awayTeamName: input.awayTeam.name,
            after: input.after,
            dashboardUrl,
          }),
          sourceType,
          sourceId,
          metadata,
          createdByUserId: input.createdByUserId,
        }),
      );
    }
  }

  const kickoffChanged =
    input.before.kickoffAt.getTime() !== input.after.kickoffAt.getTime();
  if (
    kickoffChanged &&
    input.after.status === FixtureStatus.SCHEDULED &&
    teamIds.length > 0
  ) {
    const reminders = await rescheduleFixtureReminderEmails({
      fixtureId: input.fixtureId,
      leagueId: input.leagueId,
      leagueName: input.leagueName,
      leagueSeason: input.leagueSeason,
      leagueSlug: input.leagueSlug,
      kickoffAt: input.after.kickoffAt,
      homeTeam: input.homeTeam,
      awayTeam: input.awayTeam,
      teamIds,
      createdByUserId: input.createdByUserId,
    });
    summary.remindersQueued = reminders.queued;
    summary.remindersSkipped = reminders.skipped;
  }

  const refereeNotices: Array<{
    action: RefereeNoticeAction;
    referee: NightBoardNotificationReferee;
  }> = [];

  if (input.before.referee?.id !== input.after.referee?.id) {
    if (input.before.referee) {
      refereeNotices.push({ action: "removed", referee: input.before.referee });
    }
    if (input.after.referee) {
      refereeNotices.push({ action: "assigned", referee: input.after.referee });
    }
  } else if (input.after.referee && refereeChangeLines.length > 0) {
    refereeNotices.push({ action: "updated", referee: input.after.referee });
  }

  const refereeUrl = refereeDashboardUrl();

  for (const notice of refereeNotices) {
    const recipient = await upsertRefereeRecipient(notice.referee);
    const firstName =
      notice.referee.name?.trim().split(/\s+/)[0] ||
      notice.referee.email ||
      "there";
    const copy = refereeCopy({
      action: notice.action,
      firstName,
      homeTeamName: input.homeTeam.name,
      awayTeamName: input.awayTeam.name,
      before: input.before,
      after: input.after,
      changeLines: refereeChangeLines,
      dashboardUrl: refereeUrl,
    });
    const sourceId = `${input.fixtureId}:${hash}:${notice.action}:${notice.referee.id}`;
    const metadata = {
      kind: "night_board_referee_fixture_change",
      fixtureId: input.fixtureId,
      leagueId: input.leagueId,
      refereeId: notice.referee.id,
      action: notice.action,
      changeHash: hash,
      changeLines: refereeChangeLines,
      status: input.after.status,
    };

    recordOutcome(
      referee,
      NotificationChannel.EMAIL,
      await queueOnce({
        recipientId: recipient.id,
        channel: NotificationChannel.EMAIL,
        audience: NotificationAudience.REFEREE,
        subject: copy.subject,
        body: copy.body,
        sourceType: REFEREE_CHANGE_SOURCE_TYPE,
        sourceId,
        metadata,
        emailCta: { label: copy.ctaLabel, url: refereeUrl },
        createdByUserId: input.createdByUserId,
      }),
    );

    recordOutcome(
      referee,
      NotificationChannel.SMS,
      await queueOnce({
        recipientId: recipient.id,
        channel: NotificationChannel.SMS,
        audience: NotificationAudience.REFEREE,
        body: copy.sms,
        sourceType: REFEREE_CHANGE_SOURCE_TYPE,
        sourceId,
        metadata,
        createdByUserId: input.createdByUserId,
      }),
    );
  }

  if (!shouldNotifyTeams && refereeNotices.length === 0) {
    summary.reason =
      input.after.status === FixtureStatus.COMPLETED
        ? "The fixture was marked completed; no team reconfirmation notice was sent."
        : "The saved change did not require a team or referee notification.";
  } else if (placeholderTeamIds.size > 0 && teamChangeLines.length > 0) {
    summary.reason =
      "A provisional team was present, so notifications were only sent to confirmed teams.";
  }

  return summary;
}
