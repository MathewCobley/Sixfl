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

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  return value as Record<string, unknown>;
}

function getStringValue(value: unknown) {
  if (typeof value !== "string") return null;

  const trimmed = value.trim();
  return trimmed || null;
}

function getNestedString(
  record: Record<string, unknown> | null,
  keys: string[],
) {
  if (!record) return null;

  let current: unknown = record;

  for (const key of keys) {
    const currentRecord = asRecord(current);
    if (!currentRecord) return null;

    current = currentRecord[key];
  }

  return getStringValue(current);
}

function extractResendMessageId(payload: Record<string, unknown>) {
  const data = asRecord(payload.data);

  const candidates = [
    payload.email_id,
    payload.emailId,
    payload.id,
    data?.email_id,
    data?.emailId,
    data?.id,
    getNestedString(data, ["email", "id"]),
  ];

  for (const candidate of candidates) {
    const value = getStringValue(candidate);
    if (value) return value;
  }

  return null;
}

function extractResendEventType(payload: Record<string, unknown>) {
  const directType = getStringValue(payload.type);
  if (directType) return directType.toLowerCase();

  return "unknown";
}

function extractResendEventReason(
  payload: Record<string, unknown>,
  eventType: string,
) {
  const data = asRecord(payload.data);

  const candidates = [
    payload.reason,
    payload.message,
    payload.error,
    data?.reason,
    data?.message,
    data?.error,
    data?.status,
    data?.bounce_reason,
    data?.bounceMessage,
    getNestedString(data, ["bounce", "reason"]),
    getNestedString(data, ["bounce", "message"]),
    getNestedString(data, ["complaint", "type"]),
    getNestedString(data, ["suppression", "reason"]),
  ];

  for (const candidate of candidates) {
    const value = getStringValue(candidate);

    if (value && value.toLowerCase() !== eventType) {
      return `${eventType}: ${value}`;
    }
  }

  return eventType;
}

type ResendEventClassification = {
  attemptStatus: NotificationAttemptStatus;
  providerStatus: string;
  resultStatus: "sent" | "failed" | "delayed" | "engagement";
  dispatchStatus: NotificationDispatchStatus | null;
  isFailure: boolean;
  suppressRecipient: boolean;
};

function classifyResendEvent(
  eventType: string,
): ResendEventClassification | null {
  switch (eventType) {
    case "email.sent":
      return {
        attemptStatus: NotificationAttemptStatus.SUCCESS,
        providerStatus: "SENT",
        resultStatus: "sent",
        dispatchStatus: NotificationDispatchStatus.SENT,
        isFailure: false,
        suppressRecipient: false,
      };
    case "email.delivered":
      return {
        attemptStatus: NotificationAttemptStatus.SUCCESS,
        providerStatus: "DELIVERED",
        resultStatus: "sent",
        dispatchStatus: NotificationDispatchStatus.SENT,
        isFailure: false,
        suppressRecipient: false,
      };
    case "email.opened":
      return {
        attemptStatus: NotificationAttemptStatus.SUCCESS,
        providerStatus: "OPENED",
        resultStatus: "engagement",
        dispatchStatus: null,
        isFailure: false,
        suppressRecipient: false,
      };
    case "email.clicked":
      return {
        attemptStatus: NotificationAttemptStatus.SUCCESS,
        providerStatus: "CLICKED",
        resultStatus: "engagement",
        dispatchStatus: null,
        isFailure: false,
        suppressRecipient: false,
      };
    case "email.delivery_delayed":
      return {
        attemptStatus: NotificationAttemptStatus.PENDING,
        providerStatus: "DELIVERY_DELAYED",
        resultStatus: "delayed",
        dispatchStatus: null,
        isFailure: false,
        suppressRecipient: false,
      };
    case "email.bounced":
      return {
        attemptStatus: NotificationAttemptStatus.FAILED,
        providerStatus: "BOUNCED",
        resultStatus: "failed",
        dispatchStatus: NotificationDispatchStatus.FAILED,
        isFailure: true,
        suppressRecipient: false,
      };
    case "email.failed":
      return {
        attemptStatus: NotificationAttemptStatus.FAILED,
        providerStatus: "FAILED",
        resultStatus: "failed",
        dispatchStatus: NotificationDispatchStatus.FAILED,
        isFailure: true,
        suppressRecipient: false,
      };
    case "email.complained":
      return {
        attemptStatus: NotificationAttemptStatus.FAILED,
        providerStatus: "COMPLAINED",
        resultStatus: "failed",
        dispatchStatus: NotificationDispatchStatus.FAILED,
        isFailure: true,
        suppressRecipient: true,
      };
    case "email.suppressed":
      return {
        attemptStatus: NotificationAttemptStatus.FAILED,
        providerStatus: "SUPPRESSED",
        resultStatus: "failed",
        dispatchStatus: NotificationDispatchStatus.FAILED,
        isFailure: true,
        suppressRecipient: true,
      };
    default:
      return null;
  }
}

