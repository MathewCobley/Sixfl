import { NotificationDispatchStatus, Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { getEmailReplyDomain } from "@/lib/resend/client";

const RESEND_SOURCE_TYPE = "ADMIN_EMAIL_RESEND";
const DUPLICATE_GUARD_MS = 5 * 60 * 1000;

function normaliseEmail(value: string | null | undefined) {
  return value?.trim().toLowerCase() || null;
}

function getMetadataRecord(value: Prisma.JsonValue | null | undefined) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {} as Record<string, Prisma.JsonValue>;
  }
  return value as Record<string, Prisma.JsonValue>;
}

function assertRecipientCanReceiveEmail(input: {
  recipient: {
    email: string | null;
    isSuppressed: boolean;
    transactionalEmailOptIn: boolean;
    marketingEmailOptIn: boolean;
    preferences: {
      emailEnabled: boolean;
      marketingEmailEnabled: boolean;
    } | null;
  };
  isTransactional: boolean;
}) {
  if (input.recipient.isSuppressed) {
    throw new Error("Recipient is suppressed.");
  }
  if (!input.recipient.email?.trim()) {
    throw new Error("Recipient has no email address.");
  }
  if (!input.recipient.preferences?.emailEnabled) {
    throw new Error("Recipient email notifications are disabled.");
  }
  if (input.isTransactional) {
    if (!input.recipient.transactionalEmailOptIn) {
      throw new Error("Transactional email is disabled for recipient.");
    }
  } else if (
    !input.recipient.marketingEmailOptIn ||
    !input.recipient.preferences?.marketingEmailEnabled
  ) {
    throw new Error("Marketing email is disabled for recipient.");
  }
}

export async function queueStoredAdminEmailResend(input: {
  messageId: string;
  threadId: string;
  expectedRecipientEmail: string;
  createdByUserId: string;
  actorName?: string | null;
}) {
  const messageId = input.messageId.trim();
  const threadId = input.threadId.trim();
  const createdByUserId = input.createdByUserId.trim();
  const expectedRecipientEmail = normaliseEmail(input.expectedRecipientEmail);

  if (!messageId || !threadId || !createdByUserId || !expectedRecipientEmail) {
    throw new Error("The original email and administrator are required.");
  }

  const message = await prisma.messageEntry.findFirst({
    where: {
      id: messageId,
      threadId,
      channel: "EMAIL",
      direction: "OUTBOUND",
      participantRole: "ADMIN",
    },
    select: {
      id: true,
      subject: true,
      body: true,
      textBody: true,
      htmlBody: true,
      toEmail: true,
      sentAt: true,
      providerStatus: true,
      notificationDispatchId: true,
    },
  });

  if (!message || !message.sentAt || normaliseEmail(message.toEmail) !== expectedRecipientEmail) {
    throw new Error("Only a successfully sent admin email can be resent.");
  }

  const thread = await prisma.messageThread.findUnique({
    where: { id: threadId },
    select: {
      id: true,
      recipientId: true,
      teamId: true,
      leagueId: true,
      contactEmail: true,
      emailNormalized: true,
    },
  });
  if (!thread?.recipientId) {
    throw new Error("This email thread is not linked to a notification recipient.");
  }

  const recipient = await prisma.notificationRecipient.findUnique({
    where: { id: thread.recipientId },
    include: { preferences: true },
  });
  if (!recipient) {
    throw new Error("Notification recipient not found.");
  }

  const currentRecipientEmail = normaliseEmail(recipient.email);
  const currentThreadEmail = normaliseEmail(thread.contactEmail || thread.emailNormalized);
  if (
    !currentRecipientEmail ||
    currentRecipientEmail !== expectedRecipientEmail ||
    (currentThreadEmail && currentThreadEmail !== expectedRecipientEmail)
  ) {
    throw new Error(
      "The recipient email has changed since the original message. Send a new email instead.",
    );
  }

  const originalDispatch = message.notificationDispatchId
    ? await prisma.notificationDispatch.findUnique({
        where: { id: message.notificationDispatchId },
      })
    : null;
  const isTransactional = originalDispatch?.isTransactional ?? true;

  assertRecipientCanReceiveEmail({ recipient, isTransactional });

  // Match the normal notification queue: an outbound email must have a configured
  // SIXFL reply domain before it can be queued.
  getEmailReplyDomain();

  const duplicateSince = new Date(Date.now() - DUPLICATE_GUARD_MS);
  const existing = await prisma.notificationDispatch.findFirst({
    where: {
      sourceType: RESEND_SOURCE_TYPE,
      sourceId: message.id,
      createdByUserId,
      createdAt: { gte: duplicateSince },
      status: {
        in: [
          NotificationDispatchStatus.QUEUED,
          NotificationDispatchStatus.PROCESSING,
          NotificationDispatchStatus.SENT,
        ],
      },
    },
    orderBy: { createdAt: "desc" },
  });

  if (existing) {
    return { dispatch: existing, reused: true };
  }

  const originalMetadata = getMetadataRecord(originalDispatch?.metadata);
  const metadata: Prisma.InputJsonObject = {
    ...originalMetadata,
    origin: "admin_email_resend",
    originLabel: "Resent email",
    actorRole: "ADMIN",
    actorName: input.actorName?.trim() || "SIXFL admin",
    originalMessageId: message.id,
    ...(message.notificationDispatchId
      ? { originalDispatchId: message.notificationDispatchId }
      : {}),
    ...(thread.teamId ? { teamId: thread.teamId } : {}),
    ...(thread.leagueId ? { leagueId: thread.leagueId } : {}),
    threadId: thread.id,
  };

  const dispatch = await prisma.notificationDispatch.create({
    data: {
      recipientId: recipient.id,
      templateId: originalDispatch?.templateId ?? null,
      channel: "EMAIL",
      audience: originalDispatch?.audience ?? recipient.audience,
      status: NotificationDispatchStatus.QUEUED,
      isTransactional,
      subject: message.subject,
      bodyText: message.textBody?.trim() || message.body,
      bodyHtml: message.htmlBody,
      sourceType: RESEND_SOURCE_TYPE,
      sourceId: message.id,
      variables:
        originalDispatch?.variables === null || originalDispatch?.variables === undefined
          ? undefined
          : (originalDispatch.variables as Prisma.InputJsonValue),
      metadata,
      scheduledFor: new Date(),
      createdByUserId,
    },
  });

  return { dispatch, reused: false };
}
