// ========================================
// File: src/app/(admin)/admin/fixtures/generate/division-actions.ts
// ========================================

"use server";

import { FixtureStatus, NotificationDispatchStatus, Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import {
  formatTimeInLondon,
  getLondonMinutesSinceMidnight,
  parseLondonDateTime,
} from "@/lib/datetime/london";
import { ensureSeasonTeamRowsForLeague } from "@/lib/league-season-teams";
import { voidFixtureMatchFeeChargesOrThrow } from "@/lib/payments/fixture-match-fees";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/requireAdmin";

type Pair = { team1Id: string; team2Id: string };
type CountRow = { count: number | bigint };

type TeamSchedulingRule = {
  id: string;
  name: string;
  logoUrl: string | null;
  latestKickoffTime: string | null;
  standardMatchFeePence: number | null;
};

type FixtureDeletionDbClient = Pick<typeof prisma, "fixture" | "paymentCharge" | "notificationDispatch">;

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
  const match = /^(\d{1,2}):(\d{2})(?::\d{2})?$/.exec(value.trim());
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

function isKickoffAllowed(kickoffAt: Date, team1: TeamSchedulingRule, team2: TeamSchedulingRule) {
  const kickoffMinutes = getLondonMinutesSinceMidnight(kickoffAt);
  const team1Latest = parseTimeToMinutes(team1.latestKickoffTime);
  const team2Latest = parseTimeToMinutes(team2.latestKickoffTime);

  if (team1Latest !== null && kickoffMinutes > team1Latest) {
    return { allowed: false, reason: `${team1.name} cannot kick off later than ${team1.latestKickoffTime}.` };
  }
  if (team2Latest !== null && kickoffMinutes > team2Latest) {
    return { allowed: false, reason: `${team2.name} cannot kick off later than ${team2.latestKickoffTime}.` };
  }
  return { allowed: true, reason: null };
}

function getStandardFixtureFee(team1: TeamSchedulingRule, team2: TeamSchedulingRule) {
  const team1Fee = team1.standardMatchFeePence ?? 0;
  const team2Fee = team2.standardMatchFeePence ?? 0;
  const highestFee = Math.max(team1Fee, team2Fee);
  return highestFee > 0 ? highestFee : null;
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
      pairs.push({ team1Id: a, team2Id: b });
    }
    rounds.push(pairs);
    const fixed = arr[0];
    const rest = arr.slice(1);
    rest.unshift(rest.pop()!);
    arr = [fixed, ...rest];
  }

  return rounds;
}

function repeatRounds(rounds: Pair[][]): Pair[][] {
  return rounds.map((pairs) =>
    pairs.map((pair) => ({ team1Id: pair.team1Id, team2Id: pair.team2Id })),
  );
}

