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
};

type TeamChargeSummary = {
  hasCharge: boolean;
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
  return new Intl.DateTimeFormat("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "Europe/London",
  }).format(value);
}

function formatDate(value: Date) {
  return new Intl.DateTimeFormat("en-GB", {
    weekday: "short",
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: "Europe/London",
  }).format(value);
}

function formatMoney(pence: number) {
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: "GBP",
  }).format(pence / 100);
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
  return level === "red"
    ? "border-red-400/25 bg-red-500/10 text-red-100"
    : "border-amber-400/25 bg-amber-500/10 text-amber-100";
}

function chargeClass(tone: TeamChargeSummary["tone"]) {
  if (tone === "paid") return "border-emerald-400/25 bg-emerald-500/10 text-emerald-100";
  if (tone === "missing") return "border-amber-400/25 bg-amber-500/10 text-amber-100";
  return "border-red-400/25 bg-red-500/10 text-red-100";
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
  return FIXTURE_STATUS_OPTIONS.includes(value as FixtureStatus)
    ? (value as FixtureStatus)
    : FixtureStatus.SCHEDULED;
}

function parseOperationalKickoff(input: { currentKickoffAt: Date; timeInput: string }) {
  const time = input.timeInput.trim();
  if (!/^\d{2}:\d{2}$/.test(time)) return input.currentKickoffAt;
  return parseLondonDateTime(toLondonDateInput(input.currentKickoffAt), time);
}

function getTeamChargeSummary(fixture: FixtureForBoard, teamId: string): TeamChargeSummary {
  const charges = fixture.paymentCharges.filter(
    (charge) => charge.teamId === teamId && charge.status !== PaymentChargeStatus.VOID,
  );

  if (charges.length === 0) {
    const expectedPence = fixture.matchFeePence ?? DEFAULT_MATCH_FEE_PENCE;
    return {
      hasCharge: false,
      amountPence: expectedPence,
      paidPence: 0,
      outstandingPence: expectedPence,
      label: "Missing charge",
      detail: `Expected ${formatMoney(expectedPence)}`,
      tone: "missing",
    };
  }

  const amountPence = charges.reduce((total, charge) => total + charge.amountPence, 0);
  const paidPence = charges.reduce(
    (total, charge) => total + charge.transactions.reduce((sum, transaction) => sum + transaction.amountPence, 0),
    0,
  );
  const outstandingPence = Math.max(0, amountPence - paidPence);
  const isPaid = outstandingPence === 0 || charges.every((charge) => charge.status === PaymentChargeStatus.PAID);

  return {
    hasCharge: true,
    amountPence,
    paidPence,
    outstandingPence,
    label: isPaid ? "Paid" : `Due ${formatMoney(outstandingPence)}`,
    detail: `Charge ${formatMoney(amountPence)} · Paid ${formatMoney(paidPence)}`,
    tone: isPaid ? "paid" : "open",
  };
}

function TeamChargeBadge({ label, teamName, summary }: { label: string; teamName: string; summary: TeamChargeSummary }) {
  return (
    <div className={`rounded-xl border px-3 py-2 text-xs ${chargeClass(summary.tone)}`}>
      <div className="flex items-center justify-between gap-3">
        <span className="font-semibold text-white/80">{label}: {teamName}</span>
        <span className="shrink-0 font-semibold">{summary.label}</span>
      </div>
      <div className="mt-1 text-[11px] text-white/55">{summary.detail}</div>
    </div>
  );
}

async function getSavedNightBoardPitchHireOverride(input: { boardDate: string; leagueId: string; venueId: string }) {
  try {
    const rows = await prisma.$queryRaw<NightBoardOverrideRow[]>(Prisma.sql`
      SELECT "pitchHirePence"::int AS "pitchHirePence"
      FROM "NightBoardOverride"
      WHERE "scopeKey" = ${buildNightBoardOverrideScopeKey(input)}
      LIMIT 1
    `);
    return rows[0]?.pitchHirePence ?? null;
  } catch (error) {
    console.error("Failed to load night board override", error);
    return null;
  }
}

async function saveNightBoardPitchHireOverride(input: { boardDate: string; leagueId: string; venueId: string; pitchHirePence: number | null }) {
  const scopeKey = buildNightBoardOverrideScopeKey(input);

  try {
    if (input.pitchHirePence === null) {
      await prisma.$executeRaw(Prisma.sql`DELETE FROM "NightBoardOverride" WHERE "scopeKey" = ${scopeKey}`);
      return;
    }

    await prisma.$executeRaw(Prisma.sql`
      INSERT INTO "NightBoardOverride" (
        "scopeKey", "boardDate", "leagueId", "venueId", "pitchHirePence", "createdAt", "updatedAt"
      ) VALUES (
        ${scopeKey}, ${input.boardDate}, ${input.leagueId || null}, ${input.venueId || null}, ${input.pitchHirePence}, NOW(), NOW()
      )
      ON CONFLICT ("scopeKey") DO UPDATE
      SET "pitchHirePence" = EXCLUDED."pitchHirePence", "updatedAt" = NOW()
    `);
  } catch (error) {
    console.error("Failed to save night board override", error);
  }
}

