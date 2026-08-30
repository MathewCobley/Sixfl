import {
  FixtureCaptainConfirmationStatus,
  FixtureStatus,
  Prisma,
} from "@prisma/client";

import { toLondonTimeInputValue } from "@/lib/datetime/london";
import { prisma } from "@/lib/prisma";

export type NightBoardIssueLevel = "amber" | "red";

export type NextNightBoardIssueSummary = {
  count: number;
  level: NightBoardIssueLevel | null;
  dateInput: string | null;
  dateLabel: string | null;
};

type MutableIssueSummary = {
  count: number;
  level: NightBoardIssueLevel | null;
};

type RefereeConfirmationRow = {
  fixtureId: string;
  refereeId: string;
  confirmationStatus: string | null;
  nightStatus: string;
};

const NIGHT_BOARD_VISIBLE_STATUSES: FixtureStatus[] = [
  FixtureStatus.SCHEDULED,
  FixtureStatus.COMPLETED,
];
const CAPTAIN_CONFIRMATION_WARNING_WINDOW_MS = 72 * 60 * 60 * 1000;
const CRITICAL_WARNING_WINDOW_MS = 24 * 60 * 60 * 1000;

function emptySummary(): NextNightBoardIssueSummary {
  return {
    count: 0,
    level: null,
    dateInput: null,
    dateLabel: null,
  };
}

function addIssue(
  summary: MutableIssueSummary,
  level: NightBoardIssueLevel,
  amount = 1,
) {
  summary.count += amount;
  if (level === "red" || summary.level === null) summary.level = level;
}

function warningLevelForKickoff(kickoffAt: Date, now: Date) {
  return kickoffAt.getTime() - now.getTime() <= CRITICAL_WARNING_WINDOW_MS
    ? ("red" as const)
    : ("amber" as const);
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

function formatNightDate(value: Date) {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/London",
    weekday: "short",
    day: "numeric",
    month: "short",
  }).format(value);
}

function dateRangeFromInput(dateInput: string) {
  // Keep the sidebar scan aligned with the Night Board's existing date filter.
  const start = new Date(`${dateInput}T00:00:00.000Z`);
  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + 1);
  return { start, end };
}

function timeToMinutes(value: string | null | undefined) {
  if (!value) return null;
  const match = /^(\d{1,2}):(\d{2})/.exec(value.trim());
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return null;
  return hours * 60 + minutes;
}

async function loadNextNightFixtures(now: Date) {
  const nextFixture = await prisma.fixture.findFirst({
    where: {
      publishedAt: { not: null },
      kickoffAt: { gte: now },
      status: FixtureStatus.SCHEDULED,
    },
    orderBy: { kickoffAt: "asc" },
    select: { kickoffAt: true },
  });

  if (!nextFixture) return null;

  const dateInput = toLondonDateInput(nextFixture.kickoffAt);
  const { start, end } = dateRangeFromInput(dateInput);
  const fixtures = await prisma.fixture.findMany({
    where: {
      publishedAt: { not: null },
      kickoffAt: { gte: start, lt: end },
      status: { in: NIGHT_BOARD_VISIBLE_STATUSES },
    },
    orderBy: { kickoffAt: "asc" },
    select: {
      id: true,
      kickoffAt: true,
      pitch: true,
      status: true,
      venue: { select: { id: true } },
      league: { select: { venueName: true } },
      referee: { select: { id: true } },
      homeTeam: {
        select: { id: true, latestKickoffTime: true },
      },
      awayTeam: {
        select: { id: true, latestKickoffTime: true },
      },
      captainConfirmations: {
        select: { teamId: true, status: true },
      },
    },
  });

  return {
    dateInput,
    dateLabel: formatNightDate(nextFixture.kickoffAt),
    fixtures,
  };
}

type NextNightFixture = NonNullable<
  Awaited<ReturnType<typeof loadNextNightFixtures>>
>["fixtures"][number];