function sortPairsByRestriction(pairs: Pair[], teamMap: Map<string, TeamSchedulingRule>) {
  return [...pairs].sort((a, b) => {
    const aTeam1 = teamMap.get(a.team1Id);
    const aTeam2 = teamMap.get(a.team2Id);
    const bTeam1 = teamMap.get(b.team1Id);
    const bTeam2 = teamMap.get(b.team2Id);
    const aLimit = Math.min(
      parseTimeToMinutes(aTeam1?.latestKickoffTime ?? null) ?? Number.MAX_SAFE_INTEGER,
      parseTimeToMinutes(aTeam2?.latestKickoffTime ?? null) ?? Number.MAX_SAFE_INTEGER,
    );
    const bLimit = Math.min(
      parseTimeToMinutes(bTeam1?.latestKickoffTime ?? null) ?? Number.MAX_SAFE_INTEGER,
      parseTimeToMinutes(bTeam2?.latestKickoffTime ?? null) ?? Number.MAX_SAFE_INTEGER,
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

function getUnpublishedFixtureWhere(input: { leagueId: string; divisionId: string | null }) {
  return {
    leagueId: input.leagueId,
    publishedAt: null,
    ...(input.divisionId ? { divisionId: input.divisionId } : {}),
  };
}

async function getUnpublishedFixtureIds(input: {
  db: Pick<typeof prisma, "fixture">;
  leagueId: string;
  divisionId: string | null;
}) {
  const fixtures = await input.db.fixture.findMany({
    where: getUnpublishedFixtureWhere({
      leagueId: input.leagueId,
      divisionId: input.divisionId,
    }),
    select: { id: true },
  });

  return fixtures.map((fixture) => fixture.id);
}

async function cancelQueuedFixtureDispatches(input: {
  db: FixtureDeletionDbClient;
  fixtureIds: string[];
  reason: string;
}) {
  if (input.fixtureIds.length === 0) return;

  await input.db.notificationDispatch.updateMany({
    where: {
      status: NotificationDispatchStatus.QUEUED,
      OR: input.fixtureIds.flatMap((fixtureId) => [
        { sourceId: fixtureId },
        { sourceId: { startsWith: `${fixtureId}:` } },
      ]),
    },
    data: {
      status: NotificationDispatchStatus.CANCELLED,
      cancelledAt: new Date(),
      failureReason: input.reason,
    },
  });
}

async function deleteUnpublishedFixtures(input: {
  db: FixtureDeletionDbClient;
  leagueId: string;
  divisionId: string | null;
}) {
  const fixtureIds = await getUnpublishedFixtureIds({
    db: input.db,
    leagueId: input.leagueId,
    divisionId: input.divisionId,
  });

  if (fixtureIds.length === 0) return 0;

  await voidFixtureMatchFeeChargesOrThrow(fixtureIds, input.db);
  await cancelQueuedFixtureDispatches({
    db: input.db,
    fixtureIds,
    reason: "Unpublished fixture was deleted before queued fixture messages were sent.",
  });

  const result = await input.db.fixture.deleteMany({
    where: getUnpublishedFixtureWhere({
      leagueId: input.leagueId,
      divisionId: input.divisionId,
    }),
  });

  return result.count;
}

async function getGenerationTeams(input: { leagueId: string; divisionId: string | null }) {
  await ensureSeasonTeamRowsForLeague(input.leagueId);

  if (input.divisionId) {
    return prisma.$queryRaw<TeamSchedulingRule[]>(Prisma.sql`
      SELECT t."id", t."name", t."logoUrl", t."latestKickoffTime", t."standardMatchFeePence"
      FROM "LeagueSeasonTeam" lst
      JOIN "Team" t ON t."id" = lst."teamId"
      WHERE lst."leagueId" = ${input.leagueId}
        AND lst."divisionId" = ${input.divisionId}
        AND lst."isActive" = true
        AND COALESCE(t."isFixturePlaceholder", false) = false
      ORDER BY t."name" ASC
    `);
  }

  return prisma.$queryRaw<TeamSchedulingRule[]>(Prisma.sql`
    SELECT t."id", t."name", t."logoUrl", t."latestKickoffTime", t."standardMatchFeePence"
    FROM "LeagueSeasonTeam" lst
    JOIN "Team" t ON t."id" = lst."teamId"
    WHERE lst."leagueId" = ${input.leagueId}
      AND lst."isActive" = true
      AND COALESCE(t."isFixturePlaceholder", false) = false
    ORDER BY t."name" ASC
  `);
}

export async function deleteUnpublishedFixturesAction(formData: FormData) {
  await requireAdmin();

  const leagueId = parseRequiredString(formData.get("leagueId"), "League");
  const divisionId = parseOptionalString(formData.get("divisionId"));

  const [league, divisionRows] = await Promise.all([
    prisma.league.findUnique({ where: { id: leagueId }, select: { id: true, slug: true } }),
    divisionId
      ? prisma.$queryRaw<Array<{ id: string }>>(Prisma.sql`
          SELECT "id"
          FROM "LeagueDivision"
          WHERE "id" = ${divisionId}
            AND "leagueId" = ${leagueId}
          LIMIT 1
        `)
      : Promise.resolve([]),
  ]);

  if (!league) throw new Error("League not found.");
  if (divisionId && !divisionRows[0]) throw new Error("Selected division was not found for this league.");

  const deletedCount = await prisma.$transaction((tx) =>
    deleteUnpublishedFixtures({ db: tx, leagueId, divisionId }),
  );

  revalidateFixturePaths(leagueId, league.slug);
  redirect(`/admin/fixtures/generate?unpublishedDeleted=${deletedCount}`);
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

  const [league, divisionRows, teams, venue, selectedReferees, activeDivisionRows] = await Promise.all([
    prisma.league.findUnique({ where: { id: leagueId }, select: { id: true, name: true, season: true, slug: true } }),
    divisionId
      ? prisma.$queryRaw<Array<{ id: string; name: string }>>(Prisma.sql`
          SELECT "id", "name"
          FROM "LeagueDivision"
          WHERE "id" = ${divisionId}
            AND "leagueId" = ${leagueId}
            AND "isActive" = true
          LIMIT 1
        `)
      : Promise.resolve([]),
    getGenerationTeams({ leagueId, divisionId }),
    venueId ? prisma.venue.findUnique({ where: { id: venueId }, select: { id: true } }) : Promise.resolve(null),
    prisma.user.findMany({
      where: { id: { in: selectedRefereeIds }, role: "REFEREE" },
      select: { id: true },
    }),
    prisma.$queryRaw<CountRow[]>(Prisma.sql`
      SELECT COUNT(*)::int AS "count"
      FROM "LeagueDivision"
      WHERE "leagueId" = ${leagueId}
        AND "isActive" = true
    `),
  ]);

  if (!league) throw new Error("League not found.");
  if (divisionId && !divisionRows[0]) throw new Error("Selected active division was not found for this league.");
  if (!divisionId && Number(activeDivisionRows[0]?.count ?? 0) > 0) {
    throw new Error("This league uses active divisions. Choose the exact division to schedule so teams from different divisions cannot be mixed.");
  }
  if (teams.length < 2) {
    throw new Error(divisionId ? "This division needs at least 2 active teams assigned before generating fixtures. Check the teams are still attached to this season." : "This league needs at least 2 active teams assigned before generating fixtures. Check the teams are still attached to this season.");
  }
  if (venueId && !venue) throw new Error("Selected venue was not found.");

  const validRefereeIds = new Set(selectedReferees.map((referee) => referee.id));
  const invalidRefereeIds = selectedRefereeIds.filter((refereeId) => !validRefereeIds.has(refereeId));
  if (invalidRefereeIds.length > 0) throw new Error("One or more selected pitch referees could not be found.");

  let rounds = generateRounds(teams.map((team) => team.id));
  if (doubleRoundRobin) rounds = [...rounds, ...repeatRounds(rounds)];

  const teamMap = new Map<string, TeamSchedulingRule>(teams.map((team) => [team.id, team]));
  const fixturesToCreate: Array<{
    leagueId: string;
    divisionId: string | null;
    team1Id: string;
    team2Id: string;
    venueId: string | null;
    refereeId: string | null;
    kickoffAt: Date;
    round: number;
    position: number;
    pitch: string;
    status: FixtureStatus;
    matchFeePence: number | null;
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
        const team1 = teamMap.get(pair.team1Id);
        const team2 = teamMap.get(pair.team2Id);
        if (!team1 || !team2) throw new Error("Fixture generation failed because a team was missing.");

        const allowed = isKickoffAllowed(kickoffAt, team1, team2);
        if (!allowed.allowed) {
          throw new Error(`Unable to generate fixtures. Week ${roundNumber} would place ${team1.name} vs ${team2.name} at ${formatTimeInLondon(kickoffAt)}, but ${allowed.reason}`);
        }

        fixturesToCreate.push({
          leagueId,
          divisionId,
          team1Id: pair.team1Id,
          team2Id: pair.team2Id,
          venueId,
          refereeId: refereeIdsByPitch[pitchNumber - 1] ?? null,
          kickoffAt,
          round: roundNumber,
          position: chunkStart + nightlyIndex + 1,
          pitch: `Pitch ${pitchNumber}`,
          status,
          matchFeePence: getStandardFixtureFee(team1, team2),
        });
      });

      nightOffset += 1;
    }
  });

  if (fixturesToCreate.length === 0) throw new Error("No fixtures could be generated.");

  await prisma.$transaction(async (tx) => {
    if (clearExisting) {
      await deleteUnpublishedFixtures({ db: tx, leagueId, divisionId });
    }

    for (const fixtureData of fixturesToCreate) {
      const created = await tx.fixture.create({
        data: {
          leagueId: fixtureData.leagueId,
          // Legacy database column names are technical team slots only.
          homeTeamId: fixtureData.team1Id,
          awayTeamId: fixtureData.team2Id,
          venueId: fixtureData.venueId,
          refereeId: fixtureData.refereeId,
          kickoffAt: fixtureData.kickoffAt,
          round: fixtureData.round,
          position: fixtureData.position,
          pitch: fixtureData.pitch,
          status: fixtureData.status,
          matchFeePence: fixtureData.matchFeePence,
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
