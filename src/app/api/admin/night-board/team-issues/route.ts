// ========================================
// File: src/app/api/admin/night-board/team-issues/route.ts
// ========================================

import { NextResponse } from "next/server";

import { parseLondonDateTime, toLondonDateInputValue } from "@/lib/datetime/london";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/requireAdmin";

export const dynamic = "force-dynamic";

const DATE_INPUT = /^\d{4}-\d{2}-\d{2}$/;
const VISIBLE_FIXTURE_STATUSES = ["SCHEDULED", "COMPLETED"] as const;

function nextDateInput(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  const next = new Date(Date.UTC(year, month - 1, day + 1));
  return next.toISOString().slice(0, 10);
}

async function resolveSelectedDate(input: {
  requestedDate: string;
  leagueId: string;
  venueId: string;
}) {
  if (DATE_INPUT.test(input.requestedDate)) return input.requestedDate;

  const nextFixture = await prisma.fixture.findFirst({
    where: {
      publishedAt: { not: null },
      kickoffAt: { gte: new Date() },
      status: { in: [...VISIBLE_FIXTURE_STATUSES] },
      ...(input.leagueId ? { leagueId: input.leagueId } : {}),
      ...(input.venueId ? { venueId: input.venueId } : {}),
    },
    orderBy: [{ kickoffAt: "asc" }],
    select: { kickoffAt: true },
  });

  return nextFixture ? toLondonDateInputValue(nextFixture.kickoffAt) : toLondonDateInputValue(new Date());
}

export async function GET(request: Request) {
  await requireAdmin();

  const url = new URL(request.url);
  const requestedDate = url.searchParams.get("date")?.trim() ?? "";
  const leagueId = url.searchParams.get("leagueId")?.trim() ?? "";
  const venueId = url.searchParams.get("venueId")?.trim() ?? "";
  const selectedDate = await resolveSelectedDate({ requestedDate, leagueId, venueId });
  const start = parseLondonDateTime(selectedDate, "00:00");
  const end = parseLondonDateTime(nextDateInput(selectedDate), "00:00");

  const issues = await prisma.fixtureCaptainConfirmation.findMany({
    where: {
      status: "ISSUE_RAISED",
      fixture: {
        publishedAt: { not: null },
        kickoffAt: { gte: start, lt: end },
        status: { in: [...VISIBLE_FIXTURE_STATUSES] },
        ...(leagueId ? { leagueId } : {}),
        ...(venueId ? { venueId } : {}),
      },
    },
    orderBy: [{ issueRaisedAt: "asc" }, { updatedAt: "asc" }],
    select: {
      id: true,
      fixtureId: true,
      teamId: true,
      note: true,
      issueRaisedAt: true,
      lastChasedAt: true,
      team: {
        select: {
          id: true,
          name: true,
          contactName: true,
          contactEmail: true,
          secondaryContactName: true,
          secondaryContactEmail: true,
        },
      },
      fixture: {
        select: {
          id: true,
          leagueId: true,
          kickoffAt: true,
          pitch: true,
          league: { select: { name: true, season: true } },
          homeTeam: { select: { id: true, name: true } },
          awayTeam: { select: { id: true, name: true } },
        },
      },
      confirmedByUser: { select: { name: true, email: true } },
    },
  });

  return NextResponse.json({
    selectedDate,
    emailReplyConfigured: Boolean(process.env.EMAIL_REPLY_DOMAIN?.trim()),
    issues,
  });
}
