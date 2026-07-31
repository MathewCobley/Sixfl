// ========================================
// File: src/lib/notifications/recipients.ts
// ========================================

import {
  NotificationAudience,
  NotificationRecipientSourceType,
  Prisma,
} from "@prisma/client";
import { normalizeEmailAddress } from "@/lib/notifications/email-health";
import { normalizePhoneNumber } from "@/lib/notifications/phone";
import { prisma } from "@/lib/prisma";

export type UpsertNotificationRecipientInput = {
  sourceType: NotificationRecipientSourceType;
  sourceId?: string | null;
  audience: NotificationAudience;
  displayName?: string | null;
  email?: string | null;
  phone?: string | null;
  marketingEmailOptIn?: boolean;
  marketingSmsOptIn?: boolean;
  transactionalEmailOptIn?: boolean;
  transactionalSmsOptIn?: boolean;
  metadata?: Prisma.InputJsonValue;
};

function normalizeEmail(email?: string | null) {
  return normalizeEmailAddress(email) || null;
}

function normalizePhone(phone?: string | null) {
  return normalizePhoneNumber(phone);
}

function isJsonObject(value: unknown): value is Record<string, Prisma.JsonValue> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function isInputJsonObject(
  value: Prisma.InputJsonValue | undefined,
): value is Prisma.InputJsonObject {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function mergeRecipientMetadata(
  existing: Prisma.JsonValue | null | undefined,
  incoming: Prisma.InputJsonValue | undefined,
): Prisma.InputJsonValue | undefined {
  if (incoming === undefined) {
    if (existing === null || existing === undefined) return undefined;
    return existing as Prisma.InputJsonValue;
  }

  if (isJsonObject(existing) && isInputJsonObject(incoming)) {
    return {
      ...existing,
      ...incoming,
    } as Prisma.InputJsonObject;
  }

  return incoming;
}

function asInputJson(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

function addAutomaticEmailChangeResolution(input: {
  metadata: Prisma.InputJsonValue | undefined;
  recipientId: string;
  oldEmail: string | null;
  newEmail: string;
  resolvedAt: string;
}) {
  const metadata = isInputJsonObject(input.metadata) ? input.metadata : {};
  const existingHistory = Array.isArray(metadata.deliveryIssueHistory)
    ? metadata.deliveryIssueHistory.slice(-19)
    : [];
  const resolution = {
    type: "EMAIL_CHANGED_DURING_SYNC",
    recipientId: input.recipientId,
    oldEmail: input.oldEmail,
    newEmail: input.newEmail,
    resolvedAt: input.resolvedAt,
    resolvedByUserId: null,
    sourceLabel: "source record sync",
    sourceRecordUpdated: true,
    resendSuppressionConfirmed: false,
    retryDispatchId: null,
    retryOfDispatchId: null,
  };

  return asInputJson({
    ...metadata,
    deliveryIssueResolvedAt: input.resolvedAt,
    deliveryIssueResolvedByUserId: null,
    deliveryIssueOldEmail: input.oldEmail,
    deliveryIssueNewEmail: input.newEmail,
    deliveryIssueResolution: resolution,
    deliveryIssueHistory: [...existingHistory, resolution],
  });
}

export async function upsertNotificationRecipient(
  input: UpsertNotificationRecipientInput,
) {
  const sourceId = input.sourceId?.trim() || null;
  const displayName = input.displayName?.trim() || null;
  const email = input.email?.trim() || null;
  const emailNormalized = normalizeEmail(input.email);
  const phoneNormalized = normalizePhone(input.phone);

  const existing = await prisma.notificationRecipient.findFirst({
    where: {
      sourceType: input.sourceType,
      sourceId,
    },
    select: {
      id: true,
      email: true,
      emailNormalized: true,
      isSuppressed: true,
      suppressionReason: true,
      metadata: true,
    },
  });

  const now = new Date();
  const oldEmailNormalized = normalizeEmail(
    existing?.emailNormalized ?? existing?.email,
  );
  const emailChanged = Boolean(
    existing &&
      emailNormalized &&
      oldEmailNormalized !== emailNormalized,
  );
  const mergedMetadata = mergeRecipientMetadata(
    existing?.metadata,
    input.metadata,
  );
  const metadata =
    existing && emailChanged && emailNormalized
      ? addAutomaticEmailChangeResolution({
          metadata: mergedMetadata,
          recipientId: existing.id,
          oldEmail: oldEmailNormalized,
          newEmail: emailNormalized,
          resolvedAt: now.toISOString(),
        })
      : mergedMetadata;

  const recipientData = {
    audience: input.audience,
    displayName,
    email,
    phone: phoneNormalized,
    emailNormalized,
    phoneNormalized,
    marketingEmailOptIn: input.marketingEmailOptIn ?? false,
    marketingSmsOptIn: input.marketingSmsOptIn ?? false,
    transactionalEmailOptIn: input.transactionalEmailOptIn ?? true,
    transactionalSmsOptIn: input.transactionalSmsOptIn ?? true,
    metadata,
    lastSyncedAt: now,
    ...(emailChanged
      ? {
          isSuppressed: false,
          suppressionReason: null,
        }
      : {}),
  };

  const recipient = existing
    ? await prisma.notificationRecipient.update({
        where: { id: existing.id },
        data: recipientData,
      })
    : await prisma.notificationRecipient.create({
        data: {
          sourceType: input.sourceType,
          sourceId,
          ...recipientData,
        },
      });

  await prisma.notificationPreference.upsert({
    where: {
      recipientId: recipient.id,
    },
    update: {},
    create: {
      recipientId: recipient.id,
    },
  });

  return recipient;
}

export async function getNotificationRecipientBySource(input: {
  sourceType: NotificationRecipientSourceType;
  sourceId: string;
}) {
  return prisma.notificationRecipient.findFirst({
    where: {
      sourceType: input.sourceType,
      sourceId: input.sourceId,
    },
    include: {
      preferences: true,
    },
  });
}

export async function getNotificationRecipientById(recipientId: string) {
  return prisma.notificationRecipient.findUnique({
    where: { id: recipientId },
    include: {
      preferences: true,
    },
  });
}
