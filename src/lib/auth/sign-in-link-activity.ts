import { randomUUID } from "node:crypto";

import { prisma } from "@/lib/prisma";

let ensureTablePromise: Promise<void> | null = null;

const SENSITIVE_CALLBACK_PARAMETER =
  /(?:^|_)(?:token|code|secret|key|signature|password|credential)(?:$|_)/i;

function normaliseEmail(value: string) {
  return value.trim().toLowerCase();
}

function trimOptional(value: string | null | undefined, maximumLength = 500) {
  const trimmed = value?.trim();
  return trimmed ? trimmed.slice(0, maximumLength) : null;
}

function describeError(error: unknown) {
  if (error instanceof Error) return error.message.slice(0, 1_000);

  try {
    return JSON.stringify(error).slice(0, 1_000);
  } catch {
    return String(error).slice(0, 1_000);
  }
}

function sanitiseCallbackUrl(value: string | null) {
  if (!value?.trim()) return null;

  try {
    const parsed = new URL(value, "https://sixfl.invalid");

    for (const parameter of Array.from(parsed.searchParams.keys())) {
      if (SENSITIVE_CALLBACK_PARAMETER.test(parameter)) {
        parsed.searchParams.set(parameter, "[redacted]");
      }
    }

    return trimOptional(`${parsed.pathname}${parsed.search}${parsed.hash}`, 2_000);
  } catch {
    return null;
  }
}

function readMagicLinkContext(magicLinkUrl: string) {
  try {
    const parsed = new URL(magicLinkUrl);
    const callbackUrl = parsed.searchParams.get("callbackUrl");

    return {
      linkHost: trimOptional(parsed.host, 255),
      callbackUrl: sanitiseCallbackUrl(callbackUrl),
    };
  } catch {
    return { linkHost: null, callbackUrl: null };
  }
}

export async function ensureSignInLinkActivityTable() {
  if (!ensureTablePromise) {
    ensureTablePromise = (async () => {
      await prisma.$executeRaw`
        CREATE TABLE IF NOT EXISTS "SignInLinkActivity" (
          "id" TEXT NOT NULL,
          "userId" TEXT,
          "emailNormalized" TEXT NOT NULL,
          "userNameSnapshot" TEXT,
          "accountTypeSnapshot" TEXT,
          "teamIdSnapshot" TEXT,
          "teamNameSnapshot" TEXT,
          "callbackUrl" TEXT,
          "linkHost" TEXT,
          "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
          "sentAt" TIMESTAMP(3),
          "usedAt" TIMESTAMP(3),
          "failedAt" TIMESTAMP(3),
          "failureReason" TEXT,
          "providerMessageId" TEXT,
          "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
          "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
          CONSTRAINT "SignInLinkActivity_pkey" PRIMARY KEY ("id")
        )
      `;

      await prisma.$executeRaw`
        CREATE INDEX IF NOT EXISTS "SignInLinkActivity_email_requested_idx"
        ON "SignInLinkActivity" ("emailNormalized", "requestedAt" DESC)
      `;
      await prisma.$executeRaw`
        CREATE INDEX IF NOT EXISTS "SignInLinkActivity_user_requested_idx"
        ON "SignInLinkActivity" ("userId", "requestedAt" DESC)
      `;
      await prisma.$executeRaw`
        CREATE INDEX IF NOT EXISTS "SignInLinkActivity_requested_idx"
        ON "SignInLinkActivity" ("requestedAt" DESC)
      `;
      await prisma.$executeRaw`
        CREATE INDEX IF NOT EXISTS "SignInLinkActivity_used_idx"
        ON "SignInLinkActivity" ("usedAt")
      `;
    })().catch((error) => {
      ensureTablePromise = null;
      throw error;
    });
  }

  await ensureTablePromise;
}

export type StartSignInLinkActivityInput = {
  email: string;
  magicLinkUrl: string;
  userId?: string | null;
  userName?: string | null;
  accountType?: string | null;
  teamId?: string | null;
  teamName?: string | null;
};