function addBoardFixtureIssues(
  fixtures: NextNightFixture[],
  now: Date,
  summary: MutableIssueSummary,
) {
  const pitchTime = new Map<string, Set<string>>();
  const refereeTime = new Map<string, Set<string>>();
  const teamTime = new Map<string, Set<string>>();
  const teamAppearances = new Map<string, Set<string>>();

  for (const fixture of fixtures) {
    const kickoffKey = fixture.kickoffAt.toISOString();
    const pitch = fixture.pitch?.trim();

    if (!pitch) addIssue(summary, "amber");
    if (!fixture.referee) addIssue(summary, "red");
    if (!fixture.venue && !fixture.league.venueName) {
      addIssue(summary, "amber");
    }

    if (pitch) {
      const key = `${kickoffKey}__${pitch.toLowerCase()}`;
      const fixtureIds = pitchTime.get(key) ?? new Set<string>();
      fixtureIds.add(fixture.id);
      pitchTime.set(key, fixtureIds);
    }

    if (fixture.referee?.id) {
      const key = `${kickoffKey}__${fixture.referee.id}`;
      const fixtureIds = refereeTime.get(key) ?? new Set<string>();
      fixtureIds.add(fixture.id);
      refereeTime.set(key, fixtureIds);
    }

    const kickoffMinutes = timeToMinutes(
      toLondonTimeInputValue(fixture.kickoffAt),
    );
    const latestKickoffBreached = [fixture.homeTeam, fixture.awayTeam].some(
      (team) => {
        const latestMinutes = timeToMinutes(team.latestKickoffTime);
        return (
          kickoffMinutes !== null &&
          latestMinutes !== null &&
          kickoffMinutes > latestMinutes
        );
      },
    );
    if (latestKickoffBreached) addIssue(summary, "amber");

    const confirmationByTeamId = new Map(
      fixture.captainConfirmations.map((confirmation) => [
        confirmation.teamId,
        confirmation.status,
      ]),
    );
    const captainConfirmationWarningWindow =
      fixture.status === FixtureStatus.SCHEDULED &&
      fixture.kickoffAt.getTime() - now.getTime() <=
        CAPTAIN_CONFIRMATION_WARNING_WINDOW_MS;

    for (const team of [fixture.homeTeam, fixture.awayTeam]) {
      const sameTimeKey = `${kickoffKey}__${team.id}`;
      const sameTimeFixtureIds = teamTime.get(sameTimeKey) ?? new Set<string>();
      sameTimeFixtureIds.add(fixture.id);
      teamTime.set(sameTimeKey, sameTimeFixtureIds);

      const appearanceFixtureIds =
        teamAppearances.get(team.id) ?? new Set<string>();
      appearanceFixtureIds.add(fixture.id);
      teamAppearances.set(team.id, appearanceFixtureIds);

      const confirmationStatus = confirmationByTeamId.get(team.id);
      if (
        confirmationStatus === FixtureCaptainConfirmationStatus.ISSUE_RAISED
      ) {
        addIssue(summary, "red");
      } else if (
        captainConfirmationWarningWindow &&
        confirmationStatus !== FixtureCaptainConfirmationStatus.CONFIRMED
      ) {
        addIssue(
          summary,
          warningLevelForKickoff(fixture.kickoffAt, now),
        );
      }
    }
  }

  for (const fixtureIds of pitchTime.values()) {
    if (fixtureIds.size > 1) addIssue(summary, "red");
  }
  for (const fixtureIds of refereeTime.values()) {
    if (fixtureIds.size > 1) addIssue(summary, "red");
  }
  for (const fixtureIds of teamTime.values()) {
    if (fixtureIds.size > 1) addIssue(summary, "red");
  }
  for (const fixtureIds of teamAppearances.values()) {
    if (fixtureIds.size > 1) addIssue(summary, "amber");
  }
}

async function addRefereeConfirmationIssues(
  fixtures: NextNightFixture[],
  now: Date,
  summary: MutableIssueSummary,
) {
  const assignedFixtures = fixtures.filter(
    (fixture) =>
      fixture.status === FixtureStatus.SCHEDULED && Boolean(fixture.referee),
  );
  if (assignedFixtures.length === 0) return;

  const fixtureIds = assignedFixtures.map((fixture) => fixture.id);

  try {
    const rows = await prisma.$queryRaw<RefereeConfirmationRow[]>(Prisma.sql`
      SELECT
        rnf."fixtureId",
        rn."refereeId",
        rn."confirmationStatus",
        rn.status AS "nightStatus"
      FROM "RefereeNightFixture" rnf
      JOIN "RefereeNight" rn ON rn.id = rnf."refereeNightId"
      WHERE rnf."fixtureId" IN (${Prisma.join(fixtureIds)})
    `);

    const byReferee = new Map<
      string,
      { firstKickoffAt: Date; fixtureIds: Set<string> }
    >();

    for (const fixture of assignedFixtures) {
      const refereeId = fixture.referee?.id;
      if (!refereeId) continue;
      const existing = byReferee.get(refereeId) ?? {
        firstKickoffAt: fixture.kickoffAt,
        fixtureIds: new Set<string>(),
      };
      if (fixture.kickoffAt < existing.firstKickoffAt) {
        existing.firstKickoffAt = fixture.kickoffAt;
      }
      existing.fixtureIds.add(fixture.id);
      byReferee.set(refereeId, existing);
    }

    for (const [refereeId, group] of byReferee) {
      const confirmationRows = rows.filter(
        (row) =>
          row.refereeId === refereeId &&
          group.fixtureIds.has(row.fixtureId) &&
          row.nightStatus !== "CANCELLED" &&
          row.nightStatus !== "SETTLED",
      );

      if (confirmationRows.length === 0) {
        addIssue(
          summary,
          warningLevelForKickoff(group.firstKickoffAt, now),
        );
        continue;
      }

      if (
        confirmationRows.some(
          (row) => row.confirmationStatus === "DECLINED",
        )
      ) {
        addIssue(summary, "red");
        continue;
      }

      if (
        !confirmationRows.every(
          (row) => row.confirmationStatus === "CONFIRMED",
        )
      ) {
        addIssue(
          summary,
          warningLevelForKickoff(group.firstKickoffAt, now),
        );
      }
    }
  } catch (error) {
    // Do not make the whole admin console unavailable if legacy referee-night
    // confirmation columns are temporarily unavailable. Other issue types still
    // drive the dot, and the Night Board endpoint will surface the data problem.
    console.error(
      "Failed to scan referee confirmation issues for the Night Board navigation",
      error,
    );
  }
}

export async function getNextNightBoardIssueSummary(): Promise<NextNightBoardIssueSummary> {
  const now = new Date();

  try {
    const nextNight = await loadNextNightFixtures(now);
    if (!nextNight) return emptySummary();

    const summary: MutableIssueSummary = { count: 0, level: null };
    addBoardFixtureIssues(nextNight.fixtures, now, summary);
    await addRefereeConfirmationIssues(nextNight.fixtures, now, summary);

    return {
      ...summary,
      dateInput: nextNight.dateInput,
      dateLabel: nextNight.dateLabel,
    };
  } catch (error) {
    console.error("Failed to calculate the next Night Board issue summary", error);
    return emptySummary();
  }
}
