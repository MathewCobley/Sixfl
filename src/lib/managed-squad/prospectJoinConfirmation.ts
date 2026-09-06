// ========================================
// File: src/lib/managed-squad/prospectJoinConfirmation.ts
// ========================================

import {
  NotificationAudience,
  NotificationChannel,
  NotificationDispatchStatus,
  NotificationRecipientSourceType,
  NotificationTemplateKind,
  Prisma,
} from "@prisma/client";

import { logNotificationDispatchToThread } from "@/lib/communications/log-dispatch";
import { queueNotificationFromTemplate } from "@/lib/notifications/service";
import { upsertNotificationRecipient } from "@/lib/notifications/recipients";
import { prisma } from "@/lib/prisma";
import { createSquadActivationToken } from "@/lib/squad/activationToken";

export const MANAGED_SQUAD_JOIN_CONFIRMATION_TEMPLATE_KEY =
  "managed-squad-join-confirmation-email";
export const MANAGED_SQUAD_JOIN_CHASE_TEMPLATE_KEY =
  "managed-squad-join-chase-email";
export const MANAGED_SQUAD_JOIN_FINAL_CHASE_TEMPLATE_KEY =
  "managed-squad-join-final-chase-email";

const MANAGED_SQUAD_JOIN_CONFIRMATION_SOURCE_TYPE =
  "MANAGED_SQUAD_JOIN_CONFIRMATION";
const MANAGED_SQUAD_JOIN_CHASE_SOURCE_TYPE = "MANAGED_SQUAD_JOIN_CHASE";
const MANAGED_SQUAD_JOIN_FINAL_CHASE_SOURCE_TYPE =
  "MANAGED_SQUAD_JOIN_FINAL_CHASE";

const SQUAD_INVITE_TEMPLATE_NAME = "Squad invite email";
const SQUAD_INVITE_ORIGIN_LABEL = "Squad invite email";
const SQUAD_INVITE_TEMPLATE_DESCRIPTION =
  "Email sent when a player prospect is added to a squad, asking them to confirm and activate their squad place.";

function getSiteUrl() {
  return (
    process.env.NEXT_PUBLIC_SITE_URL?.trim() ||
    process.env.SITE_URL?.trim() ||
    process.env.NEXT_PUBLIC_APP_URL?.trim() ||
    process.env.APP_URL?.trim() ||
    process.env.NEXTAUTH_URL?.trim() ||
    "https://www.sixfl.co.uk"
  ).replace(/\/+$/, "");
}

function formatPreferredNight(value: string | null | undefined) {
  if (!value || value === "ANY") return null;
  return value.charAt(0).toUpperCase() + value.slice(1).toLowerCase();
}

function getDisplayName(input: { firstName: string; lastName: string | null }) {
  return [input.firstName, input.lastName].filter(Boolean).join(" ").trim();
}

function getFirstName(value: string) {
  return value.trim().split(/\s+/)[0] ?? "";
}

function getProspectRecipientSourceId(prospectId: string) {
  return `team-prospect:${prospectId}`;
}

export function getManagedSquadJoinConfirmationUrl(prospectId: string) {
  const token = createSquadActivationToken(prospectId);
  return `${getSiteUrl()}/squad/join/${encodeURIComponent(token)}`;
}

function formatLongDate(value: Date) {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/London",
    weekday: "long",
    day: "numeric",
    month: "long",
  }).format(value);
}

function getUkDateKey(value: Date) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/London",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(value);

  const year = parts.find((part) => part.type === "year")?.value ?? "0000";
  const month = parts.find((part) => part.type === "month")?.value ?? "00";
  const day = parts.find((part) => part.type === "day")?.value ?? "00";

  return `${year}-${month}-${day}`;
}

function getStartDateTiming(value: Date | null) {
  if (!value) return "unknown" as const;

  const startDateKey = getUkDateKey(value);
  const todayKey = getUkDateKey(new Date());

  if (startDateKey === todayKey) return "today" as const;
  return startDateKey < todayKey ? ("past" as const) : ("future" as const);
}

function getVenueName(value: string | null | undefined) {
  const venueName = value?.trim();
  if (!venueName || venueName.toUpperCase() === "TBC") return null;
  return venueName;
}

