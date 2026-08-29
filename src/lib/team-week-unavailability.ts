// ========================================
// File: src/lib/team-week-unavailability.ts
// ========================================

import { randomUUID } from "crypto";
import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";

const DAY_MS = 24 * 60 * 60 * 1000;

export type TeamWeekUnavailability = {
  id: string;
  teamId: string;
  leagueId: string | null;
  weekStart: Date;
  note: string | null;
  restrictionType: "UNAVAILABLE" | "TIME_RESTRICTION";
  earliestKickoff: string | null;
  latestKickoff: string | null;
  submittedByUserId: string | null;
  createdAt: Date;
  updatedAt: Date;
};

export type TeamWeekUnavailabilityAdminRow = TeamWeekUnavailability & {
  teamName: string;
  leagueName: string | null;
  leagueSeason: string | null;
  divisionName: string | null;
  submittedByName: string | null;
  submittedByEmail: string | null;
};

let ensureTablePromise: Promise<void> | null = null;

export async function ensureTeamWeekUnavailabilityTable() {
  if (!ensureTablePromise) {
    ensureTablePromise = (async () => {
      await prisma.$executeRawUnsafe(`
        CREATE TABLE IF NOT EXISTS "TeamWeekUnavailability" (
          "id" TEXT PRIMARY KEY,
          "teamId" TEXT NOT NULL REFERENCES "Team"("id") ON DELETE CASCADE,
          "leagueId" TEXT REFERENCES "League"("id") ON DELETE SET NULL,
          "weekStart" TIMESTAMP(3) NOT NULL,
          "note" TEXT,
          "restrictionType" TEXT NOT NULL DEFAULT 'UNAVAILABLE',
          "earliestKickoff" TEXT,
          "latestKickoff" TEXT,
          "submittedByUserId" TEXT REFERENCES "User"("id") ON DELETE SET NULL,
          "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
          "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
          CONSTRAINT "TeamWeekUnavailability_teamId_weekStart_key" UNIQUE ("teamId", "weekStart")
        )
      `);
      await prisma.$executeRawUnsafe(`
        ALTER TABLE "TeamWeekUnavailability"
        ADD COLUMN IF NOT EXISTS "restrictionType" TEXT NOT NULL DEFAULT 'UNAVAILABLE'
      `);
      await prisma.$executeRawUnsafe(`
        ALTER TABLE "TeamWeekUnavailability"
        ADD COLUMN IF NOT EXISTS "earliestKickoff" TEXT
      `);
      await prisma.$executeRawUnsafe(`
        ALTER TABLE "TeamWeekUnavailability"
        ADD COLUMN IF NOT EXISTS "latestKickoff" TEXT
      `);
      await prisma.$executeRawUnsafe(`
        CREATE INDEX IF NOT EXISTS "TeamWeekUnavailability_weekStart_idx"
        ON "TeamWeekUnavailability"("weekStart")
      `);
      await prisma.$executeRawUnsafe(`
        CREATE INDEX IF NOT EXISTS "TeamWeekUnavailability_leagueId_weekStart_idx"
        ON "TeamWeekUnavailability"("leagueId", "weekStart")
      `);
    })();
  }

  try {
    await ensureTablePromise;
  } catch (error) {
    ensureTablePromise = null;
    throw error;
  }
}

export function toLondonDateInput(value: Date) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/London",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(value);
  const year = parts.find((part) => part.type === "year")?.value ?? "1970";
  const month = parts.find((part) => part.type === "month")?.value ?? "01";
  const day = parts.find((part) => part.type === "day")?.value ?? "01";
  return `${year}-${month}-${day}`;
}

