// ========================================
// File: src/lib/notifications/webhooks.ts
// ========================================

import {
  NotificationAttemptStatus,
  NotificationDispatchStatus,
  Prisma,
} from "@prisma/client";
import { prisma } from "@/lib/prisma";

function asJsonValue(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value ?? null)) as Prisma.InputJsonValue;
}

function extractResendMessageId(payload: Record<string, unknown>) {
  const directId = payload.email_id;
  if (typeof directId === "string" && directId.trim()) return directId.trim();

  const data = payload.data;
  if (data && typeof data === "object") {
    const nestedId = (data as Record<string, unknown>).email_id;
    if (typeof nestedId === "string" && nestedId.trim()) return nestedId.trim();
  }

  return null;
}

function extractResendEventType(payload: Record<string, unknown>) {
  const directType = payload.type;
  if (typeof directType === "string") return directType.toLowerCase();

  return "unknown";
}

export async function handleResendWebhook(payload: Record<string, unknown>) {
  const providerMessageId = extractResendMessageId(payload);
  const eventType = extractResendEventType(payload);

  if (!providerMessageId) {
    return {
      ok: true,
      ignored: true,
      reason: "Missing provider message id.",
    };
  }

  const dispatch = await prisma.notificationDispatch.findFirst({
    where: {
      provider: "resend",
      providerMessageId,
    },
    select: {
      id: true,
      status: true,
    },
  });

  if (!dispatch) {
    return {
      ok: true,
      ignored: true,
      reason: "No matching dispatch found.",
    };
  }

  const failureEvents = new Set(["email.bounced", "email.complained", "email.failed"]);
  const successEvents = new Set(["email.sent", "email.delivered"]);

  if (failureEvents.has(eventType)) {
    await prisma.$transaction(async (tx) => {
      await tx.notificationAttempt.create({
        data: {
          dispatchId: dispatch.id,
          provider: "resend",
          status: NotificationAttemptStatus.FAILED,
          responsePayload: asJsonValue(payload),
          errorMessage: eventType,
        },
      });

      await tx.notificationDispatch.update({
        where: { id: dispatch.id },
        data: {
          status: NotificationDispatchStatus.FAILED,
          failedAt: new Date(),
          failureReason: eventType,
        },
      });
    });

    return { ok: true, updated: true, status: "failed" };
  }

  if (successEvents.has(eventType)) {
    await prisma.notificationAttempt.create({
      data: {
        dispatchId: dispatch.id,
        provider: "resend",
        status: NotificationAttemptStatus.SUCCESS,
        responsePayload: asJsonValue(payload),
      },
    });

    return { ok: true, updated: true, status: "sent" };
  }

  return {
    ok: true,
    ignored: true,
    reason: `Unhandled Resend event: ${eventType}`,
  };
}

export async function handleTwilioWebhook(payload: Record<string, string>) {
  const providerMessageId = payload.MessageSid?.trim();
  const messageStatus = payload.MessageStatus?.trim().toLowerCase() || "unknown";
  const errorMessage = payload.ErrorMessage?.trim() || null;

  if (!providerMessageId) {
    return {
      ok: true,
      ignored: true,
      reason: "Missing Twilio MessageSid.",
    };
  }

  const dispatch = await prisma.notificationDispatch.findFirst({
    where: {
      provider: "twilio",
      providerMessageId,
    },
    select: {
      id: true,
      status: true,
    },
  });

  if (!dispatch) {
    return {
      ok: true,
      ignored: true,
      reason: "No matching dispatch found.",
    };
  }

  const failureStatuses = new Set(["failed", "undelivered"]);
  const successStatuses = new Set(["sent", "delivered"]);

  if (failureStatuses.has(messageStatus)) {
    await prisma.$transaction(async (tx) => {
      await tx.notificationAttempt.create({
        data: {
          dispatchId: dispatch.id,
          provider: "twilio",
          status: NotificationAttemptStatus.FAILED,
          responsePayload: asJsonValue(payload),
          errorMessage: errorMessage || messageStatus,
        },
      });

      await tx.notificationDispatch.update({
        where: { id: dispatch.id },
        data: {
          status: NotificationDispatchStatus.FAILED,
          failedAt: new Date(),
          failureReason: errorMessage || messageStatus,
        },
      });
    });

    return { ok: true, updated: true, status: "failed" };
  }

  if (successStatuses.has(messageStatus)) {
    await prisma.notificationAttempt.create({
      data: {
        dispatchId: dispatch.id,
        provider: "twilio",
        status: NotificationAttemptStatus.SUCCESS,
        responsePayload: asJsonValue(payload),
      },
    });

    return { ok: true, updated: true, status: "sent" };
  }

  return {
    ok: true,
    ignored: true,
    reason: `Unhandled Twilio status: ${messageStatus}`,
  };
}
