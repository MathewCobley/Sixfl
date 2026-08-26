// ========================================
// File: src/app/api/admin/night-board/referee-confirmation-warnings/route.ts
// ========================================

import { Prisma } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";

import { ensureRefereeNightConfirmationColumns } from "@/lib/referee-night-confirmations";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/requireAdmin";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type Warning = {
  level: "amber" | "red";
  message: string;
};

type ConfirmationRow = {
  fixtureId: string;
  refereeNightId: string;
  refereeId: string;
  confirmationStatus: string | null;
  nightStatus: string;
};

function isDateInput(value: string | null) {
  return Boolean(value && /^\d{4}-\d{2}-\d{2}$/.test(value));
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

function dateRange(dateInput: string) {
  const start = new Date(`${dateInput}T00:00:00.000Z`);
  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + 1);
  return { start, end };
}

function refereeName(referee: { name: string | null; email: string | null }) {
  return referee.name || referee.email || "Unnamed referee";
}

function formatKickoff(value: Date) {
  return new Intl.DateTimeFormat("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "Europe/London",
  }).format(value);
}

function warningLevel(firstKickoff: Date) {
  return firstKickoff.getTime() - Date.now() <= 24 * 60 * 60 * 1000 ? "red" : "amber";
}

export async function GET(request: NextRequest) {
  await requireAdmin();
  await ensureRefereeNightConfirmationColumns();

  const leagueId = request.nextUrl.searchParams.get("leagueId")?.trim() ?? "";
  const requestedVenueId = request.nextUrl.searchParams.get("venueId")?.trim() ?? "";
  const requestedDate = request.nextUrl.searchParams.get("date")?.trim() ?? "";

  let venueId = requestedVenueId;
  let upcoming = await prisma.fixture.findFirst({
    where: {
      publishedAt: { not: null },
      kickoffAt: { gte: new Date() },
      status: "SCHEDULED",
      ...(leagueId ? { leagueId } : {}),
      ...(venueId ? { venueId } : {}),
    },
    orderBy: { kickoffAt: "asc" },
    select: { kickoffAt: true },
  });

  // Match the Night Board's behaviour: if a stale venue filter has no upcoming
  // nights, fall back to all venues rather than silently checking the wrong date.
  if (venueId && !upcoming) {
    venueId = "";
    upcoming = await prisma.fixture.findFirst({
      where: {
        publishedAt: { not: null },
        kickoffAt: { gte: new Date() },
        status: "SCHEDULED",
        ...(leagueId ? { leagueId } : {}),
      },
      orderBy: { kickoffAt: "asc" },
      select: { kickoffAt: true },
    });
  }

  const selectedDate = isDateInput(requestedDate)
    ? requestedDate
    : upcoming
      ? toLondonDateInput(upcoming.kickoffAt)
      : toLondonDateInput(new Date());
  const { start, end } = dateRange(selectedDate);

  const fixtures = await prisma.fixture.findMany({
    where: {
      publishedAt: { not: null },
      kickoffAt: { gte: start, lt: end },
      status: "SCHEDULED",
      ...(leagueId ? { leagueId } : {}),
      ...(venueId ? { venueId } : {}),
    },
    orderBy: { kickoffAt: "asc" },
    select: {
      id: true,
      kickoffAt: true,
      referee: { select: { id: true, name: true, email: true } },
    },
  });

  const assignedFixtures = fixtures.filter(
    (fixture): fixture is typeof fixture & { referee: NonNullable<typeof fixture.referee> } =>
      Boolean(fixture.referee),
  );
  if (assignedFixtures.length === 0) {
    return NextResponse.json({ warnings: [] satisfies Warning[] });
  }

  const fixtureIds = assignedFixtures.map((fixture) => fixture.id);
  const rows = await prisma.$queryRaw<ConfirmationRow[]>(Prisma.sql`
    SELECT
      rnf."fixtureId",
      rn.id AS "refereeNightId",
      rn."refereeId",
      rn."confirmationStatus",
      rn.status AS "nightStatus"
    FROM "RefereeNightFixture" rnf
    JOIN "RefereeNight" rn ON rn.id = rnf."refereeNightId"
    WHERE rnf."fixtureId" IN (${Prisma.join(fixtureIds)})
  `);

  const byReferee = new Map<
    string,
    {
      referee: (typeof assignedFixtures)[number]["referee"];
      fixtures: typeof assignedFixtures;
    }
  >();

  for (const fixture of assignedFixtures) {
    const existing = byReferee.get(fixture.referee.id) ?? {
      referee: fixture.referee,
      fixtures: [],
    };
    existing.fixtures.push(fixture);
    byReferee.set(fixture.referee.id, existing);
  }

  const warnings: Warning[] = [];
  for (const [refereeId, group] of byReferee) {
    const name = refereeName(group.referee);
    const firstKickoff = group.fixtures[0].kickoffAt;
    const level = warningLevel(firstKickoff);
    const assignedFixtureIds = new Set(group.fixtures.map((fixture) => fixture.id));
    const confirmationRows = rows.filter(
      (row) =>
        row.refereeId === refereeId &&
        assignedFixtureIds.has(row.fixtureId) &&
        row.nightStatus !== "CANCELLED" &&
        row.nightStatus !== "SETTLED",
    );

    if (confirmationRows.length === 0) {
      warnings.push({
        level,
        message: `${level === "red" ? "REFEREE NOT CONFIRMED" : "Referee confirmation needed"} – ${name} is assigned to ${group.fixtures.length} match${group.fixtures.length === 1 ? "" : "es"} from ${formatKickoff(firstKickoff)}, but there is no active referee-night confirmation linked.`,
      });
      continue;
    }

    if (confirmationRows.some((row) => row.confirmationStatus === "DECLINED")) {
      warnings.push({
        level: "red",
        message: `REFEREE DECLINED – ${name} is still assigned to ${group.fixtures.length} match${group.fixtures.length === 1 ? "" : "es"} from ${formatKickoff(firstKickoff)} but has declined the referee-night confirmation.`,
      });
      continue;
    }

    const allConfirmed = confirmationRows.every(
      (row) => row.confirmationStatus === "CONFIRMED",
    );
    if (!allConfirmed) {
      warnings.push({
        level,
        message: `${level === "red" ? "REFEREE NOT CONFIRMED" : "Referee confirmation pending"} – ${name} is assigned to ${group.fixtures.length} match${group.fixtures.length === 1 ? "" : "es"} from ${formatKickoff(firstKickoff)} and has not confirmed attendance yet.`,
      });
    }
  }

  return NextResponse.json({ warnings });
}