export function parseDateInput(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export function getWeekStartFromDateInput(value: string) {
  const parsed = parseDateInput(value);
  if (!parsed) return null;
  const mondayOffset = (parsed.getUTCDay() + 6) % 7;
  parsed.setUTCDate(parsed.getUTCDate() - mondayOffset);
  return parsed;
}

export function getWeekStartForDate(value: Date) {
  return getWeekStartFromDateInput(toLondonDateInput(value)) ?? new Date(0);
}

export function getCurrentWeekStart() {
  return getWeekStartForDate(new Date());
}

export function addWeeks(value: Date, weeks: number) {
  return new Date(value.getTime() + weeks * 7 * DAY_MS);
}

export function isMondayWeekStart(value: Date) {
  return value.getUTCDay() === 1;
}

export function formatWeekLabel(value: Date) {
  const end = new Date(value.getTime() + 6 * DAY_MS);
  const startLabel = new Intl.DateTimeFormat("en-GB", {
    timeZone: "UTC",
    weekday: "short",
    day: "2-digit",
    month: "short",
  }).format(value);
  const endLabel = new Intl.DateTimeFormat("en-GB", {
    timeZone: "UTC",
    weekday: "short",
    day: "2-digit",
    month: "short",
  }).format(end);
  return `${startLabel} to ${endLabel}`;
}

export async function listTeamWeekUnavailability(input: {
  teamIds: string[];
  from: Date;
  to: Date;
}) {
  await ensureTeamWeekUnavailabilityTable();
  const teamIds = Array.from(new Set(input.teamIds.filter(Boolean)));
  if (teamIds.length === 0) return [] as TeamWeekUnavailability[];

  return prisma.$queryRaw<TeamWeekUnavailability[]>(Prisma.sql`
    SELECT
      "id",
      "teamId",
      "leagueId",
      "weekStart",
      "note",
      CASE WHEN "restrictionType" = 'TIME_RESTRICTION' THEN 'TIME_RESTRICTION' ELSE 'UNAVAILABLE' END AS "restrictionType",
      "earliestKickoff",
      "latestKickoff",
      "submittedByUserId",
      "createdAt",
      "updatedAt"
    FROM "TeamWeekUnavailability"
    WHERE "teamId" IN (${Prisma.join(teamIds)})
      AND "weekStart" >= ${input.from}
      AND "weekStart" < ${input.to}
    ORDER BY "weekStart" ASC, "updatedAt" DESC
  `);
}

export async function listUpcomingTeamWeekUnavailability(input: {
  from: Date;
  to: Date;
  leagueIds?: string[];
}) {
  await ensureTeamWeekUnavailabilityTable();
  const leagueIds = Array.from(new Set((input.leagueIds ?? []).filter(Boolean)));
  const leagueFilter =
    leagueIds.length > 0
      ? Prisma.sql`AND COALESCE(u."leagueId", t."leagueId") IN (${Prisma.join(leagueIds)})`
      : Prisma.sql``;

  return prisma.$queryRaw<TeamWeekUnavailabilityAdminRow[]>(Prisma.sql`
    SELECT
      u."id",
      u."teamId",
      u."leagueId",
      u."weekStart",
      u."note",
      CASE WHEN u."restrictionType" = 'TIME_RESTRICTION' THEN 'TIME_RESTRICTION' ELSE 'UNAVAILABLE' END AS "restrictionType",
      u."earliestKickoff",
      u."latestKickoff",
      u."submittedByUserId",
      u."createdAt",
      u."updatedAt",
      t."name" AS "teamName",
      l."name" AS "leagueName",
      l."season" AS "leagueSeason",
      d."name" AS "divisionName",
      usr."name" AS "submittedByName",
      usr."email" AS "submittedByEmail"
    FROM "TeamWeekUnavailability" u
    JOIN "Team" t ON t."id" = u."teamId"
    LEFT JOIN "League" l ON l."id" = COALESCE(u."leagueId", t."leagueId")
    LEFT JOIN "LeagueDivision" d ON d."id" = t."divisionId"
    LEFT JOIN "User" usr ON usr."id" = u."submittedByUserId"
    WHERE u."weekStart" >= ${input.from}
      AND u."weekStart" < ${input.to}
      ${leagueFilter}
    ORDER BY u."weekStart" ASC, l."name" ASC, t."name" ASC
  `);
}

export async function upsertTeamWeekUnavailability(input: {
  teamId: string;
  leagueId: string | null;
  weekStart: Date;
  note: string | null;
  restrictionType?: "UNAVAILABLE" | "TIME_RESTRICTION";
  earliestKickoff?: string | null;
  latestKickoff?: string | null;
  submittedByUserId: string | null;
}) {
  await ensureTeamWeekUnavailabilityTable();
  const id = randomUUID();
  const restrictionType = input.restrictionType === "TIME_RESTRICTION" ? "TIME_RESTRICTION" : "UNAVAILABLE";
  const earliestKickoff = restrictionType === "TIME_RESTRICTION" ? input.earliestKickoff ?? null : null;
  const latestKickoff = restrictionType === "TIME_RESTRICTION" ? input.latestKickoff ?? null : null;

  await prisma.$executeRaw(Prisma.sql`
    INSERT INTO "TeamWeekUnavailability" (
      "id",
      "teamId",
      "leagueId",
      "weekStart",
      "note",
      "restrictionType",
      "earliestKickoff",
      "latestKickoff",
      "submittedByUserId",
      "createdAt",
      "updatedAt"
    ) VALUES (
      ${id},
      ${input.teamId},
      ${input.leagueId},
      ${input.weekStart},
      ${input.note},
      ${restrictionType},
      ${earliestKickoff},
      ${latestKickoff},
      ${input.submittedByUserId},
      NOW(),
      NOW()
    )
    ON CONFLICT ("teamId", "weekStart")
    DO UPDATE SET
      "leagueId" = EXCLUDED."leagueId",
      "note" = EXCLUDED."note",
      "restrictionType" = EXCLUDED."restrictionType",
      "earliestKickoff" = EXCLUDED."earliestKickoff",
      "latestKickoff" = EXCLUDED."latestKickoff",
      "submittedByUserId" = EXCLUDED."submittedByUserId",
      "updatedAt" = NOW()
  `);
}

export async function deleteTeamWeekUnavailability(input: {
  teamId: string;
  weekStart: Date;
}) {
  await ensureTeamWeekUnavailabilityTable();
  await prisma.$executeRaw(Prisma.sql`
    DELETE FROM "TeamWeekUnavailability"
    WHERE "teamId" = ${input.teamId}
      AND "weekStart" = ${input.weekStart}
  `);
}
