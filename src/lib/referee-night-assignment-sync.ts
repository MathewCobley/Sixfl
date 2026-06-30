// ========================================
// File: src/lib/referee-night-assignment-sync.ts
// ========================================

import { Prisma } from "@prisma/client";

import {
  createRefereeNightId,
  recalculateRefereeNightCashup,
} from "@/lib/referee-nights";
import { prisma } from "@/lib/prisma";

type RefereeNightAssignmentDbClient = Pick<typeof prisma, "$queryRaw" | "$executeRaw">;

type FixtureAssignmentRow = {
  id: string;
  refereeId: string | null;
  leagueId: string;
  venueId: string | null;
  nightDate: string;
  publishedAt: Date | null;
  status: string;
};

async function getStandardNightFeePence(input: {
  db: RefereeNightAssignmentDbClient;
  refereeId: string;
}) {
  const rows = await input.db.$queryRaw<Array<{ feePence: number | null }>>(Prisma.sql`
    SELECT COALESCE("standardNightFeePence", 0)::int AS "feePence"
    FROM "RefereeProfile"
    WHERE "userId" = ${input.refereeId}
    LIMIT 1
  `);

  return Number(rows[0]?.feePence ?? 0);
}

async function getExistingNightId(input: {
  db: RefereeNightAssignmentDbClient;
  refereeId: string;
  leagueId: string;
  venueId: string | null;
  nightDate: string;
}) {
  const rows = await input.db.$queryRaw<Array<{ id: string }>>(Prisma.sql`
    SELECT id
    FROM "RefereeNight"
    WHERE "refereeId" = ${input.refereeId}
      AND "leagueId" = ${input.leagueId}
      AND "nightDate" = ${input.nightDate}::date
      AND status <> 'CANCELLED'
      AND (
        (${input.venueId}::text IS NULL AND "venueId" IS NULL)
        OR "venueId" = ${input.venueId}
      )
    ORDER BY "createdAt" ASC
    LIMIT 1
  `);

  return rows[0]?.id ?? null;
}

async function createRefereeNight(input: {
  db: RefereeNightAssignmentDbClient;
  refereeId: string;
  leagueId: string;
  venueId: string | null;
  nightDate: string;
  createdByUserId?: string | null;
}) {
  const id = createRefereeNightId();
  const feePence = await getStandardNightFeePence({
    db: input.db,
    refereeId: input.refereeId,
  });

  await input.db.$executeRaw(Prisma.sql`
    INSERT INTO "RefereeNight" (
      "id", "refereeId", "leagueId", "venueId", "nightDate", "feePence", "status", "createdByUserId", "updatedAt"
    ) VALUES (
      ${id}, ${input.refereeId}, ${input.leagueId}, ${input.venueId}, ${input.nightDate}::date, ${feePence}, 'DRAFT', ${input.createdByUserId ?? null}, NOW()
    )
  `);

  return id;
}

async function getOrCreateRefereeNight(input: {
  db: RefereeNightAssignmentDbClient;
  refereeId: string;
  leagueId: string;
  venueId: string | null;
  nightDate: string;
  createdByUserId?: string | null;
}) {
  const existingNightId = await getExistingNightId(input);
  if (existingNightId) return existingNightId;

  return createRefereeNight(input);
}

export async function syncPublishedFixtureRefereeNightAssignment(input: {
  fixtureId: string;
  createdByUserId?: string | null;
  db?: RefereeNightAssignmentDbClient;
}) {
  const db = input.db ?? prisma;

  const fixtureRows = await db.$queryRaw<FixtureAssignmentRow[]>(Prisma.sql`
    SELECT
      id,
      "refereeId",
      "leagueId",
      "venueId",
      ("kickoffAt" AT TIME ZONE 'Europe/London')::date::text AS "nightDate",
      "publishedAt",
      status::text AS status
    FROM "Fixture"
    WHERE id = ${input.fixtureId}
    LIMIT 1
  `);

  const fixture = fixtureRows[0] ?? null;

  const previousRows = await db.$queryRaw<Array<{ refereeNightId: string }>>(Prisma.sql`
    SELECT "refereeNightId"
    FROM "RefereeNightFixture"
    WHERE "fixtureId" = ${input.fixtureId}
  `);
  const affectedNightIds = new Set(previousRows.map((row) => row.refereeNightId));

  if (!fixture || !fixture.refereeId || !fixture.publishedAt || fixture.status === "CANCELLED") {
    await db.$executeRaw(Prisma.sql`
      DELETE FROM "RefereeNightFixture"
      WHERE "fixtureId" = ${input.fixtureId}
    `);

    return Array.from(affectedNightIds);
  }

  const refereeNightId = await getOrCreateRefereeNight({
    db,
    refereeId: fixture.refereeId,
    leagueId: fixture.leagueId,
    venueId: fixture.venueId,
    nightDate: fixture.nightDate,
    createdByUserId: input.createdByUserId,
  });

  affectedNightIds.add(refereeNightId);

  await db.$executeRaw(Prisma.sql`
    INSERT INTO "RefereeNightFixture" ("id", "refereeNightId", "fixtureId")
    VALUES (${createRefereeNightId()}, ${refereeNightId}, ${fixture.id})
    ON CONFLICT ("fixtureId") DO UPDATE
    SET "refereeNightId" = EXCLUDED."refereeNightId"
  `);

  return Array.from(affectedNightIds);
}

export async function syncPublishedFixtureRefereeNightAssignmentAndRecalculate(input: {
  fixtureId: string;
  createdByUserId?: string | null;
}) {
  const affectedNightIds = await syncPublishedFixtureRefereeNightAssignment(input);
  await Promise.all(affectedNightIds.map((nightId) => recalculateRefereeNightCashup(nightId)));
  return affectedNightIds;
}

export async function syncPublishedFixtureRefereeNightAssignmentsAndRecalculate(input: {
  fixtureIds: string[];
  createdByUserId?: string | null;
}) {
  const affectedNightIds = new Set<string>();

  for (const fixtureId of input.fixtureIds) {
    const syncedNightIds = await syncPublishedFixtureRefereeNightAssignment({
      fixtureId,
      createdByUserId: input.createdByUserId,
    });

    syncedNightIds.forEach((nightId) => affectedNightIds.add(nightId));
  }

  await Promise.all(Array.from(affectedNightIds).map((nightId) => recalculateRefereeNightCashup(nightId)));
  return Array.from(affectedNightIds);
}
