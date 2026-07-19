// ========================================
// File: src/lib/notifications/recipients.ts
// ========================================

import {
  NotificationAudience,
  NotificationRecipientSourceType,
  Prisma,
} from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { normalizePhoneNumber } from "@/lib/notifications/phone";

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
  const value = email?.trim().toLowerCase();
  return value || null;
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
    return existing && existing !== Prisma.JsonNull
      ? (existing as Prisma.InputJsonValue)
      : undefined;
  }

  if (isJsonObject(existing) && isInputJsonObject(incoming)) {
    return {
      ...existing,
      ...incoming,
    } as Prisma.InputJsonObject;
  }

  return incoming;
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
      metadata: true,
    },
  });

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
    metadata: mergeRecipientMetadata(existing?.metadata, input.metadata),
    lastSyncedAt: new Date(),
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
