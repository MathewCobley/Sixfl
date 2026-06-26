// ========================================
// File: src/lib/referee-nights.ts
// ========================================

import { randomUUID } from "crypto";
import { Prisma } from "@prisma/client";
import { formatDateTimeInLondon, toLondonDateInputValue } from "@/lib/datetime/london";
import { prisma } from "@/lib/prisma";

export type RefereeNightStatus =
  | "DRAFT"
  | "SUBMITTED"
  | "APPROVED"
  | "SETTLED"
  | "REOPENED"
  | "CANCELLED";

export type RefereeNightSummary = {
  id: string;
  refereeId: string;
  refereeName: string | null;
  refereeEmail: string | null;
  leagueId: string;
  leagueName: string;
  leagueSeason: string | null;
  venueId: string | null;
  venueName: string | null;
  nightDate: string;
  feePence: number;
  status: RefereeNightStatus;
  cashCollectedPence: number;
  retainedByRefereePence: number;
  dueToSixflPence: number;
  dueToRefereePence: number;
  refereeNotes: string | null;
  adminNotes: string | null;
  submittedAt: Date | null;
  approvedAt: Date | null;
  settledAt: Date | null;
  fixtureCount: number;
};

export type RefereeNightFixtureView = {
  id: string;
  kickoffAt: Date;
  round: number | null;
  position: number | null;
  pitch: string | null;
  status: string;
  leagueId: string;
  venueId: string | null;
  homeTeam: { id: string; name: string };
  awayTeam: { id: string; name: string };
  result: { homeScore: number; awayScore: number; isDisputed: boolean } | null;
  paymentCharges: Array<{
    id: string;
    teamId: string;
    amountPence: number;
    status: string;
  }>;
};

export type CashByTeam = Record<string, number>;

export function createRefereeNightId() {
  return randomUUID();
}

export function parseMoneyToPence(value: FormDataEntryValue | string | null) {
  const raw = String(value ?? "").replace(/[£,\s]/g, "").trim();
  if (!raw) return null;

  const amount = Number(raw);
  if (!Number.isFinite(amount) || amount < 0) return null;

  return Math.round(amount * 100);
}

export function formatMoney(pence: number | null | undefined) {
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: "GBP",
  }).format((pence ?? 0) / 100);
}

export function formatNightDate(value: string | Date) {
  if (value instanceof Date) {
    return formatDateTimeInLondon(value, {
      weekday: "long",
      day: "2-digit",
      month: "long",
      year: "numeric",
    });
  }

  const [year, month, day] = value.split("-").map(Number);
  const safeDate = new Date(Date.UTC(year, month - 1, day, 12, 0, 0));

  return formatDateTimeInLondon(safeDate, {
    weekday: "long",
    day: "2-digit",
    month: "long",
    year: "numeric",
  });
}

