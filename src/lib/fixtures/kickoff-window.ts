import {
  formatTimeInLondon,
  getLondonMinutesSinceMidnight,
} from "@/lib/datetime/london";

export type TeamKickoffWindow = {
  name: string;
  earliestKickoffTime?: string | null;
  latestKickoffTime?: string | null;
};

export type TeamKickoffWindowViolation = {
  teamName: string;
  kickoffTime: string;
  earliestKickoffTime: string | null;
  latestKickoffTime: string | null;
  kind: "too_early" | "too_late" | "outside_overnight_window";
  message: string;
};

export function parseTeamKickoffTimeToMinutes(value: string | null | undefined) {
  if (!value) return null;
  const match = /^(\d{1,2}):(\d{2})(?::\d{2})?$/.exec(value.trim());
  if (!match) return null;

  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (
    !Number.isInteger(hours) ||
    !Number.isInteger(minutes) ||
    hours < 0 ||
    hours > 23 ||
    minutes < 0 ||
    minutes > 59
  ) {
    return null;
  }

  return hours * 60 + minutes;
}

export function normaliseTeamKickoffTime(value: string | null | undefined) {
  const minutes = parseTeamKickoffTimeToMinutes(value);
  if (minutes === null) return null;
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return `${String(hours).padStart(2, "0")}:${String(mins).padStart(2, "0")}`;
}

export function getTeamKickoffWindowViolation(
  kickoffAt: Date,
  team: TeamKickoffWindow,
): TeamKickoffWindowViolation | null {
  const kickoffMinutes = getLondonMinutesSinceMidnight(kickoffAt);
  const earliestMinutes = parseTeamKickoffTimeToMinutes(team.earliestKickoffTime);
  const latestMinutes = parseTeamKickoffTimeToMinutes(team.latestKickoffTime);
  const earliest = normaliseTeamKickoffTime(team.earliestKickoffTime);
  const latest = normaliseTeamKickoffTime(team.latestKickoffTime);
  const kickoffTime = formatTimeInLondon(kickoffAt);

  if (earliestMinutes === null && latestMinutes === null) return null;

  if (
    earliestMinutes !== null &&
    latestMinutes !== null &&
    earliestMinutes > latestMinutes
  ) {
    const insideOvernightWindow =
      kickoffMinutes >= earliestMinutes || kickoffMinutes <= latestMinutes;
    if (insideOvernightWindow) return null;

    return {
      teamName: team.name,
      kickoffTime,
      earliestKickoffTime: earliest,
      latestKickoffTime: latest,
      kind: "outside_overnight_window",
      message: `${team.name} can only kick off between ${earliest} and ${latest} (overnight window). ${kickoffTime} is outside that window.`,
    };
  }

  if (earliestMinutes !== null && kickoffMinutes < earliestMinutes) {
    return {
      teamName: team.name,
      kickoffTime,
      earliestKickoffTime: earliest,
      latestKickoffTime: latest,
      kind: "too_early",
      message: `${team.name} cannot kick off before ${earliest}. This fixture is scheduled for ${kickoffTime}.`,
    };
  }

  if (latestMinutes !== null && kickoffMinutes > latestMinutes) {
    return {
      teamName: team.name,
      kickoffTime,
      earliestKickoffTime: earliest,
      latestKickoffTime: latest,
      kind: "too_late",
      message: `${team.name} cannot kick off later than ${latest}. This fixture is scheduled for ${kickoffTime}.`,
    };
  }

  return null;
}

export function getFixtureKickoffWindowViolations(
  kickoffAt: Date,
  teams: TeamKickoffWindow[],
) {
  return teams
    .map((team) => getTeamKickoffWindowViolation(kickoffAt, team))
    .filter((violation): violation is TeamKickoffWindowViolation => Boolean(violation));
}

/**
 * Server-side convenience helper for routes that only have fixture team IDs.
 * The shared rule calculator above remains independent of Prisma.
 */
export async function getFixtureTeamKickoffWindowViolations(input: {
  homeTeamId: string;
  awayTeamId: string;
  kickoffAt: Date;
}) {
  const { prisma } = await import("@/lib/prisma");
  const teams = await prisma.team.findMany({
    where: {
      id: {
        in: [input.homeTeamId, input.awayTeamId],
      },
    },
    select: {
      id: true,
      name: true,
      earliestKickoffTime: true,
      latestKickoffTime: true,
    },
  });

  return getFixtureKickoffWindowViolations(input.kickoffAt, teams);
}

export function assertFixtureKickoffWindow(
  kickoffAt: Date,
  teams: TeamKickoffWindow[],
  options?: { allowOverride?: boolean; overrideLabel?: string },
) {
  if (options?.allowOverride) return;
  const violations = getFixtureKickoffWindowViolations(kickoffAt, teams);
  if (violations.length === 0) return;

  const suffix = options?.overrideLabel
    ? ` ${options.overrideLabel}`
    : " Change the fixture time or update the team kick-off rules.";
  throw new Error(`${violations.map((item) => item.message).join(" ")}${suffix}`);
}
