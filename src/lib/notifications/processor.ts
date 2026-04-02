// ========================================
// File: src/lib/notifications/processor.ts
// ========================================

import { NotificationChannel } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { buildThreadReplyAddress } from "@/lib/email/reply-address";
import { linkDispatchToThread } from "@/lib/messaging/service";
import { sendEmailWithResend } from "./providers/resend";
import { sendSmsWithTwilio } from "./providers/twilio";
import {
  getDueNotificationDispatches,
  markNotificationDispatchFailed,
  markNotificationDispatchProcessing,
  markNotificationDispatchSent,
} from "./service";

export type ProcessNotificationQueueResult = {
  processed: number;
  sent: number;
  failed: number;
  skipped: number;
  items: Array<{
    dispatchId: string;
    status: "sent" | "failed" | "skipped";
    channel: NotificationChannel;
    provider?: string;
    message?: string;
  }>;
};

function getMetadataRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  return value as Record<string, unknown>;
}

function getMetadataString(
  metadata: Record<string, unknown> | null,
  key: string,
): string | null {
  const value = metadata?.[key];
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function normaliseEmailAddress(input: string | null | undefined): string | null {
  if (!input) return null;

  const trimmed = input.trim();
  if (!trimmed) return null;

  const angleMatch = trimmed.match(/<([^<>]+)>/);
  const candidate = (angleMatch?.[1] ?? trimmed).trim().toLowerCase();

  if (!candidate.includes("@")) {
    return null;
  }

  return candidate;
}

function buildLastMessagePreview(body: string): string {
  const trimmed = body.trim().replace(/\s+/g, " ");
  if (!trimmed) return "";
  return trimmed.length > 140 ? `${trimmed.slice(0, 137)}...` : trimmed;
}

async function findOrCreateEmailThread(params: {
  recipientId?: string | null;
  teamId?: string | null;
  leagueId?: string | null;
  sourceType?: string | null;
  sourceId?: string | null;
  contactName?: string | null;
  contactEmail?: string | null;
}) {
  const emailNormalized = normaliseEmailAddress(params.contactEmail);

  const orConditions = [];

  if (params.recipientId) {
    orConditions.push({
      recipientId: params.recipientId,
      channel: "EMAIL" as const,
      status: "OPEN" as const,
    });
  }

  if (params.teamId && emailNormalized) {
    orConditions.push({
      teamId: params.teamId,
      emailNormalized,
      channel: "EMAIL" as const,
      status: "OPEN" as const,
    });
  }

  if (emailNormalized) {
    orConditions.push({
      emailNormalized,
      channel: "EMAIL" as const,
      status: "OPEN" as const,
    });
  }

  const existing =
    orConditions.length > 0
      ? await prisma.messageThread.findFirst({
          where: {
            OR: orConditions,
          },
          orderBy: [{ latestMessageAt: "desc" }, { updatedAt: "desc" }],
        })
      : null;

  if (existing) {
    if (!existing.replyAddress) {
      return prisma.messageThread.update({
        where: { id: existing.id },
        data: {
          replyAddress: buildThreadReplyAddress(existing.id),
          contactEmail: existing.contactEmail ?? params.contactEmail ?? null,
          emailNormalized: existing.emailNormalized ?? emailNormalized,
          channel: "EMAIL",
        },
      });
    }

    return existing;
  }

  const created = await prisma.messageThread.create({
    data: {
      channel: "EMAIL",
      status: "OPEN",
      recipientId: params.recipientId ?? null,
      teamId: params.teamId ?? null,
      leagueId: params.leagueId ?? null,
      sourceType: params.sourceType ?? null,
      sourceId: params.sourceId ?? null,
      contactName: params.contactName ?? null,
      contactEmail: params.contactEmail ?? null,
      emailNormalized,
    },
  });

  return prisma.messageThread.update({
    where: { id: created.id },
    data: {
      replyAddress: buildThreadReplyAddress(created.id),
    },
  });
}

async function recordOutboundEmailToThread(params: {
  threadId: string;
  dispatchId: string;
  subject: string;
  bodyText: string;
  bodyHtml?: string | null;
  toEmail: string;
  fromEmail: string;
  provider: string;
  providerMessageId: string | null;
  createdByUserId?: string | null;
  responsePayload?: unknown;
}) {
  const entry = await prisma.messageEntry.create({
    data: {
      threadId: params.threadId,
      channel: "EMAIL",
      direction: "OUTBOUND",
      participantRole: params.createdByUserId ? "ADMIN" : "SYSTEM",
      body: params.bodyText,
      subject: params.subject,
      textBody: params.bodyText,
      htmlBody: params.bodyHtml ?? null,
      fromEmail: params.fromEmail,
      toEmail: params.toEmail,
      provider: params.provider,
      providerMessageId: params.providerMessageId,
      providerStatus: "sent",
      notificationDispatchId: params.dispatchId,
      createdByUserId: params.createdByUserId ?? null,
      sentAt: new Date(),
    },
  });

  await prisma.messageThread.update({
    where: { id: params.threadId },
    data: {
      channel: "EMAIL",
      latestMessageAt: entry.sentAt ?? entry.createdAt,
      latestOutboundAt: entry.sentAt ?? entry.createdAt,
      lastOutboundMessageId: entry.id,
      lastMessagePreview: buildLastMessagePreview(params.bodyText),
    },
  });

  return entry;
}

export async function processNotificationQueue(limit = 25) {
  const dueDispatches = await getDueNotificationDispatches(limit);

  const result: ProcessNotificationQueueResult = {
    processed: dueDispatches.length,
    sent: 0,
    failed: 0,
    skipped: 0,
    items: [],
  };

  for (const dispatch of dueDispatches) {
    try {
      if (dispatch.channel === NotificationChannel.EMAIL) {
        if (!dispatch.recipient.email?.trim()) {
          result.skipped += 1;
          result.items.push({
            dispatchId: dispatch.id,
            status: "skipped",
            channel: dispatch.channel,
            message: "Recipient email missing.",
          });
          continue;
        }

        if (!dispatch.subject?.trim()) {
          throw new Error("Email dispatch is missing a subject.");
        }

        await markNotificationDispatchProcessing(dispatch.id);

        const metadata = getMetadataRecord(dispatch.metadata);

        const thread = await findOrCreateEmailThread({
          recipientId: dispatch.recipientId,
          teamId: getMetadataString(metadata, "teamId"),
          leagueId: getMetadataString(metadata, "leagueId"),
          sourceType: dispatch.sourceType,
          sourceId: dispatch.sourceId,
          contactName:
            getMetadataString(metadata, "contactName") ??
            dispatch.recipient.displayName ??
            null,
          contactEmail: dispatch.recipient.email,
        });

        const sendResult = await sendEmailWithResend({
          to: dispatch.recipient.email,
          subject: dispatch.subject,
          text: dispatch.bodyText,
          html: dispatch.bodyHtml,
          replyTo: thread.replyAddress,
        });

        await markNotificationDispatchSent({
          dispatchId: dispatch.id,
          provider: sendResult.provider,
          providerMessageId: sendResult.providerMessageId,
          responsePayload: sendResult.responsePayload,
        });

        await recordOutboundEmailToThread({
          threadId: thread.id,
          dispatchId: dispatch.id,
          subject: dispatch.subject,
          bodyText: dispatch.bodyText,
          bodyHtml: dispatch.bodyHtml,
          toEmail: dispatch.recipient.email,
          fromEmail: sendResult.fromEmail,
          provider: sendResult.provider,
          providerMessageId: sendResult.providerMessageId,
          createdByUserId: dispatch.createdByUserId,
          responsePayload: sendResult.responsePayload,
        });

        result.sent += 1;
        result.items.push({
          dispatchId: dispatch.id,
          status: "sent",
          channel: dispatch.channel,
          provider: sendResult.provider,
        });
        continue;
      }

      if (dispatch.channel === NotificationChannel.SMS) {
        if (!dispatch.recipient.phone?.trim()) {
          result.skipped += 1;
          result.items.push({
            dispatchId: dispatch.id,
            status: "skipped",
            channel: dispatch.channel,
            message: "Recipient phone missing.",
          });
          continue;
        }

        await markNotificationDispatchProcessing(dispatch.id);

        const sendResult = await sendSmsWithTwilio({
          to: dispatch.recipient.phone,
          body: dispatch.bodyText,
        });

        await markNotificationDispatchSent({
          dispatchId: dispatch.id,
          provider: sendResult.provider,
          providerMessageId: sendResult.providerMessageId,
          responsePayload: sendResult.responsePayload,
        });

        const metadata = getMetadataRecord(dispatch.metadata);

        await linkDispatchToThread({
          dispatchId: dispatch.id,
          recipientId: dispatch.recipientId,
          teamId: getMetadataString(metadata, "teamId"),
          leagueId: getMetadataString(metadata, "leagueId"),
          sourceType: dispatch.sourceType,
          sourceId: dispatch.sourceId,
          contactName:
            getMetadataString(metadata, "contactName") ??
            dispatch.recipient.displayName ??
            null,
          phone: dispatch.recipient.phone,
          body: dispatch.bodyText,
          fromNumber: sendResult.fromNumber,
          toNumber: dispatch.recipient.phone,
          provider: sendResult.provider,
          providerMessageId: sendResult.providerMessageId,
          providerStatus: "sent",
          twilioMessageSid: sendResult.providerMessageId,
          createdByUserId: dispatch.createdByUserId,
          sentAt: new Date(),
        });

        result.sent += 1;
        result.items.push({
          dispatchId: dispatch.id,
          status: "sent",
          channel: dispatch.channel,
          provider: sendResult.provider,
        });
        continue;
      }

      result.skipped += 1;
      result.items.push({
        dispatchId: dispatch.id,
        status: "skipped",
        channel: dispatch.channel,
        message: "Unsupported notification channel.",
      });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Notification processing failed.";

      await markNotificationDispatchFailed({
        dispatchId: dispatch.id,
        provider:
          dispatch.channel === NotificationChannel.EMAIL ? "resend" : "twilio",
        errorMessage: message,
      });

      result.failed += 1;
      result.items.push({
        dispatchId: dispatch.id,
        status: "failed",
        channel: dispatch.channel,
        provider:
          dispatch.channel === NotificationChannel.EMAIL ? "resend" : "twilio",
        message,
      });
    }
  }

  return result;
}