export async function startSignInLinkActivity(
  input: StartSignInLinkActivityInput,
): Promise<string | null> {
  const email = normaliseEmail(input.email);
  if (!email) return null;

  const id = randomUUID();
  const linkContext = readMagicLinkContext(input.magicLinkUrl);

  try {
    await ensureSignInLinkActivityTable();
    await prisma.$executeRaw`
      INSERT INTO "SignInLinkActivity" (
        "id",
        "userId",
        "emailNormalized",
        "userNameSnapshot",
        "accountTypeSnapshot",
        "teamIdSnapshot",
        "teamNameSnapshot",
        "callbackUrl",
        "linkHost",
        "requestedAt",
        "createdAt",
        "updatedAt"
      ) VALUES (
        ${id},
        ${trimOptional(input.userId, 255)},
        ${email},
        ${trimOptional(input.userName, 255)},
        ${trimOptional(input.accountType, 100)},
        ${trimOptional(input.teamId, 255)},
        ${trimOptional(input.teamName, 255)},
        ${linkContext.callbackUrl},
        ${linkContext.linkHost},
        NOW(),
        NOW(),
        NOW()
      )
    `;

    return id;
  } catch (error) {
    console.warn("Could not start sign-in link activity record", error);
    return null;
  }
}

export async function markSignInLinkSent(input: {
  activityId: string | null;
  providerMessageId?: string | null;
}) {
  if (!input.activityId) return;

  try {
    await ensureSignInLinkActivityTable();
    await prisma.$executeRaw`
      UPDATE "SignInLinkActivity"
      SET
        "sentAt" = NOW(),
        "providerMessageId" = ${trimOptional(input.providerMessageId, 255)},
        "failureReason" = NULL,
        "failedAt" = NULL,
        "updatedAt" = NOW()
      WHERE "id" = ${input.activityId}
    `;
  } catch (error) {
    console.warn("Could not mark sign-in link as sent", error);
  }
}

export async function markSignInLinkFailed(input: {
  activityId: string | null;
  error: unknown;
}) {
  if (!input.activityId) return;

  try {
    await ensureSignInLinkActivityTable();
    await prisma.$executeRaw`
      UPDATE "SignInLinkActivity"
      SET
        "failedAt" = NOW(),
        "failureReason" = ${describeError(input.error)},
        "updatedAt" = NOW()
      WHERE "id" = ${input.activityId}
    `;
  } catch (error) {
    console.warn("Could not mark sign-in link as failed", error);
  }
}

export async function markLatestSignInLinkUsed(input: {
  email?: string | null;
  userId?: string | null;
}) {
  const email = input.email ? normaliseEmail(input.email) : "";
  if (!email) return;

  try {
    await ensureSignInLinkActivityTable();

    if (input.userId?.trim()) {
      await prisma.$executeRaw`
        WITH candidate AS (
          SELECT "id"
          FROM "SignInLinkActivity"
          WHERE "emailNormalized" = ${email}
            AND "sentAt" IS NOT NULL
            AND "usedAt" IS NULL
            AND "failedAt" IS NULL
            AND "requestedAt" >= NOW() - INTERVAL '48 hours'
          ORDER BY "requestedAt" DESC
          LIMIT 1
        )
        UPDATE "SignInLinkActivity" activity
        SET
          "usedAt" = NOW(),
          "userId" = ${input.userId.trim()},
          "updatedAt" = NOW()
        FROM candidate
        WHERE activity."id" = candidate."id"
      `;
      return;
    }

    await prisma.$executeRaw`
      WITH candidate AS (
        SELECT "id"
        FROM "SignInLinkActivity"
        WHERE "emailNormalized" = ${email}
          AND "sentAt" IS NOT NULL
          AND "usedAt" IS NULL
          AND "failedAt" IS NULL
          AND "requestedAt" >= NOW() - INTERVAL '48 hours'
        ORDER BY "requestedAt" DESC
        LIMIT 1
      )
      UPDATE "SignInLinkActivity" activity
      SET
        "usedAt" = NOW(),
        "updatedAt" = NOW()
      FROM candidate
      WHERE activity."id" = candidate."id"
    `;
  } catch (error) {
    console.warn("Could not mark sign-in link as used", error);
  }
}
