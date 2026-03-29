// ========================================
// File: src/lib/notifications/processor.ts
// ========================================

import { NotificationChannel } from "@prisma/client";
import {
  getDueNotificationDispatches,
  markNotificationDispatchFailed,
  markNotificationDispatchProcessing,
  markNotificationDispatchSent,
} from "./service";
import { sendEmailWithResend } from "./providers/resend";
import { sendSmsWithTwilio } from "./providers/twilio";

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

        const sendResult = await sendEmailWithResend({
          to: dispatch.recipient.email,
          subject: dispatch.subject,
          text: dispatch.bodyText,
          html: dispatch.bodyHtml,
        });

        await markNotificationDispatchSent({
          dispatchId: dispatch.id,
          provider: sendResult.provider,
          providerMessageId: sendResult.providerMessageId,
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