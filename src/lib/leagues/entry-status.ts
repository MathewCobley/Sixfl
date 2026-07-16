// ========================================
// File: src/lib/leagues/entry-status.ts
// ========================================

import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";

type DbClient = typeof prisma | Prisma.TransactionClient;

export type TeamEntryStatus = "OPEN" | "WAITING_LIST" | "CLOSED";
export type PlayerEntryStatus = "OPEN" | "CLOSED";

export type LeagueEntryStatus = {
  leagueId: string;
  teamEntryStatus: TeamEntryStatus;
  playerEntryStatus: PlayerEntryStatus;
};

function normaliseTeamEntryStatus(value: unknown): TeamEntryStatus {
  return value === "WAITING_LIST" || value === "CLOSED" ? value : "OPEN";
}

function normalisePlayerEntryStatus(value: unknown): PlayerEntryStatus {
  return value === "CLOSED" ? "CLOSED" : "OPEN";
}

export async function ensureLeagueEntryStatusColumns(db: DbClient = prisma) {
  await db.$executeRaw(Prisma.sql`
    ALTER TABLE "League"
      ADD COLUMN IF NOT EXISTS "teamEntryStatus" TEXT NOT NULL DEFAULT 'OPEN'
  `);

  await db.$executeRaw(Prisma.sql`
    ALTER TABLE "League"
      ADD COLUMN IF NOT EXISTS "playerEntryStatus" TEXT NOT NULL DEFAULT 'OPEN'
  `);

  await db.$executeRaw(Prisma.sql`
    CREATE INDEX IF NOT EXISTS "League_teamEntryStatus_idx"
      ON "League"("teamEntryStatus")
  `);

  await db.$executeRaw(Prisma.sql`
    CREATE INDEX IF NOT EXISTS "League_playerEntryStatus_idx"
      ON "League"("playerEntryStatus")
  `);
}

export async function getLeagueEntryStatus(leagueId: string, db: DbClient = prisma): Promise<LeagueEntryStatus | null> {
  if (!leagueId) return null;

  await ensureLeagueEntryStatusColumns(db);

  const rows = await db.$queryRaw<Array<{
    leagueId: string;
    teamEntryStatus: string;
    playerEntryStatus: string;
  }>>(Prisma.sql`
    SELECT
      "id" AS "leagueId",
      COALESCE("teamEntryStatus", 'OPEN') AS "teamEntryStatus",
      COALESCE("playerEntryStatus", 'OPEN') AS "playerEntryStatus"
    FROM "League"
    WHERE "id" = ${leagueId}
    LIMIT 1
  `);

  const row = rows[0] ?? null;
  if (!row) return null;

  return {
    leagueId: row.leagueId,
    teamEntryStatus: normaliseTeamEntryStatus(row.teamEntryStatus),
    playerEntryStatus: normalisePlayerEntryStatus(row.playerEntryStatus),
  };
}

export async function getLeagueEntryStatusForLaunch(input: {
  area: string;
  dayOfWeek?: string | null;
  leagueType?: string | null;
  db?: DbClient;
}): Promise<LeagueEntryStatus | null> {
  const area = input.area.trim();
  if (!area) return null;

  const db = input.db ?? prisma;
  await ensureLeagueEntryStatusColumns(db);

  const areaPattern = `%${area}%`;
  const rows = await db.$queryRaw<Array<{
    leagueId: string;
    teamEntryStatus: string;
    playerEntryStatus: string;
  }>>(Prisma.sql`
    SELECT
      "id" AS "leagueId",
      COALESCE("teamEntryStatus", 'OPEN') AS "teamEntryStatus",
      COALESCE("playerEntryStatus", 'OPEN') AS "playerEntryStatus"
    FROM "League"
    WHERE "isActive" = true
      AND (
        LOWER(COALESCE("area", '')) = LOWER(${area})
        OR LOWER("name") LIKE LOWER(${areaPattern})
      )
      AND (${input.dayOfWeek ?? null}::text IS NULL OR "dayOfWeek"::text = ${input.dayOfWeek ?? null})
      AND (${input.leagueType ?? null}::text IS NULL OR "leagueType"::text = ${input.leagueType ?? null})
    ORDER BY "updatedAt" DESC
    LIMIT 1
  `);

  const row = rows[0] ?? null;
  if (!row) return null;

  return {
    leagueId: row.leagueId,
    teamEntryStatus: normaliseTeamEntryStatus(row.teamEntryStatus),
    playerEntryStatus: normalisePlayerEntryStatus(row.playerEntryStatus),
  };
}

export async function setLeagueEntryStatuses(input: {
  leagueId: string;
  teamEntryStatus: TeamEntryStatus;
  playerEntryStatus: PlayerEntryStatus;
  db?: DbClient;
}) {
  const db = input.db ?? prisma;
  await ensureLeagueEntryStatusColumns(db);

  await db.$executeRaw(Prisma.sql`
    UPDATE "League"
    SET
      "teamEntryStatus" = ${input.teamEntryStatus},
      "playerEntryStatus" = ${input.playerEntryStatus},
      "updatedAt" = NOW()
    WHERE "id" = ${input.leagueId}
  `);
}

export function getTeamEntryStatusLabel(status: TeamEntryStatus | null | undefined) {
  if (status === "WAITING_LIST") return "Waiting list only";
  if (status === "CLOSED") return "Team entries closed";
  return "Team entries open";
}

export function getPlayerEntryStatusLabel(status: PlayerEntryStatus | null | undefined) {
  if (status === "CLOSED") return "Player registrations closed";
  return "Player registrations open";
}

export function isTeamEntryRestricted(status: TeamEntryStatus | null | undefined) {
  return status === "WAITING_LIST" || status === "CLOSED";
}
