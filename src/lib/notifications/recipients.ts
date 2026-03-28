// ========================================
// File: src/lib/notifications/recipients.ts
// ========================================

import {
  NotificationAudience,
  NotificationRecipientSourceType,
  Prisma,
} from "@prisma/client";
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
  const value = email?.trim().toLowerCase();
  return value || null;
}

function normalizePhone(phone?: string | null) {
  const value = phone?.trim().replace(/[^\d+]/g, "");
  return value || null;
}

export async function upsertNotificationRecipient(
  input: UpsertNotificationRecipientInput,
) {
  const sourceId = input.sourceId?.trim() || null;
  const emailNormalized = normalizeEmail(input.email);
  const phoneNormalized = normalizePhone(input.phone);

  const existing = await prisma.notificationRecipient.findFirst({
    where: {
      sourceType: input.sourceType,
      sourceId,
    },
    select: {
      id: true,
    },
  });

  if (existing) {
    return prisma.notificationRecipient.update({
      where: { id: existing.id },
      data: {
        audience: input.audience,
        displayName: input.displayName?.trim() || null,
        email: input.email?.trim() || null,
        phone: input.phone?.trim() || null,
        emailNormalized,
        phoneNormalized,
        marketingEmailOptIn: input.marketingEmailOptIn ?? false,
        marketingSmsOptIn: input.marketingSmsOptIn ?? false,
        transactionalEmailOptIn: input.transactionalEmailOptIn ?? true,
        transactionalSmsOptIn: input.transactionalSmsOptIn ?? true,
        metadata: input.metadata,
        lastSyncedAt: new Date(),
      },
    });
  }

  return prisma.notificationRecipient.create({
    data: {
      sourceType: input.sourceType,
      sourceId,
      audience: input.audience,
      displayName: input.displayName?.trim() || null,
      email: input.email?.trim() || null,
      phone: input.phone?.trim() || null,
      emailNormalized,
      phoneNormalized,
      marketingEmailOptIn: input.marketingEmailOptIn ?? false,
      marketingSmsOptIn: input.marketingSmsOptIn ?? false,
      transactionalEmailOptIn: input.transactionalEmailOptIn ?? true,
      transactionalSmsOptIn: input.transactionalSmsOptIn ?? true,
      metadata: input.metadata,
      lastSyncedAt: new Date(),
      preferences: {
        create: {},
      },
    },
  });
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
