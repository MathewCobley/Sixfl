// ========================================
// File: src/lib/referees/profile.ts
// ========================================

import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { normalizePhoneNumber } from "@/lib/notifications/phone";

export type RefereeProfileRecord = {
  userId: string;
  phone: string | null;
  phoneNormalized: string | null;
  standardNightFeePence: number;
  notes: string | null;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
};

let ensuredRefereeProfileTable = false;

export async function ensureRefereeProfileTable() {
  if (ensuredRefereeProfileTable) return;

  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "RefereeProfile" (
      "userId" TEXT PRIMARY KEY,
      "phone" TEXT,
      "phoneNormalized" TEXT,
      "standardNightFeePence" INTEGER NOT NULL DEFAULT 0,
      "notes" TEXT,
      "isActive" BOOLEAN NOT NULL DEFAULT TRUE,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "RefereeProfile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
    );
  `);

  await prisma.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS "RefereeProfile_isActive_idx" ON "RefereeProfile"("isActive");
  `);

  await prisma.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS "RefereeProfile_phoneNormalized_idx" ON "RefereeProfile"("phoneNormalized");
  `);

  ensuredRefereeProfileTable = true;
}

export function parseMoneyToPence(value: string) {
  const cleaned = value.replace(/[£,\s]/g, "").trim();

  if (!cleaned) return 0;
  if (!/^\d+(\.\d{1,2})?$/.test(cleaned)) return null;

  const pence = Math.round(Number(cleaned) * 100);

  if (!Number.isFinite(pence) || pence < 0 || pence > 100000) {
    return null;
  }

  return pence;
}

export function formatPenceAsPoundsInput(value?: number | null) {
  const amount = value ?? 0;
  if (!amount) return "";
  return (amount / 100).toFixed(amount % 100 === 0 ? 0 : 2);
}

export function formatMoney(value?: number | null) {
  const amount = value ?? 0;

  if (!amount) return "—";

  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: "GBP",
  }).format(amount / 100);
}

export async function getRefereeProfileByUserId(userId: string) {
  await ensureRefereeProfileTable();

  const rows = await prisma.$queryRaw<RefereeProfileRecord[]>`
    SELECT
      "userId",
      "phone",
      "phoneNormalized",
      "standardNightFeePence",
      "notes",
      "isActive",
      "createdAt",
      "updatedAt"
    FROM "RefereeProfile"
    WHERE "userId" = ${userId}
    LIMIT 1
  `;

  return rows[0] ?? null;
}

export async function getRefereeProfilesByUserIds(userIds: string[]) {
  await ensureRefereeProfileTable();

  const ids = userIds.map((id) => id.trim()).filter(Boolean);

  if (ids.length === 0) {
    return new Map<string, RefereeProfileRecord>();
  }

  const rows = await prisma.$queryRaw<RefereeProfileRecord[]>`
    SELECT
      "userId",
      "phone",
      "phoneNormalized",
      "standardNightFeePence",
      "notes",
      "isActive",
      "createdAt",
      "updatedAt"
    FROM "RefereeProfile"
    WHERE "userId" IN (${Prisma.join(ids)})
  `;

  return new Map(rows.map((row) => [row.userId, row]));
}

export async function upsertRefereeProfile(input: {
  userId: string;
  phone?: string | null;
  standardNightFeePence?: number | null;
  notes?: string | null;
  isActive?: boolean;
}) {
  await ensureRefereeProfileTable();

  const phone = input.phone?.trim() || null;
  const phoneNormalized = normalizePhoneNumber(phone);
  const standardNightFeePence = Math.max(0, input.standardNightFeePence ?? 0);
  const notes = input.notes?.trim() || null;
  const isActive = input.isActive ?? true;

  const rows = await prisma.$queryRaw<RefereeProfileRecord[]>`
    INSERT INTO "RefereeProfile" (
      "userId",
      "phone",
      "phoneNormalized",
      "standardNightFeePence",
      "notes",
      "isActive",
      "createdAt",
      "updatedAt"
    )
    VALUES (
      ${input.userId},
      ${phone},
      ${phoneNormalized},
      ${standardNightFeePence},
      ${notes},
      ${isActive},
      NOW(),
      NOW()
    )
    ON CONFLICT ("userId") DO UPDATE SET
      "phone" = EXCLUDED."phone",
      "phoneNormalized" = EXCLUDED."phoneNormalized",
      "standardNightFeePence" = EXCLUDED."standardNightFeePence",
      "notes" = EXCLUDED."notes",
      "isActive" = EXCLUDED."isActive",
      "updatedAt" = NOW()
    RETURNING
      "userId",
      "phone",
      "phoneNormalized",
      "standardNightFeePence",
      "notes",
      "isActive",
      "createdAt",
      "updatedAt"
  `;

  return rows[0] ?? null;
}
