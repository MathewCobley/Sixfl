// ========================================
// File: src/lib/fixtures/managed-squad-availability-reminders.ts
// ========================================

import {
  NotificationAudience,
  NotificationDispatchStatus,
  NotificationRecipientSourceType,
  NotificationTemplateKind,
  TeamRole,
} from "@prisma/client";

import { formatDateTimeInLondon } from "@/lib/datetime/london";
import { getPhoneDisplayValue } from "@/lib/notifications/phone";
import { upsertNotificationRecipient } from "@/lib/notifications/recipients";
import { queueNotificationFromTemplate } from "@/lib/notifications/service";
import { prisma } from "@/lib/prisma";
import { getTeamMemberProfilesByTeamMemberIds } from "@/lib/teamMemberProfiles";

type ReminderMode = "request" | "chase24h" | "chase72h";

type ReminderChannel = "EMAIL" | "SMS";

type AvailabilityReminderTemplate = {
  key: string;
  name: string;
  description: string;
  channel: ReminderChannel;
  subject: string | null;
  body: string;
  ctaLabel: string | null;
  ctaUrlKey: string | null;
};

type QueueReminderInput = {
  fixtureId: string;
  teamId: string;
  teamMemberId: string;
  mode: ReminderMode;
};

export type QueueManagedSquadAvailabilityReminderResult =
  | { ok: true; status: "queued" | "already_sent"; queued: number; teamName: string; playerName: string }
  | { ok: false; status: "fixture_not_found" | "team_not_managed" | "member_not_found" | "already_responded" | "no_contact" | "not_available"; teamName?: string; playerName?: string };

const SOURCE_TYPES: Record<ReminderMode, string> = {
  request: "MANAGED_SQUAD_AVAILABILITY_REQUEST",
  chase24h: "MANAGED_SQUAD_AVAILABILITY_CHASE_24H",
  chase72h: "MANAGED_SQUAD_AVAILABILITY_CHASE_72H",
};

const TEMPLATE_KEYS: Record<ReminderMode, Record<ReminderChannel, string>> = {
  request: {
    EMAIL: "managed-squad-availability-request-email",
    SMS: "managed-squad-availability-request-sms",
  },
  chase24h: {
    EMAIL: "managed-squad-availability-chase-24h-email",
    SMS: "managed-squad-availability-chase-24h-sms",
  },
  chase72h: {
    EMAIL: "managed-squad-availability-chase-72h-email",
    SMS: "managed-squad-availability-chase-72h-sms",
  },
};

