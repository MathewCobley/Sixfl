
// ========================================
// File: src/lib/notifications/service.ts
// ========================================

import {
  NotificationAttemptStatus,
  NotificationAudience,
  NotificationChannel,
  NotificationDispatchStatus,
  NotificationRecipient,
  NotificationTemplate,
  NotificationTemplateKind,
  Prisma,
} from "@prisma/client";
import { prisma } from "@/lib/prisma";
import {
  appendSIXFLTextSignature,
  buildSIXFLEmailHtml,
  type SIXFLEmailBranding,
  type SIXFLPaymentSummary,
} from "@/lib/email/buildEmail";
import { getEmailReplyDomain } from "@/lib/resend/client";
import { getNotificationRecipientById } from "./recipients";
import {
  renderNotificationText,
  type NotificationTemplateVariables,
} from "./renderer";

export type QueueNotificationFromTemplateInput = {
  templateKey: string;
  recipientId: string;
  variables?: NotificationTemplateVariables;
  sourceType?: string | null;
  sourceId?: string | null;
  metadata?: Prisma.InputJsonValue;
  scheduledFor?: Date;
  createdByUserId?: string | null;
  emailBranding?: SIXFLEmailBranding;
  paymentSummary?: SIXFLPaymentSummary;
};

export type QueueDirectNotificationInput = {
  recipientId: string;
  channel: NotificationChannel;
  audience: NotificationAudience;
  subject?: string | null;
  body: string;
  isTransactional?: boolean;
  sourceType?: string | null;
  sourceId?: string | null;
  metadata?: Prisma.InputJsonValue;
  variables?: Prisma.InputJsonValue;
  emailBranding?: SIXFLEmailBranding;
  emailCta?: {
    label: string;
    url: string;
  };
  paymentSummary?: SIXFLPaymentSummary;
  scheduledFor?: Date;
  createdByUserId?: string | null;
};

type ResolvedQueuedContent = {
  subject: string | null;
  bodyText: string;
  bodyHtml: string | null;
};

const SIXFL_SMS_SIGNATURE = "— SIXFL";
const SMS_QUIET_HOURS_START_HOUR = 21;
const SMS_QUIET_HOURS_END_HOUR = 9;
const SMS_QUIET_HOURS_TIME_ZONE = "Europe/London";

function appendSIXFLSmsSignature(body: string) {
  const trimmedBody = body.trim();

  if (!trimmedBody) {
    return SIXFL_SMS_SIGNATURE;
  }

  const withoutExistingSignature = trimmedBody
    .replace(/\n?\n?—\s*SIXFL\s*$/i, "")
    .trim();

  return `${withoutExistingSignature}\n\n${SIXFL_SMS_SIGNATURE}`.trim();
}

function getUkDateParts(value: Date) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: SMS_QUIET_HOURS_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(value);

  const partMap = new Map(parts.map((part) => [part.type, part.value]));

  return {
    year: Number(partMap.get("year")),
    month: Number(partMap.get("month")),
    day: Number(partMap.get("day")),
    hour: Number(partMap.get("hour")),
    minute: Number(partMap.get("minute")),
    second: Number(partMap.get("second")),
  };
}

function getUtcDateForUkLocalTime(input: {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute?: number;
  second?: number;
}) {
  const utcGuess = new Date(
    Date.UTC(
      input.year,
      input.month - 1,
      input.day,
      input.hour,
      input.minute ?? 0,
      input.second ?? 0,
    ),
  );
  const ukPartsForGuess = getUkDateParts(utcGuess);
  const offsetMinutes =
    (Date.UTC(
      ukPartsForGuess.year,
      ukPartsForGuess.month - 1,
      ukPartsForGuess.day,
      ukPartsForGuess.hour,
      ukPartsForGuess.minute,
      ukPartsForGuess.second,
    ) -
      utcGuess.getTime()) /
    60000;

  return new Date(utcGuess.getTime() - offsetMinutes * 60000);
}

function getNextUkDate(input: { year: number; month: number; day: number }) {
  const noonUtc = getUtcDateForUkLocalTime({
    ...input,
    hour: 12,
  });
  const nextDay = new Date(noonUtc.getTime() + 24 * 60 * 60 * 1000);
  const nextDayParts = getUkDateParts(nextDay);

  return {
    year: nextDayParts.year,
    month: nextDayParts.month,
    day: nextDayParts.day,
  };
}

