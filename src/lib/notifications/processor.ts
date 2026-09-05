// ========================================
// File: src/lib/notifications/processor.ts
// ========================================

import { NotificationChannel } from "@prisma/client";
import { getUnpublishedFixtureBlockReason } from "@/lib/fixtures/publishing";
import {
  findOrCreateEmailThreadForOutbound,
  linkDispatchToThread,
} from "@/lib/messaging/service";
import {
  getChargeOutstandingPence,
  getChargePaidTotal,
} from "@/lib/payments/charge-status";
import { prisma } from "@/lib/prisma";
import { refereeEveningDeliveryBlock } from "@/lib/referees/evening-notifications";
import { isLegacyRefereeNotice, LEGACY_REFEREE_REASON } from "@/lib/referees/evening-policy";
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
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function getMetadataString(metadata: Record<string, unknown> | null, key: string) {
  const value = metadata?.[key];
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function getFixtureReminderFixtureId(input: {
  metadata: Record<string, unknown> | null;
  sourceId: string | null;
}) {
  const metadataFixtureId = getMetadataString(input.metadata, "fixtureId");
  if (metadataFixtureId) return metadataFixtureId;

  const sourceId = input.sourceId?.trim();
  if (!sourceId) return null;

  return sourceId.split(":")[0]?.trim() || null;
}

function getManagedSquadAvailabilityRefs(input: {
  metadata: Record<string, unknown> | null;
  sourceId: string | null;
}) {
  const metadataFixtureId = getMetadataString(input.metadata, "fixtureId");
  const metadataTeamMemberId = getMetadataString(input.metadata, "teamMemberId");

  if (metadataFixtureId && metadataTeamMemberId) {
    return { fixtureId: metadataFixtureId, teamMemberId: metadataTeamMemberId };
  }

  const parts = input.sourceId?.trim().split(":") ?? [];
  const fixtureId = metadataFixtureId ?? parts[0]?.trim() ?? null;
  const teamMemberId = metadataTeamMemberId ?? parts[1]?.trim() ?? null;

  if (!fixtureId || !teamMemberId) return null;
  return { fixtureId, teamMemberId };
}

function buildLastMessagePreview(body: string) {
  const trimmed = body.trim().replace(/\s+/g, " ");
  if (!trimmed) return "";
  return trimmed.length > 140 ? `${trimmed.slice(0, 137)}...` : trimmed;
}

function isQueuedMatchFeeNotification(sourceType: string | null | undefined) {
  return sourceType === "FIXTURE_MATCH_FEE" || sourceType === "FIXTURE_MATCH_FEE_REMINDER";
}

function isFixtureReminderNotification(sourceType: string | null | undefined) {
  return sourceType === "FIXTURE_REMINDER";
}

function isManagedSquadAvailabilityNotification(sourceType: string | null | undefined) {
  return (
    sourceType === "MANAGED_SQUAD_AVAILABILITY_REQUEST" ||
    sourceType === "MANAGED_SQUAD_AVAILABILITY_CHASE_24H" ||
    sourceType === "MANAGED_SQUAD_AVAILABILITY_CHASE_72H"
  );
}

function isFixtureConfirmationSmsNotification(sourceType: string | null | undefined) {
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
  if (!isQueuedMatchFeeNotification(input.sourceType) || !input.sourceId) return null;

  const charge = await prisma.paymentCharge.findUnique({
    where: { id: input.sourceId },
    include: {
      fixture: {
        select: { id: true, publishedAt: true, status: true, kickoffAt: true },
      },
      transactions: { select: { amountPence: true } },
    },
  });

  if (!charge) return "Match fee charge no longer exists.";
  if (!charge.fixture) return "Match fee charge is not linked to a fixture.";
  if (!charge.fixture.publishedAt) return "Fixture is not published. SIXFL does not send payment messages for unpublished fixtures.";
  if (charge.fixture.status !== "SCHEDULED" || charge.fixture.kickoffAt <= new Date()) {
    return "Fixture is no longer scheduled before queued payment message was sent.";
  }
  if (charge.status === "VOID") return "Match fee charge was voided before queued payment email was sent.";

  const outstandingPence = getChargeOutstandingPence(
    charge.amountPence,
    getChargePaidTotal(charge.transactions),
  );

  return outstandingPence <= 0 ? "Match fee charge was paid before queued payment email was sent." : null;
}

async function getQueuedFixtureReminderCancellationReason(input: {
  sourceType: string | null;
  sourceId: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: Date;
}) {
  if (!isFixtureReminderNotification(input.sourceType)) return null;

  const fixtureId = getFixtureReminderFixtureId({ metadata: input.metadata, sourceId: input.sourceId });
  if (!fixtureId) return "Fixture reminder is missing its fixture reference.";

  const fixture = await prisma.fixture.findUnique({
    where: { id: fixtureId },
    select: { id: true, updatedAt: true, publishedAt: true, status: true, kickoffAt: true },
  });

  if (!fixture) return "Fixture was deleted before queued reminder email was sent.";
  if (!fixture.publishedAt) return "Fixture is not published before queued reminder email was sent.";
  if (fixture.status !== "SCHEDULED" || fixture.kickoffAt <= new Date()) return "Fixture is no longer scheduled before queued reminder email was sent.";
  if (fixture.updatedAt.getTime() > input.createdAt.getTime()) return "Fixture was changed before queued reminder email was sent.";
  return null;
}

async function getQueuedManagedSquadAvailabilityCancellationReason(input: {
  sourceType: string | null;
  sourceId: string | null;
  metadata: Record<string, unknown> | null;
}) {
  if (!isManagedSquadAvailabilityNotification(input.sourceType)) return null;

  const refs = getManagedSquadAvailabilityRefs({ metadata: input.metadata, sourceId: input.sourceId });
  if (!refs) return "Managed squad availability reminder is missing its fixture or player reference.";

  const [fixture, availability] = await Promise.all([
    prisma.fixture.findUnique({
      where: { id: refs.fixtureId },
      select: { id: true, publishedAt: true, status: true, kickoffAt: true },
    }),
    prisma.fixtureAvailability.findUnique({
      where: { fixtureId_teamMemberId: refs },
      select: { response: true, respondedAt: true },
    }),
  ]);

  if (!fixture) return "Fixture was deleted before queued managed squad availability reminder was sent.";
  if (!fixture.publishedAt) return "Fixture is not published before queued managed squad availability reminder was sent.";
  if (fixture.status !== "SCHEDULED" || fixture.kickoffAt <= new Date()) return "Fixture is no longer scheduled before queued managed squad availability reminder was sent.";
  if (availability && availability.response !== "NO_RESPONSE") return "Player had already responded before queued managed squad availability reminder was sent.";
  return null;
}

async function getQueuedFixtureConfirmationSmsCancellationReason(input: {
  sourceType: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: Date;
}) {
  if (!isFixtureConfirmationSmsNotification(input.sourceType)) return null;

  const fixtureId = getMetadataString(input.metadata, "fixtureId");
  if (!fixtureId) return "Fixture confirmation SMS is missing its fixture reference.";

  const fixture = await prisma.fixture.findUnique({
    where: { id: fixtureId },
    select: { id: true, updatedAt: true, publishedAt: true, status: true, kickoffAt: true },
  });

  if (!fixture) return "Fixture was deleted before queued confirmation SMS was sent.";
  if (!fixture.publishedAt) return "Fixture is not published before queued confirmation SMS was sent.";
  if (fixture.status !== "SCHEDULED" || fixture.kickoffAt <= new Date()) return "Fixture is no longer available for confirmation before queued SMS was sent.";
  if (fixture.updatedAt.getTime() > input.createdAt.getTime()) return "Fixture was changed before queued confirmation SMS was sent.";
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
    where: { notificationDispatchId: params.dispatchId },
    select: { id: true, createdAt: true },
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
    let claimed = false;
    let acceptedByProvider = false;
    try {
      claimed = await markNotificationDispatchProcessing(dispatch.id);
      if (!claimed) {
        result.skipped += 1;
        result.items.push({ dispatchId: dispatch.id, status: "skipped", channel: dispatch.channel, message: "Dispatch already claimed or cancelled." });
        continue;
      }
      const metadata = getMetadataRecord(dispatch.metadata);
      const unpublishedFixtureBlockReason = isLegacyRefereeNotice(dispatch.sourceType) ? LEGACY_REFEREE_REASON : await getUnpublishedFixtureBlockReason({
        sourceType: dispatch.sourceType,
        sourceId: dispatch.sourceId,
        metadata: dispatch.metadata,
      });
      const cancellationReason =
        unpublishedFixtureBlockReason ??
        (await refereeEveningDeliveryBlock(dispatch)) ??
        (await getQueuedMatchFeeCancellationReason({ sourceType: dispatch.sourceType, sourceId: dispatch.sourceId })) ??
        (await getQueuedFixtureReminderCancellationReason({ sourceType: dispatch.sourceType, sourceId: dispatch.sourceId, metadata, createdAt: dispatch.createdAt })) ??
        (await getQueuedManagedSquadAvailabilityCancellationReason({ sourceType: dispatch.sourceType, sourceId: dispatch.sourceId, metadata })) ??
        (await getQueuedFixtureConfirmationSmsCancellationReason({ sourceType: dispatch.sourceType, metadata, createdAt: dispatch.createdAt }));

      if (cancellationReason) {
        await markNotificationDispatchCancelled(dispatch.id, cancellationReason);
        result.skipped += 1;
        result.items.push({ dispatchId: dispatch.id, status: "skipped", channel: dispatch.channel, message: cancellationReason });
        continue;
      }

      if (dispatch.channel === NotificationChannel.EMAIL) {
        if (!dispatch.recipient.email?.trim()) {
          await markNotificationDispatchCancelled(dispatch.id, "Recipient email missing.");
          result.skipped += 1;
          result.items.push({ dispatchId: dispatch.id, status: "skipped", channel: dispatch.channel, message: "Recipient email missing." });
          continue;
        }
        if (!dispatch.subject?.trim()) throw new Error("Email dispatch is missing a subject.");

        const thread = await findOrCreateEmailThreadForOutbound({
          recipientId: dispatch.recipientId,
          teamId: getMetadataString(metadata, "teamId"),
          leagueId: getMetadataString(metadata, "leagueId"),
          sourceType: dispatch.sourceType,
          sourceId: dispatch.sourceId,
          contactName: getMetadataString(metadata, "contactName") ?? dispatch.recipient.displayName ?? null,
          contactEmail: dispatch.recipient.email,
        });

        const replyTo = thread.replyAddress?.trim();
        if (!replyTo) throw new Error("Email thread reply address is missing.");

        const sendResult = await sendEmailWithResend({
          to: dispatch.recipient.email,
          subject: dispatch.subject,
          text: dispatch.bodyText,
          html: dispatch.bodyHtml,
          replyTo,
        });

        acceptedByProvider = true;
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
          contactName: getMetadataString(metadata, "contactName") ?? dispatch.recipient.displayName ?? null,
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
        result.items.push({ dispatchId: dispatch.id, status: "sent", channel: dispatch.channel, provider: sendResult.provider });
        continue;
      }

      if (dispatch.channel === NotificationChannel.SMS) {
        if (!dispatch.recipient.phone?.trim()) {
          await markNotificationDispatchCancelled(dispatch.id, "Recipient phone missing.");
          result.skipped += 1;
          result.items.push({ dispatchId: dispatch.id, status: "skipped", channel: dispatch.channel, message: "Recipient phone missing." });
          continue;
        }

        const sendResult = await sendSmsWithTwilio({ to: dispatch.recipient.phone, body: dispatch.bodyText });

        acceptedByProvider = true;
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
          contactName: getMetadataString(metadata, "contactName") ?? dispatch.recipient.displayName ?? null,
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
        result.items.push({ dispatchId: dispatch.id, status: "sent", channel: dispatch.channel, provider: sendResult.provider });
        continue;
      }

      result.skipped += 1;
      result.items.push({ dispatchId: dispatch.id, status: "skipped", channel: dispatch.channel, message: "Unsupported notification channel." });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Notification processing failed.";
      if (acceptedByProvider) {
        // A logging/DB failure after provider acceptance is not a failed delivery.
        // Leave SENT (or uncertain PROCESSING) intact; never make it retryable.
        console.error("Notification accepted; post-send recording needs repair", dispatch.id, error);
        result.sent += 1;
        result.items.push({ dispatchId: dispatch.id, status: "sent", channel: dispatch.channel, message: "Provider accepted the message; delivery-history recording needs attention." });
        continue;
      }
      if (!claimed) {
        result.failed += 1;
        result.items.push({ dispatchId: dispatch.id, status: "failed", channel: dispatch.channel, message });
        continue;
      }

      await markNotificationDispatchFailed({
        dispatchId: dispatch.id,
        provider: dispatch.channel === NotificationChannel.EMAIL ? "resend" : "twilio",
        errorMessage: message,
      });

      result.failed += 1;
      result.items.push({
        dispatchId: dispatch.id,
        status: "failed",
        channel: dispatch.channel,
        provider: dispatch.channel === NotificationChannel.EMAIL ? "resend" : "twilio",
        message,
      });
    }
  }

  return result;
}
