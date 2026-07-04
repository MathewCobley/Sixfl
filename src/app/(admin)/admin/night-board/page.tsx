// ========================================
// File: src/app/(admin)/admin/night-board/page.tsx
// ========================================

import Link from "next/link";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { FixtureStatus, PaymentChargeStatus, Prisma, UserRole } from "@prisma/client";

import AdminCard from "@/components/admin/AdminCard";
import { parseLondonDateTime, toLondonTimeInputValue } from "@/lib/datetime/london";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/requireAdmin";
import { createRefereeNightId, recalculateRefereeNightCashup } from "@/lib/referee-nights";
import { getRefereeProfileByUserId } from "@/lib/referees/profile";

import NightBoardFilters from "./NightBoardFilters";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const DEFAULT_MATCH_FEE_PENCE = 4000;
const FIXTURE_STATUS_OPTIONS: FixtureStatus[] = [
  FixtureStatus.SCHEDULED,
  FixtureStatus.POSTPONED,
  FixtureStatus.CANCELLED,
  FixtureStatus.COMPLETED,
];
const NIGHT_BOARD_VISIBLE_STATUSES: readonly FixtureStatus[] = [
  FixtureStatus.SCHEDULED,
  FixtureStatus.COMPLETED,
];

type NightBoardPageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

type FixtureForBoard = Awaited<ReturnType<typeof getFixturesForBoard>>[number];

type BoardWarning = {
  level: "amber" | "red";
  message: string;
};

type SelectOption = {
  value: string;
  label: string;
  description?: string;
};

type NightBoardLeagueOption = {
  id: string;
  name: string;
  season: string | null;
  isActive: boolean;
  nextKickoffAt: Date | null;
  fixtureCount: number;
};

type LeagueBookingCostRow = {
  leagueId: string;
  bookedPitchCount: number | null;
  bookingStartTime: string | null;
  bookingEndTime: string | null;
  pitchCostPerHourOverridePence: number | null;
};

type VenueCostRow = {
  venueId: string;
  defaultPitchCostPerHourPence: number | null;
};

type NightBoardOverrideRow = {
  pitchHirePence: number | null;
  nightPitchCount: number | null;
  nightStartTime: string | null;
  nightEndTime: string | null;
};

type TeamChargeSummary = {
  amountPence: number;
  paidPence: number;
  outstandingPence: number;
  label: string;
  detail: string;
  tone: "paid" | "open" | "missing";
};

function getSearchParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}

function hasSearchParam(params: Record<string, string | string[] | undefined>, key: string) {
  return Object.prototype.hasOwnProperty.call(params, key);
}

function isDateInput(value: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function toLondonDateInput(value: Date) {
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

function todayInputValue() {
  return toLondonDateInput(new Date());
}

function dateRangeFromInput(dateInput: string) {
  const safeDate = isDateInput(dateInput) ? dateInput : todayInputValue();
  const start = new Date(`${safeDate}T00:00:00.000Z`);
  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + 1);
  return { safeDate, start, end };
}

function formatTime(value: Date) {
  return new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "Europe/London" }).format(value);
}

function formatDate(value: Date) {
  return new Intl.DateTimeFormat("en-GB", { weekday: "short", day: "2-digit", month: "short", year: "numeric", timeZone: "Europe/London" }).format(value);
}

function formatMoney(pence: number) {
  return new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" }).format(pence / 100);
}

function formatMoneyInputValue(pence: number | null) {
  if (pence === null) return "";
  return (pence / 100).toFixed(2);
}

function parsePence(value: string, fallback = 0) {
  const trimmed = value.trim();
  if (!trimmed) return fallback;
  const asNumber = Number(trimmed);
  if (!Number.isFinite(asNumber) || asNumber < 0) return fallback;
  return Math.round(asNumber * 100);
}

function parseOptionalPence(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const asNumber = Number(trimmed);
  if (!Number.isFinite(asNumber) || asNumber < 0) return null;
  return Math.round(asNumber * 100);
}

function parseOptionalPositiveInteger(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const parsed = Number(trimmed);
  if (!Number.isInteger(parsed) || parsed < 0) return null;
  return parsed;
}

function parseOptionalTime(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (!/^\d{2}:\d{2}$/.test(trimmed)) return null;
  return trimmed;
}

function parseTimeToMinutes(value: string | null) {
  if (!value) return null;
  const match = /^(\d{2}):(\d{2})$/.exec(value.trim());
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return null;
  return hours * 60 + minutes;
}