export function formatKickoffTime(value: Date) {
  return formatDateTimeInLondon(value, {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function normaliseRawNight(row: Record<string, unknown>): RefereeNightSummary {
  return {
    id: String(row.id),
    refereeId: String(row.refereeId),
    refereeName: row.refereeName ? String(row.refereeName) : null,
    refereeEmail: row.refereeEmail ? String(row.refereeEmail) : null,
    leagueId: String(row.leagueId),
    leagueName: String(row.leagueName),
    leagueSeason: row.leagueSeason ? String(row.leagueSeason) : null,
    venueId: row.venueId ? String(row.venueId) : null,
    venueName: row.venueName ? String(row.venueName) : null,
    nightDate: toLondonDateInputValue(new Date(String(row.nightDate))),
    feePence: Number(row.feePence ?? 0),
    status: String(row.status ?? "DRAFT") as RefereeNightStatus,
    cashCollectedPence: Number(row.cashCollectedPence ?? 0),
    retainedByRefereePence: Number(row.retainedByRefereePence ?? 0),
    dueToSixflPence: Number(row.dueToSixflPence ?? 0),
    dueToRefereePence: Number(row.dueToRefereePence ?? 0),
    refereeNotes: row.refereeNotes ? String(row.refereeNotes) : null,
    adminNotes: row.adminNotes ? String(row.adminNotes) : null,
    submittedAt: row.submittedAt ? new Date(String(row.submittedAt)) : null,
    approvedAt: row.approvedAt ? new Date(String(row.approvedAt)) : null,
    settledAt: row.settledAt ? new Date(String(row.settledAt)) : null,
    fixtureCount: Number(row.fixtureCount ?? 0),
  };
}

export async function getRefereeNightById(id: string) {
  const rows = await prisma.$queryRaw<Array<Record<string, unknown>>>(Prisma.sql`
    SELECT
      rn.*,
      u.name AS "refereeName",
      u.email AS "refereeEmail",
      l.name AS "leagueName",
      l.season AS "leagueSeason",
      v.name AS "venueName",
      COUNT(rnf.id)::int AS "fixtureCount"
    FROM "RefereeNight" rn
    JOIN "User" u ON u.id = rn."refereeId"
    JOIN "League" l ON l.id = rn."leagueId"
    LEFT JOIN "Venue" v ON v.id = rn."venueId"
    LEFT JOIN "RefereeNightFixture" rnf ON rnf."refereeNightId" = rn.id
    WHERE rn.id = ${id}
    GROUP BY rn.id, u.id, l.id, v.id
    LIMIT 1
  `);

  return rows[0] ? normaliseRawNight(rows[0]) : null;
}

export async function getRefereeNightSummaries(input?: { refereeId?: string }) {
  const refereeFilter = input?.refereeId
    ? Prisma.sql`WHERE rn."refereeId" = ${input.refereeId}`
    : Prisma.empty;

  const rows = await prisma.$queryRaw<Array<Record<string, unknown>>>(Prisma.sql`
    SELECT
      rn.*,
      u.name AS "refereeName",
      u.email AS "refereeEmail",
      l.name AS "leagueName",
      l.season AS "leagueSeason",
      v.name AS "venueName",
      COUNT(rnf.id)::int AS "fixtureCount"
    FROM "RefereeNight" rn
    JOIN "User" u ON u.id = rn."refereeId"
    JOIN "League" l ON l.id = rn."leagueId"
    LEFT JOIN "Venue" v ON v.id = rn."venueId"
    LEFT JOIN "RefereeNightFixture" rnf ON rnf."refereeNightId" = rn.id
    ${refereeFilter}
    GROUP BY rn.id, u.id, l.id, v.id
    ORDER BY rn."nightDate" DESC, l.name ASC, v.name ASC
  `);

  return rows.map(normaliseRawNight);
}

export async function getRefereeNightFixtureIds(refereeNightId: string) {
  const rows = await prisma.$queryRaw<Array<{ fixtureId: string }>>(Prisma.sql`
    SELECT "fixtureId"
    FROM "RefereeNightFixture"
    WHERE "refereeNightId" = ${refereeNightId}
    ORDER BY "createdAt" ASC
  `);

  return rows.map((row) => row.fixtureId);
}

export async function getRefereeNightFixtures(refereeNightId: string) {
  const fixtureIds = await getRefereeNightFixtureIds(refereeNightId);
  if (fixtureIds.length === 0) return [];

  const fixtures = await prisma.fixture.findMany({
    where: {
      id: {
        in: fixtureIds,
      },
    },
    orderBy: [{ kickoffAt: "asc" }, { position: "asc" }],
    select: {
      id: true,
      kickoffAt: true,
      round: true,
      position: true,
      pitch: true,
      status: true,
      leagueId: true,
      venueId: true,
      homeTeam: { select: { id: true, name: true } },
      awayTeam: { select: { id: true, name: true } },
      result: {
        select: {
          homeScore: true,
          awayScore: true,
          isDisputed: true,
        },
      },
      paymentCharges: {
        select: {
          id: true,
          teamId: true,
          amountPence: true,
          status: true,
        },
      },
    },
  });

  return fixtures as RefereeNightFixtureView[];
}

export async function getCashCollectedByTeam(refereeNightId: string) {
  const rows = await prisma.$queryRaw<Array<{ teamId: string; amountPence: bigint }>>(Prisma.sql`
    SELECT "teamId", COALESCE(SUM("amountPence"), 0)::bigint AS "amountPence"
    FROM "PaymentTransaction"
    WHERE "refereeNightId" = ${refereeNightId}
    GROUP BY "teamId"
  `);

  return rows.reduce<CashByTeam>((acc, row) => {
    acc[row.teamId] = Number(row.amountPence ?? 0);
    return acc;
  }, {});
}

export async function getNightCashCollectedPence(refereeNightId: string) {
  const rows = await prisma.$queryRaw<Array<{ total: bigint }>>(Prisma.sql`
    SELECT COALESCE(SUM("amountPence"), 0)::bigint AS total
    FROM "PaymentTransaction"
    WHERE "refereeNightId" = ${refereeNightId}
  `);

  return Number(rows[0]?.total ?? 0);
}

export async function recalculateRefereeNightCashup(refereeNightId: string) {
  const night = await getRefereeNightById(refereeNightId);
  if (!night) return null;

  const collected = await getNightCashCollectedPence(refereeNightId);
  const retainedByReferee = Math.min(collected, night.feePence);
  const dueToSixfl = Math.max(0, collected - night.feePence);
  const dueToReferee = Math.max(0, night.feePence - collected);

  await prisma.$executeRaw(Prisma.sql`
    UPDATE "RefereeNight"
    SET
      "cashCollectedPence" = ${collected},
      "retainedByRefereePence" = ${retainedByReferee},
      "dueToSixflPence" = ${dueToSixfl},
      "dueToRefereePence" = ${dueToReferee},
      "updatedAt" = NOW()
    WHERE id = ${refereeNightId}
  `);

  return {
    collected,
    retainedByReferee,
    dueToSixfl,
    dueToReferee,
  };
}

export async function findFixturesForNight(input: {
  leagueId: string;
  venueId?: string | null;
  nightDate: string;
}) {
  const fixtures = await prisma.fixture.findMany({
    where: {
      leagueId: input.leagueId,
      ...(input.venueId ? { venueId: input.venueId } : {}),
    },
    orderBy: [{ kickoffAt: "asc" }, { position: "asc" }],
    select: {
      id: true,
      kickoffAt: true,
      venueId: true,
    },
  });

  return fixtures.filter(
    (fixture) => toLondonDateInputValue(fixture.kickoffAt) === input.nightDate,
  );
}