function getProviderStatusLabel(
  classification: ResendEventClassification,
  reason: string,
) {
  if (!classification.isFailure && classification.resultStatus !== "delayed") {
    return classification.providerStatus;
  }

  return `${classification.providerStatus}: ${reason}`;
}

function uniqueStrings(values: Array<string | null | undefined>) {
  return Array.from(
    new Set(
      values
        .map((value) => value?.trim())
        .filter((value): value is string => Boolean(value)),
    ),
  );
}

export async function handleResendWebhook(payload: Record<string, unknown>) {
  const providerMessageId = extractResendMessageId(payload);
  const eventType = extractResendEventType(payload);
  const classification = classifyResendEvent(eventType);

  if (!providerMessageId) {
    return {
      ok: true,
      ignored: true,
      reason: "Missing provider message id.",
    };
  }

  if (!classification) {
    return {
      ok: true,
      ignored: true,
      reason: `Unhandled Resend event: ${eventType}`,
    };
  }

  const messageEntries = await prisma.messageEntry.findMany({
    where: {
      channel: "EMAIL",
      direction: "OUTBOUND",
      OR: [
        { providerMessageId },
        { resendEmailId: providerMessageId },
      ],
    },
    select: {
      id: true,
      notificationDispatchId: true,
      thread: {
        select: {
          recipientId: true,
        },
      },
    },
  });

  const dispatchIdsFromMessages = uniqueStrings(
    messageEntries.map((entry) => entry.notificationDispatchId),
  );

  const dispatchWhere: Prisma.NotificationDispatchWhereInput[] = [
    {
      provider: "resend",
      providerMessageId,
    },
  ];

  if (dispatchIdsFromMessages.length > 0) {
    dispatchWhere.push({
      id: {
        in: dispatchIdsFromMessages,
      },
    });
  }

  const dispatches = await prisma.notificationDispatch.findMany({
    where: {
      OR: dispatchWhere,
    },
    select: {
      id: true,
      status: true,
      recipientId: true,
      sentAt: true,
    },
  });

  if (dispatches.length === 0 && messageEntries.length === 0) {
    return {
      ok: true,
      ignored: true,
      reason: "No matching dispatch or message entry found.",
    };
  }

  const now = new Date();
  const reason = extractResendEventReason(payload, eventType);
  const providerStatus = getProviderStatusLabel(classification, reason);
  const messageEntryIds = messageEntries.map((entry) => entry.id);
  const recipientIds = uniqueStrings([
    ...dispatches.map((dispatch) => dispatch.recipientId),
    ...messageEntries.map((entry) => entry.thread.recipientId),
  ]);

  await prisma.$transaction(async (tx) => {
    for (const dispatch of dispatches) {
      await tx.notificationAttempt.create({
        data: {
          dispatchId: dispatch.id,
          provider: "resend",
          status: classification.attemptStatus,
          responsePayload: asJsonValue(payload),
          errorMessage:
            classification.isFailure || classification.resultStatus === "delayed"
              ? reason
              : null,
        },
      });

      if (classification.dispatchStatus === NotificationDispatchStatus.FAILED) {
        await tx.notificationDispatch.update({
          where: { id: dispatch.id },
          data: {
            status: NotificationDispatchStatus.FAILED,
            failedAt: now,
            failureReason: reason,
          },
        });
      }

      if (
        classification.dispatchStatus === NotificationDispatchStatus.SENT &&
        ![
          NotificationDispatchStatus.FAILED,
          NotificationDispatchStatus.CANCELLED,
          NotificationDispatchStatus.SKIPPED,
        ].includes(dispatch.status)
      ) {
        await tx.notificationDispatch.update({
          where: { id: dispatch.id },
          data: {
            status: NotificationDispatchStatus.SENT,
            sentAt: dispatch.sentAt ?? now,
          },
        });
      }
    }

    if (messageEntryIds.length > 0) {
      await tx.messageEntry.updateMany({
        where: {
          id: {
            in: messageEntryIds,
          },
        },
        data: {
          provider: "resend",
          providerMessageId,
          providerStatus,
          resendEmailId: providerMessageId,
          resendPayload: asJsonValue(payload),
        },
      });
    }

    if (classification.suppressRecipient && recipientIds.length > 0) {
      await tx.notificationRecipient.updateMany({
        where: {
          id: {
            in: recipientIds,
          },
        },
        data: {
          isSuppressed: true,
          suppressionReason: reason,
        },
      });
    }
  });

  return {
    ok: true,
    updated: true,
    status: classification.resultStatus,
    eventType,
    providerStatus,
    dispatchCount: dispatches.length,
    messageEntryCount: messageEntries.length,
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
