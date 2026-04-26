// ========================================
// File: src/lib/communications/log-dispatch.ts
// ========================================

import {
  MessageChannel,
  MessageDirection,
  MessageParticipantRole,
  NotificationChannel,
  type NotificationDispatch,
  type NotificationRecipient,
} from "@prisma/client";

import { prisma } from "@/lib/prisma";

type RecipientSnapshot = Pick<
  NotificationRecipient,
  | "id"
  | "displayName"
  | "email"
  | "phone"
  | "emailNormalized"
  | "phoneNormalized"
>;

function getMessageChannel(channel: NotificationChannel): MessageChannel {
  return channel === "SMS" ? "SMS" : "EMAIL";
}

function getParticipantRole(createdByUserId: string | null): MessageParticipantRole {
  return createdByUserId ? "ADMIN" : "SYSTEM";
}

function getProviderStatusLabel(dispatch: NotificationDispatch) {
  const reason = dispatch.failureReason?.trim();

  if (!reason) {
    return dispatch.status;
  }

  return `${dispatch.status}: ${reason}`;
}

function buildPreview(bodyText: string) {
  const trimmed = bodyText.replace(/\s+/g, " ").trim();
  if (!trimmed) return null;
  return trimmed.length > 180 ? `${trimmed.slice(0, 177)}...` : trimmed;
}

async function resolveThreadContext(dispatch: NotificationDispatch) {
  if (dispatch.sourceType === "TEAM" && dispatch.sourceId) {
    const team = await prisma.team.findUnique({
      where: { id: dispatch.sourceId },
      select: {
        id: true,
        name: true,
        contactEmail: true,
        contactPhone: true,
        leagueId: true,
      },
    });

    if (team) {
      return {
        sourceType: "TEAM",
        sourceId: team.id,
        teamId: team.id,
        leagueId: team.leagueId,
        contactName: team.name,
        contactEmail: team.contactEmail,
        contactPhone: team.contactPhone,
      };
    }
  }

  if (dispatch.sourceType === "TEAM_PLAYER_PROSPECT" && dispatch.sourceId) {
    const prospect = await prisma.teamPlayerProspect.findUnique({
      where: { id: dispatch.sourceId },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        email: true,
        phone: true,
        teamId: true,
        team: {
          select: {
            leagueId: true,
          },
        },
      },
    });

    if (prospect) {
      const displayName = [prospect.firstName, prospect.lastName]
        .filter(Boolean)
        .join(" ")
        .trim();

      return {
        sourceType: "TEAM_PLAYER_PROSPECT",
        sourceId: prospect.id,
        teamId: prospect.teamId,
        leagueId: prospect.team?.leagueId ?? null,
        contactName: displayName || prospect.firstName,
        contactEmail: prospect.email,
        contactPhone: prospect.phone,
      };
    }
  }

  return {
    sourceType: dispatch.sourceType?.trim() || null,
    sourceId: dispatch.sourceId?.trim() || null,
    teamId: null,
    leagueId: null,
    contactName: null,
    contactEmail: null,
    contactPhone: null,
  };
}

export async function logNotificationDispatchToThread(input: {
  dispatch: NotificationDispatch;
  recipient: RecipientSnapshot;
}) {
  const { dispatch, recipient } = input;
  const channel = getMessageChannel(dispatch.channel);
  const context = await resolveThreadContext(dispatch);
  const preview = buildPreview(dispatch.bodyText);
  const providerStatus = getProviderStatusLabel(dispatch);

  const existingThread = await prisma.messageThread.findFirst({
    where: {
      channel,
      sourceType: context.sourceType,
      sourceId: context.sourceId,
    },
    select: {
      id: true,
    },
  });

  const thread = existingThread
    ? await prisma.messageThread.update({
        where: { id: existingThread.id },
        data: {
          recipientId: recipient.id,
          teamId: context.teamId,
          leagueId: context.leagueId,
          contactName: context.contactName ?? recipient.displayName ?? null,
          contactEmail: context.contactEmail ?? recipient.email ?? null,
          emailNormalized: recipient.emailNormalized ?? null,
          contactPhone: context.contactPhone ?? recipient.phone ?? null,
          phoneNormalized: recipient.phoneNormalized ?? null,
          lastMessagePreview: preview,
          latestMessageAt: new Date(),
          latestOutboundAt: new Date(),
          status: "OPEN",
        },
      })
    : await prisma.messageThread.create({
        data: {
          channel,
          status: "OPEN",
          recipientId: recipient.id,
          teamId: context.teamId,
          leagueId: context.leagueId,
          sourceType: context.sourceType,
          sourceId: context.sourceId,
          contactName: context.contactName ?? recipient.displayName ?? null,
          contactEmail: context.contactEmail ?? recipient.email ?? null,
          emailNormalized: recipient.emailNormalized ?? null,
          contactPhone: context.contactPhone ?? recipient.phone ?? null,
          phoneNormalized: recipient.phoneNormalized ?? null,
          lastMessagePreview: preview,
          latestMessageAt: new Date(),
          latestOutboundAt: new Date(),
        },
      });

  const entry = await prisma.messageEntry.create({
    data: {
      threadId: thread.id,
      channel,
      direction: MessageDirection.OUTBOUND,
      participantRole: getParticipantRole(dispatch.createdByUserId ?? null),
      body: dispatch.bodyText,
      subject: dispatch.subject,
      textBody: dispatch.bodyText,
      htmlBody: dispatch.bodyHtml,
      toNumber: dispatch.channel === "SMS" ? recipient.phone ?? null : null,
      toEmail: dispatch.channel === "EMAIL" ? recipient.email ?? null : null,
      provider: dispatch.provider,
      providerMessageId: dispatch.providerMessageId,
      providerStatus,
      notificationDispatchId: dispatch.id,
      createdByUserId: dispatch.createdByUserId ?? null,
      sentAt: dispatch.sentAt,
    },
    select: {
      id: true,
      sentAt: true,
    },
  });

  await prisma.messageThread.update({
    where: { id: thread.id },
    data: {
      lastOutboundMessageId: entry.id,
      latestMessageAt: entry.sentAt ?? new Date(),
      latestOutboundAt: entry.sentAt ?? new Date(),
    },
  });

  return thread;
}