async function getExistingRefereeNightAssignments(fixtureId: string) {
  return prisma.$queryRaw<Array<{ refereeNightId: string }>>(Prisma.sql`
    SELECT "refereeNightId"
    FROM "RefereeNightFixture"
    WHERE "fixtureId" = ${fixtureId}
  `);
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

  if (refereeId) {
    const referee = await prisma.user.findFirst({
      where: { id: refereeId, role: { in: [UserRole.REFEREE, UserRole.ADMIN] } },
      select: { id: true },
    });

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
    where: { publishedAt: { not: null }, kickoffAt: { gte: new Date() }, ...(venueId ? { venueId } : {}) },
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
    byLeague.set(fixture.league.id, { ...fixture.league, nextKickoffAt: fixture.kickoffAt, fixtureCount: 1 });
  }

  return Array.from(byLeague.values()).sort((a, b) => {
    const aTime = a.nextKickoffAt?.getTime() ?? Number.MAX_SAFE_INTEGER;
    const bTime = b.nextKickoffAt?.getTime() ?? Number.MAX_SAFE_INTEGER;
    return aTime - bTime || a.name.localeCompare(b.name);
  });
}

async function getUpcomingFixtureNightOptions({ leagueId, venueId }: { leagueId: string; venueId: string }) {
  const fixtures = await prisma.fixture.findMany({
    where: { publishedAt: { not: null }, kickoffAt: { gte: new Date() }, ...(leagueId ? { leagueId } : {}), ...(venueId ? { venueId } : {}) },
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

  return Array.from(grouped.entries()).slice(0, 24).map(([value, group], index) => ({
    value,
    label: `${index === 0 ? "Next: " : ""}${formatDate(group.date)}`,
    description: `${group.count} fixture${group.count === 1 ? "" : "s"}${group.venues.size ? ` · ${Array.from(group.venues).slice(0, 2).join(", ")}` : ""}`,
  }));
}

async function getFixturesForBoard({ start, end, leagueId, venueId }: { start: Date; end: Date; leagueId: string; venueId: string }) {
  return prisma.fixture.findMany({
    where: { publishedAt: { not: null }, kickoffAt: { gte: start, lt: end }, ...(leagueId ? { leagueId } : {}), ...(venueId ? { venueId } : {}) },
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

function buildWarnings(fixtures: FixtureForBoard[]) {
  const warnings: BoardWarning[] = [];
  const pitchTime = new Map<string, FixtureForBoard[]>();
  const refTime = new Map<string, FixtureForBoard[]>();
  const teamTime = new Map<string, FixtureForBoard[]>();

  for (const fixture of fixtures) {
    const time = fixture.kickoffAt.toISOString();
    const pitch = fixture.pitch?.trim();
    if (!pitch) warnings.push({ level: "amber", message: `${formatTime(fixture.kickoffAt)} ${fixture.homeTeam.name} v ${fixture.awayTeam.name} has no pitch.` });
    if (!fixture.referee) warnings.push({ level: "red", message: `${formatTime(fixture.kickoffAt)} ${fixture.homeTeam.name} v ${fixture.awayTeam.name} has no referee.` });
    if (!fixture.venue && !fixture.league.venueName) warnings.push({ level: "amber", message: `${formatTime(fixture.kickoffAt)} ${fixture.homeTeam.name} v ${fixture.awayTeam.name} has no venue.` });
    if (pitch) pitchTime.set(`${time}__${pitch.toLowerCase()}`, [...(pitchTime.get(`${time}__${pitch.toLowerCase()}`) ?? []), fixture]);
    if (fixture.referee?.id) refTime.set(`${time}__${fixture.referee.id}`, [...(refTime.get(`${time}__${fixture.referee.id}`) ?? []), fixture]);
    for (const teamId of [fixture.homeTeam.id, fixture.awayTeam.id]) teamTime.set(`${time}__${teamId}`, [...(teamTime.get(`${time}__${teamId}`) ?? []), fixture]);
  }

  for (const matches of pitchTime.values()) if (matches.length > 1) warnings.push({ level: "red", message: `${formatTime(matches[0].kickoffAt)} has ${matches.length} matches on ${matches[0].pitch}.` });
  for (const matches of refTime.values()) if (matches.length > 1) warnings.push({ level: "red", message: `${matches[0].referee?.name ?? matches[0].referee?.email ?? "A referee"} has ${matches.length} matches at ${formatTime(matches[0].kickoffAt)}.` });
  for (const matches of teamTime.values()) if (matches.length > 1) warnings.push({ level: "red", message: `A team is double-booked at ${formatTime(matches[0].kickoffAt)}.` });
  return warnings;
}

function getBoardGroups(fixtures: FixtureForBoard[]) {
  const pitchNames = Array.from(new Set(fixtures.map((fixture) => fixture.pitch?.trim() || "No pitch"))).sort((a, b) => a.localeCompare(b));
  const timeLabels = Array.from(new Set(fixtures.map((fixture) => formatTime(fixture.kickoffAt))));
  const fixtureByTimePitch = new Map<string, FixtureForBoard[]>();
  for (const fixture of fixtures) {
    const key = `${formatTime(fixture.kickoffAt)}__${fixture.pitch?.trim() || "No pitch"}`;
    fixtureByTimePitch.set(key, [...(fixtureByTimePitch.get(key) ?? []), fixture]);
  }
  return { pitchNames, timeLabels, fixtureByTimePitch };
}

function getRefereeRows(fixtures: FixtureForBoard[], refFeePence: number) {
  const rows = new Map<string, { name: string; email: string | null; pitchNames: Set<string>; fixtures: FixtureForBoard[] }>();
  for (const fixture of fixtures) {
    if (!fixture.referee?.id) continue;
    const existing = rows.get(fixture.referee.id) ?? { name: fixture.referee.name || fixture.referee.email || "Unnamed referee", email: fixture.referee.email, pitchNames: new Set<string>(), fixtures: [] };
    existing.fixtures.push(fixture);
    existing.pitchNames.add(fixture.pitch?.trim() || "No pitch");
    rows.set(fixture.referee.id, existing);
  }
  return Array.from(rows.values()).map((row) => ({ ...row, pitchList: Array.from(row.pitchNames).sort().join(", "), firstKickoff: row.fixtures[0]?.kickoffAt ?? null, lastKickoff: row.fixtures[row.fixtures.length - 1]?.kickoffAt ?? null, feePence: row.fixtures.length * refFeePence }));
}

function getFinance(fixtures: FixtureForBoard[], refFeePence: number, pitchHirePence: number) {
  const expectedTeamIds = new Set<string>();
  const chargedTeamIds = new Set<string>();
  const uniqueRefedFixtures = fixtures.filter((fixture) => fixture.referee?.id).length;
  let chargesCreatedPence = 0;
  let paidPence = 0;
  let openCharges = 0;
  let chargeCount = 0;
  let defaultFeePence = DEFAULT_MATCH_FEE_PENCE;

  for (const fixture of fixtures) {
    expectedTeamIds.add(fixture.homeTeam.id);
    expectedTeamIds.add(fixture.awayTeam.id);
    if (fixture.matchFeePence && fixture.matchFeePence > 0) defaultFeePence = fixture.matchFeePence;
    for (const charge of fixture.paymentCharges) {
      if (charge.status === PaymentChargeStatus.VOID) continue;
      chargeCount += 1;
      chargedTeamIds.add(charge.teamId);
      chargesCreatedPence += charge.amountPence;
      if (charge.status === PaymentChargeStatus.OPEN || charge.status === PaymentChargeStatus.PART_PAID) openCharges += 1;
      paidPence += charge.transactions.reduce((total, transaction) => total + transaction.amountPence, 0);
    }
  }

  const expectedChargeCount = expectedTeamIds.size;
  const chargesCreatedCount = chargedTeamIds.size;
  const missingChargeCount = Math.max(0, expectedChargeCount - chargesCreatedCount);
  const expectedIncomePence = expectedChargeCount * defaultFeePence;
  const missingChargesPence = Math.max(0, expectedIncomePence - chargesCreatedPence);
  const outstandingAgainstChargesPence = Math.max(0, chargesCreatedPence - paidPence);
  const expectedOutstandingPence = Math.max(0, expectedIncomePence - paidPence);
  const refCostPence = uniqueRefedFixtures * refFeePence;
  const totalCostPence = refCostPence + pitchHirePence;
  const expectedProfitPence = expectedIncomePence - totalCostPence;
  return { expectedTeams: expectedChargeCount, defaultFeePence, expectedIncomePence, chargeCount, chargesCreatedCount, chargesCreatedPence, missingChargeCount, missingChargesPence, paidPence, outstandingAgainstChargesPence, expectedOutstandingPence, openCharges, refCostPence, pitchHirePence, totalCostPence, expectedProfitPence };
}

async function calculateAutomaticPitchHire(fixtures: FixtureForBoard[]) {
  const leagueIds = Array.from(new Set(fixtures.map((fixture) => fixture.league.id)));
  const venueIds = Array.from(new Set(fixtures.map((fixture) => fixture.venue?.id).filter((id): id is string => Boolean(id))));
  if (leagueIds.length === 0) return { amountPence: 0, label: "No fixtures selected", missingParts: 0 };

  const [leagueRows, venueRows] = await Promise.all([
    prisma.$queryRaw<LeagueBookingCostRow[]>(Prisma.sql`
      SELECT id AS "leagueId", "bookedPitchCount"::int AS "bookedPitchCount", "bookingStartTime" AS "bookingStartTime", "bookingEndTime" AS "bookingEndTime", "pitchCostPerHourOverridePence"::int AS "pitchCostPerHourOverridePence"
      FROM "League"
      WHERE id IN (${Prisma.join(leagueIds)})
    `),
    venueIds.length > 0
      ? prisma.$queryRaw<VenueCostRow[]>(Prisma.sql`
          SELECT id AS "venueId", "defaultPitchCostPerHourPence"::int AS "defaultPitchCostPerHourPence"
          FROM "Venue"
          WHERE id IN (${Prisma.join(venueIds)})
        `)
      : Promise.resolve([]),
  ]);

  const leagueMap = new Map(leagueRows.map((row) => [row.leagueId, row]));
  const venueCostMap = new Map(venueRows.map((row) => [row.venueId, row.defaultPitchCostPerHourPence]));
  const firstVenueByLeague = new Map<string, string | null>();
  for (const fixture of fixtures) if (!firstVenueByLeague.has(fixture.league.id)) firstVenueByLeague.set(fixture.league.id, fixture.venue?.id ?? null);

  let amountPence = 0;
  let calculatedLeagues = 0;
  let missingParts = 0;
  for (const leagueId of leagueIds) {
    const booking = leagueMap.get(leagueId);
    const venueId = firstVenueByLeague.get(leagueId) ?? null;
    const pitchCount = booking?.bookedPitchCount ?? null;
    const hours = bookingHours(booking?.bookingStartTime ?? null, booking?.bookingEndTime ?? null);
    const costPerHourPence = booking?.pitchCostPerHourOverridePence ?? (venueId ? venueCostMap.get(venueId) ?? null : null);
    if (!pitchCount || !hours || !costPerHourPence) { missingParts += 1; continue; }
    amountPence += Math.round(pitchCount * hours * costPerHourPence);
    calculatedLeagues += 1;
  }
  return { amountPence, label: calculatedLeagues > 0 ? `Auto from ${calculatedLeagues} league booking${calculatedLeagues === 1 ? "" : "s"}` : "Add league booking + venue rate", missingParts };
}

function buildDateOptions(options: SelectOption[], selectedDate: string) {
  if (options.length === 0) return [{ value: selectedDate, label: formatDate(new Date(`${selectedDate}T00:00:00.000Z`)), description: "No upcoming published fixture nights found" }];
  if (!options.some((option) => option.value === selectedDate)) return [{ value: selectedDate, label: formatDate(new Date(`${selectedDate}T00:00:00.000Z`)), description: "Selected date" }, ...options];
  return options;
}

export default async function NightBoardPage({ searchParams }: NightBoardPageProps) {
  await requireAdmin();

  const params = searchParams ? await searchParams : {};
  const requestedDate = getSearchParam(params.date);
  const leagueId = getSearchParam(params.leagueId);
  const venueId = getSearchParam(params.venueId);
  const refFeeValue = getSearchParam(params.refFee);
  const pitchHireValue = getSearchParam(params.pitchHire);
  const nightPitchCountValue = getSearchParam(params.nightPitchCount);
  const nightStartTimeValue = getSearchParam(params.nightStartTime);
  const nightEndTimeValue = getSearchParam(params.nightEndTime);
  const nightPitchCostPerHourValue = getSearchParam(params.nightPitchCostPerHour);
  const nightPitchTotalCostValue = getSearchParam(params.nightPitchTotalCost) || nightPitchCostPerHourValue;
  const refFeePence = parsePence(refFeeValue, 0);

  const [leagues, venues, upcomingNightOptions, referees] = await Promise.all([
    getUpcomingLeagueOptions(venueId),
    prisma.venue.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
    getUpcomingFixtureNightOptions({ leagueId, venueId }),
    prisma.user.findMany({
      where: { role: { in: [UserRole.REFEREE, UserRole.ADMIN] } },
      orderBy: [{ name: "asc" }, { email: "asc" }],
      select: { id: true, name: true, email: true, role: true },
    }),
  ]);

  const leagueStillAvailable = !leagueId || leagues.some((league) => league.id === leagueId);
  const activeLeagueId = leagueStillAvailable ? leagueId : "";
  const activeUpcomingNightOptions = leagueStillAvailable ? upcomingNightOptions : await getUpcomingFixtureNightOptions({ leagueId: "", venueId });
  const selectedDate = isDateInput(requestedDate) ? requestedDate : activeUpcomingNightOptions[0]?.value ?? todayInputValue();
  const { start, end } = dateRangeFromInput(selectedDate);
  const fixtures = await getFixturesForBoard({ start, end, leagueId: activeLeagueId, venueId });
  const automaticPitchHire = await calculateAutomaticPitchHire(fixtures);

  const submittedOverrideValue = nightPitchTotalCostValue.trim() || pitchHireValue.trim();
  const overrideWasSubmitted = hasSearchParam(params, "pitchHire") || hasSearchParam(params, "nightPitchCostPerHour") || hasSearchParam(params, "nightPitchTotalCost");
  let savedPitchHirePence = await getSavedNightBoardPitchHireOverride({ boardDate: selectedDate, leagueId: activeLeagueId, venueId });
  if (overrideWasSubmitted) {
    savedPitchHirePence = parseOptionalPence(submittedOverrideValue);
    await saveNightBoardPitchHireOverride({ boardDate: selectedDate, leagueId: activeLeagueId, venueId, pitchHirePence: savedPitchHirePence });
  }

  const pitchHirePence = savedPitchHirePence ?? automaticPitchHire.amountPence;
  const pitchHireSourceLabel = savedPitchHirePence !== null ? "Saved pitch hire override for this night" : automaticPitchHire.label;
  const displayedPitchHireValue = submittedOverrideValue || formatMoneyInputValue(savedPitchHirePence);

  const returnTo = buildNightBoardReturnTo({ date: selectedDate, leagueId: activeLeagueId, venueId, refFee: refFeeValue });
  const dateOptions = buildDateOptions(activeUpcomingNightOptions, selectedDate);
  const leagueOptions = [{ value: "", label: "All leagues", description: "Upcoming published fixtures only" }, ...leagues.map((league) => ({ value: league.id, label: league.name, description: `${league.season ?? "No season"} · ${league.fixtureCount} upcoming fixture${league.fixtureCount === 1 ? "" : "s"}${league.nextKickoffAt ? ` · next ${formatDate(league.nextKickoffAt)}` : ""}${league.isActive ? "" : " · inactive"}` }))];
  const venueOptions = [{ value: "", label: "All venues", description: "Show every venue" }, ...venues.map((venue) => ({ value: venue.id, label: venue.name }))];
  const refereeOptions = [{ value: "", label: "No referee" }, ...referees.map((referee) => ({ value: referee.id, label: `${referee.name || referee.email || "Unnamed referee"}${referee.role === UserRole.ADMIN ? " · admin" : ""}` }))];

  const warnings = buildWarnings(fixtures);
  const { pitchNames, timeLabels, fixtureByTimePitch } = getBoardGroups(fixtures);
  const refereeRows = getRefereeRows(fixtures, refFeePence);
  const finance = getFinance(fixtures, refFeePence, pitchHirePence);
  const completedCount = fixtures.filter((fixture) => fixture.status === FixtureStatus.COMPLETED).length;
  const missingRefCount = fixtures.filter((fixture) => !fixture.referee).length;
  const missingPitchCount = fixtures.filter((fixture) => !fixture.pitch?.trim()).length;
  const confirmedCaptains = fixtures.reduce((total, fixture) => total + fixture.captainConfirmations.filter((confirmation) => confirmation.status === "CONFIRMED").length, 0);
  const expectedCaptainConfirmations = fixtures.length * 2;
  const isSorted = fixtures.length > 0 && warnings.filter((warning) => warning.level === "red").length === 0 && missingPitchCount === 0;
  const hasMissingCharges = finance.missingChargeCount > 0;

  return (
    <div className="w-full space-y-8 px-4 pb-10 pt-6 sm:px-6 lg:px-8">
      <AdminCard className="rounded-3xl border border-white/10 bg-white/[0.03] p-6 md:p-8">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
          <div><div className="text-[11px] font-semibold uppercase tracking-[0.24em] text-emerald-300/80">Operations</div><h1 className="mt-3 text-3xl font-semibold tracking-tight text-white">Night board</h1><p className="mt-3 max-w-3xl text-sm leading-6 text-white/60">One page to check who is playing on which pitch, at what time, referee cover, charges and whether the night is sorted.</p></div>
          <div className={`rounded-2xl border px-5 py-4 text-sm font-semibold ${isSorted ? "border-emerald-400/25 bg-emerald-500/10 text-emerald-100" : "border-amber-400/25 bg-amber-500/10 text-amber-100"}`}>{isSorted ? "Night sorted" : "Needs attention"}</div>
        </div>
        <NightBoardFilters dateOptions={dateOptions} leagueOptions={leagueOptions} venueOptions={venueOptions} selectedDate={selectedDate} selectedLeagueId={activeLeagueId} selectedVenueId={venueId} refFee={refFeeValue} pitchHire={displayedPitchHireValue} nightPitchCount={nightPitchCountValue} nightStartTime={nightStartTimeValue} nightEndTime={nightEndTimeValue} nightPitchCostPerHour={displayedPitchHireValue} />
        <div className="mt-3 rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-xs leading-5 text-white/45">Pitch hire: <span className="font-semibold text-white/70">{formatMoney(pitchHirePence)}</span> · {pitchHireSourceLabel}. This override is saved for {formatDate(start)}{activeLeagueId ? " and this league" : ""}{venueId ? " and venue" : ""}.</div>
      </AdminCard>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <AdminCard className="rounded-3xl border border-white/10 bg-white/[0.03] p-5"><div className="text-xs uppercase tracking-[0.16em] text-white/35">Published fixtures</div><div className="mt-2 text-3xl font-semibold text-white">{fixtures.length}</div><div className="mt-1 text-sm text-white/45">{completedCount} completed</div></AdminCard>
        <AdminCard className="rounded-3xl border border-white/10 bg-white/[0.03] p-5"><div className="text-xs uppercase tracking-[0.16em] text-white/35">Pitches used</div><div className="mt-2 text-3xl font-semibold text-white">{pitchNames.filter((name) => name !== "No pitch").length}</div><div className="mt-1 text-sm text-white/45">{missingPitchCount} missing pitch</div></AdminCard>
        <AdminCard className="rounded-3xl border border-white/10 bg-white/[0.03] p-5"><div className="text-xs uppercase tracking-[0.16em] text-white/35">Referees</div><div className="mt-2 text-3xl font-semibold text-white">{refereeRows.length}</div><div className="mt-1 text-sm text-white/45">{missingRefCount} matches missing ref</div></AdminCard>
        <AdminCard className="rounded-3xl border border-white/10 bg-white/[0.03] p-5"><div className="text-xs uppercase tracking-[0.16em] text-white/35">Captain confirms</div><div className="mt-2 text-3xl font-semibold text-white">{confirmedCaptains}/{expectedCaptainConfirmations}</div><div className="mt-1 text-sm text-white/45">home + away confirmations</div></AdminCard>
      </div>

      <AdminCard className="overflow-hidden rounded-3xl border border-white/10 bg-white/[0.03] p-0">
        <div className="border-b border-white/10 px-6 py-5 md:px-8"><h2 className="text-xl font-semibold text-white">Pitch board</h2><p className="mt-1 text-sm text-white/45">{formatDate(start)}</p></div>
        {fixtures.length === 0 ? <div className="p-6 text-sm text-white/55">No published fixtures found for these filters.</div> : (
          <div className="overflow-x-auto"><table className="min-w-[1320px] text-left text-sm"><thead className="bg-white/[0.03] text-[10px] uppercase tracking-[0.16em] text-white/40"><tr><th className="w-28 px-4 py-3">Time</th>{pitchNames.map((pitch) => <th key={pitch} className="px-4 py-3">{pitch}</th>)}</tr></thead><tbody className="divide-y divide-white/10">{timeLabels.map((time) => <tr key={time}><td className="px-4 py-4 align-top text-lg font-semibold text-white">{time}</td>{pitchNames.map((pitch) => { const matches = fixtureByTimePitch.get(`${time}__${pitch}`) ?? []; return <td key={`${time}-${pitch}`} className="min-w-[410px] px-4 py-4 align-top">{matches.length === 0 ? <div className="rounded-2xl border border-white/5 bg-black/20 px-4 py-5 text-center text-white/25">Empty</div> : null}<div className="space-y-3">{matches.map((fixture) => { const homeCharge = getTeamChargeSummary(fixture, fixture.homeTeam.id); const awayCharge = getTeamChargeSummary(fixture, fixture.awayTeam.id); return <div key={fixture.id} className={`rounded-2xl border p-4 ${statusClass(fixture.status)}`}><div className="flex items-start justify-between gap-3"><div><div className="font-semibold">{fixture.homeTeam.name}</div><div className="text-white/45">v</div><div className="font-semibold">{fixture.awayTeam.name}</div></div><div className="rounded-full border border-white/10 px-2 py-1 text-[10px] uppercase tracking-[0.12em] text-white/55">{fixture.status}</div></div><div className="mt-3 grid gap-2"><TeamChargeBadge label="Home charge" teamName={fixture.homeTeam.name} summary={homeCharge} /><TeamChargeBadge label="Away charge" teamName={fixture.awayTeam.name} summary={awayCharge} /></div><div className="mt-3 space-y-1 text-xs text-white/55"><div>Ref: <span className={fixture.referee ? "text-white/80" : "text-red-200"}>{fixture.referee?.name || fixture.referee?.email || "Missing"}</span></div><div>League: {fixture.league.name}{fixture.division ? ` / ${fixture.division.name}` : ""}</div><div>Venue: {fixture.venue?.name || fixture.league.venueName || "Missing"}</div>{fixture.result ? <div>Result: {fixture.result.homeScore} - {fixture.result.awayScore}</div> : null}</div><form action={updateNightBoardFixtureMatchAction} className="mt-4 rounded-2xl border border-white/10 bg-black/20 p-3"><input type="hidden" name="fixtureId" value={fixture.id} /><input type="hidden" name="returnTo" value={returnTo} /><div className="grid gap-2 sm:grid-cols-2"><label className="space-y-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-white/35">KO time<input name="kickoffTime" type="time" defaultValue={toLondonTimeInputValue(fixture.kickoffAt)} className="h-10 w-full rounded-xl border border-white/10 bg-black/30 px-3 text-xs text-white outline-none focus:border-emerald-400/40" /></label><label className="space-y-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-white/35">Status<select name="status" defaultValue={fixture.status} className="h-10 w-full rounded-xl border border-white/10 bg-black/30 px-3 text-xs text-white outline-none focus:border-emerald-400/40">{FIXTURE_STATUS_OPTIONS.map((status) => <option key={`${fixture.id}-${status}`} value={status}>{status}</option>)}</select></label><label className="space-y-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-white/35">Pitch<input name="pitch" defaultValue={fixture.pitch ?? ""} placeholder="Pitch" className="h-10 w-full rounded-xl border border-white/10 bg-black/30 px-3 text-xs text-white outline-none placeholder:text-white/30 focus:border-emerald-400/40" /></label><label className="space-y-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-white/35">Venue<select name="venueId" defaultValue={fixture.venue?.id ?? ""} className="h-10 w-full rounded-xl border border-white/10 bg-black/30 px-3 text-xs text-white outline-none focus:border-emerald-400/40"><option value="">No venue</option>{venues.map((venue) => <option key={`${fixture.id}-venue-${venue.id}`} value={venue.id}>{venue.name}</option>)}</select></label></div><label className="mt-2 block space-y-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-white/35">Referee<select name="refereeId" defaultValue={fixture.referee?.id ?? ""} className="h-10 w-full rounded-xl border border-white/10 bg-black/30 px-3 text-xs text-white outline-none focus:border-sky-400/40">{refereeOptions.map((option) => <option key={`${fixture.id}-ref-${option.value || "none"}`} value={option.value}>{option.label}</option>)}</select></label><button type="submit" className="mt-3 w-full rounded-xl border border-emerald-400/25 bg-emerald-500/10 px-3 py-2 text-xs font-semibold text-emerald-100 transition hover:bg-emerald-500/15">Save match-night edit</button></form><div className="mt-3 flex flex-wrap gap-3"><Link href={`/admin/fixtures/${fixture.id}/edit`} className="inline-flex text-xs font-semibold text-sky-200 hover:text-sky-100">Full fixture edit</Link><Link href={`/admin/payments?teamId=${fixture.homeTeam.id}`} className="inline-flex text-xs font-semibold text-amber-200 hover:text-amber-100">Home payments</Link><Link href={`/admin/payments?teamId=${fixture.awayTeam.id}`} className="inline-flex text-xs font-semibold text-amber-200 hover:text-amber-100">Away payments</Link><Link href={`/admin/fixtures?leagueId=${fixture.league.id}`} className="inline-flex text-xs font-semibold text-emerald-200 hover:text-emerald-100">Open fixtures</Link></div></div>; })}</div></td>; })}</tr>)}</tbody></table></div>
        )}
      </AdminCard>

      <div className="grid gap-6 xl:grid-cols-2">
        <AdminCard className="rounded-3xl border border-white/10 bg-white/[0.03] p-6"><h2 className="text-xl font-semibold text-white">Referee allocation</h2><div className="mt-4 space-y-3">{refereeRows.length === 0 ? <div className="text-sm text-white/55">No referees assigned yet.</div> : null}{refereeRows.map((row) => <div key={`${row.name}-${row.email}`} className="rounded-2xl border border-white/10 bg-black/20 p-4"><div className="flex items-start justify-between gap-4"><div><div className="font-semibold text-white">{row.name}</div><div className="text-sm text-white/45">{row.email}</div></div><div className="text-right text-sm text-white/70">{formatMoney(row.feePence)}</div></div><div className="mt-3 grid gap-2 text-sm text-white/55 sm:grid-cols-3"><div>{row.fixtures.length} match{row.fixtures.length === 1 ? "" : "es"}</div><div>{row.pitchList}</div><div>{row.firstKickoff ? formatTime(row.firstKickoff) : "—"} – {row.lastKickoff ? formatTime(row.lastKickoff) : "—"}</div></div></div>)}</div></AdminCard>
        <AdminCard className="rounded-3xl border border-white/10 bg-white/[0.03] p-6"><div className="flex items-start justify-between gap-4"><div><h2 className="text-xl font-semibold text-white">Income / cost</h2><p className="mt-1 text-sm text-white/45">Based on published fixtures on this night.</p></div>{hasMissingCharges ? <div className="rounded-full border border-amber-400/25 bg-amber-500/10 px-3 py-1 text-xs font-semibold text-amber-100">Missing charges</div> : null}</div><div className="mt-4 space-y-3 text-sm"><div className="flex justify-between border-b border-white/10 pb-2"><span className="text-white/55">Expected income</span><span className="font-semibold text-white">{finance.expectedTeams} teams × {formatMoney(finance.defaultFeePence)} = {formatMoney(finance.expectedIncomePence)}</span></div><div className="flex justify-between border-b border-white/10 pb-2"><span className="text-white/55">Charges created</span><span className="font-semibold text-white">{finance.chargesCreatedCount}/{finance.expectedTeams} teams = {formatMoney(finance.chargesCreatedPence)}</span></div><div className="flex justify-between border-b border-white/10 pb-2"><span className="text-white/55">Missing charges</span><span className={`font-semibold ${hasMissingCharges ? "text-amber-100" : "text-emerald-100"}`}>{finance.missingChargeCount} teams = {formatMoney(finance.missingChargesPence)}</span></div><div className="flex justify-between border-b border-white/10 pb-2"><span className="text-white/55">Paid</span><span className="font-semibold text-emerald-100">{formatMoney(finance.paidPence)}</span></div><div className="flex justify-between border-b border-white/10 pb-2"><span className="text-white/55">Outstanding against created charges</span><span className="font-semibold text-amber-100">{formatMoney(finance.outstandingAgainstChargesPence)}</span></div><div className="flex justify-between border-b border-white/10 pb-2"><span className="text-white/55">True expected outstanding</span><span className="font-semibold text-amber-100">{formatMoney(finance.expectedOutstandingPence)}</span></div><div className="flex justify-between border-b border-white/10 pb-2"><span className="text-white/55">Referee cost</span><span className="font-semibold text-white">{formatMoney(finance.refCostPence)}</span></div><div className="flex justify-between border-b border-white/10 pb-2"><span className="text-white/55">Pitch hire</span><span className="font-semibold text-white">{formatMoney(finance.pitchHirePence)}</span></div><div className="flex justify-between pt-2 text-base"><span className="text-white/70">Expected profit</span><span className={`font-semibold ${finance.expectedProfitPence >= 0 ? "text-emerald-100" : "text-red-100"}`}>{formatMoney(finance.expectedProfitPence)}</span></div></div>{hasMissingCharges ? <p className="mt-4 text-xs leading-5 text-amber-100/80">Some teams do not yet have fixture charges. The expected figures show what should be due; the charges-created line shows what currently exists in payments.</p> : null}{automaticPitchHire.missingParts > 0 && savedPitchHirePence === null ? <p className="mt-3 text-xs leading-5 text-white/40">Some pitch hire could not be calculated yet. Fill in venue hourly rate and league booking details, or type a pitch hire override above.</p> : null}</AdminCard>
      </div>

      <AdminCard className="rounded-3xl border border-white/10 bg-white/[0.03] p-6"><h2 className="text-xl font-semibold text-white">Warnings</h2><div className="mt-4 space-y-3">{warnings.length === 0 ? <div className="rounded-2xl border border-emerald-400/20 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-100">No obvious pitch, referee, venue or clash warnings.</div> : null}{warnings.map((warning, index) => <div key={`${warning.message}-${index}`} className={`rounded-2xl border px-4 py-3 text-sm ${warningClass(warning.level)}`}>{warning.message}</div>)}</div></AdminCard>
    </div>
  );
}