function getNewLeagueLabel(area: string | null | undefined) {
  const cleanArea = area?.trim();
  return cleanArea ? `the new SIXFL ${cleanArea} league` : "the new SIXFL league";
}

function getMatchScheduleLine(input: {
  night: string | null;
  venueName: string | null;
  futureTense: boolean;
}) {
  const verb = input.futureTense ? "will be played" : "are played";

  if (input.night && input.venueName) {
    return `Matches ${verb} on ${input.night} nights at ${input.venueName}.`;
  }

  if (input.night) {
    return `Matches ${verb} on ${input.night} nights.`;
  }

  if (input.venueName) {
    return `Matches ${verb} at ${input.venueName}.`;
  }

  return null;
}

function getTeamContextLine(
  team: {
    name: string;
    league: {
      area: string | null;
      dayOfWeek: string | null;
      venueName: string | null;
    } | null;
  },
  proposedStartDate: Date | null,
) {
  const night = formatPreferredNight(team.league?.dayOfWeek);
  const venueName = getVenueName(team.league?.venueName);
  const timing = getStartDateTiming(proposedStartDate);
  const newLeagueLabel = getNewLeagueLabel(team.league?.area);

  if (timing === "future" && proposedStartDate) {
    const scheduleLine = getMatchScheduleLine({ night, venueName, futureTense: true });
    return `${newLeagueLabel.charAt(0).toUpperCase()}${newLeagueLabel.slice(1)} is due to start on ${formatLongDate(proposedStartDate)}.${scheduleLine ? ` ${scheduleLine}` : ""}`;
  }

  if (timing === "today") {
    const scheduleLine = getMatchScheduleLine({ night, venueName, futureTense: true });
    return `${newLeagueLabel.charAt(0).toUpperCase()}${newLeagueLabel.slice(1)} starts today.${scheduleLine ? ` ${scheduleLine}` : ""}`;
  }

  if (night && venueName) {
    return `${team.name} plays on ${night} nights at ${venueName}.`;
  }

  if (night) {
    return `${team.name} plays on ${night} nights.`;
  }

  if (venueName) {
    return `${team.name} plays at ${venueName}.`;
  }

  return `${team.name} is a SIXFL squad.`;
}

function getSquadInviteIntroLine(input: {
  teamName: string;
  area: string | null | undefined;
  proposedStartDate: Date | null;
}) {
  const timing = getStartDateTiming(input.proposedStartDate);

  if (timing === "future" || timing === "today") {
    return `You’ve been added to the ${input.teamName} squad for ${getNewLeagueLabel(input.area)}.`;
  }

  return `You’ve been added to the ${input.teamName} squad on SIXFL.`;
}

function getSquadAccessLine(proposedStartDate: Date | null) {
  const timing = getStartDateTiming(proposedStartDate);

  if (timing === "future" || timing === "today") {
    return "Once confirmed, you’ll receive squad updates and, when fixtures begin, you’ll be included in match availability checks and other team messages.";
  }

  return "Once confirmed, you’ll be included in squad messages and fixture availability checks when games are coming up.";
}

function getSquadInviteBody() {
  return [
    "Hi {{firstName}},",
    "",
    "{{squadInviteIntroLine}}",
    "",
    "{{teamContextLine}}",
    "",
    "Please tap below to confirm your place and activate your squad access:",
    "",
    "{{cta}}",
    "",
    "{{squadAccessLine}}",
    "",
    "Thanks,",
    "SIXFL",
  ].join("\n");
}

function getSquadInviteChaseBody() {
  return [
    "Hi {{firstName}},",
    "",
    "Just checking you saw the SIXFL squad invite for {{teamName}}.",
    "",
    "{{teamContextLine}}",
    "",
    "We’re pulling squads together now, so please tap below if you’d still like to be included:",
    "",
    "{{cta}}",
    "",
    "Thanks,",
    "SIXFL",
  ].join("\n");
}

function getSquadInviteFinalChaseBody() {
  return [
    "Hi {{firstName}},",
    "",
    "Quick final check before we offer the space to another player.",
    "",
    "If you still want to join {{teamName}}, please tap below to confirm your place:",
    "",
    "{{cta}}",
    "",
    "If you’re no longer looking to join, no problem — you can ignore this or reply NO and we’ll remove you from the active list.",
    "",
    "Thanks,",
    "SIXFL",
  ].join("\n");
}

