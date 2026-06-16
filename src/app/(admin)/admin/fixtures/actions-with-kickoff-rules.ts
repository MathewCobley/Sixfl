// ========================================
// File: src/app/(admin)/admin/fixtures/actions-with-kickoff-rules.ts
// ========================================

"use server";

import { Prisma } from "@prisma/client";
import { redirect } from "next/navigation";

import {
  formatTimeInLondon,
  getLondonMinutesSinceMidnight,
  parseLondonDateTime,
} from "@/lib/datetime/london";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/requireAdmin";
import {
  createFixtureAction as createFixtureActionWithoutKickoffRules,
  deleteFixtureAction,
  deleteLeagueFixturesAction,
  generateFixtures as generateFixturesWithoutKickoffRules,
  submitResultAction,
  updateFixtureAction as updateFixtureActionWithoutKickoffRules,
} from "./actions";

export { deleteFixtureAction, deleteLeagueFixturesAction, submitResultAction };

type Pair = {
  homeId: string;
  awayId: string;
};

type TeamSchedulingRule = {
  id: string;
  name: string;
  leagueId: string | null;
  earliestKickoffTime: string | null;
  latestKickoffTime: string | null;
};

function getString(value: FormDataEntryValue | null) {
  return String(value ?? "").trim();
}

function addDays(date: Date, days: number) {
  const out = new Date(date);
  out.setDate(out.getDate() + days);
  return out;
}

function addMinutes(date: Date, minutes: number) {
  const out = new Date(date);
  out.setMinutes(out.getMinutes() + minutes);
  return out;
}

function parsePositiveInt(value: FormDataEntryValue | null, min = 1) {
  const raw = getString(value);
  const parsed = Number(raw);

  if (!Number.isInteger(parsed) || parsed < min) {
    return null;
  }

  return parsed;
}

