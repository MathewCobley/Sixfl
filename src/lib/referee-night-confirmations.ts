// Referee attendance schema helpers. Automatic booking and reminder delivery
// is owned exclusively by referees/evening-notifications.ts.
import { createHash } from "node:crypto";
import { prisma } from "@/lib/prisma";
export type RefereeNightConfirmationStatus = "PENDING" | "CONFIRMED" | "DECLINED";

let ensuredConfirmationColumns = false;

export function getRefereeNightConfirmationTokenHash(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export async function ensureRefereeNightConfirmationColumns() {
  if (ensuredConfirmationColumns) return;

  await prisma.$executeRawUnsafe(`
    ALTER TABLE "RefereeNight"
      ADD COLUMN IF NOT EXISTS "confirmationStatus" TEXT NOT NULL DEFAULT 'PENDING',
      ADD COLUMN IF NOT EXISTS "confirmationTokenHash" TEXT,
      ADD COLUMN IF NOT EXISTS "confirmationSentAt" TIMESTAMP(3),
      ADD COLUMN IF NOT EXISTS "confirmationLastChasedAt" TIMESTAMP(3),
      ADD COLUMN IF NOT EXISTS "confirmationConfirmedAt" TIMESTAMP(3),
      ADD COLUMN IF NOT EXISTS "confirmationDeclinedAt" TIMESTAMP(3),
      ADD COLUMN IF NOT EXISTS "confirmationResponseNote" TEXT;
  `);

  await prisma.$executeRawUnsafe(`
    CREATE UNIQUE INDEX IF NOT EXISTS "RefereeNight_confirmationTokenHash_key"
      ON "RefereeNight" ("confirmationTokenHash")
      WHERE "confirmationTokenHash" IS NOT NULL;
  `);

  await prisma.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS "RefereeNight_confirmationStatus_nightDate_idx"
      ON "RefereeNight" ("confirmationStatus", "nightDate");
  `);

  ensuredConfirmationColumns = true;
}

