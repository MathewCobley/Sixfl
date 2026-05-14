// ========================================
// File: src/lib/managed-squad/prospectJoinConfirmation.ts
// ========================================

import {
  NotificationAudience,
  NotificationChannel,
  NotificationDispatchStatus,
  NotificationRecipientSourceType,
  NotificationTemplateKind,
} from "@prisma/client";

import { logNotificationDispatchToThread } from "@/lib/communications/log-dispatch";
import { queueNotificationFromTemplate } from "@/lib/notifications/service";
import { upsertNotificationRecipient } from "@/lib/notifications/recipients";
import { prisma } from "@/lib/prisma";
import { createSquadActivationToken } from "@/lib/squad/activationToken";

export const MANAGED_SQUAD_JOIN_CONFIRMATION_TEMPLATE_KEY =
  "managed-squad-join-confirmation-email";

const MANAGED_SQUAD_JOIN_CONFIRMATION_SOURCE_TYPE =
  "MANAGED_SQUAD_JOIN_CONFIRMATION";

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

function getTeamContextLine(team: {
  name: string;
  league: { dayOfWeek: string | null; venueName: string | null } | null;
}) {
  const night = formatPreferredNight(team.league?.dayOfWeek);
  const venueName = team.league?.venueName?.trim();

  if (night && venueName) {
    return `${team.name} plays on a ${night} night at ${venueName}.`;
  }

  if (night) {
    return `${team.name} plays on a ${night} night.`;
  }

  if (venueName) {
    return `${team.name} plays at ${venueName}.`;
  }

  return `${team.name} is a managed SIXFL squad.`;
}

export async function ensureManagedSquadJoinConfirmationTemplate() {
  return prisma.notificationTemplate.upsert({
    where: { key: MANAGED_SQUAD_JOIN_CONFIRMATION_TEMPLATE_KEY },
    update: {
      name: "Managed squad join confirmation email",
      description:
        "Low-friction welcome email sent when a player lead is added to a managed squad, asking them to confirm they still want to join.",
      kind: NotificationTemplateKind.TRANSACTIONAL,
      channel: NotificationChannel.EMAIL,
      audience: NotificationAudience.PLAYER,
      subject: "Confirm your place with {{teamName}}",
      body: [
        "Hi {{firstName}},",
        "",
        "You’ve been added to the {{teamName}} squad list on SIXFL.",
        "",
        "{{teamContextLine}}",
        "",
        "To keep things simple, please tap below if you still want to join:",
        "",
        "{{cta}}",
        "",
        "Once confirmed, we’ll include you in squad messages and fixture availability checks when games are coming up.",
        "",
        "Thanks,",
        "SIXFL",
      ].join("\n"),
      ctaLabel: "Yes, I want to join",
      ctaUrlKey: "joinConfirmationUrl",
      isActive: true,
    },
    create: {
      key: MANAGED_SQUAD_JOIN_CONFIRMATION_TEMPLATE_KEY,
      name: "Managed squad join confirmation email",
      description:
        "Low-friction welcome email sent when a player lead is added to a managed squad, asking them to confirm they still want to join.",
      kind: NotificationTemplateKind.TRANSACTIONAL,
      channel: NotificationChannel.EMAIL,
      audience: NotificationAudience.PLAYER,
      subject: "Confirm your place with {{teamName}}",
      body: [
        "Hi {{firstName}},",
        "",
        "You’ve been added to the {{teamName}} squad list on SIXFL.",
        "",
        "{{teamContextLine}}",
        "",
        "To keep things simple, please tap below if you still want to join:",
        "",
        "{{cta}}",
        "",
        "Once confirmed, we’ll include you in squad messages and fixture availability checks when games are coming up.",
        "",
        "Thanks,",
        "SIXFL",
      ].join("\n"),
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

export async function queueManagedSquadJoinConfirmationEmail(input: {
  prospectId: string;
  createdByUserId?: string | null;
}) {
  const prospectId = input.prospectId.trim();

  if (!prospectId) {
    return { ok: false as const, status: "missing_prospect" as const };
  }

  await ensureManagedSquadJoinConfirmationTemplate();

  const prospect = await prisma.teamPlayerProspect.findUnique({
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
              name: true,
              season: true,
              dayOfWeek: true,
              venueName: true,
            },
          },
        },
      },
    },
  });

  if (!prospect) {
    return { ok: false as const, status: "prospect_not_found" as const };
  }

  const email = prospect.email?.trim().toLowerCase() || null;

  if (!email) {
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

  const displayName = getDisplayName(prospect) || email;
  const joinConfirmationUrl = getManagedSquadJoinConfirmationUrl(prospect.id);
  const leagueName = prospect.team.league
    ? `${prospect.team.league.name}${
        prospect.team.league.season ? ` · ${prospect.team.league.season}` : ""
      }`
    : "";

  const recipient = await upsertNotificationRecipient({
    sourceType: NotificationRecipientSourceType.GENERAL,
    sourceId: getProspectRecipientSourceId(prospect.id),
    audience: NotificationAudience.PLAYER,
    displayName,
    email,
    phone: prospect.phone,
    transactionalEmailOptIn: true,
    transactionalSmsOptIn: true,
    marketingEmailOptIn: true,
    marketingSmsOptIn: true,
    metadata: {
      teamId: prospect.teamId,
      teamName: prospect.team.name,
      prospectId: prospect.id,
      contactName: displayName,
      entityType: "TEAM_PLAYER_PROSPECT",
    },
  });

  const dispatch = await queueNotificationFromTemplate({
    templateKey: MANAGED_SQUAD_JOIN_CONFIRMATION_TEMPLATE_KEY,
    recipientId: recipient.id,
    variables: {
      firstName: getFirstName(displayName) || "there",
      fullName: displayName,
      teamName: prospect.team.name,
      leagueName,
      venueName: prospect.team.league?.venueName ?? "",
      preferredNight: formatPreferredNight(prospect.team.league?.dayOfWeek) ?? "",
      teamContextLine: getTeamContextLine(prospect.team),
      joinConfirmationUrl,
      teamJoinUrl: joinConfirmationUrl,
    },
    sourceType: MANAGED_SQUAD_JOIN_CONFIRMATION_SOURCE_TYPE,
    sourceId: prospect.id,
    metadata: {
      origin: "managed_squad_lead_conversion",
      originLabel: "Managed squad join confirmation email",
      teamId: prospect.teamId,
      prospectId: prospect.id,
      contactName: displayName,
      templateKey: MANAGED_SQUAD_JOIN_CONFIRMATION_TEMPLATE_KEY,
      joinConfirmationUrl,
    },
    emailBranding: {
      teamName: prospect.team.name,
      teamLogoUrl: prospect.team.logoUrl,
      leagueName,
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
