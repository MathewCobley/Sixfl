// ========================================
// File: src/lib/notifications/processor.ts
// ========================================

import { NotificationChannel } from "@prisma/client";
import {
  getChargeOutstandingPence,
  getChargePaidTotal,
} from "@/lib/payments/charge-status";
import { prisma } from "@/lib/prisma";
import {
  findOrCreateEmailThreadForOutbound,
  linkDispatchToThread,
} from "@/lib/messaging/service";
import { sendEmailWithResend } from "./providers/resend";
import { sendSmsWithTwilio } from "./providers/twilio";
import {
  getDueNotificationDispatches,
  markNotificationDispatchCancelled,
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

function buildLastMessagePreview(body: string): string {
  const trimmed = body.trim().replace(/\s+/g, " ");
  if (!trimmed) return "";
  return trimmed.length > 140 ? `${trimmed.slice(0, 137)}...` : trimmed;
}

function isQueuedMatchFeeNotification(
  sourceType: string | null | undefined,
) {
  return (
    sourceType === "FIXTURE_MATCH_FEE" ||
    sourceType === "FIXTURE_MATCH_FEE_REMINDER"
  );
}

function isFixtureConfirmationSmsNotification(
  sourceType: string | null | undefined,
) {
  return (
    sourceType === "FIXTURE_CONFIRMATION_CHASE_SMS" ||
    sourceType === "FIXTURE_CONFIRMATION_AUTO_SMS_72H" ||
    sourceType === "FIXTURE_CONFIRMATION_AUTO_SMS_24H"
  );
}

async function getQueuedMatchFeeCancellationReason(input: {
  sourceType: string | null;
  sourceId: string | null;
}) {
  if (!isQueuedMatchFeeNotification(input.sourceType) || !input.sourceId) {
    return null;
  }

  const charge = await prisma.paymentCharge.findUnique({
    where: {
      id: input.sourceId,
    },
    include: {
      transactions: {
        select: {
          amountPence: true,
        },
      },
    },
  });

  if (!charge) {
    return "Match fee charge no longer exists.";
  }

  if (charge.status === "VOID") {
    return "Match fee charge was voided before queued payment email was sent.";
  }

  const paidTotalPence = getChargePaidTotal(charge.transactions);
  const outstandingPence = getChargeOutstandingPence(
    charge.amountPence,
    paidTotalPence,
  );

  if (outstandingPence <= 0) {
    return "Match fee charge was paid before queued payment email was sent.";
  }

  return null;
}

async function getQueuedFixtureConfirmationSmsCancellationReason(input: {
  sourceType: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: Date;
}) {
  if (!isFixtureConfirmationSmsNotification(input.sourceType)) {
    return null;
  }

  const fixtureId = getMetadataString(input.metadata, "fixtureId");

  if (!fixtureId) {
    return "Fixture confirmation SMS is missing its fixture reference.";
  }

  const fixture = await prisma.fixture.findUnique({
    where: {
      id: fixtureId,
    },
    select: {
      id: true,
      updatedAt: true,
      status: true,
      kickoffAt: true,
    },
  });

  if (!fixture) {
    return "Fixture was deleted before queued confirmation SMS was sent.";
  }

  if (fixture.status !== "SCHEDULED" || fixture.kickoffAt <= new Date()) {
    return "Fixture is no longer available for confirmation before queued SMS was sent.";
  }

  if (fixture.updatedAt.getTime() > input.createdAt.getTime()) {
    return "Fixture was changed before queued confirmation SMS was sent.";
  }

  return null;
}

async function recordOutboundEmailToThread(params: {
  recipientId?: string | null;
  teamId?: string | null;
  leagueId?: string | null;
  sourceType?: string | null;
  sourceId?: string | null;
  contactName?: string | null;
  toEmail: string;
  dispatchId: string;
  subject: string;
  bodyText: string;
  bodyHtml?: string | null;
  fromEmail: string;
  provider: string;
  providerMessageId: string | null;
  createdByUserId?: string | null;
}) {
  const thread = await findOrCreateEmailThreadForOutbound({
    recipientId: params.recipientId,
    teamId: params.teamId,
    leagueId: params.leagueId,
    sourceType: params.sourceType,
    sourceId: params.sourceId,
    contactName: params.contactName,
    contactEmail: params.toEmail,
  });

  const existing = await prisma.messageEntry.findFirst({
    where: {
      notificationDispatchId: params.dispatchId,
    },
    select: {
      id: true,
      createdAt: true,
    },
  });

  if (existing) {
    const updated = await prisma.messageEntry.update({
      where: { id: existing.id },
      data: {
        threadId: thread.id,
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
      where: { id: thread.id },
      data: {
        channel: "EMAIL",
        latestMessageAt: updated.sentAt ?? updated.createdAt,
        latestOutboundAt: updated.sentAt ?? updated.createdAt,
        lastOutboundMessageId: updated.id,
        lastMessagePreview: buildLastMessagePreview(params.bodyText),
      },
    });

    return updated;
  }

  const entry = await prisma.messageEntry.create({
    data: {
      threadId: thread.id,
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
    where: { id: thread.id },
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
      const metadata = getMetadataRecord(dispatch.metadata);
      const queuedMatchFeeCancellationReason =
        await getQueuedMatchFeeCancellationReason({
          sourceType: dispatch.sourceType,
          sourceId: dispatch.sourceId,
        });
      const queuedFixtureConfirmationSmsCancellationReason =
        await getQueuedFixtureConfirmationSmsCancellationReason({
          sourceType: dispatch.sourceType,
          metadata,
          createdAt: dispatch.createdAt,
        });
      const cancellationReason =
        queuedMatchFeeCancellationReason ??
        queuedFixtureConfirmationSmsCancellationReason;

      if (cancellationReason) {
        await markNotificationDispatchCancelled(dispatch.id, cancellationReason);

        result.skipped += 1;
        result.items.push({
          dispatchId: dispatch.id,
          status: "skipped",
          channel: dispatch.channel,
          message: cancellationReason,
        });
        continue;
      }

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

        const thread = await findOrCreateEmailThreadForOutbound({
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

        const replyTo = thread.replyAddress?.trim();

        if (!replyTo) {
          throw new Error("Email thread reply address is missing.");
        }

        const sendResult = await sendEmailWithResend({
          to: dispatch.recipient.email,
          subject: dispatch.subject,
          text: dispatch.bodyText,
          html: dispatch.bodyHtml,
          replyTo,
        });

        await markNotificationDispatchSent({
          dispatchId: dispatch.id,
          provider: sendResult.provider,
          providerMessageId: sendResult.providerMessageId,
          responsePayload: sendResult.responsePayload,
        });

        await recordOutboundEmailToThread({
          recipientId: dispatch.recipientId,
          teamId: getMetadataString(metadata, "teamId"),
          leagueId: getMetadataString(metadata, "leagueId"),
          sourceType: dispatch.sourceType,
          sourceId: dispatch.sourceId,
          contactName:
            getMetadataString(metadata, "contactName") ??
            dispatch.recipient.displayName ??
            null,
          toEmail: dispatch.recipient.email,
          dispatchId: dispatch.id,
          subject: dispatch.subject,
          bodyText: dispatch.bodyText,
          bodyHtml: dispatch.bodyHtml,
          fromEmail: sendResult.fromEmail,
          provider: sendResult.provider,
          providerMessageId: sendResult.providerMessageId,
          createdByUserId: dispatch.createdByUserId,
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