function parseTimeToMinutes(value: string | null) {
  if (!value) return null;

  const match = /^(\d{2}):(\d{2})$/.exec(value);
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

function buildScheduleErrorHref(input: {
  leagueId?: string | null;
  message: string;
}) {
  const params = new URLSearchParams();

  if (input.leagueId?.trim()) {
    params.set("leagueId", input.leagueId.trim());
  }

  params.set("scheduleError", input.message.slice(0, 320));

  return `/admin/fixtures?${params.toString()}#fixture-scheduling-warning`;
}

function redirectWithScheduleError(input: {
  leagueId?: string | null;
  message: string;
}): never {
  redirect(buildScheduleErrorHref(input));
}

function generateRounds(teamIds: string[]): Pair[][] {
  const ids: (string | null)[] = [...teamIds];

  if (ids.length < 2) return [];
  if (ids.length % 2 === 1) ids.push(null);

  const n = ids.length;
  const rounds: Pair[][] = [];
  let arr = [...ids];

  for (let round = 0; round < n - 1; round += 1) {
    const pairs: Pair[] = [];

    for (let i = 0; i < n / 2; i += 1) {
      const a = arr[i];
      const b = arr[n - 1 - i];

      if (!a || !b) continue;

      const isEvenRound = round % 2 === 0;
      pairs.push({
        homeId: isEvenRound ? a : b,
        awayId: isEvenRound ? b : a,
      });
    }

    rounds.push(pairs);

    const fixed = arr[0];
    const rest = arr.slice(1);
    rest.unshift(rest.pop()!);
    arr = [fixed, ...rest];
  }

  return rounds;
}

function mirrorRounds(rounds: Pair[][]): Pair[][] {
  return rounds.map((pairs) =>
    pairs.map((pair) => ({
      homeId: pair.awayId,
      awayId: pair.homeId,
    })),
  );
}

function sortPairsByLatestRestriction(
  pairs: Pair[],
  teamMap: Map<string, TeamSchedulingRule>,
) {
  return [...pairs].sort((a, b) => {
    const aHome = teamMap.get(a.homeId);
    const aAway = teamMap.get(a.awayId);
    const bHome = teamMap.get(b.homeId);
    const bAway = teamMap.get(b.awayId);

    const aLimit = Math.min(
      parseTimeToMinutes(aHome?.latestKickoffTime ?? null) ?? Number.MAX_SAFE_INTEGER,
      parseTimeToMinutes(aAway?.latestKickoffTime ?? null) ?? Number.MAX_SAFE_INTEGER,
    );

    const bLimit = Math.min(
      parseTimeToMinutes(bHome?.latestKickoffTime ?? null) ?? Number.MAX_SAFE_INTEGER,
      parseTimeToMinutes(bAway?.latestKickoffTime ?? null) ?? Number.MAX_SAFE_INTEGER,
    );

    return aLimit - bLimit;
  });
}

function getKickoffRuleBreach(input: {
  kickoffAt: Date;
  homeTeam: TeamSchedulingRule;
  awayTeam: TeamSchedulingRule;
}) {
  const kickoffMinutes = getLondonMinutesSinceMidnight(input.kickoffAt);

  for (const team of [input.homeTeam, input.awayTeam]) {
    const earliestMinutes = parseTimeToMinutes(team.earliestKickoffTime);

    if (earliestMinutes !== null && kickoffMinutes < earliestMinutes) {
      return `${team.name} cannot kick off before ${team.earliestKickoffTime}.`;
    }

    const latestMinutes = parseTimeToMinutes(team.latestKickoffTime);

    if (latestMinutes !== null && kickoffMinutes > latestMinutes) {
      return `${team.name} cannot kick off later than ${team.latestKickoffTime}.`;
    }
  }

  return null;
}

async function getTeamSchedulingRules(teamIds: string[]) {
  if (teamIds.length === 0) return [];

  return prisma.$queryRaw<TeamSchedulingRule[]>`
    SELECT
      "id",
      "name",
      "leagueId",
      "earliestKickoffTime",
      "latestKickoffTime"
    FROM "Team"
    WHERE "id" IN (${Prisma.join(teamIds)})
  `;
}

async function validateManualFixtureScheduling(formData: FormData) {
  const leagueId = getString(formData.get("leagueId"));
  const homeTeamId = getString(formData.get("homeTeamId"));
  const awayTeamId = getString(formData.get("awayTeamId"));
  const kickoffDate = getString(formData.get("kickoffDate"));
  const kickoffTime = getString(formData.get("kickoffTime"));

  if (!leagueId || !homeTeamId || !awayTeamId || !kickoffDate || !kickoffTime) {
    return;
  }

  let kickoffAt: Date;

  try {
    kickoffAt = parseLondonDateTime(kickoffDate, kickoffTime);
  } catch {
    return;
  }

  const teams = await getTeamSchedulingRules([homeTeamId, awayTeamId]);
  const teamMap = new Map(teams.map((team) => [team.id, team]));
  const homeTeam = teamMap.get(homeTeamId);
  const awayTeam = teamMap.get(awayTeamId);

  if (!homeTeam || !awayTeam) return;
  if (homeTeam.leagueId !== leagueId || awayTeam.leagueId !== leagueId) return;

  const breach = getKickoffRuleBreach({ kickoffAt, homeTeam, awayTeam });

  if (breach) {
    redirectWithScheduleError({
      leagueId,
      message: `Fixture blocked: ${homeTeam.name} vs ${awayTeam.name} at ${formatTimeInLondon(kickoffAt)} breaches a team kick-off rule. ${breach}`,
    });
  }
}

async function validateGeneratedFixtureScheduling(formData: FormData) {
  const leagueId = getString(formData.get("leagueId"));
  const startDate = getString(formData.get("startDate"));
  const startTime = getString(formData.get("startTime"));
  const weekGapDays = parsePositiveInt(formData.get("weekGapDays"), 1);
  const slotMinutes = parsePositiveInt(formData.get("slotMinutes"), 10);
  const pitches = parsePositiveInt(formData.get("pitches"), 1);
  const maxGamesPerNight = parsePositiveInt(formData.get("maxGamesPerNight"), 1);
  const startRound = parsePositiveInt(formData.get("startRound"), 1);
  const doubleRoundRobin = getString(formData.get("doubleRoundRobin")) === "on";

  if (
    !leagueId ||
    !startDate ||
    !startTime ||
    !weekGapDays ||
    !slotMinutes ||
    !pitches ||
    !maxGamesPerNight ||
    !startRound
  ) {
    return;
  }

  let startDateTime: Date;

  try {
    startDateTime = parseLondonDateTime(startDate, startTime);
  } catch {
    return;
  }

  const teams = await prisma.$queryRaw<TeamSchedulingRule[]>`
    SELECT
      "id",
      "name",
      "leagueId",
      "earliestKickoffTime",
      "latestKickoffTime"
    FROM "Team"
    WHERE "leagueId" = ${leagueId}
    ORDER BY "name" ASC
  `;

  if (teams.length < 2) return;

  let rounds = generateRounds(teams.map((team) => team.id));

  if (doubleRoundRobin) {
    rounds = [...rounds, ...mirrorRounds(rounds)];
  }

  const teamMap = new Map(teams.map((team) => [team.id, team]));
  let nightOffset = 0;

  for (const [roundIndex, pairs] of rounds.entries()) {
    const roundNumber = startRound + roundIndex;

    for (
      let chunkStart = 0;
      chunkStart < pairs.length;
      chunkStart += maxGamesPerNight
    ) {
      const nightlyPairs = sortPairsByLatestRestriction(
        pairs.slice(chunkStart, chunkStart + maxGamesPerNight),
        teamMap,
      );
      const roundBase = addDays(startDateTime, nightOffset * weekGapDays);

      for (const [nightlyIndex, pair] of nightlyPairs.entries()) {
        const batch = Math.floor(nightlyIndex / pitches);
        const kickoffAt = addMinutes(roundBase, batch * slotMinutes);
        const homeTeam = teamMap.get(pair.homeId);
        const awayTeam = teamMap.get(pair.awayId);

        if (!homeTeam || !awayTeam) continue;

        const breach = getKickoffRuleBreach({ kickoffAt, homeTeam, awayTeam });

        if (breach) {
          redirectWithScheduleError({
            leagueId,
            message: `Fixture generation blocked: week ${roundNumber} would place ${homeTeam.name} vs ${awayTeam.name} at ${formatTimeInLondon(kickoffAt)}, but ${breach}`,
          });
        }
      }

      nightOffset += 1;
    }
  }
}

export async function createFixtureAction(formData: FormData) {
  await requireAdmin();
  await validateManualFixtureScheduling(formData);
  return createFixtureActionWithoutKickoffRules(formData);
}

export async function updateFixtureAction(formData: FormData) {
  await requireAdmin();
  await validateManualFixtureScheduling(formData);
  return updateFixtureActionWithoutKickoffRules(formData);
}

export async function generateFixtures(formData: FormData) {
  await requireAdmin();
  await validateGeneratedFixtureScheduling(formData);
  return generateFixturesWithoutKickoffRules(formData);
}
