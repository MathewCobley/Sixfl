// ========================================
// File: src/app/(admin)/admin/fixtures/generate/division-actions.ts
// ========================================

"use server";

import { FixtureStatus, Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import {
  formatTimeInLondon,
  getLondonMinutesSinceMidnight,
  parseLondonDateTime,
} from "@/lib/datetime/london";
import { ensureSeasonTeamRowsForLeague } from "@/lib/league-season-teams";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/requireAdmin";

type Pair = { homeId: string; awayId: string };

type TeamSchedulingRule = {
  id: string;
  name: string;
  logoUrl: string | null;
  latestKickoffTime: string | null;
};

function addDays(date: Date, days: number) {
  return new Date(date.getTime() + days * 24 * 60 * 60 * 1000);
}

function addMinutes(date: Date, minutes: number) {
  return new Date(date.getTime() + minutes * 60 * 1000);
}

function parseRequiredString(value: FormDataEntryValue | null, fieldName: string) {
  const parsed = String(value ?? "").trim();
  if (!parsed) throw new Error(`${fieldName} is required.`);
  return parsed;
}

function parseOptionalString(value: FormDataEntryValue | null) {
  const parsed = String(value ?? "").trim();
  return parsed || null;
}

function parseRequiredPositiveInt(value: FormDataEntryValue | null, fieldName: string, min = 1) {
  const parsed = Number(String(value ?? "").trim());
  if (!Number.isInteger(parsed) || parsed < min) {
    throw new Error(`${fieldName} must be ${min} or more.`);
  }
  return parsed;
}

function parseFixtureStatus(value: FormDataEntryValue | null) {
  const parsed = String(value ?? "").trim();
  if (!parsed) return FixtureStatus.SCHEDULED;
  if (!Object.values(FixtureStatus).includes(parsed as FixtureStatus)) {
    throw new Error("Invalid fixture status.");
  }
  return parsed as FixtureStatus;
}

function parseTimeToMinutes(value: string | null) {
  if (!value) return null;
  const match = /^(\d{2}):(\d{2})$/.exec(value);
  if (!match) return null;

  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (!Number.isInteger(hours) || !Number.isInteger(minutes) || hours < 0 || hours > 23 || minutes < 0 || minutes > 59) {
    return null;
  }
  return hours * 60 + minutes;
}

function getSessionCapacity(input: {
  startDate: string;
  startTime: string;
  lastGameStartTime: string;
  slotMinutes: number;
  pitches: number;
}) {
  const startDateTime = parseLondonDateTime(input.startDate, input.startTime);
  const lastGameStartDateTime = parseLondonDateTime(input.startDate, input.lastGameStartTime);
  const sessionMs = lastGameStartDateTime.getTime() - startDateTime.getTime();
  if (sessionMs < 0) throw new Error("Last game start time must be after the session start time.");

  const slotCount = Math.floor(sessionMs / (input.slotMinutes * 60 * 1000)) + 1;
  if (slotCount < 1) throw new Error("The session needs at least one kick-off slot.");

  return { startDateTime, slotCount, gamesPerSession: slotCount * input.pitches };
}

function isKickoffAllowed(kickoffAt: Date, homeTeam: TeamSchedulingRule, awayTeam: TeamSchedulingRule) {
  const kickoffMinutes = getLondonMinutesSinceMidnight(kickoffAt);
  const homeLatest = parseTimeToMinutes(homeTeam.latestKickoffTime);
  const awayLatest = parseTimeToMinutes(awayTeam.latestKickoffTime);

  if (homeLatest !== null && kickoffMinutes > homeLatest) {
    return { allowed: false, reason: `${homeTeam.name} cannot kick off later than ${homeTeam.latestKickoffTime}.` };
  }
  if (awayLatest !== null && kickoffMinutes > awayLatest) {
    return { allowed: false, reason: `${awayTeam.name} cannot kick off later than ${awayTeam.latestKickoffTime}.` };
  }
  return { allowed: true, reason: null };
}

function generateRounds(teamIds: string[]): Pair[][] {
  const ids: (string | null)[] = [...teamIds];
  if (ids.length < 2) return [];
  if (ids.length % 2 === 1) ids.push(null);

  const rounds: Pair[][] = [];
  let arr = [...ids];
  const n = arr.length;

  for (let round = 0; round < n - 1; round += 1) {
    const pairs: Pair[] = [];
    for (let i = 0; i < n / 2; i += 1) {
      const a = arr[i];
      const b = arr[n - 1 - i];
      if (!a || !b) continue;
      const isEvenRound = round % 2 === 0;
      pairs.push({ homeId: isEvenRound ? a : b, awayId: isEvenRound ? b : a });
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
  return rounds.map((pairs) => pairs.map((pair) => ({ homeId: pair.awayId, awayId: pair.homeId })));
}

function sortPairsByRestriction(pairs: Pair[], teamMap: Map<string, TeamSchedulingRule>) {
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

function getRefereeIdsByPitch(formData: FormData, pitches: number) {
  return Array.from({ length: pitches }, (_, index) => {
    const value = String(formData.get(`refereeIdByPitch${index + 1}`) ?? "").trim();
    return value || null;
  });
}

function revalidateFixturePaths(leagueId: string, leagueSlug: string | null) {
  revalidatePath("/admin/fixtures");
  revalidatePath("/admin/fixtures/generate");
  revalidatePath(`/admin/leagues/${leagueId}`);
  revalidatePath(`/admin/leagues/${leagueId}/fixtures`);
  if (leagueSlug) {
    revalidatePath(`/leagues/${leagueSlug}`);
    revalidatePath(`/leagues/${leagueSlug}/fixtures`);
  }
}

async function getGenerationTeams(input: { leagueId: string; divisionId: string | null }) {
  await ensureSeasonTeamRowsForLeague(input.leagueId);

  if (input.divisionId) {
    return prisma.$queryRaw<TeamSchedulingRule[]>(Prisma.sql`
      SELECT t."id", t."name", t."logoUrl", t."latestKickoffTime"
      FROM "LeagueSeasonTeam" lst
      JOIN "Team" t ON t."id" = lst."teamId"
      WHERE lst."leagueId" = ${input.leagueId}
        AND lst."divisionId" = ${input.divisionId}
        AND lst."isActive" = true
      ORDER BY t."name" ASC
    `);
  }

  return prisma.$queryRaw<TeamSchedulingRule[]>(Prisma.sql`
    SELECT t."id", t."name", t."logoUrl", t."latestKickoffTime"
    FROM "LeagueSeasonTeam" lst
    JOIN "Team" t ON t."id" = lst."teamId"
    WHERE lst."leagueId" = ${input.leagueId}
      AND lst."isActive" = true
    ORDER BY t."name" ASC
  `);
}

export async function generateDraftFixturesWithDivisionsAction(formData: FormData) {
  await requireAdmin();

  const leagueId = parseRequiredString(formData.get("leagueId"), "League");
  const divisionId = parseOptionalString(formData.get("divisionId"));
  const startDate = parseRequiredString(formData.get("startDate"), "Start date");
  const startTime = parseRequiredString(formData.get("startTime"), "Start time");
  const lastGameStartTime = parseRequiredString(formData.get("lastGameStartTime"), "Last game start time");
  const weekGapDays = parseRequiredPositiveInt(formData.get("weekGapDays"), "Week gap days", 1);
  const slotMinutes = parseRequiredPositiveInt(formData.get("slotMinutes"), "Slot minutes", 10);
  const pitches = parseRequiredPositiveInt(formData.get("pitches"), "Pitches", 1);
  const startRound = parseRequiredPositiveInt(formData.get("startRound"), "Start week", 1);
  const doubleRoundRobin = String(formData.get("doubleRoundRobin") || "") === "on";
  const clearExisting = String(formData.get("clearExisting") || "") === "on";
  const venueId = parseOptionalString(formData.get("venueId"));
  const status = parseFixtureStatus(formData.get("status"));
  const refereeIdsByPitch = getRefereeIdsByPitch(formData, pitches);
  const selectedRefereeIds = refereeIdsByPitch.filter((refereeId): refereeId is string => refereeId !== null);
  const { startDateTime, slotCount, gamesPerSession } = getSessionCapacity({
    startDate,
    startTime,
    lastGameStartTime,
    slotMinutes,
    pitches,
  });

  const [league, divisionRows, teams, venue, selectedReferees] = await Promise.all([
    prisma.league.findUnique({ where: { id: leagueId }, select: { id: true, name: true, season: true, slug: true } }),
    divisionId
      ? prisma.$queryRaw<Array<{ id: string; name: string }>>(Prisma.sql`
          SELECT "id", "name"
          FROM "LeagueDivision"
          WHERE "id" = ${divisionId}
            AND "leagueId" = ${leagueId}
          LIMIT 1
        `)
      : Promise.resolve([]),
    getGenerationTeams({ leagueId, divisionId }),
    venueId ? prisma.venue.findUnique({ where: { id: venueId }, select: { id: true } }) : Promise.resolve(null),
    prisma.user.findMany({
      where: { id: { in: selectedRefereeIds }, role: "REFEREE" },
      select: { id: true },
    }),
  ]);

  if (!league) throw new Error("League not found.");
  if (divisionId && !divisionRows[0]) throw new Error("Selected division was not found for this league.");
  if (teams.length < 2) {
    throw new Error(divisionId ? "This division needs at least 2 teams assigned before generating fixtures." : "This league needs at least 2 teams assigned before generating fixtures.");
  }
  if (venueId && !venue) throw new Error("Selected venue was not found.");

  const validRefereeIds = new Set(selectedReferees.map((referee) => referee.id));
  const invalidRefereeIds = selectedRefereeIds.filter((refereeId) => !validRefereeIds.has(refereeId));
  if (invalidRefereeIds.length > 0) throw new Error("One or more selected pitch referees could not be found.");

  let rounds = generateRounds(teams.map((team) => team.id));
  if (doubleRoundRobin) rounds = [...rounds, ...mirrorRounds(rounds)];

  const teamMap = new Map<string, TeamSchedulingRule>(teams.map((team) => [team.id, team]));
  const fixturesToCreate: Array<{
    leagueId: string;
    divisionId: string | null;
    homeTeamId: string;
    awayTeamId: string;
    venueId: string | null;
    refereeId: string | null;
    kickoffAt: Date;
    round: number;
    position: number;
    pitch: string;
    status: FixtureStatus;
  }> = [];

  let nightOffset = 0;

  rounds.forEach((pairs, roundIndex) => {
    const roundNumber = startRound + roundIndex;
    for (let chunkStart = 0; chunkStart < pairs.length; chunkStart += gamesPerSession) {
      const nightlyPairs = sortPairsByRestriction(pairs.slice(chunkStart, chunkStart + gamesPerSession), teamMap);
      const sessionBase = addDays(startDateTime, nightOffset * weekGapDays);

      nightlyPairs.forEach((pair, nightlyIndex) => {
        const slotIndex = Math.floor(nightlyIndex / pitches);
        const pitchNumber = (nightlyIndex % pitches) + 1;
        if (slotIndex >= slotCount) throw new Error("Fixture generation tried to use more slots than the session allows.");

        const kickoffAt = addMinutes(sessionBase, slotIndex * slotMinutes);
        const homeTeam = teamMap.get(pair.homeId);
        const awayTeam = teamMap.get(pair.awayId);
        if (!homeTeam || !awayTeam) throw new Error("Fixture generation failed because a team was missing.");

        const allowed = isKickoffAllowed(kickoffAt, homeTeam, awayTeam);
        if (!allowed.allowed) {
          throw new Error(`Unable to generate fixtures. Week ${roundNumber} would place ${homeTeam.name} vs ${awayTeam.name} at ${formatTimeInLondon(kickoffAt)}, but ${allowed.reason}`);
        }

        fixturesToCreate.push({
          leagueId,
          divisionId,
          homeTeamId: pair.homeId,
          awayTeamId: pair.awayId,
          venueId,
          refereeId: refereeIdsByPitch[pitchNumber - 1] ?? null,
          kickoffAt,
          round: roundNumber,
          position: chunkStart + nightlyIndex + 1,
          pitch: `Pitch ${pitchNumber}`,
          status,
        });
      });

      nightOffset += 1;
    }
  });

  if (fixturesToCreate.length === 0) throw new Error("No fixtures could be generated.");

  await prisma.$transaction(async (tx) => {
    if (clearExisting) {
      if (divisionId) {
        await tx.$executeRaw(Prisma.sql`
          DELETE FROM "Fixture"
          WHERE "leagueId" = ${leagueId}
            AND "divisionId" = ${divisionId}
        `);
      } else {
        await tx.fixture.deleteMany({ where: { leagueId } });
      }
    }

    for (const fixtureData of fixturesToCreate) {
      const created = await tx.fixture.create({
        data: {
          leagueId: fixtureData.leagueId,
          homeTeamId: fixtureData.homeTeamId,
          awayTeamId: fixtureData.awayTeamId,
          venueId: fixtureData.venueId,
          refereeId: fixtureData.refereeId,
          kickoffAt: fixtureData.kickoffAt,
          round: fixtureData.round,
          position: fixtureData.position,
          pitch: fixtureData.pitch,
          status: fixtureData.status,
        },
        select: { id: true },
      });

      if (fixtureData.divisionId) {
        await tx.$executeRaw(Prisma.sql`
          UPDATE "Fixture"
          SET "divisionId" = ${fixtureData.divisionId}, "updatedAt" = NOW()
          WHERE "id" = ${created.id}
        `);
      }
    }
  });

  revalidateFixturePaths(leagueId, league.slug);
  redirect(`/admin/fixtures?leagueId=${encodeURIComponent(leagueId)}&generated=${fixturesToCreate.length}`);
}
