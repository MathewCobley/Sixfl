// ========================================
// File: src/lib/player-pool/storage.ts
// ========================================

import { randomUUID } from "crypto";

import { prisma } from "@/lib/prisma";

let ensurePromise: Promise<void> | null = null;

export const PLAYER_POOL_PROFILE_STATUSES = {
  INVITED: "INVITED",
  AVAILABLE: "AVAILABLE",
  INTRODUCTION_REQUESTED: "INTRODUCTION_REQUESTED",
  TRIAL_ARRANGED: "TRIAL_ARRANGED",
  JOINED: "JOINED",
  PAUSED: "PAUSED",
  NOT_LOOKING: "NOT_LOOKING",
} as const;

export const PLAYER_POOL_REQUEST_STATUSES = {
  REQUESTED: "REQUESTED",
  INTRODUCED: "INTRODUCED",
  JOINED: "JOINED",
  DECLINED: "DECLINED",
  CLOSED: "CLOSED",
} as const;

async function createPlayerPoolTables() {
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "PlayerPoolProfile" (
      "id" TEXT NOT NULL,
      "prospectId" TEXT NOT NULL,
      "leadId" TEXT,
      "profileToken" TEXT NOT NULL,
      "publicCode" TEXT NOT NULL,
      "emailNormalized" TEXT NOT NULL,
      "area" TEXT,
      "leagueId" TEXT,
      "preferredPosition" TEXT,
      "consentShareProfile" BOOLEAN NOT NULL DEFAULT false,
      "consentContact" BOOLEAN NOT NULL DEFAULT false,
      "status" TEXT NOT NULL DEFAULT 'INVITED',
      "invitedAt" TIMESTAMP(3),
      "profileSubmittedAt" TIMESTAMP(3),
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "PlayerPoolProfile_pkey" PRIMARY KEY ("id"),
      CONSTRAINT "PlayerPoolProfile_prospectId_fkey" FOREIGN KEY ("prospectId") REFERENCES "TeamPlayerProspect"("id") ON DELETE CASCADE ON UPDATE CASCADE,
      CONSTRAINT "PlayerPoolProfile_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "InterestLead"("id") ON DELETE SET NULL ON UPDATE CASCADE,
      CONSTRAINT "PlayerPoolProfile_leagueId_fkey" FOREIGN KEY ("leagueId") REFERENCES "League"("id") ON DELETE SET NULL ON UPDATE CASCADE
    )
  `);

  await prisma.$executeRawUnsafe(`
    CREATE UNIQUE INDEX IF NOT EXISTS "PlayerPoolProfile_prospectId_key"
    ON "PlayerPoolProfile"("prospectId")
  `);
  await prisma.$executeRawUnsafe(`
    CREATE UNIQUE INDEX IF NOT EXISTS "PlayerPoolProfile_leadId_key"
    ON "PlayerPoolProfile"("leadId")
    WHERE "leadId" IS NOT NULL
  `);
  await prisma.$executeRawUnsafe(`
    CREATE UNIQUE INDEX IF NOT EXISTS "PlayerPoolProfile_profileToken_key"
    ON "PlayerPoolProfile"("profileToken")
  `);
  await prisma.$executeRawUnsafe(`
    CREATE UNIQUE INDEX IF NOT EXISTS "PlayerPoolProfile_publicCode_key"
    ON "PlayerPoolProfile"("publicCode")
  `);
  await prisma.$executeRawUnsafe(`
    CREATE UNIQUE INDEX IF NOT EXISTS "PlayerPoolProfile_emailNormalized_key"
    ON "PlayerPoolProfile"("emailNormalized")
  `);
  await prisma.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS "PlayerPoolProfile_status_area_idx"
    ON "PlayerPoolProfile"("status", "area")
  `);
  await prisma.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS "PlayerPoolProfile_leagueId_status_idx"
    ON "PlayerPoolProfile"("leagueId", "status")
  `);

  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "PlayerPoolLeaguePreference" (
      "id" TEXT NOT NULL,
      "profileId" TEXT NOT NULL,
      "leagueId" TEXT NOT NULL,
      "availabilityStatus" TEXT NOT NULL DEFAULT 'AVAILABLE',
      "isPrimary" BOOLEAN NOT NULL DEFAULT false,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "PlayerPoolLeaguePreference_pkey" PRIMARY KEY ("id"),
      CONSTRAINT "PlayerPoolLeaguePreference_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "PlayerPoolProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE,
      CONSTRAINT "PlayerPoolLeaguePreference_leagueId_fkey" FOREIGN KEY ("leagueId") REFERENCES "League"("id") ON DELETE CASCADE ON UPDATE CASCADE,
      CONSTRAINT "PlayerPoolLeaguePreference_availabilityStatus_check" CHECK (
        "availabilityStatus" IN ('AVAILABLE', 'MOST_WEEKS', 'SOMETIMES', 'NOT_AVAILABLE')
      )
    )
  `);
  await prisma.$executeRawUnsafe(`
    CREATE UNIQUE INDEX IF NOT EXISTS "PlayerPoolLeaguePreference_profile_league_key"
    ON "PlayerPoolLeaguePreference"("profileId", "leagueId")
  `);
  await prisma.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS "PlayerPoolLeaguePreference_league_status_idx"
    ON "PlayerPoolLeaguePreference"("leagueId", "availabilityStatus")
  `);
  await prisma.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS "PlayerPoolLeaguePreference_profile_primary_idx"
    ON "PlayerPoolLeaguePreference"("profileId", "isPrimary")
  `);
  await prisma.$executeRawUnsafe(`
    INSERT INTO "PlayerPoolLeaguePreference" (
      "id", "profileId", "leagueId", "availabilityStatus", "isPrimary", "createdAt", "updatedAt"
    )
    SELECT
      CONCAT(profile."id", ':', profile."leagueId"),
      profile."id",
      profile."leagueId",
      'AVAILABLE',
      TRUE,
      COALESCE(profile."profileSubmittedAt", profile."createdAt"),
      NOW()
    FROM "PlayerPoolProfile" profile
    WHERE profile."leagueId" IS NOT NULL
    ON CONFLICT ("profileId", "leagueId") DO UPDATE SET
      "isPrimary" = TRUE,
      "updatedAt" = NOW()
  `);

  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "PlayerPoolIntroductionRequest" (
      "id" TEXT NOT NULL,
      "profileId" TEXT NOT NULL,
      "teamId" TEXT NOT NULL,
      "requestedByUserId" TEXT,
      "captainMessage" TEXT,
      "status" TEXT NOT NULL DEFAULT 'REQUESTED',
      "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "introducedAt" TIMESTAMP(3),
      "resolvedAt" TIMESTAMP(3),
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "PlayerPoolIntroductionRequest_pkey" PRIMARY KEY ("id"),
      CONSTRAINT "PlayerPoolIntroductionRequest_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "PlayerPoolProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE,
      CONSTRAINT "PlayerPoolIntroductionRequest_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE CASCADE ON UPDATE CASCADE,
      CONSTRAINT "PlayerPoolIntroductionRequest_requestedByUserId_fkey" FOREIGN KEY ("requestedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE
    )
  `);
  await prisma.$executeRawUnsafe(`
    CREATE UNIQUE INDEX IF NOT EXISTS "PlayerPoolIntroductionRequest_profile_team_key"
    ON "PlayerPoolIntroductionRequest"("profileId", "teamId")
  `);
  await prisma.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS "PlayerPoolIntroductionRequest_team_status_idx"
    ON "PlayerPoolIntroductionRequest"("teamId", "status")
  `);
  await prisma.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS "PlayerPoolIntroductionRequest_status_requested_idx"
    ON "PlayerPoolIntroductionRequest"("status", "requestedAt")
  `);
}

export async function ensurePlayerPoolTables() {
  if (!ensurePromise) {
    ensurePromise = createPlayerPoolTables().catch((error) => {
      ensurePromise = null;
      throw error;
    });
  }

  await ensurePromise;
}

export function cleanPlayerPoolText(value: unknown) {
  const cleaned = String(value ?? "").trim();
  return cleaned || null;
}

export function normalizePlayerPoolEmail(value: unknown) {
  return String(value ?? "").trim().toLowerCase();
}

export function splitPlayerPoolName(value: string) {
  const parts = value.trim().split(/\s+/).filter(Boolean);
  const firstName = parts.shift() || "Player";
  const lastName = parts.length ? parts.join(" ") : null;
  return { firstName, lastName };
}

export function readPlayerPoolStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim())
    .filter(Boolean);
}

export function createPlayerPoolToken() {
  return randomUUID().replace(/-/g, "");
}

export function createPlayerPoolPublicCode() {
  return `PP-${randomUUID().slice(0, 6).toUpperCase()}`;
}

export function createPlayerPoolId() {
  return randomUUID();
}

export function getPlayerPoolBaseUrl() {
  return (process.env.NEXTAUTH_URL || "https://www.sixfl.co.uk").replace(/\/$/, "");
}
