// src/app/admin/fixtures/actions.ts

"use server";

import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/admin";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { FixtureStatus } from "@prisma/client";

type Pair = {
  homeId: string;
  awayId: string;
};

function addDays(d: Date, days: number) {
  const out = new Date(d);
  out.setDate(out.getDate() + days);
  return out;
}

function addMinutes(d: Date, mins: number) {
  const out = new Date(d);
  out.setMinutes(out.getMinutes() + mins);
  return out;
}

function parseOptionalString(value: FormDataEntryValue | null) {
  const str = String(value ?? "").trim();
  return str.length > 0 ? str : null;
}

function parseRequiredString(value: FormDataEntryValue | null, fieldName: string) {
  const str = String(value ?? "").trim();

  if (!str) {
    throw new Error(`${fieldName} is required.`);
  }

  return str;
}

function parseOptionalInt(value: FormDataEntryValue | null, fieldName: string) {
  const str = String(value ?? "").trim();

  if (!str) return null;

  const num = Number(str);

  if (!Number.isInteger(num)) {
    throw new Error(`${fieldName} must be a whole number.`);
  }

  return num;
}

function parseRequiredPositiveInt(value: FormDataEntryValue | null, fieldName: string, min = 1) {
  const str = String(value ?? "").trim();
  const num = Number(str);

  if (!Number.isFinite(num) || num < min) {
    throw new Error(`${fieldName} must be ${min} or more.`);
  }

  return num;
}

function parseKickoffAt(value: FormDataEntryValue | null) {
  const str = String(value ?? "").trim();

  if (!str) {
    throw new Error("Kickoff date/time is required.");
  }

  const date = new Date(str);

  if (Number.isNaN(date.getTime())) {
    throw new Error("Kickoff date/time is invalid.");
  }

  return date;
}

function parseFixtureStatus(value: FormDataEntryValue | null) {
  const str = String(value ?? "").trim();

  if (!str) return FixtureStatus.SCHEDULED;

  if (!Object.values(FixtureStatus).includes(str as FixtureStatus)) {
    throw new Error("Invalid fixture status.");
  }

  return str as FixtureStatus;
}

/**
 * Circle method (round-robin)
 * - Teams are arranged in a list.
 * - Each round pairs first-last, second-secondlast, etc.
 * - Then rotate all but the first team.
 * - If odd teams, add a BYE (null).
 */