function bookingHours(startTime: string | null, endTime: string | null) {
  const start = parseTimeToMinutes(startTime);
  const end = parseTimeToMinutes(endTime);
  if (start === null || end === null) return null;
  let minutes = end - start;
  if (minutes <= 0) minutes += 24 * 60;
  return minutes / 60;
}

function statusClass(status: FixtureStatus) {
  if (status === FixtureStatus.COMPLETED) return "border-emerald-400/25 bg-emerald-500/10 text-emerald-100";
  if (status === FixtureStatus.POSTPONED || status === FixtureStatus.CANCELLED) return "border-red-400/25 bg-red-500/10 text-red-100";
  return "border-white/10 bg-white/[0.04] text-white";
}

function warningClass(level: BoardWarning["level"]) {
  return level === "red" ? "border-red-400/25 bg-red-500/10 text-red-100" : "border-amber-400/25 bg-amber-500/10 text-amber-100";
}

function buildNightBoardReturnTo(input: Record<string, string>) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(input)) {
    const clean = value.trim();
    if (clean) params.set(key, clean);
  }
  const query = params.toString();
  return `/admin/night-board${query ? `?${query}` : ""}`;
}

function buildNightBoardOverrideScopeKey(input: { boardDate: string; leagueId: string; venueId: string }) {
  return `${input.boardDate}::${input.leagueId || "all-leagues"}::${input.venueId || "all-venues"}`;
}

function getSafeReturnTo(formData: FormData) {
  const rawReturnTo = String(formData.get("returnTo") ?? "").trim();
  return rawReturnTo.startsWith("/admin/night-board") ? rawReturnTo : "/admin/night-board";
}

function parseFixtureStatus(value: string) {
  return FIXTURE_STATUS_OPTIONS.includes(value as FixtureStatus) ? (value as FixtureStatus) : FixtureStatus.SCHEDULED;
}

function parseOperationalKickoff(input: { currentKickoffAt: Date; timeInput: string }) {
  const time = input.timeInput.trim();
  if (!/^\d{2}:\d{2}$/.test(time)) return input.currentKickoffAt;
  return parseLondonDateTime(toLondonDateInput(input.currentKickoffAt), time);
}

async function getSavedNightBoardPitchHireOverride(input: { boardDate: string; leagueId: string; venueId: string }) {
  try {
    const rows = await prisma.$queryRaw<NightBoardOverrideRow[]>(Prisma.sql`
      SELECT
        "pitchHirePence"::int AS "pitchHirePence",
        "nightPitchCount"::int AS "nightPitchCount",
        "nightStartTime",
        "nightEndTime"
      FROM "NightBoardOverride"
      WHERE "scopeKey" = ${buildNightBoardOverrideScopeKey(input)}
      LIMIT 1
    `);
    return rows[0] ?? null;
  } catch (error) {
    console.error("Failed to load night board override", error);
    return null;
  }
}

async function saveNightBoardPitchHireOverride(input: { boardDate: string; leagueId: string; venueId: string; pitchHirePence: number | null; nightPitchCount: number | null; nightStartTime: string | null; nightEndTime: string | null }) {
  const scopeKey = buildNightBoardOverrideScopeKey(input);
  const hasAnyOverride = input.pitchHirePence !== null || input.nightPitchCount !== null || input.nightStartTime !== null || input.nightEndTime !== null;
  try {
    if (!hasAnyOverride) {
      await prisma.$executeRaw(Prisma.sql`DELETE FROM "NightBoardOverride" WHERE "scopeKey" = ${scopeKey}`);
      return;
    }
    await prisma.$executeRaw(Prisma.sql`
      INSERT INTO "NightBoardOverride" (
        "scopeKey", "boardDate", "leagueId", "venueId", "pitchHirePence", "nightPitchCount", "nightStartTime", "nightEndTime", "createdAt", "updatedAt"
      ) VALUES (
        ${scopeKey}, ${input.boardDate}, ${input.leagueId || null}, ${input.venueId || null}, ${input.pitchHirePence}, ${input.nightPitchCount}, ${input.nightStartTime}, ${input.nightEndTime}, NOW(), NOW()
      )
      ON CONFLICT ("scopeKey") DO UPDATE
      SET
        "pitchHirePence" = EXCLUDED."pitchHirePence",
        "nightPitchCount" = EXCLUDED."nightPitchCount",
        "nightStartTime" = EXCLUDED."nightStartTime",
        "nightEndTime" = EXCLUDED."nightEndTime",
        "updatedAt" = NOW()
    `);
  } catch (error) {
    console.error("Failed to save night board override", error);
  }
}