const SYSTEM_TEMPLATES: AvailabilityReminderTemplate[] = [
  {
    key: TEMPLATE_KEYS.request.EMAIL,
    name: "Managed squad availability request email",
    description: "Initial email asking managed squad players to confirm availability for an upcoming fixture.",
    channel: "EMAIL",
    subject: "Availability needed for {{fixtureLabel}}",
    body: [
      "Hi {{firstName}},",
      "",
      "Can you confirm whether you are available for {{fixtureLabel}}?",
      "",
      "Please use the link below so we can organise the matchday squad properly:",
      "",
      "{{cta}}",
      "",
      "Please reply as soon as you can.",
      "",
      "Thanks,",
      "SIXFL",
    ].join("\n"),
    ctaLabel: "Confirm availability",
    ctaUrlKey: "availabilityUrl",
  },
  {
    key: TEMPLATE_KEYS.request.SMS,
    name: "Managed squad availability request SMS",
    description: "Initial SMS asking managed squad players to confirm availability for an upcoming fixture.",
    channel: "SMS",
    subject: null,
    body: "SIXFL: Are you available for {{fixtureLabel}}? Please confirm here: {{availabilityUrl}}",
    ctaLabel: null,
    ctaUrlKey: null,
  },
  {
    key: TEMPLATE_KEYS.chase24h.EMAIL,
    name: "Managed squad availability 24h chase email",
    description: "Follow-up email sent when a managed squad player has not confirmed availability after 24 hours.",
    channel: "EMAIL",
    subject: "Reminder: please confirm availability for {{fixtureLabel}}",
    body: [
      "Hi {{firstName}},",
      "",
      "Just a reminder to confirm whether you are available for {{fixtureLabel}}.",
      "",
      "We are trying to finalise the squad, so please update your availability here:",
      "",
      "{{cta}}",
      "",
      "Thanks,",
      "SIXFL",
    ].join("\n"),
    ctaLabel: "Update availability",
    ctaUrlKey: "availabilityUrl",
  },
  {
    key: TEMPLATE_KEYS.chase24h.SMS,
    name: "Managed squad availability 24h chase SMS",
    description: "Follow-up SMS sent when a managed squad player has not confirmed availability after 24 hours.",
    channel: "SMS",
    subject: null,
    body: "SIXFL reminder: please confirm if you are available for {{fixtureLabel}}. Update here: {{availabilityUrl}}",
    ctaLabel: null,
    ctaUrlKey: null,
  },
  {
    key: TEMPLATE_KEYS.chase72h.EMAIL,
    name: "Managed squad availability 72h final chase email",
    description: "Final email sent when a managed squad player has not confirmed availability after 72 hours.",
    channel: "EMAIL",
    subject: "Final reminder: availability needed for {{fixtureLabel}}",
    body: [
      "Hi {{firstName}},",
      "",
      "Final reminder to confirm whether you are available for {{fixtureLabel}}.",
      "",
      "If we do not hear from you, we may assume you are unavailable and offer the place to another player.",
      "",
      "Please update your availability here:",
      "",
      "{{cta}}",
      "",
      "Thanks,",
      "SIXFL",
    ].join("\n"),
    ctaLabel: "Confirm now",
    ctaUrlKey: "availabilityUrl",
  },
  {
    key: TEMPLATE_KEYS.chase72h.SMS,
    name: "Managed squad availability 72h final chase SMS",
    description: "Final SMS sent when a managed squad player has not confirmed availability after 72 hours.",
    channel: "SMS",
    subject: null,
    body: "SIXFL final reminder: please confirm availability for {{fixtureLabel}}. If we do not hear back, we may assume you are unavailable. {{availabilityUrl}}",
    ctaLabel: null,
    ctaUrlKey: null,
  },
];

function getSiteUrl() {
  return (
    process.env.NEXT_PUBLIC_SITE_URL?.trim() ||
    process.env.SITE_URL?.trim() ||
    process.env.NEXT_PUBLIC_APP_URL?.trim() ||
    process.env.APP_URL?.trim() ||
    "https://www.sixfl.co.uk"
  ).replace(/\/+$/, "");
}

