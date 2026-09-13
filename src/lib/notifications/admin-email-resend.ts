import { NotificationDispatchStatus, Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { getEmailReplyDomain } from "@/lib/resend/client";

const RESEND_SOURCE_TYPE = "ADMIN_EMAIL_RESEND";
const DUPLICATE_GUARD_MS = 5 * 60 * 1000;

function normaliseEmail(value: string | null | undefined) {
  return value?.trim().toLowerCase() || null;
}

function getMetadataRecord(value: Prisma.JsonValue | null) {
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
  originalDispatchId: string;
  expectedRecipientEmail: string;
  createdByUserId: string;
  actorName?: string | null;
}) {
  const originalDispatchId = input.originalDispatchId.trim();
  const createdByUserId = input.createdByUserId.trim();
  const expectedRecipientEmail = normaliseEmail(input.expectedRecipientEmail);

  if (!originalDispatchId || !createdByUserId || !expectedRecipientEmail) {
    throw new Error("The original email and administrator are required.");
  }

  const original = await prisma.notificationDispatch.findUnique({
    where: { id: originalDispatchId },
    include: {
      recipient: {
        include: { preferences: true },
      },
    },
  });

  if (
    !original ||
    original.channel !== "EMAIL" ||
    original.status !== NotificationDispatchStatus.SENT
  ) {
    throw new Error("Only a successfully sent email can be resent.");
  }

  const currentRecipientEmail = normaliseEmail(original.recipient.email);
  if (!currentRecipientEmail || currentRecipientEmail !== expectedRecipientEmail) {
    throw new Error(
      "The recipient email has changed since the original message. Send a new email instead.",
    );
  }

  assertRecipientCanReceiveEmail({
    recipient: original.recipient,
    isTransactional: original.isTransactional,
  });

  // Match the normal notification queue: an outbound email must have a configured
  // SIXFL reply domain before it can be queued.
  getEmailReplyDomain();

  const duplicateSince = new Date(Date.now() - DUPLICATE_GUARD_MS);
  const existing = await prisma.notificationDispatch.findFirst({
    where: {
      sourceType: RESEND_SOURCE_TYPE,
      sourceId: original.id,
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

  const originalMetadata = getMetadataRecord(original.metadata);
  const metadata: Prisma.InputJsonObject = {
    ...originalMetadata,
    origin: "admin_email_resend",
    originLabel: "Resent email",
    actorRole: "ADMIN",
    actorName: input.actorName?.trim() || "SIXFL admin",
    originalDispatchId: original.id,
    ...(original.sourceType ? { originalSourceType: original.sourceType } : {}),
    ...(original.sourceId ? { originalSourceId: original.sourceId } : {}),
  };

  const dispatch = await prisma.notificationDispatch.create({
    data: {
      recipientId: original.recipientId,
      templateId: original.templateId,
      channel: "EMAIL",
      audience: original.audience,
      status: NotificationDispatchStatus.QUEUED,
      isTransactional: original.isTransactional,
      subject: original.subject,
      bodyText: original.bodyText,
      bodyHtml: original.bodyHtml,
      sourceType: RESEND_SOURCE_TYPE,
      sourceId: original.id,
      variables:
        original.variables === null
          ? undefined
          : (original.variables as Prisma.InputJsonValue),
      metadata,
      scheduledFor: new Date(),
      createdByUserId,
    },
  });

  return { dispatch, reused: false };
}