async function getExistingRefereeNightAssignments(fixtureId: string) {
  return prisma.$queryRaw<Array<{ refereeNightId: string }>>(Prisma.sql`SELECT "refereeNightId" FROM "RefereeNightFixture" WHERE "fixtureId" = ${fixtureId}`);
}

async function updateNightBoardFixtureMatchAction(formData: FormData) {
  "use server";

  const { user } = await requireAdmin();
  const returnTo = getSafeReturnTo(formData);
  const fixtureId = String(formData.get("fixtureId") ?? "").trim();
  if (!fixtureId) redirect(returnTo);

  const pitch = String(formData.get("pitch") ?? "").trim();
  const refereeId = String(formData.get("refereeId") ?? "").trim();
  const venueId = String(formData.get("venueId") ?? "").trim() || null;
  const kickoffTime = String(formData.get("kickoffTime") ?? "").trim();
  const status = parseFixtureStatus(String(formData.get("status") ?? "").trim());
  const shouldAppearOnNightBoard = NIGHT_BOARD_VISIBLE_STATUSES.includes(status);

  const fixture = await prisma.fixture.findUnique({
    where: { id: fixtureId },
    select: { id: true, leagueId: true, kickoffAt: true },
  });
  if (!fixture) redirect(returnTo);

  const kickoffAt = parseOperationalKickoff({ currentKickoffAt: fixture.kickoffAt, timeInput: kickoffTime });
  const nightDate = toLondonDateInput(kickoffAt);
  const existingAssignments = await getExistingRefereeNightAssignments(fixture.id);
  const affectedNightIds = new Set(existingAssignments.map((row) => row.refereeNightId));
  let targetNightId: string | null = null;
  let validatedRefereeId: string | null = null;
  let refereeNightFeePence = 0;

  if (refereeId && shouldAppearOnNightBoard) {
    const referee = await prisma.user.findFirst({ where: { id: refereeId, role: { in: [UserRole.REFEREE, UserRole.ADMIN] } }, select: { id: true } });
    if (referee) {
      validatedRefereeId = referee.id;
      const profile = await getRefereeProfileByUserId(referee.id);
      refereeNightFeePence = profile?.standardNightFeePence ?? 0;
    }
  }

  await prisma.$transaction(async (tx) => {
    await tx.$executeRaw(Prisma.sql`DELETE FROM "RefereeNightFixture" WHERE "fixtureId" = ${fixture.id}`);

    if (validatedRefereeId) {
      const existingNightRows = await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
        SELECT id
        FROM "RefereeNight"
        WHERE "refereeId" = ${validatedRefereeId}
          AND "leagueId" = ${fixture.leagueId}
          AND "nightDate" = ${nightDate}::date
          AND "venueId" IS NOT DISTINCT FROM ${venueId}
        LIMIT 1
      `);

      targetNightId = existingNightRows[0]?.id ?? null;
      if (!targetNightId) {
        targetNightId = createRefereeNightId();
        await tx.$executeRaw(Prisma.sql`
          INSERT INTO "RefereeNight" (
            "id", "refereeId", "leagueId", "venueId", "nightDate", "feePence", "status", "adminNotes", "createdByUserId", "updatedAt"
          ) VALUES (
            ${targetNightId}, ${validatedRefereeId}, ${fixture.leagueId}, ${venueId}, ${nightDate}::date, ${refereeNightFeePence}, 'DRAFT', ${"Created from Night Board match edit."}, ${user?.id ?? null}, NOW()
          )
        `);
      }

      await tx.$executeRaw(Prisma.sql`
        INSERT INTO "RefereeNightFixture" ("id", "refereeNightId", "fixtureId")
        VALUES (${createRefereeNightId()}, ${targetNightId}, ${fixture.id})
        ON CONFLICT ("fixtureId") DO UPDATE
        SET "refereeNightId" = EXCLUDED."refereeNightId"
      `);
    }

    await tx.fixture.update({
      where: { id: fixture.id },
      data: { kickoffAt, pitch: pitch || null, venueId, refereeId: validatedRefereeId, status },
    });
  });

  if (targetNightId) affectedNightIds.add(targetNightId);
  await Promise.all(Array.from(affectedNightIds).map((nightId) => recalculateRefereeNightCashup(nightId)));

  revalidatePath("/admin/night-board");
  revalidatePath("/admin/fixtures");
  revalidatePath("/admin/referee-nights");
  if (targetNightId) revalidatePath(`/admin/referee-nights/${targetNightId}`);

  redirect(returnTo);
}

async function getUpcomingLeagueOptions(venueId: string): Promise<NightBoardLeagueOption[]> {
  const fixtures = await prisma.fixture.findMany({
    where: { publishedAt: { not: null }, kickoffAt: { gte: new Date() }, status: { in: [...NIGHT_BOARD_VISIBLE_STATUSES] }, ...(venueId ? { venueId } : {}) },
    orderBy: [{ kickoffAt: "asc" }],
    select: { kickoffAt: true, league: { select: { id: true, name: true, season: true, isActive: true } } },
  });

  const byLeague = new Map<string, NightBoardLeagueOption>();
  for (const fixture of fixtures) {
    const existing = byLeague.get(fixture.league.id);
    if (existing) {
      existing.fixtureCount += 1;
      if (!existing.nextKickoffAt || fixture.kickoffAt < existing.nextKickoffAt) existing.nextKickoffAt = fixture.kickoffAt;
      continue;
    }
    byLeague.set(fixture.league.id, { id: fixture.league.id, name: fixture.league.name, season: fixture.league.season, isActive: fixture.league.isActive, nextKickoffAt: fixture.kickoffAt, fixtureCount: 1 });
  }
  return Array.from(byLeague.values()).sort((a, b) => (a.nextKickoffAt?.getTime() ?? Number.MAX_SAFE_INTEGER) - (b.nextKickoffAt?.getTime() ?? Number.MAX_SAFE_INTEGER) || a.name.localeCompare(b.name));
}

async function getUpcomingFixtureNightOptions({ leagueId, venueId }: { leagueId: string; venueId: string }) {
  const fixtures = await prisma.fixture.findMany({
    where: { publishedAt: { not: null }, kickoffAt: { gte: new Date() }, status: { in: [...NIGHT_BOARD_VISIBLE_STATUSES] }, ...(leagueId ? { leagueId } : {}), ...(venueId ? { venueId } : {}) },
    orderBy: [{ kickoffAt: "asc" }],
    take: 160,
    select: { kickoffAt: true, league: { select: { name: true } }, venue: { select: { name: true } } },
  });

  const grouped = new Map<string, { date: Date; count: number; leagues: Set<string>; venues: Set<string> }>();
  for (const fixture of fixtures) {
    const dateKey = toLondonDateInput(fixture.kickoffAt);
    const existing = grouped.get(dateKey) ?? { date: fixture.kickoffAt, count: 0, leagues: new Set<string>(), venues: new Set<string>() };
    existing.count += 1;
    existing.leagues.add(fixture.league.name);
    if (fixture.venue?.name) existing.venues.add(fixture.venue.name);
    grouped.set(dateKey, existing);
  }

  return Array.from(grouped.entries()).slice(0, 24).map(([value, group], index) => ({ value, label: `${index === 0 ? "Next: " : ""}${formatDate(group.date)}`, description: `${group.count} fixture${group.count === 1 ? "" : "s"}${group.venues.size ? ` · ${Array.from(group.venues).slice(0, 2).join(", ")}` : ""}` }));
}

async function getFixturesForBoard({ start, end, leagueId, venueId }: { start: Date; end: Date; leagueId: string; venueId: string }) {
  return prisma.fixture.findMany({
    where: { publishedAt: { not: null }, kickoffAt: { gte: start, lt: end }, status: { in: [...NIGHT_BOARD_VISIBLE_STATUSES] }, ...(leagueId ? { leagueId } : {}), ...(venueId ? { venueId } : {}) },
    orderBy: [{ kickoffAt: "asc" }, { pitch: "asc" }, { position: "asc" }],
    select: {
      id: true,
      leagueId: true,
      venueId: true,
      kickoffAt: true,
      pitch: true,
      status: true,
      matchFeePence: true,
      league: { select: { id: true, name: true, season: true, venueName: true } },
      division: { select: { id: true, name: true } },
      venue: { select: { id: true, name: true } },
      homeTeam: { select: { id: true, name: true } },
      awayTeam: { select: { id: true, name: true } },
      referee: { select: { id: true, name: true, email: true } },
      result: { select: { id: true, homeScore: true, awayScore: true } },
      paymentCharges: { select: { id: true, amountPence: true, status: true, teamId: true, transactions: { select: { amountPence: true } } } },
      captainConfirmations: { select: { id: true, status: true, teamId: true } },
    },
  });
}