function buildAvailabilityUrl(teamId: string, fixtureId: string) {
  return `${getSiteUrl()}/player/team/${teamId}/availability?fixtureId=${encodeURIComponent(fixtureId)}`;
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

function getPlayerName(input: { name: string | null; email: string | null }) {
  return input.name?.trim() || input.email?.trim() || "Player";
}

function getFirstName(value: string) {
  return value.trim().split(/\s+/)[0] ?? "";
}

function getSourceId(input: { fixtureId: string; teamMemberId: string }) {
  return `${input.fixtureId}:${input.teamMemberId}`;
}

function getFixtureLabel(input: {
  teamName: string;
  opponentName: string;
  kickoffAt: Date;
}) {
  return `${input.teamName} vs ${input.opponentName} · ${formatKickoff(input.kickoffAt)}`;
}

async function hasDispatch(input: {
  fixtureId: string;
  teamMemberId: string;
  mode: ReminderMode;
}) {
  const dispatch = await prisma.notificationDispatch.findFirst({
    where: {
      sourceType: SOURCE_TYPES[input.mode],
      sourceId: getSourceId(input),
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
      createdAt: true,
      sentAt: true,
    },
    orderBy: [{ createdAt: "asc" }],
  });

  return dispatch;
}

export async function ensureManagedSquadAvailabilityTemplates() {
  await Promise.all(
    SYSTEM_TEMPLATES.map((template) =>
      prisma.notificationTemplate.upsert({
        where: { key: template.key },
        update: {
          name: template.name,
          description: template.description,
          kind: NotificationTemplateKind.TRANSACTIONAL,
          channel: template.channel,
          audience: NotificationAudience.PLAYER,
          subject: template.subject,
          body: template.body,
          ctaLabel: template.ctaLabel,
          ctaUrlKey: template.ctaUrlKey,
          isActive: true,
        },
        create: {
          key: template.key,
          name: template.name,
          description: template.description,
          kind: NotificationTemplateKind.TRANSACTIONAL,
          channel: template.channel,
          audience: NotificationAudience.PLAYER,
          subject: template.subject,
          body: template.body,
          ctaLabel: template.ctaLabel,
          ctaUrlKey: template.ctaUrlKey,
          isActive: true,
        },
      }),
    ),
  );
}

export async function queueManagedSquadAvailabilityReminder(
  input: QueueReminderInput,
): Promise<QueueManagedSquadAvailabilityReminderResult> {
  await ensureManagedSquadAvailabilityTemplates();

  const fixture = await prisma.fixture.findFirst({
    where: {
      id: input.fixtureId,
      status: "SCHEDULED",
      kickoffAt: {
        gt: new Date(),
      },
      OR: [{ homeTeamId: input.teamId }, { awayTeamId: input.teamId }],
    },
    select: {
      id: true,
      kickoffAt: true,
      leagueId: true,
      homeTeamId: true,
      awayTeamId: true,
      homeTeam: {
        select: {
          id: true,
          name: true,
          teamMode: true,
          logoUrl: true,
          league: {
            select: {
              name: true,
              season: true,
            },
          },
        },
      },
      awayTeam: {
        select: {
          id: true,
          name: true,
          teamMode: true,
          logoUrl: true,
          league: {
            select: {
              name: true,
              season: true,
            },
          },
        },
      },
    },
  });

  if (!fixture) {
    return { ok: false, status: "fixture_not_found" };
  }

  const isHome = fixture.homeTeamId === input.teamId;
  const team = isHome ? fixture.homeTeam : fixture.awayTeam;
  const opponent = isHome ? fixture.awayTeam : fixture.homeTeam;

  if (team.teamMode !== "MANAGED") {
    return { ok: false, status: "team_not_managed", teamName: team.name };
  }

  const member = await prisma.teamMember.findFirst({
    where: {
      id: input.teamMemberId,
      teamId: input.teamId,
      role: {
        in: [TeamRole.PLAYER, TeamRole.VICE_CAPTAIN, TeamRole.BACKUP_PLAYER],
      },
    },
    select: {
      id: true,
      role: true,
      user: {
        select: {
          id: true,
          name: true,
          email: true,
        },
      },
      fixtureAvailabilities: {
        where: {
          fixtureId: fixture.id,
        },
        select: {
          response: true,
        },
        take: 1,
      },
    },
  });

  if (!member) {
    return { ok: false, status: "member_not_found", teamName: team.name };
  }

  const playerName = getPlayerName(member.user);
  const availability = member.fixtureAvailabilities[0] ?? null;

  if (availability && availability.response !== "NO_RESPONSE") {
    return {
      ok: false,
      status: "already_responded",
      teamName: team.name,
      playerName,
    };
  }

  const existing = await hasDispatch({
    fixtureId: fixture.id,
    teamMemberId: member.id,
    mode: input.mode,
  });

  if (existing) {
    return {
      ok: true,
      status: "already_sent",
      queued: 0,
      teamName: team.name,
      playerName,
    };
  }

  const profiles = await getTeamMemberProfilesByTeamMemberIds([member.id]);
  const profile = profiles.get(member.id) ?? null;
  const phone = getPhoneDisplayValue(profile?.phone ?? null);
  const email = member.user.email?.trim() || null;

  if (!email && !phone) {
    return { ok: false, status: "no_contact", teamName: team.name, playerName };
  }

  const leagueName = team.league
    ? `${team.league.name}${team.league.season ? ` · ${team.league.season}` : ""}`
    : "";
  const fixtureLabel = getFixtureLabel({
    teamName: team.name,
    opponentName: opponent.name,
    kickoffAt: fixture.kickoffAt,
  });
  const availabilityUrl = buildAvailabilityUrl(team.id, fixture.id);

  const recipient = await upsertNotificationRecipient({
    sourceType: NotificationRecipientSourceType.GENERAL,
    sourceId: `team-member:${member.id}`,
    audience: NotificationAudience.PLAYER,
    displayName: playerName,
    email,
    phone,
    marketingEmailOptIn: true,
    marketingSmsOptIn: true,
    transactionalEmailOptIn: true,
    transactionalSmsOptIn: true,
    metadata: {
      teamId: team.id,
      teamMemberId: member.id,
      userId: member.user.id,
      entityType: "TEAM_MEMBER",
    },
  });

  const variables = {
    firstName: getFirstName(playerName),
    fullName: playerName,
    teamName: team.name,
    opponentName: opponent.name,
    leagueName,
    fixtureLabel,
    kickoffDateTime: formatKickoff(fixture.kickoffAt),
    availabilityUrl,
  };

  let queued = 0;

  if (email) {
    const dispatch = await queueNotificationFromTemplate({
      templateKey: TEMPLATE_KEYS[input.mode].EMAIL,
      recipientId: recipient.id,
      variables,
      sourceType: SOURCE_TYPES[input.mode],
      sourceId: getSourceId({ fixtureId: fixture.id, teamMemberId: member.id }),
      metadata: {
        origin: "managed_squad_availability_automation",
        originLabel: "Managed squad availability automation",
        mode: input.mode,
        fixtureId: fixture.id,
        teamId: team.id,
        teamMemberId: member.id,
        userId: member.user.id,
        leagueId: fixture.leagueId,
        availabilityUrl,
      },
      emailBranding: {
        teamName: team.name,
        teamLogoUrl: team.logoUrl,
        leagueName,
      },
    });

    if (dispatch.status === NotificationDispatchStatus.QUEUED) queued += 1;
  }

  if (phone) {
    const dispatch = await queueNotificationFromTemplate({
      templateKey: TEMPLATE_KEYS[input.mode].SMS,
      recipientId: recipient.id,
      variables,
      sourceType: SOURCE_TYPES[input.mode],
      sourceId: getSourceId({ fixtureId: fixture.id, teamMemberId: member.id }),
      metadata: {
        origin: "managed_squad_availability_automation",
        originLabel: "Managed squad availability automation",
        mode: input.mode,
        fixtureId: fixture.id,
        teamId: team.id,
        teamMemberId: member.id,
        userId: member.user.id,
        leagueId: fixture.leagueId,
        availabilityUrl,
      },
    });

    if (dispatch.status === NotificationDispatchStatus.QUEUED) queued += 1;
  }

  return {
    ok: true,
    status: "queued",
    queued,
    teamName: team.name,
    playerName,
  };
}

export async function getManagedSquadAvailabilityReminderMode(input: {
  fixtureId: string;
  teamMemberId: string;
  now?: Date;
}): Promise<ReminderMode | null> {
  const now = input.now ?? new Date();
  const initial = await hasDispatch({
    fixtureId: input.fixtureId,
    teamMemberId: input.teamMemberId,
    mode: "request",
  });

  if (!initial) return "request";

  const initialAt = initial.sentAt ?? initial.createdAt;
  const hoursSinceInitial =
    (now.getTime() - initialAt.getTime()) / (1000 * 60 * 60);

  if (hoursSinceInitial >= 72) {
    const chase72 = await hasDispatch({
      fixtureId: input.fixtureId,
      teamMemberId: input.teamMemberId,
      mode: "chase72h",
    });

    if (!chase72) return "chase72h";
  }

  if (hoursSinceInitial >= 24) {
    const chase24 = await hasDispatch({
      fixtureId: input.fixtureId,
      teamMemberId: input.teamMemberId,
      mode: "chase24h",
    });

    if (!chase24) return "chase24h";
  }

  return null;
}
