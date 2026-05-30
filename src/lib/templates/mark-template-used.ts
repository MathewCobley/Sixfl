// ========================================
// File: src/lib/templates/mark-template-used.ts
// ========================================

import { prisma } from "@/lib/prisma";

type MarkTemplateUsedInput = {
  templateId?: string | null;
  templateKey?: string | null;
  usedAt?: Date;
};

export async function markTemplateUsed(input: MarkTemplateUsedInput) {
  const templateId = input.templateId?.trim() || null;
  const templateKey = input.templateKey?.trim() || null;
  const usedAt = input.usedAt ?? new Date();

  if (!templateId && !templateKey) {
    return;
  }

  if (templateId) {
    await Promise.all([
      prisma.$executeRaw`
        UPDATE "EmailTemplate"
        SET "lastUsedAt" = ${usedAt}
        WHERE "id" = ${templateId}
      `,
      prisma.$executeRaw`
        UPDATE "NotificationTemplate"
        SET "lastUsedAt" = ${usedAt}
        WHERE "id" = ${templateId}
      `,
    ]);
  }

  if (templateKey) {
    await Promise.all([
      prisma.$executeRaw`
        UPDATE "EmailTemplate"
        SET "lastUsedAt" = ${usedAt}
        WHERE "key" = ${templateKey}
      `,
      prisma.$executeRaw`
        UPDATE "NotificationTemplate"
        SET "lastUsedAt" = ${usedAt}
        WHERE "key" = ${templateKey}
      `,
    ]);
  }
}