export async function ensureManagedSquadJoinConfirmationTemplate() {
  return prisma.notificationTemplate.upsert({
    where: { key: MANAGED_SQUAD_JOIN_CONFIRMATION_TEMPLATE_KEY },
    update: {}, // Preserve administrator edits and disabled templates.
    create: {
      key: MANAGED_SQUAD_JOIN_CONFIRMATION_TEMPLATE_KEY,
      name: SQUAD_INVITE_TEMPLATE_NAME,
      description: SQUAD_INVITE_TEMPLATE_DESCRIPTION,
      kind: NotificationTemplateKind.TRANSACTIONAL,
      channel: NotificationChannel.EMAIL,
      audience: NotificationAudience.PLAYER,
      subject: "Confirm your place with {{teamName}}",
      body: getSquadInviteBody(),
      ctaLabel: "Yes, I want to join",
      ctaUrlKey: "joinConfirmationUrl",
      isActive: true,
    },
  });
}

export async function ensureManagedSquadJoinChaseTemplates() {
  await prisma.notificationTemplate.upsert({
    where: { key: MANAGED_SQUAD_JOIN_CHASE_TEMPLATE_KEY },
    update: {}, // Preserve administrator edits and disabled templates.
    create: {
      key: MANAGED_SQUAD_JOIN_CHASE_TEMPLATE_KEY,
      name: "Squad invite chase email",
      description: "Gentle chase after a managed squad invite has been sent but not confirmed.",
      kind: NotificationTemplateKind.TRANSACTIONAL,
      channel: NotificationChannel.EMAIL,
      audience: NotificationAudience.PLAYER,
      subject: "Quick check — {{teamName}} squad invite",
      body: getSquadInviteChaseBody(),
      ctaLabel: "Yes, I want to join",
      ctaUrlKey: "joinConfirmationUrl",
      isActive: true,
    },
  });

  await prisma.notificationTemplate.upsert({
    where: { key: MANAGED_SQUAD_JOIN_FINAL_CHASE_TEMPLATE_KEY },
    update: {}, // Preserve administrator edits and disabled templates.
    create: {
      key: MANAGED_SQUAD_JOIN_FINAL_CHASE_TEMPLATE_KEY,
      name: "Final squad invite chase email",
      description: "Final check before removing a managed squad prospect from the active pipeline.",
      kind: NotificationTemplateKind.TRANSACTIONAL,
      channel: NotificationChannel.EMAIL,
      audience: NotificationAudience.PLAYER,
      subject: "Final check — {{teamName}} squad place",
      body: getSquadInviteFinalChaseBody(),
      ctaLabel: "Yes, I want to join",
      ctaUrlKey: "joinConfirmationUrl",
      isActive: true,
    },
  });
}

async function alreadyQueuedOrSent(prospectId: string) {
  return prisma.notificationDispatch.findFirst({
    where: {
      sourceType: MANAGED_SQUAD_JOIN_CONFIRMATION_SOURCE_TYPE,
      sourceId: prospectId,
      channel: NotificationChannel.EMAIL,
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
      status: true,
    },
    orderBy: [{ createdAt: "desc" }],
  });
}

type LoadedProspect = NonNullable<Awaited<ReturnType<typeof loadProspectForSquadEmail>>>;

type LeagueStartRow = {
  proposedStartDate: Date | null;
};

async function getLeagueProposedStartDate(leagueId: string | null | undefined) {
  if (!leagueId) return null;

  const rows = await prisma.$queryRaw<Array<LeagueStartRow>>(Prisma.sql`
    SELECT "proposedStartDate" AS "proposedStartDate"
    FROM "League"
    WHERE id = ${leagueId}
    LIMIT 1
  `);

  return rows[0]?.proposedStartDate ?? null;
}

async function loadProspectForSquadEmail(prospectId: string) {
  return prisma.teamPlayerProspect.findUnique({
    where: { id: prospectId },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      email: true,
      phone: true,
      status: true,
      teamId: true,
      team: {
        select: {
          id: true,
          name: true,
          logoUrl: true,
          league: {
            select: {
              id: true,
              name: true,
              season: true,
              area: true,
              dayOfWeek: true,
              venueName: true,
            },
          },
        },
      },
    },
  });
}

