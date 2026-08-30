import { randomUUID } from "node:crypto";

import { prisma } from "@/lib/prisma";

let ensureTablePromise: Promise<void> | null = null;

function normaliseEmail(value: string | null | undefined) {
  const email = value?.trim().toLowerCase();
  return email || null;
}

export async function ensureAuthenticatedReturnVisitTable() {
  if (!ensureTablePromise) {
    ensureTablePromise = (async () => {
      await prisma.$executeRaw`
        CREATE TABLE IF NOT EXISTS "AuthenticatedReturnVisit" (
          "id" TEXT NOT NULL,
          "userId" TEXT NOT NULL,
          "emailNormalized" TEXT,
          "observedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
          "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
          CONSTRAINT "AuthenticatedReturnVisit_pkey" PRIMARY KEY ("id")
        )
      `;

      await prisma.$executeRaw`
        CREATE INDEX IF NOT EXISTS "AuthenticatedReturnVisit_user_observed_idx"
        ON "AuthenticatedReturnVisit" ("userId", "observedAt" DESC)
      `;

      await prisma.$executeRaw`
        CREATE INDEX IF NOT EXISTS "AuthenticatedReturnVisit_email_observed_idx"
        ON "AuthenticatedReturnVisit" ("emailNormalized", "observedAt" DESC)
      `;
    })().catch((error) => {
      ensureTablePromise = null;
      throw error;
    });
  }

  await ensureTablePromise;
}

export async function recordAuthenticatedReturnVisit(input: {
  userId: string;
  email?: string | null;
}) {
  const userId = input.userId.trim();
  const email = normaliseEmail(input.email);
  if (!userId) return { recorded: false as const, reason: "missing-user" as const };

  try {
    await ensureAuthenticatedReturnVisitTable();

    const recentMagicLink = email
      ? await prisma.$queryRaw<Array<{ exists: boolean }>>`
          SELECT EXISTS (
            SELECT 1
            FROM "SignInLinkActivity"
            WHERE "emailNormalized" = ${email}
              AND "sentAt" IS NOT NULL
              AND "requestedAt" >= NOW() - INTERVAL '20 minutes'
          ) AS "exists"
        `
      : [{ exists: false }];

    if (recentMagicLink[0]?.exists) {
      return { recorded: false as const, reason: "recent-magic-link" as const };
    }

    const recentReturn = await prisma.$queryRaw<Array<{ exists: boolean }>>`
      SELECT EXISTS (
        SELECT 1
        FROM "AuthenticatedReturnVisit"
        WHERE "userId" = ${userId}
          AND "observedAt" >= NOW() - INTERVAL '12 hours'
      ) AS "exists"
    `;

    if (recentReturn[0]?.exists) {
      return { recorded: false as const, reason: "throttled" as const };
    }

    await prisma.$executeRaw`
      INSERT INTO "AuthenticatedReturnVisit" (
        "id", "userId", "emailNormalized", "observedAt", "createdAt"
      ) VALUES (
        ${randomUUID()}, ${userId}, ${email}, NOW(), NOW()
      )
    `;

    return { recorded: true as const, reason: "return-session" as const };
  } catch (error) {
    console.warn("Could not record authenticated return visit", error);
    return { recorded: false as const, reason: "error" as const };
  }
}