function resolveScheduledFor(input: {
  channel: NotificationChannel;
  scheduledFor?: Date;
}) {
  const requestedDate = input.scheduledFor ?? new Date();

  if (input.channel !== NotificationChannel.SMS) {
    return requestedDate;
  }

  const ukParts = getUkDateParts(requestedDate);

  if (ukParts.hour >= SMS_QUIET_HOURS_START_HOUR) {
    const nextUkDate = getNextUkDate(ukParts);

    return getUtcDateForUkLocalTime({
      ...nextUkDate,
      hour: SMS_QUIET_HOURS_END_HOUR,
    });
  }

  if (ukParts.hour < SMS_QUIET_HOURS_END_HOUR) {
    return getUtcDateForUkLocalTime({
      year: ukParts.year,
      month: ukParts.month,
      day: ukParts.day,
      hour: SMS_QUIET_HOURS_END_HOUR,
    });
  }

  return requestedDate;
}

function resolveEmailCtaUrl(input: {
  ctaUrlKey?: string | null;
  variables?: NotificationTemplateVariables;
}) {
  const key = input.ctaUrlKey?.trim();
  if (!key) return null;

  const rawValue = input.variables?.[key];
  if (!rawValue) return null;

  const url = String(rawValue).trim();
  return url || null;
}

function cleanPlainTextTemplateBody(body: string) {
  return body.replace(/\{\{\s*cta\s*\}\}/gi, "").replace(/\n{3,}/g, "\n\n").trim();
}

function coerceVariables(
  value?: Prisma.InputJsonValue | NotificationTemplateVariables,
): NotificationTemplateVariables {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }

  return value as NotificationTemplateVariables;
}

function ensureEmailRepliesConfigured() {
  getEmailReplyDomain();
}

function buildQueuedContentFromTemplate(input: {
  template: NotificationTemplate;
  variables?: NotificationTemplateVariables;
  emailBranding?: SIXFLEmailBranding;
  paymentSummary?: SIXFLPaymentSummary;
}): ResolvedQueuedContent {
  const renderedSubject = input.template.subject
    ? renderNotificationText(input.template.subject, input.variables)
    : null;

  const renderedBody = renderNotificationText(input.template.body, input.variables);

  if (input.template.channel === NotificationChannel.EMAIL) {
    const cleanedBody = cleanPlainTextTemplateBody(renderedBody);
    const signedTextBody = appendSIXFLTextSignature(cleanedBody);
    const ctaUrl = resolveEmailCtaUrl({
      ctaUrlKey: input.template.ctaUrlKey,
      variables: input.variables,
    });

    return {
      subject: renderedSubject,
      bodyText: signedTextBody,
      bodyHtml: buildSIXFLEmailHtml({
        body: renderedBody,
        branding: input.emailBranding,
        cta:
          input.template.ctaLabel && ctaUrl
            ? {
                label: input.template.ctaLabel,
                url: ctaUrl,
              }
            : undefined,
        payment: input.paymentSummary,
      }),
    };
  }

  return {
    subject: null,
    bodyText: appendSIXFLSmsSignature(renderedBody),
    bodyHtml: null,
  };
}

function buildQueuedContentDirect(input: {
  channel: NotificationChannel;
  subject?: string | null;
  body: string;
  variables?: Prisma.InputJsonValue | NotificationTemplateVariables;
  emailBranding?: SIXFLEmailBranding;
  emailCta?: {
    label: string;
    url: string;
  };
  paymentSummary?: SIXFLPaymentSummary;
}): ResolvedQueuedContent {
  const variables = coerceVariables(input.variables);
  const renderedSubject = input.subject?.trim()
    ? renderNotificationText(input.subject.trim(), variables)
    : null;
  const renderedBody = renderNotificationText(input.body.trim(), variables);

  if (input.channel === NotificationChannel.EMAIL) {
    const ctaLabel = input.emailCta?.label?.trim();
    const ctaUrl = input.emailCta?.url?.trim();
    const ctaText =
      ctaLabel && ctaUrl ? `${ctaLabel}: ${ctaUrl}` : null;

    const plainTextBody = ctaText
      ? /\{\{\s*cta\s*\}\}/i.test(renderedBody)
        ? renderedBody.replace(/\{\{\s*cta\s*\}\}/gi, ctaText).replace(/\n{3,}/g, "\n\n").trim()
        : `${renderedBody}\n\n${ctaText}`.replace(/\n{3,}/g, "\n\n").trim()
      : cleanPlainTextTemplateBody(renderedBody);

    const signedTextBody = appendSIXFLTextSignature(plainTextBody);

    return {
      subject: renderedSubject,
      bodyText: signedTextBody,
      bodyHtml: buildSIXFLEmailHtml({
        body: renderedBody,
        branding: input.emailBranding,
        cta: input.emailCta,
        payment: input.paymentSummary,
      }),
    };
  }

  return {
    subject: null,
    bodyText: appendSIXFLSmsSignature(renderedBody),
    bodyHtml: null,
  };
}

