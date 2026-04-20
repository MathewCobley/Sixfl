// ========================================
// File: src/lib/communications/log-direct-message.ts
// ========================================

import {
  MessageChannel,
  MessageDirection,
  MessageParticipantRole,
} from "@prisma/client";

import { prisma } from "@/lib/prisma";

type Input = {
  channel: MessageChannel;
  sourceType: string;
  sourceId: string;
  recipientId?: string | null;
  teamId?: string | null;
  leagueId?: string | null;
  contactName?: string | null;
  contactEmail?: string | null;
  emailNormalized?: string | null;
  contactPhone?: string | null;
  phoneNormalized?: string | null;
  subject?: string | null;
  body: string;
  textBody?: string | null;
  htmlBody?: string | null;
  toEmail?: string | null;
  toNumber?: string | null;
  provider?: string | null;
  providerMessageId?: string | null;
  providerStatus?: string | null;
  resendEmailId?: string | null;
  createdByUserId?: string | null;
  sentAt?: Date | null;
};

function buildPreview(body: string) {
  const trimmed = body.replace(/\s+/g, " ").trim();
  if (!trimmed) return null;
  return trimmed.length > 180 ? `${trimmed.slice(0, 177)}...` : trimmed;
}

export async function logDirectOutboundMessage(input: Input) {
  const sentAt = input.sentAt ?? new Date();
  const preview = buildPreview(input.textBody ?? input.body);

  const existingThread = await prisma.messageThread.findFirst({
    where: {
      channel: input.channel,
      sourceType: input.sourceType,
      sourceId: input.sourceId,
    },
    select: {
      id: true,
    },
  });

  const thread = existingThread
    ? await prisma.messageThread.update({
        where: { id: existingThread.id },
        data: {
          recipientId: input.recipientId ?? null,
          teamId: input.teamId ?? null,
          leagueId: input.leagueId ?? null,
          contactName: input.contactName ?? null,
          contactEmail: input.contactEmail ?? null,
          emailNormalized: input.emailNormalized ?? null,
          contactPhone: input.contactPhone ?? null,
          phoneNormalized: input.phoneNormalized ?? null,
          lastMessagePreview: preview,
          latestMessageAt: sentAt,
          latestOutboundAt: sentAt,
          status: "OPEN",
        },
      })
    : await prisma.messageThread.create({
        data: {
          channel: input.channel,
          status: "OPEN",
          recipientId: input.recipientId ?? null,
          teamId: input.teamId ?? null,
          leagueId: input.leagueId ?? null,
          sourceType: input.sourceType,
          sourceId: input.sourceId,
          contactName: input.contactName ?? null,
          contactEmail: input.contactEmail ?? null,
          emailNormalized: input.emailNormalized ?? null,
          contactPhone: input.contactPhone ?? null,
          phoneNormalized: input.phoneNormalized ?? null,
          lastMessagePreview: preview,
          latestMessageAt: sentAt,
          latestOutboundAt: sentAt,
        },
      });

  const entry = await prisma.messageEntry.create({
    data: {
      threadId: thread.id,
      channel: input.channel,
      direction: MessageDirection.OUTBOUND,
      participantRole: input.createdByUserId ? MessageParticipantRole.ADMIN : MessageParticipantRole.SYSTEM,
      body: input.body,
      subject: input.subject ?? null,
      textBody: input.textBody ?? input.body,
      htmlBody: input.htmlBody ?? null,
      toEmail: input.toEmail ?? null,
      toNumber: input.toNumber ?? null,
      provider: input.provider ?? null,
      providerMessageId: input.providerMessageId ?? null,
      providerStatus: input.providerStatus ?? null,
      resendEmailId: input.resendEmailId ?? null,
      createdByUserId: input.createdByUserId ?? null,
      sentAt,
    },
    select: {
      id: true,
    },
  });

  await prisma.messageThread.update({
    where: { id: thread.id },
    data: {
      lastOutboundMessageId: entry.id,
      latestMessageAt: sentAt,
      latestOutboundAt: sentAt,
    },
  });

  return thread;
}
