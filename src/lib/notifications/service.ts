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

function buildQueuedContentFromTemplate(input: {
  template: NotificationTemplate;
  variables?: NotificationTemplateVariables;
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
        body: cleanedBody,
        cta:
          input.template.ctaLabel && ctaUrl
            ? {
                label: input.template.ctaLabel,
                url: ctaUrl,
              }
            : undefined,
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
    const signedTextBody = appendSIXFLTextSignature(renderedBody);

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
        scheduledFor: input.scheduledFor ?? new Date(),
        failureReason: allowed.reason,
        createdByUserId: input.createdByUserId?.trim() || null,
      },
    });
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
      scheduledFor: input.scheduledFor ?? new Date(),
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
        scheduledFor: input.scheduledFor ?? new Date(),
        failureReason: allowed.reason,
        createdByUserId: input.createdByUserId?.trim() || null,
      },
    });
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
      scheduledFor: input.scheduledFor ?? new Date(),
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