function generateRounds(teamIds: string[]): Pair[][] {
  const ids: (string | null)[] = [...teamIds];

  if (ids.length < 2) return [];

  if (ids.length % 2 === 1) ids.push(null);

  const n = ids.length;
  const rounds: Pair[][] = [];
  let arr = [...ids];

  for (let round = 0; round < n - 1; round++) {
    const pairs: Pair[] = [];

    for (let i = 0; i < n / 2; i++) {
      const a = arr[i];
      const b = arr[n - 1 - i];

      if (!a || !b) continue;

      const isEvenRound = round % 2 === 0;
      const homeId = isEvenRound ? a : b;
      const awayId = isEvenRound ? b : a;

      pairs.push({ homeId, awayId });
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
    pairs.map((p) => ({
      homeId: p.awayId,
      awayId: p.homeId,
    }))
  );
}

export async function createFixtureAction(formData: FormData) {
  await requireAdmin();

  const leagueId = parseRequiredString(formData.get("leagueId"), "League");
  const homeTeamId = parseRequiredString(formData.get("homeTeamId"), "Home team");
  const awayTeamId = parseRequiredString(formData.get("awayTeamId"), "Away team");
  const venueId = parseOptionalString(formData.get("venueId"));
  const kickoffAt = parseKickoffAt(formData.get("kickoffAt"));
  const round = parseOptionalInt(formData.get("round"), "Round");
  const status = parseFixtureStatus(formData.get("status"));

  if (homeTeamId === awayTeamId) {
    throw new Error("Home team and away team cannot be the same.");
  }

  const [league, homeTeam, awayTeam, venue] = await Promise.all([
    prisma.league.findUnique({
      where: { id: leagueId },
      select: { id: true, name: true },
    }),
    prisma.team.findUnique({
      where: { id: homeTeamId },
      select: { id: true, name: true, leagueId: true },
    }),
    prisma.team.findUnique({
      where: { id: awayTeamId },
      select: { id: true, name: true, leagueId: true },
    }),
    venueId
      ? prisma.venue.findUnique({
          where: { id: venueId },
          select: { id: true, name: true },
        })
      : Promise.resolve(null),
  ]);

  if (!league) {
    throw new Error("Selected league was not found.");
  }

  if (!homeTeam) {
    throw new Error("Selected home team was not found.");
  }

  if (!awayTeam) {
    throw new Error("Selected away team was not found.");
  }

  if (venueId && !venue) {
    throw new Error("Selected venue was not found.");
  }

  if (homeTeam.leagueId !== leagueId) {
    throw new Error("Home team does not belong to the selected league.");
  }

  if (awayTeam.leagueId !== leagueId) {
    throw new Error("Away team does not belong to the selected league.");
  }

  await prisma.fixture.create({
    data: {
      leagueId,
      homeTeamId,
      awayTeamId,
      venueId,
      kickoffAt,
      round,
      status,
    },
  });

  revalidatePath("/admin/fixtures");
  redirect("/admin/fixtures");
}

export async function deleteFixtureAction(formData: FormData) {
  await requireAdmin();

  const id = parseRequiredString(formData.get("id"), "Fixture ID");

  await prisma.fixture.delete({
    where: { id },
  });

  revalidatePath("/admin/fixtures");
  redirect("/admin/fixtures");
}

export async function generateFixtures(formData: FormData) {
  await requireAdmin();

  const leagueId = parseRequiredString(formData.get("leagueId"), "League");
  const startDate = parseRequiredString(formData.get("startDate"), "Start date");
  const startTime = parseRequiredString(formData.get("startTime"), "Start time");
  const weekGapDays = parseRequiredPositiveInt(formData.get("weekGapDays"), "Week gap days", 1);
  const slotMinutes = parseRequiredPositiveInt(formData.get("slotMinutes"), "Slot minutes", 10);
  const pitches = parseRequiredPositiveInt(formData.get("pitches"), "Pitches", 1);
  const startRound = parseRequiredPositiveInt(formData.get("startRound"), "Start round", 1);
  const doubleRoundRobin = String(formData.get("doubleRoundRobin") || "") === "on";
  const clearExisting = String(formData.get("clearExisting") || "") === "on";
  const venueId = parseOptionalString(formData.get("venueId"));
  const status = parseFixtureStatus(formData.get("status"));

  const league = await prisma.league.findUnique({
    where: { id: leagueId },
    select: { id: true, name: true, season: true },
  });

  if (!league) {
    throw new Error("League not found.");
  }

  const teams = await prisma.team.findMany({
    where: { leagueId },
    orderBy: { name: "asc" },
    select: { id: true, name: true },
  });

  if (teams.length < 2) {
    throw new Error("This league needs at least 2 teams assigned before generating fixtures.");
  }

  if (venueId) {
    const venue = await prisma.venue.findUnique({
      where: { id: venueId },
      select: { id: true },
    });

    if (!venue) {
      throw new Error("Selected venue was not found.");
    }
  }

  if (clearExisting) {
    await prisma.fixture.deleteMany({
      where: { leagueId },
    });
  }

  let rounds = generateRounds(teams.map((t) => t.id));

  if (doubleRoundRobin) {
    rounds = [...rounds, ...mirrorRounds(rounds)];
  }

  const startDateTime = new Date(`${startDate}T${startTime}`);

  if (Number.isNaN(startDateTime.getTime())) {
    throw new Error("Start date/time is invalid.");
  }

  const fixturesToCreate: {
    leagueId: string;
    homeTeamId: string;
    awayTeamId: string;
    venueId: string | null;
    kickoffAt: Date;
    round: number;
    status: FixtureStatus;
  }[] = [];

  rounds.forEach((pairs, roundIndex) => {
    const roundNumber = startRound + roundIndex;
    const roundBase = addDays(startDateTime, roundIndex * weekGapDays);

    pairs.forEach((pair, matchIndex) => {
      const batch = Math.floor(matchIndex / pitches);
      const kickoffAt = addMinutes(roundBase, batch * slotMinutes);

      fixturesToCreate.push({
        leagueId,
        homeTeamId: pair.homeId,
        awayTeamId: pair.awayId,
        venueId,
        kickoffAt,
        round: roundNumber,
        status,
      });
    });
  });

  await prisma.fixture.createMany({
    data: fixturesToCreate,
  });

  revalidatePath("/admin/fixtures");
  revalidatePath("/admin/fixtures/generate");
  redirect("/admin/fixtures");
}