function canQueueForRecipient(input: {
  recipient: Pick<
    NotificationRecipient,
    | "email"
    | "phone"
    | "isSuppressed"
    | "transactionalEmailOptIn"
    | "transactionalSmsOptIn"
    | "marketingEmailOptIn"
    | "marketingSmsOptIn"
  > & {
    preferences?: {
      emailEnabled: boolean;
      smsEnabled: boolean;
      marketingEmailEnabled: boolean;
      marketingSmsEnabled: boolean;
    } | null;
  };
  channel: NotificationChannel;
  isTransactional: boolean;
}) {
  if (input.recipient.isSuppressed) {
    return {
      ok: false,
      reason: "Recipient is suppressed.",
    };
  }

  if (input.channel === NotificationChannel.EMAIL) {
    if (!input.recipient.email?.trim()) {
      return { ok: false, reason: "Recipient has no email address." };
    }

    if (!input.recipient.preferences?.emailEnabled) {
      return { ok: false, reason: "Recipient email notifications are disabled." };
    }

    if (input.isTransactional) {
      if (!input.recipient.transactionalEmailOptIn) {
        return {
          ok: false,
          reason: "Transactional email is disabled for recipient.",
        };
      }
    } else {
      if (
        !input.recipient.marketingEmailOptIn ||
        !input.recipient.preferences?.marketingEmailEnabled
      ) {
        return { ok: false, reason: "Marketing email is disabled for recipient." };
      }
    }
  }

  if (input.channel === NotificationChannel.SMS) {
    if (!input.recipient.phone?.trim()) {
      return { ok: false, reason: "Recipient has no phone number." };
    }

    if (!input.recipient.preferences?.smsEnabled) {
      return { ok: false, reason: "Recipient SMS notifications are disabled." };
    }

    if (input.isTransactional) {
      if (!input.recipient.transactionalSmsOptIn) {
        return {
          ok: false,
          reason: "Transactional SMS is disabled for recipient.",
        };
      }
    } else {
      if (
        !input.recipient.marketingSmsOptIn ||
        !input.recipient.preferences?.marketingSmsEnabled
      ) {
        return { ok: false, reason: "Marketing SMS is disabled for recipient." };
      }
    }
  }

  return { ok: true as const };
}

export async function queueNotificationFromTemplate(
  input: QueueNotificationFromTemplateInput,
) {
  const template = await prisma.notificationTemplate.findUnique({
    where: { key: input.templateKey },
  });

  if (!template || !template.isActive) {
    throw new Error("Notification template not found or inactive.");
  }

  const recipient = await getNotificationRecipientById(input.recipientId);

  if (!recipient) {
    throw new Error("Notification recipient not found.");
  }

  const isTransactional =
    template.kind === NotificationTemplateKind.TRANSACTIONAL;

  const allowed = canQueueForRecipient({
    recipient,
    channel: template.channel,
    isTransactional,
  });

  const rendered = buildQueuedContentFromTemplate({
    template,
    variables: input.variables,
    emailBranding: input.emailBranding,
    paymentSummary: input.paymentSummary,
  });

  const scheduledFor = resolveScheduledFor({
    channel: template.channel,
    scheduledFor: input.scheduledFor,
  });

  if (!allowed.ok) {
    return prisma.notificationDispatch.create({
      data: {
        recipientId: recipient.id,
        templateId: template.id,
        channel: template.channel,
        audience: template.audience,
        status: NotificationDispatchStatus.SKIPPED,
        isTransactional,
        subject: rendered.subject,
        bodyText: rendered.bodyText,
        bodyHtml: rendered.bodyHtml,
        sourceType: input.sourceType?.trim() || null,
        sourceId: input.sourceId?.trim() || null,
        variables: (input.variables ?? {}) as Prisma.InputJsonValue,
        metadata: input.metadata,
        scheduledFor,
        failureReason: allowed.reason,
        createdByUserId: input.createdByUserId?.trim() || null,
      },
    });
  }

  if (template.channel === NotificationChannel.EMAIL) {
    ensureEmailRepliesConfigured();
  }

  return prisma.notificationDispatch.create({
    data: {
      recipientId: recipient.id,
      templateId: template.id,
      channel: template.channel,
      audience: template.audience,
      status: NotificationDispatchStatus.QUEUED,
      isTransactional,
      subject: rendered.subject,
      bodyText: rendered.bodyText,
      bodyHtml: rendered.bodyHtml,
      sourceType: input.sourceType?.trim() || null,
      sourceId: input.sourceId?.trim() || null,
      variables: (input.variables ?? {}) as Prisma.InputJsonValue,
      metadata: input.metadata,
      scheduledFor,
      createdByUserId: input.createdByUserId?.trim() || null,
    },
  });
}

