import {
  FixtureStatus,
  NotificationDispatchStatus,
  Prisma,
} from "@prisma/client";
import { NextResponse } from "next/server";

import { queueNotificationFromTemplate } from "@/lib/notifications/service";
import { upsertTeamNotificationRecipient } from "@/lib/notifications/team-contacts";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/requireAdmin";
import { getTeamWeekUnavailabilityOverview } from "@/lib/team-week-unavailability-overview";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const TEMPLATE_KEY = "team-no-fixture-capacity-email";
const SOURCE_TYPE = "team-no-fixture-capacity";
const VISIBLE_FIXTURE_STATUSES: FixtureStatus[] = [
  FixtureStatus.SCHEDULED,
  FixtureStatus.COMPLETED,
];

function isDateInput(value: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function weekRangeFromInput(dateInput: string) {
  const selectedDate = new Date(`${dateInput}T00:00:00.000Z`);
  const mondayOffset = (selectedDate.getUTCDay() + 6) % 7;
  const start = new Date(selectedDate);
  start.setUTCDate(start.getUTCDate() - mondayOffset);
  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + 7);
  return { start, end };
}

function formatWeekBeginning(value: Date) {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/London",
    weekday: "long",
    day: "numeric",
    month: "long",
  }).format(value);
}

function firstName(value: string | null | undefined) {
  return value?.trim().split(/\s+/)[0] || "there";
}

type RequestBody = {
  teamId?: unknown;
  leagueId?: unknown;
  date?: unknown;
};

export async function POST(request: Request) {
  const access = await requireAdmin();
  const body = (await request.json().catch(() => null)) as RequestBody | null;
  const teamId = String(body?.teamId ?? "").trim();
  const leagueId = String(body?.leagueId ?? "").trim();
  const date = String(body?.date ?? "").trim();

  if (!teamId || !leagueId || !isDateInput(date)) {
    return NextResponse.json(
      { error: "Team, league and fixture week are required." },
      { status: 400 },
    );
  }

  const { start, end } = weekRangeFromInput(date);
  const membershipRows = await prisma.$queryRaw<
    Array<{ teamId: string; teamName: string; leagueName: string }>
  >(Prisma.sql`
    SELECT
      team."id" AS "teamId",
      team."name" AS "teamName",
      league."name" AS "leagueName"
    FROM "LeagueSeasonTeam" membership
    JOIN "Team" team ON team."id" = membership."teamId"
    JOIN "League" league ON league."id" = membership."leagueId"
    WHERE membership."leagueId" = ${leagueId}
      AND membership."teamId" = ${teamId}
      AND membership."isActive" = TRUE
      AND team."leagueId" IS NOT NULL
      AND COALESCE(team."isFixturePlaceholder", FALSE) = FALSE
      AND UPPER(TRIM(team."name")) <> 'TBC'
    LIMIT 1
  `);
  const membership = membershipRows[0];

  if (!membership) {
    return NextResponse.json(
      { error: "This team is not an active team in the selected league." },
      { status: 400 },
    );
  }

  const [fixture, advanceNotices] = await Promise.all([
    prisma.fixture.findFirst({
      where: {
        leagueId,
        publishedAt: { not: null },
        kickoffAt: { gte: start, lt: end },
        status: { in: VISIBLE_FIXTURE_STATUSES },
        OR: [{ homeTeamId: teamId }, { awayTeamId: teamId }],
      },
      select: { id: true },
    }),
    getTeamWeekUnavailabilityOverview({
      from: start,
      to: end,
      leagueIds: [leagueId],
    }),
  ]);

  if (fixture) {
    return NextResponse.json(
      { error: "This team now has a published fixture for that week, so the email was not sent." },
      { status: 409 },
    );
  }

  if (advanceNotices.some((notice) => notice.teamId === teamId)) {
    return NextResponse.json(
      { error: "This team has recorded that it is unavailable for that week, so the capacity email was not sent." },
      { status: 409 },
    );
  }

  const weekKey = start.toISOString().slice(0, 10);
  const sourceId = `${leagueId}:${teamId}:${weekKey}`;
  const existing = await prisma.notificationDispatch.findFirst({
    where: {
      sourceType: SOURCE_TYPE,
      sourceId,
      status: {
        in: [
          NotificationDispatchStatus.QUEUED,
          NotificationDispatchStatus.PROCESSING,
          NotificationDispatchStatus.SENT,
        ],
      },
    },
    orderBy: { createdAt: "desc" },
    select: { id: true, status: true },
  });

  if (existing) {
    return NextResponse.json({
      ok: true,
      alreadySent: true,
      status: existing.status,
      message: "The no-fixture email has already been queued or sent for this team and week.",
    });
  }

  const { snapshot, recipient } = await upsertTeamNotificationRecipient(teamId);
  if (!recipient.email?.trim()) {
    return NextResponse.json(
      { error: "This team does not have an email address saved, so the email cannot be sent." },
      { status: 400 },
    );
  }

  const dispatch = await queueNotificationFromTemplate({
    templateKey: TEMPLATE_KEY,
    recipientId: recipient.id,
    sourceType: SOURCE_TYPE,
    sourceId,
    variables: {
      firstName: firstName(snapshot.primaryContact.name),
      teamName: membership.teamName,
      leagueName: membership.leagueName,
      weekBeginning: formatWeekBeginning(start),
    },
    metadata: {
      event: "team.no_fixture_capacity.manual_email",
      teamId,
      leagueId,
      weekBeginning: weekKey,
    },
    createdByUserId: access.user?.id ?? null,
  });

  if (
    dispatch.status !== NotificationDispatchStatus.QUEUED &&
    dispatch.status !== NotificationDispatchStatus.PROCESSING &&
    dispatch.status !== NotificationDispatchStatus.SENT
  ) {
    return NextResponse.json(
      {
        error:
          dispatch.failureReason ||
          "The email could not be queued for this team. Check its saved email and notification settings.",
      },
      { status: 400 },
    );
  }

  return NextResponse.json({
    ok: true,
    alreadySent: false,
    status: dispatch.status,
    message: `No-fixture email queued for ${membership.teamName}.`,
  });
}
