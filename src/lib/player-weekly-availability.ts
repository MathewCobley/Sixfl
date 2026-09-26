import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

export type PlayerWeeklyAvailabilityStatus =
  | "AVAILABLE"
  | "MAYBE"
  | "UNAVAILABLE"
  | "NO_RESPONSE";

export function toAvailabilityDateKey(value: Date) {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/London",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  return formatter.format(value);
}

export function addDaysToDateKey(dateKey: string, days: number) {
  const value = new Date(`${dateKey}T12:00:00.000Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

export async function getPlayerWeeklyAvailability(input: {
  teamMemberId: string;
  startDate: string;
  endDate: string;
}) {
  return prisma.playerWeeklyAvailability.findMany({
    where: {
      teamMemberId: input.teamMemberId,
      availabilityDate: {
        gte: new Date(`${input.startDate}T00:00:00.000Z`),
        lte: new Date(`${input.endDate}T00:00:00.000Z`),
      },
    },
    orderBy: { availabilityDate: "asc" },
  });
}

export async function savePlayerWeeklyAvailability(input: {
  teamMemberId: string;
  date: string;
  response: PlayerWeeklyAvailabilityStatus;
  note?: string | null;
}) {
  const availabilityDate = new Date(`${input.date}T00:00:00.000Z`);
  return prisma.playerWeeklyAvailability.upsert({
    where: {
      teamMemberId_availabilityDate: {
        teamMemberId: input.teamMemberId,
        availabilityDate,
      },
    },
    update: {
      response: input.response,
      note: input.note?.trim() || null,
      respondedAt: input.response === "NO_RESPONSE" ? null : new Date(),
    },
    create: {
      teamMemberId: input.teamMemberId,
      availabilityDate,
      response: input.response,
      note: input.note?.trim() || null,
      respondedAt: input.response === "NO_RESPONSE" ? null : new Date(),
    },
  });
}

export async function syncWeeklyAvailabilityToPublishedFixtures(input: {
  teamId: string;
  teamMemberId: string;
  date: string;
  response: PlayerWeeklyAvailabilityStatus;
  note?: string | null;
}) {
  const fixtures = await prisma.$queryRaw<Array<{ id: string }>>(Prisma.sql`
    SELECT f.id
    FROM "Fixture" f
    WHERE f."publishedAt" IS NOT NULL
      AND f.status::text IN ('SCHEDULED','POSTPONED')
      AND (f."homeTeamId" = ${input.teamId} OR f."awayTeamId" = ${input.teamId})
      AND (f."kickoffAt" AT TIME ZONE 'Europe/London')::date = ${input.date}::date
  `);

  for (const fixture of fixtures) {
    await prisma.fixtureAvailability.upsert({
      where: {
        fixtureId_teamMemberId: {
          fixtureId: fixture.id,
          teamMemberId: input.teamMemberId,
        },
      },
      update: {
        response: input.response,
        note: input.note?.trim() || null,
        respondedAt: input.response === "NO_RESPONSE" ? null : new Date(),
      },
      create: {
        fixtureId: fixture.id,
        teamMemberId: input.teamMemberId,
        response: input.response,
        note: input.note?.trim() || null,
        respondedAt: input.response === "NO_RESPONSE" ? null : new Date(),
      },
    });
  }
}

export async function backfillFixtureAvailabilityFromWeekly(input: {
  fixtureId: string;
  teamId: string;
  kickoffAt: Date;
  teamMemberIds: string[];
}) {
  if (input.teamMemberIds.length === 0) return;
  const date = toAvailabilityDateKey(input.kickoffAt);
  const rows = await prisma.playerWeeklyAvailability.findMany({
    where: {
      teamMemberId: { in: input.teamMemberIds },
      availabilityDate: new Date(`${date}T00:00:00.000Z`),
      response: { in: ["AVAILABLE", "MAYBE", "UNAVAILABLE"] },
    },
  });

  for (const row of rows) {
    await prisma.fixtureAvailability.upsert({
      where: {
        fixtureId_teamMemberId: {
          fixtureId: input.fixtureId,
          teamMemberId: row.teamMemberId,
        },
      },
      update: {},
      create: {
        fixtureId: input.fixtureId,
        teamMemberId: row.teamMemberId,
        response: row.response,
        note: row.note,
        respondedAt: row.respondedAt ?? new Date(),
      },
    });
  }
}