export async function queueDirectNotification(input: QueueDirectNotificationInput) {
  const recipient = await getNotificationRecipientById(input.recipientId);

  if (!recipient) {
    throw new Error("Notification recipient not found.");
  }

  const allowed = canQueueForRecipient({
    recipient,
    channel: input.channel,
    isTransactional: input.isTransactional ?? true,
  });

  const rendered = buildQueuedContentDirect({
    channel: input.channel,
    subject: input.subject,
    body: input.body,
    variables: input.variables,
    emailBranding: input.emailBranding,
    emailCta: input.emailCta,
    paymentSummary: input.paymentSummary,
  });

  const scheduledFor = resolveScheduledFor({
    channel: input.channel,
    scheduledFor: input.scheduledFor,
  });

  if (!allowed.ok) {
    return prisma.notificationDispatch.create({
      data: {
        recipientId: recipient.id,
        channel: input.channel,
        audience: input.audience,
        status: NotificationDispatchStatus.SKIPPED,
        isTransactional: input.isTransactional ?? true,
        subject: rendered.subject,
        bodyText: rendered.bodyText,
        bodyHtml: rendered.bodyHtml,
        sourceType: input.sourceType?.trim() || null,
        sourceId: input.sourceId?.trim() || null,
        variables: input.variables,
        metadata: input.metadata,
        scheduledFor,
        failureReason: allowed.reason,
        createdByUserId: input.createdByUserId?.trim() || null,
      },
    });
  }

  if (input.channel === NotificationChannel.EMAIL) {
    ensureEmailRepliesConfigured();
  }

  return prisma.notificationDispatch.create({
    data: {
      recipientId: recipient.id,
      channel: input.channel,
      audience: input.audience,
      status: NotificationDispatchStatus.QUEUED,
      isTransactional: input.isTransactional ?? true,
      subject: rendered.subject,
      bodyText: rendered.bodyText,
      bodyHtml: rendered.bodyHtml,
      sourceType: input.sourceType?.trim() || null,
      sourceId: input.sourceId?.trim() || null,
      variables: input.variables,
      metadata: input.metadata,
      scheduledFor,
      createdByUserId: input.createdByUserId?.trim() || null,
    },
  });
}

export async function getDueNotificationDispatches(limit = 50) {
  return prisma.notificationDispatch.findMany({
    where: {
      status: NotificationDispatchStatus.QUEUED,
      scheduledFor: {
        lte: new Date(),
      },
    },
    include: {
      recipient: {
        include: {
          preferences: true,
        },
      },
      template: true,
      attempts: {
        orderBy: {
          attemptedAt: "desc",
        },
      },
    },
    orderBy: [{ scheduledFor: "asc" }, { createdAt: "asc" }],
    take: limit,
  });
}

export async function markNotificationDispatchProcessing(dispatchId: string) {
  return prisma.notificationDispatch.update({
    where: { id: dispatchId },
    data: {
      status: NotificationDispatchStatus.PROCESSING,
      processedAt: new Date(),
    },
  });
}

export async function markNotificationDispatchSent(input: {
  dispatchId: string;
  provider: string;
  providerMessageId?: string | null;
  responsePayload?: Prisma.InputJsonValue;
}) {
  return prisma.$transaction(async (tx) => {
    await tx.notificationAttempt.create({
      data: {
        dispatchId: input.dispatchId,
        provider: input.provider,
        status: NotificationAttemptStatus.SUCCESS,
        responsePayload: input.responsePayload,
      },
    });

    return tx.notificationDispatch.update({
      where: { id: input.dispatchId },
      data: {
        status: NotificationDispatchStatus.SENT,
        provider: input.provider,
        providerMessageId: input.providerMessageId?.trim() || null,
        sentAt: new Date(),
        failureReason: null,
      },
    });
  });
}

export async function markNotificationDispatchFailed(input: {
  dispatchId: string;
  provider: string;
  errorMessage: string;
  requestPayload?: Prisma.InputJsonValue;
  responsePayload?: Prisma.InputJsonValue;
}) {
  return prisma.$transaction(async (tx) => {
    await tx.notificationAttempt.create({
      data: {
        dispatchId: input.dispatchId,
        provider: input.provider,
        status: NotificationAttemptStatus.FAILED,
        requestPayload: input.requestPayload,
        responsePayload: input.responsePayload,
        errorMessage: input.errorMessage,
      },
    });

    return tx.notificationDispatch.update({
      where: { id: input.dispatchId },
      data: {
        status: NotificationDispatchStatus.FAILED,
        failedAt: new Date(),
        failureReason: input.errorMessage,
        provider: input.provider,
      },
    });
  });
}

export async function markNotificationDispatchCancelled(
  dispatchId: string,
  reason?: string,
) {
  return prisma.notificationDispatch.update({
    where: { id: dispatchId },
    data: {
      status: NotificationDispatchStatus.CANCELLED,
      cancelledAt: new Date(),
      failureReason: reason?.trim() || null,
    },
  });
}