/** All squad invitation paths use this complete context, including after a team change.
 * Building context only reads data; it never queues or sends a notification. */
export async function buildProspectEmailContext(
  prospect: Pick<LoadedProspect, "id" | "firstName" | "lastName" | "email" | "teamId" | "team">,
) {
  if (!prospect.teamId || !prospect.team) return null;

  const email = prospect.email?.trim().toLowerCase() || null;
  if (!email) return null;

  const displayName = getDisplayName(prospect) || email;
  const joinConfirmationUrl = getManagedSquadJoinConfirmationUrl(prospect.id);
  const leagueName = prospect.team.league
    ? `${prospect.team.league.name}${
        prospect.team.league.season ? ` · ${prospect.team.league.season}` : ""
      }`
    : "";
  const proposedStartDate = await getLeagueProposedStartDate(prospect.team.league?.id);

  return {
    email,
    displayName,
    joinConfirmationUrl,
    leagueName,
    variables: {
      firstName: getFirstName(displayName) || "there",
      fullName: displayName,
      teamName: prospect.team.name,
      leagueName,
      venueName: prospect.team.league?.venueName ?? "",
      preferredNight: formatPreferredNight(prospect.team.league?.dayOfWeek) ?? "",
      squadInviteIntroLine: getSquadInviteIntroLine({
        teamName: prospect.team.name,
        area: prospect.team.league?.area,
        proposedStartDate,
      }),
      teamContextLine: getTeamContextLine(prospect.team, proposedStartDate),
      squadAccessLine: getSquadAccessLine(proposedStartDate),
      joinConfirmationUrl,
      teamJoinUrl: joinConfirmationUrl,
    },
  };
}

export async function queueManagedSquadJoinConfirmationEmail(input: {
  prospectId: string;
  createdByUserId?: string | null;
}) {
  const prospectId = input.prospectId.trim();

  if (!prospectId) {
    return { ok: false as const, status: "missing_prospect" as const };
  }

  await ensureManagedSquadJoinConfirmationTemplate();

  const prospect = await loadProspectForSquadEmail(prospectId);

  if (!prospect) {
    return { ok: false as const, status: "prospect_not_found" as const };
  }

  if (!prospect.teamId || !prospect.team) {
    return { ok: false as const, status: "prospect_not_found" as const };
  }

  const context = await buildProspectEmailContext(prospect);

  if (!context) {
    return { ok: false as const, status: "no_email" as const };
  }

  const existingDispatch = await alreadyQueuedOrSent(prospect.id);

  if (existingDispatch) {
    return {
      ok: true as const,
      status: "already_sent" as const,
      dispatchId: existingDispatch.id,
      prospectId: prospect.id,
    };
  }

  const recipient = await upsertNotificationRecipient({
    sourceType: NotificationRecipientSourceType.GENERAL,
    sourceId: getProspectRecipientSourceId(prospect.id),
    audience: NotificationAudience.PLAYER,
    displayName: context.displayName,
    email: context.email,
    phone: prospect.phone,
    transactionalEmailOptIn: true,
    transactionalSmsOptIn: true,
    marketingEmailOptIn: true,
    marketingSmsOptIn: true,
    metadata: {
      teamId: prospect.teamId,
      teamName: prospect.team.name,
      prospectId: prospect.id,
      contactName: context.displayName,
      entityType: "TEAM_PLAYER_PROSPECT",
    },
  });

  const dispatch = await queueNotificationFromTemplate({
    templateKey: MANAGED_SQUAD_JOIN_CONFIRMATION_TEMPLATE_KEY,
    recipientId: recipient.id,
    variables: context.variables,
    sourceType: MANAGED_SQUAD_JOIN_CONFIRMATION_SOURCE_TYPE,
    sourceId: prospect.id,
    metadata: {
      origin: "squad_invite",
      originLabel: SQUAD_INVITE_ORIGIN_LABEL,
      teamId: prospect.teamId,
      prospectId: prospect.id,
      contactName: context.displayName,
      templateKey: MANAGED_SQUAD_JOIN_CONFIRMATION_TEMPLATE_KEY,
      joinConfirmationUrl: context.joinConfirmationUrl,
    },
    emailBranding: {
      teamName: prospect.team.name,
      teamLogoUrl: prospect.team.logoUrl,
      leagueName: context.leagueName,
    },
    createdByUserId: input.createdByUserId ?? null,
  });

  await logNotificationDispatchToThread({
    dispatch,
    recipient,
  });

  await prisma.teamPlayerProspect.update({
    where: { id: prospect.id },
    data: {
      lastContactedAt: new Date(),
      status: prospect.status === "NEW" ? "CONTACTED" : undefined,
    },
  });

  return {
    ok: true as const,
    status:
      dispatch.status === NotificationDispatchStatus.QUEUED
        ? ("queued" as const)
        : ("skipped" as const),
    dispatchId: dispatch.id,
    prospectId: prospect.id,
  };
}

