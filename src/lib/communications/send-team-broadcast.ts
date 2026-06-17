// ========================================
// File: src/lib/communications/send-team-broadcast.ts
// ========================================

import {
  NotificationAudience,
  NotificationChannel,
  NotificationDispatchStatus,
} from "@prisma/client";

import { logNotificationDispatchToThread } from "@/lib/communications/log-dispatch";
import { prisma } from "@/lib/prisma";
import { upsertTeamNotificationRecipient } from "@/lib/notifications/team-contacts";
import { queueDirectNotification } from "@/lib/notifications/service";

type Input = {
  teamId: string;
  channel: NotificationChannel;
  subject?: string | null;
  body: string;
  templateId?: string | null;
  templateKey?: string | null;
  ctaLabel?: string | null;
  ctaUrl?: string | null;
  origin: string;
  originLabel: string;
  metadata?: Record<string, unknown>;
  createdByUserId?: string | null;
};

function getFirstName(name?: string | null) {
  const firstName = name?.trim().split(/\s+/)[0]?.trim();
  return firstName || "there";
}

export async function sendTeamBroadcastMessage(input: Input) {
  const team = await prisma.team.findUnique({
    where: { id: input.teamId },
    select: {
      id: true,
      leagueId: true,
      name: true,
      logoUrl: true,
      league: {
        select: {
          name: true,
          season: true,
        },
      },
    },
  });

  if (!team) {
    throw new Error("Team not found");
  }

  const { recipient, snapshot } = await upsertTeamNotificationRecipient(team.id);
  const contactName = snapshot.primaryContact.name?.trim() || snapshot.teamName;
  const leagueName = team.league
    ? `${team.league.name}${team.league.season ? ` — ${team.league.season}` : ""}`
    : "";

  const dispatch = await queueDirectNotification({
    recipientId: recipient.id,
    channel: input.channel,
    audience: NotificationAudience.TEAM,
    subject: input.channel === NotificationChannel.EMAIL ? input.subject ?? null : null,
    body: input.body,
    isTransactional: true,
    sourceType: "TEAM",
    sourceId: team.id,
    variables: {
      firstName: getFirstName(contactName),
      name: contactName,
      fullName: contactName,
      teamName: team.name,
      leagueName,
      signupUrl: "https://www.sixfl.co.uk/register-interest",
      link: input.ctaUrl ?? "",
    },
    emailBranding:
      input.channel === NotificationChannel.EMAIL
        ? {
            teamName: snapshot.teamName,
            teamLogoUrl: team.logoUrl ?? null,
            leagueName: leagueName || null,
          }
        : undefined,
    emailCta:
      input.channel === NotificationChannel.EMAIL && input.ctaLabel && input.ctaUrl
        ? {
            label: input.ctaLabel,
            url: input.ctaUrl,
          }
        : undefined,
    metadata: {
      origin: input.origin,
      originLabel: input.originLabel,
      teamId: team.id,
      teamName: team.name,
      leagueId: team.leagueId,
      templateId: input.templateId ?? null,
      templateKey: input.templateKey ?? null,
      ctaLabel: input.ctaLabel ?? null,
      ctaUrl: input.ctaUrl ?? null,
      ...(input.metadata ?? {}),
    },
    createdByUserId: input.createdByUserId ?? null,
  });

  await logNotificationDispatchToThread({
    dispatch,
    recipient,
  });

  return {
    skipped: dispatch.status === NotificationDispatchStatus.SKIPPED,
    reason: dispatch.status === NotificationDispatchStatus.SKIPPED ? dispatch.failureReason : null,
    dispatchId: dispatch.id,
    teamId: team.id,
    status: dispatch.status,
  };
}