export async function queueManagedSquadJoinChaseEmail(input: {
  prospectId: string;
  chaseType: "CHASE" | "FINAL";
  createdByUserId?: string | null;
}) {
  const prospectId = input.prospectId.trim();

  if (!prospectId) {
    return { ok: false as const, status: "missing_prospect" as const };
  }

  await ensureManagedSquadJoinChaseTemplates();

  const prospect = await loadProspectForSquadEmail(prospectId);

  if (!prospect) {
    return { ok: false as const, status: "prospect_not_found" as const };
  }

  if (!prospect.teamId || !prospect.team) {
    return { ok: false as const, status: "prospect_not_found" as const };
  }

  const context = await buildProspectEmailContext(prospect);

  if (!context) {
    return { ok: false as const, status: "no_email" as const };
  }

  const recipient = await upsertNotificationRecipient({
    sourceType: NotificationRecipientSourceType.GENERAL,
    sourceId: getProspectRecipientSourceId(prospect.id),
    audience: NotificationAudience.PLAYER,
    displayName: context.displayName,
    email: context.email,
    phone: prospect.phone,
    transactionalEmailOptIn: true,
    transactionalSmsOptIn: true,
    marketingEmailOptIn: true,
    marketingSmsOptIn: true,
    metadata: {
      teamId: prospect.teamId,
      teamName: prospect.team.name,
      prospectId: prospect.id,
      contactName: context.displayName,
      entityType: "TEAM_PLAYER_PROSPECT",
    },
  });

  const isFinal = input.chaseType === "FINAL";
  const templateKey = isFinal
    ? MANAGED_SQUAD_JOIN_FINAL_CHASE_TEMPLATE_KEY
    : MANAGED_SQUAD_JOIN_CHASE_TEMPLATE_KEY;
  const sourceType = isFinal
    ? MANAGED_SQUAD_JOIN_FINAL_CHASE_SOURCE_TYPE
    : MANAGED_SQUAD_JOIN_CHASE_SOURCE_TYPE;

  const dispatch = await queueNotificationFromTemplate({
    templateKey,
    recipientId: recipient.id,
    variables: context.variables,
    sourceType,
    sourceId: prospect.id,
    metadata: {
      origin: isFinal ? "squad_invite_final_chase" : "squad_invite_chase",
      originLabel: isFinal ? "Final squad invite chase" : "Squad invite chase",
      teamId: prospect.teamId,
      prospectId: prospect.id,
      contactName: context.displayName,
      templateKey,
      joinConfirmationUrl: context.joinConfirmationUrl,
      chaseType: input.chaseType,
    },
    emailBranding: {
      teamName: prospect.team.name,
      teamLogoUrl: prospect.team.logoUrl,
      leagueName: context.leagueName,
    },
    createdByUserId: input.createdByUserId ?? null,
  });

  await logNotificationDispatchToThread({
    dispatch,
    recipient,
  });

  await prisma.teamPlayerProspect.update({
    where: { id: prospect.id },
    data: {
      lastContactedAt: new Date(),
      status: prospect.status === "NEW" ? "CONTACTED" : undefined,
    },
  });

  return {
    ok: true as const,
    status:
      dispatch.status === NotificationDispatchStatus.QUEUED
        ? ("queued" as const)
        : ("skipped" as const),
    dispatchId: dispatch.id,
    prospectId: prospect.id,
  };
}
