// ========================================
// File: src/app/(admin)/admin/fixtures/actions.ts
// ========================================

"use server";

import {
  FixtureStatus,
  NotificationDispatchStatus,
} from "@prisma/client";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  formatTimeInLondon,
  getLondonMinutesSinceMidnight,
  parseLondonDateTime,
} from "@/lib/datetime/london";
import {
  cancelQueuedMatchFeeNotificationDispatches,
  queueFixtureMatchFeeEmails,
  syncFixtureMatchFeeCharges,
  voidFixtureMatchFeeChargesOrThrow,
} from "@/lib/payments/fixture-match-fees";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/requireAdmin";

type Pair = {
  homeId: string;
  awayId: string;
};

type TeamSchedulingRule = {
  id: string;
  name: string;
  latestKickoffTime: string | null;
};

type FixtureNotificationDbClient = Pick<
  typeof prisma,
  "notificationDispatch" | "paymentCharge"
>;

type FixtureMatchFeeChargeTarget = "BOTH_TEAMS" | "HOME_ONLY" | "AWAY_ONLY";

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

function parseRequiredString(
  value: FormDataEntryValue | null,
  fieldName: string,
) {
  const str = String(value ?? "").trim();

  if (!str) {
    throw new Error(`${fieldName} is required.`);
  }

  return str;
}

function parseOptionalInt(
  value: FormDataEntryValue | null,
  fieldName: string,
) {
  const str = String(value ?? "").trim();

  if (!str) return null;

  const num = Number(str);

  if (!Number.isInteger(num)) {
    throw new Error(`${fieldName} must be a whole number.`);
  }

  return num;
}

function parseOptionalPositiveInt(
  value: FormDataEntryValue | null,
  fieldName: string,
  min = 0,
) {
  const str = String(value ?? "").trim();

  if (!str) return null;

  const num = Number(str);

  if (!Number.isInteger(num) || num < min) {
    throw new Error(`${fieldName} must be ${min} or more.`);
  }

  return num;
}

function parseRequiredPositiveInt(
  value: FormDataEntryValue | null,
  fieldName: string,
  min = 1,
) {
  const str = String(value ?? "").trim();
  const num = Number(str);

  if (!Number.isFinite(num) || !Number.isInteger(num) || num < min) {
    throw new Error(`${fieldName} must be ${min} or more.`);
  }

  return num;
}

function parseMatchFeeInput(
  value: FormDataEntryValue | null,
  fieldName: string,
): {
  matchFeePence: number | null;
  chargeTarget: FixtureMatchFeeChargeTarget;
} {
  const str = String(value ?? "").trim();

  if (!str) {
    return {
      matchFeePence: null,
      chargeTarget: "BOTH_TEAMS",
    };
  }

  const lower = str.toLowerCase();
  const chargeTarget: FixtureMatchFeeChargeTarget =
    /\b(home|team\s*1|team1|one\s*team\s*1)\b/.test(lower)
      ? "HOME_ONLY"
      : /\b(away|team\s*2|team2|one\s*team\s*2)\b/.test(lower)
        ? "AWAY_ONLY"
        : "BOTH_TEAMS";

  const amountMatch = str.match(/\d+(?:\.\d{1,2})?/);
  const amount = amountMatch ? Number(amountMatch[0]) : Number.NaN;

  if (!Number.isFinite(amount) || amount < 0) {
    throw new Error(`${fieldName} must be 0 or more.`);
  }

  if (amount === 0) {
    return {
      matchFeePence: null,
      chargeTarget,
    };
  }

  return {
    matchFeePence: Math.round(amount * 100),
    chargeTarget,
  };
}

function parseKickoffAtFromFields(
  dateValue: FormDataEntryValue | null,
  timeValue: FormDataEntryValue | null,
) {
  const dateStr = String(dateValue ?? "").trim();
  const timeStr = String(timeValue ?? "").trim();

  if (!dateStr || !timeStr) {
    throw new Error("Kickoff date and time are required.");
  }

  return parseLondonDateTime(dateStr, timeStr);
}

function parseFixtureStatus(value: FormDataEntryValue | null) {
  const str = String(value ?? "").trim();

  if (!str) return FixtureStatus.SCHEDULED;

  if (!Object.values(FixtureStatus).includes(str as FixtureStatus)) {
    throw new Error("Invalid fixture status.");
  }

  return str as FixtureStatus;
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

function getKickoffMinutes(kickoffAt: Date) {
  return getLondonMinutesSinceMidnight(kickoffAt);
}

function isKickoffAllowed(
  kickoffAt: Date,
  homeTeam: TeamSchedulingRule,
  awayTeam: TeamSchedulingRule,
) {
  const kickoffMinutes = getKickoffMinutes(kickoffAt);
  const homeLatest = parseTimeToMinutes(homeTeam.latestKickoffTime);
  const awayLatest = parseTimeToMinutes(awayTeam.latestKickoffTime);

  if (homeLatest !== null && kickoffMinutes > homeLatest) {
    return {
      allowed: false,
      reason: `${homeTeam.name} cannot kick off later than ${homeTeam.latestKickoffTime}.`,
    };
  }

  if (awayLatest !== null && kickoffMinutes > awayLatest) {
    return {
      allowed: false,
      reason: `${awayTeam.name} cannot kick off later than ${awayTeam.latestKickoffTime}.`,
    };
  }

  return {
    allowed: true,
    reason: null,
  };
}

async function cancelQueuedFixtureReminderDispatches(
  fixtureIds: string[],
  db: FixtureNotificationDbClient = prisma,
) {
  if (fixtureIds.length === 0) {
    return;
  }

  await db.notificationDispatch.updateMany({
    where: {
      sourceType: "FIXTURE_REMINDER",
      sourceId: {
        in: fixtureIds,
      },
      status: NotificationDispatchStatus.QUEUED,
    },
    data: {
      status: NotificationDispatchStatus.CANCELLED,
      cancelledAt: new Date(),
      failureReason: "Fixture deleted before reminder was sent.",
    },
  });
}

async function cancelQueuedFixtureNotificationDispatches(
  fixtureIds: string[],
  db: FixtureNotificationDbClient = prisma,
) {
  if (fixtureIds.length === 0) {
    return;
  }

  await cancelQueuedFixtureReminderDispatches(fixtureIds, db);

  const charges = await db.paymentCharge.findMany({
    where: {
      fixtureId: {
        in: fixtureIds,
      },
    },
    select: {
      id: true,
    },
  });

  await cancelQueuedMatchFeeNotificationDispatches(
    charges.map((charge) => charge.id),
    db,
    {
      reason: "Fixture deleted before queued match fee emails were sent.",
    },
  );
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
    })),
  );
}

function sortPairsByRestriction(
  pairs: Pair[],
  teamMap: Map<string, TeamSchedulingRule>,
) {
  return [...pairs].sort((a, b) => {
    const aHome = teamMap.get(a.homeId);
    const aAway = teamMap.get(a.awayId);
    const bHome = teamMap.get(b.homeId);
    const bAway = teamMap.get(b.awayId);

    const aLimit = Math.min(
      parseTimeToMinutes(aHome?.latestKickoffTime ?? null) ??
        Number.MAX_SAFE_INTEGER,
      parseTimeToMinutes(aAway?.latestKickoffTime ?? null) ??
        Number.MAX_SAFE_INTEGER,
    );

    const bLimit = Math.min(
      parseTimeToMinutes(bHome?.latestKickoffTime ?? null) ??
        Number.MAX_SAFE_INTEGER,
      parseTimeToMinutes(bAway?.latestKickoffTime ?? null) ??
        Number.MAX_SAFE_INTEGER,
    );

    return aLimit - bLimit;
  });
}

export async function submitResultAction(formData: FormData) {
  await requireAdmin();

  const fixtureId = parseRequiredString(formData.get("fixtureId"), "Fixture ID");
  const homeScore = parseRequiredPositiveInt(
    formData.get("homeScore"),
    "Team 1 score",
    0,
  );
  const awayScore = parseRequiredPositiveInt(
    formData.get("awayScore"),
    "Team 2 score",
    0,
  );

  const fixture = await prisma.fixture.findUnique({
    where: { id: fixtureId },
    select: {
      id: true,
      leagueId: true,
      league: {
        select: {
          slug: true,
        },
      },
    },
  });

  if (!fixture) {
    throw new Error("Fixture not found.");
  }

  await prisma.$transaction([
    prisma.matchResult.upsert({
      where: { fixtureId },
      update: {
        homeScore,
        awayScore,
        enteredAt: new Date(),
      },
      create: {
        fixtureId,
        homeScore,
        awayScore,
      },
    }),
    prisma.fixture.update({
      where: { id: fixtureId },
      data: {
        status: FixtureStatus.COMPLETED,
      },
    }),
  ]);

  revalidatePath("/admin/fixtures");
  revalidatePath(`/admin/leagues/${fixture.leagueId}/fixtures`);
  revalidatePath(`/admin/leagues/${fixture.leagueId}`);

  if (fixture.league.slug) {
    revalidatePath(`/leagues/${fixture.league.slug}`);
    revalidatePath(`/leagues/${fixture.league.slug}/fixtures`);
  }
}

export async function createFixtureAction(formData: FormData) {
  await requireAdmin();

  const leagueId = parseRequiredString(formData.get("leagueId"), "League");
  const homeTeamId = parseRequiredString(formData.get("homeTeamId"), "Team 1");
  const awayTeamId = parseRequiredString(formData.get("awayTeamId"), "Team 2");
  const venueId = parseOptionalString(formData.get("venueId"));
  const refereeId = parseOptionalString(formData.get("refereeId"));
  const kickoffAt = parseKickoffAtFromFields(
    formData.get("kickoffDate"),
    formData.get("kickoffTime"),
  );
  const round = parseOptionalInt(formData.get("round"), "Week");
  const position = parseOptionalPositiveInt(
    formData.get("position"),
    "Position",
    1,
  );
  const pitch = parseOptionalString(formData.get("pitch"));
  const status = parseFixtureStatus(formData.get("status"));
  const matchFeeInput = parseMatchFeeInput(
    formData.get("matchFeePounds"),
    "Match fee",
  );

  if (homeTeamId === awayTeamId) {
    throw new Error("Team 1 and Team 2 cannot be the same team.");
  }

  const [league, homeTeam, awayTeam, venue, referee] = await Promise.all([
    prisma.league.findUnique({
      where: { id: leagueId },
      select: { id: true, name: true, season: true, slug: true },
    }),
    prisma.team.findUnique({
      where: { id: homeTeamId },
      select: { id: true, name: true, leagueId: true, logoUrl: true },
    }),
    prisma.team.findUnique({
      where: { id: awayTeamId },
      select: { id: true, name: true, leagueId: true, logoUrl: true },
    }),
    venueId
      ? prisma.venue.findUnique({
          where: { id: venueId },
          select: { id: true, name: true },
        })
      : Promise.resolve(null),
    refereeId
      ? prisma.user.findUnique({
          where: { id: refereeId },
          select: { id: true, role: true, name: true, email: true },
        })
      : Promise.resolve(null),
  ]);

  if (!league) {
    throw new Error("Selected league was not found.");
  }

  if (!homeTeam) {
    throw new Error("Selected Team 1 was not found.");
  }

  if (!awayTeam) {
    throw new Error("Selected Team 2 was not found.");
  }

  if (venueId && !venue) {
    throw new Error("Selected venue was not found.");
  }

  if (refereeId && (!referee || referee.role !== "REFEREE")) {
    throw new Error("Selected referee was not found.");
  }

  if (homeTeam.leagueId !== leagueId) {
    throw new Error("Team 1 does not belong to the selected league.");
  }

  if (awayTeam.leagueId !== leagueId) {
    throw new Error("Team 2 does not belong to the selected league.");
  }

  const created = await prisma.$transaction(async (tx) => {
    const fixture = await tx.fixture.create({
      data: {
        leagueId,
        homeTeamId,
        awayTeamId,
        venueId,
        refereeId,
        kickoffAt,
        round,
        position,
        pitch,
        status,
        matchFeePence: matchFeeInput.matchFeePence,
      },
    });

    const chargeSync = await syncFixtureMatchFeeCharges({
      db: tx,
      fixtureId: fixture.id,
      leagueId,
      leagueName: league.name,
      leagueSeason: league.season,
      kickoffAt,
      homeTeam,
      awayTeam,
      matchFeePence: matchFeeInput.matchFeePence,
      chargeTarget: matchFeeInput.chargeTarget,
    });

    return {
      fixture,
      activeCharges: chargeSync.activeCharges,
    };
  });

  if ((matchFeeInput.matchFeePence ?? 0) > 0 && created.activeCharges.length > 0) {
    try {
      await queueFixtureMatchFeeEmails({
        fixtureId: created.fixture.id,
        leagueId,
        leagueName: league.name,
        leagueSeason: league.season,
        kickoffAt,
        homeTeam,
        awayTeam,
        matchFeePence: matchFeeInput.matchFeePence,
        chargeTarget: matchFeeInput.chargeTarget,
        charges: created.activeCharges,
        mode: "all",
      });
    } catch (error) {
      console.error("Failed to queue fixture match fee emails", error);
    }
  }

  revalidatePath("/admin/fixtures");
  revalidatePath(`/admin/leagues/${leagueId}/fixtures`);
  revalidatePath(`/admin/leagues/${leagueId}`);

  if (league.slug) {
    revalidatePath(`/leagues/${league.slug}`);
    revalidatePath(`/leagues/${league.slug}/fixtures`);
  }

  redirect("/admin/fixtures");
}

export async function updateFixtureAction(formData: FormData) {
  await requireAdmin();

  const fixtureId = parseRequiredString(formData.get("fixtureId"), "Fixture ID");
  const leagueId = parseRequiredString(formData.get("leagueId"), "League");
  const homeTeamId = parseRequiredString(formData.get("homeTeamId"), "Team 1");
  const awayTeamId = parseRequiredString(formData.get("awayTeamId"), "Team 2");
  const venueId = parseOptionalString(formData.get("venueId"));
  const refereeId = parseOptionalString(formData.get("refereeId"));
  const kickoffAt = parseKickoffAtFromFields(
    formData.get("kickoffDate"),
    formData.get("kickoffTime"),
  );
  const round = parseOptionalInt(formData.get("round"), "Week");
  const position = parseOptionalPositiveInt(
    formData.get("position"),
    "Position",
    1,
  );
  const pitch = parseOptionalString(formData.get("pitch"));
  const status = parseFixtureStatus(formData.get("status"));
  const matchFeeInput = parseMatchFeeInput(
    formData.get("matchFeePounds"),
    "Match fee",
  );

  if (homeTeamId === awayTeamId) {
    throw new Error("Team 1 and Team 2 cannot be the same team.");
  }

  const [fixture, league, homeTeam, awayTeam, venue, referee] =
    await Promise.all([
      prisma.fixture.findUnique({
        where: { id: fixtureId },
        select: {
          id: true,
          leagueId: true,
          homeTeamId: true,
          awayTeamId: true,
          matchFeePence: true,
          league: {
            select: {
              slug: true,
            },
          },
        },
      }),
      prisma.league.findUnique({
        where: { id: leagueId },
        select: { id: true, name: true, season: true, slug: true },
      }),
      prisma.team.findUnique({
        where: { id: homeTeamId },
        select: { id: true, name: true, leagueId: true, logoUrl: true },
      }),
      prisma.team.findUnique({
        where: { id: awayTeamId },
        select: { id: true, name: true, leagueId: true, logoUrl: true },
      }),
      venueId
        ? prisma.venue.findUnique({
            where: { id: venueId },
            select: { id: true, name: true },
          })
        : Promise.resolve(null),
      refereeId
        ? prisma.user.findUnique({
            where: { id: refereeId },
            select: { id: true, role: true, name: true, email: true },
          })
        : Promise.resolve(null),
    ]);

  if (!fixture) {
    throw new Error("Fixture not found.");
  }

  if (!league) {
    throw new Error("Selected league was not found.");
  }

  if (!homeTeam) {
    throw new Error("Selected Team 1 was not found.");
  }

  if (!awayTeam) {
    throw new Error("Selected Team 2 was not found.");
  }

  if (venueId && !venue) {
    throw new Error("Selected venue was not found.");
  }

  if (refereeId && (!referee || referee.role !== "REFEREE")) {
    throw new Error("Selected referee was not found.");
  }

  if (homeTeam.leagueId !== leagueId) {
    throw new Error("Team 1 does not belong to the selected league.");
  }

  if (awayTeam.leagueId !== leagueId) {
    throw new Error("Team 2 does not belong to the selected league.");
  }

  const updated = await prisma.$transaction(async (tx) => {
    const chargeSync = await syncFixtureMatchFeeCharges({
      db: tx,
      fixtureId,
      leagueId,
      leagueName: league.name,
      leagueSeason: league.season,
      kickoffAt,
      homeTeam,
      awayTeam,
      matchFeePence: matchFeeInput.matchFeePence,
      chargeTarget: matchFeeInput.chargeTarget,
    });

    const updatedFixture = await tx.fixture.update({
      where: { id: fixtureId },
      data: {
        leagueId,
        homeTeamId,
        awayTeamId,
        venueId,
        refereeId,
        kickoffAt,
        round,
        position,
        pitch,
        status,
        matchFeePence: matchFeeInput.matchFeePence,
      },
    });

    return {
      fixture: updatedFixture,
      activeCharges: chargeSync.activeCharges,
    };
  });

  const hadExistingFee = (fixture.matchFeePence ?? 0) > 0;
  const hasMatchFee = (matchFeeInput.matchFeePence ?? 0) > 0;
  const teamsChanged =
    fixture.homeTeamId !== homeTeamId || fixture.awayTeamId !== awayTeamId;
  const feeAmountChanged =
    (fixture.matchFeePence ?? 0) !== (matchFeeInput.matchFeePence ?? 0);

  const shouldSendInitialFeeEmail =
    !hadExistingFee || teamsChanged || feeAmountChanged;

  if (hasMatchFee && updated.activeCharges.length > 0) {
    await cancelQueuedMatchFeeNotificationDispatches(
      updated.activeCharges.map((charge) => charge.id),
      prisma,
      shouldSendInitialFeeEmail
        ? {
            reason:
              "Fixture payment details changed before queued match fee emails were sent.",
          }
        : {
            includeInitialRequest: false,
            reason:
              "Fixture reminder schedule changed before queued reminder emails were sent.",
          },
    );

    try {
      await queueFixtureMatchFeeEmails({
        fixtureId,
        leagueId,
        leagueName: league.name,
        leagueSeason: league.season,
        kickoffAt,
        homeTeam,
        awayTeam,
        matchFeePence: matchFeeInput.matchFeePence,
        chargeTarget: matchFeeInput.chargeTarget,
        charges: updated.activeCharges,
        mode: shouldSendInitialFeeEmail ? "all" : "reminders_only",
      });
    } catch (error) {
      console.error("Failed to queue fixture match fee emails", error);
    }
  }

  revalidatePath("/admin/fixtures");
  revalidatePath(`/admin/leagues/${leagueId}/fixtures`);
  revalidatePath(`/admin/leagues/${leagueId}`);

  if (league.slug) {
    revalidatePath(`/leagues/${league.slug}`);
    revalidatePath(`/leagues/${league.slug}/fixtures`);
  }

  if (fixture.league.slug && fixture.league.slug !== league.slug) {
    revalidatePath(`/leagues/${fixture.league.slug}`);
    revalidatePath(`/leagues/${fixture.league.slug}/fixtures`);
  }

  redirect("/admin/fixtures");
}

export async function deleteFixtureAction(formData: FormData) {
  await requireAdmin();

  const id = parseRequiredString(formData.get("id"), "Fixture ID");

  const fixture = await prisma.fixture.findUnique({
    where: { id },
    select: {
      id: true,
      leagueId: true,
      league: {
        select: {
          slug: true,
        },
      },
    },
  });

  if (!fixture) {
    throw new Error("Fixture not found.");
  }

  await prisma.$transaction(async (tx) => {
    const fixtureIdsToDelete = [id];

    await voidFixtureMatchFeeChargesOrThrow(fixtureIdsToDelete, tx);
    await cancelQueuedFixtureNotificationDispatches(fixtureIdsToDelete, tx);

    await tx.fixture.delete({
      where: { id },
    });
  });

  revalidatePath("/admin/fixtures");
  revalidatePath(`/admin/leagues/${fixture.leagueId}/fixtures`);
  revalidatePath(`/admin/leagues/${fixture.leagueId}`);

  if (fixture.league.slug) {
    revalidatePath(`/leagues/${fixture.league.slug}`);
    revalidatePath(`/leagues/${fixture.league.slug}/fixtures`);
  }

  redirect("/admin/fixtures");
}

export async function deleteLeagueFixturesAction(formData: FormData) {
  await requireAdmin();

  const leagueId = parseRequiredString(formData.get("leagueId"), "League");

  const league = await prisma.league.findUnique({
    where: { id: leagueId },
    select: {
      id: true,
      slug: true,
    },
  });

  if (!league) {
    throw new Error("League not found.");
  }

  const fixtureIds = await prisma.fixture.findMany({
    where: { leagueId },
    select: {
      id: true,
    },
  });

  const fixtureIdsToDelete = fixtureIds.map((fixture) => fixture.id);

  await prisma.$transaction(async (tx) => {
    await voidFixtureMatchFeeChargesOrThrow(fixtureIdsToDelete, tx);
    await cancelQueuedFixtureNotificationDispatches(fixtureIdsToDelete, tx);

    await tx.fixture.deleteMany({
      where: { leagueId },
    });
  });

  revalidatePath("/admin/fixtures");
  revalidatePath(`/admin/leagues/${leagueId}/fixtures`);
  revalidatePath(`/admin/leagues/${leagueId}`);

  if (league.slug) {
    revalidatePath(`/leagues/${league.slug}`);
    revalidatePath(`/leagues/${league.slug}/fixtures`);
  }

  redirect("/admin/fixtures");
}

export async function generateFixtures(formData: FormData) {
  await requireAdmin();

  const leagueId = parseRequiredString(formData.get("leagueId"), "League");
  const startDate = parseRequiredString(formData.get("startDate"), "Start date");
  const startTime = parseRequiredString(formData.get("startTime"), "Start time");
  const weekGapDays = parseRequiredPositiveInt(
    formData.get("weekGapDays"),
    "Week gap days",
    1,
  );
  const slotMinutes = parseRequiredPositiveInt(
    formData.get("slotMinutes"),
    "Slot minutes",
    10,
  );
  const pitches = parseRequiredPositiveInt(formData.get("pitches"), "Pitches", 1);
  const maxGamesPerNight = parseRequiredPositiveInt(
    formData.get("maxGamesPerNight"),
    "Max games per night",
    1,
  );
  const startRound = parseRequiredPositiveInt(
    formData.get("startRound"),
    "Start week",
    1,
  );
  const doubleRoundRobin =
    String(formData.get("doubleRoundRobin") || "") === "on";
  const clearExisting = String(formData.get("clearExisting") || "") === "on";
  const venueId = parseOptionalString(formData.get("venueId"));
  const status = parseFixtureStatus(formData.get("status"));

  const league = await prisma.league.findUnique({
    where: { id: leagueId },
    select: { id: true, name: true, season: true, slug: true },
  });

  if (!league) {
    throw new Error("League not found.");
  }

  const teams = await prisma.team.findMany({
    where: { leagueId },
    orderBy: { name: "asc" },
    select: {
      id: true,
      name: true,
      latestKickoffTime: true,
    },
  });

  if (teams.length < 2) {
    throw new Error(
      "This league needs at least 2 teams assigned before generating fixtures.",
    );
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
    const existingFixtureIds = await prisma.fixture.findMany({
      where: { leagueId },
      select: {
        id: true,
      },
    });

    const fixtureIdsToClear = existingFixtureIds.map((fixture) => fixture.id);

    await prisma.$transaction(async (tx) => {
      await voidFixtureMatchFeeChargesOrThrow(fixtureIdsToClear, tx);
      await cancelQueuedFixtureNotificationDispatches(fixtureIdsToClear, tx);

      await tx.fixture.deleteMany({
        where: { leagueId },
      });
    });
  }

  let rounds = generateRounds(teams.map((t) => t.id));

  if (doubleRoundRobin) {
    rounds = [...rounds, ...mirrorRounds(rounds)];
  }

  const startDateTime = parseLondonDateTime(startDate, startTime);

  const fixturesToCreate: {
    leagueId: string;
    homeTeamId: string;
    awayTeamId: string;
    venueId: string | null;
    kickoffAt: Date;
    round: number;
    position: number;
    pitch: string;
    status: FixtureStatus;
  }[] = [];

  const teamMap = new Map<string, TeamSchedulingRule>(
    teams.map((team) => [team.id, team]),
  );

  let nightOffset = 0;

  rounds.forEach((pairs, roundIndex) => {
    const roundNumber = startRound + roundIndex;

    for (
      let chunkStart = 0;
      chunkStart < pairs.length;
      chunkStart += maxGamesPerNight
    ) {
      const nightlyPairs = sortPairsByRestriction(
        pairs.slice(chunkStart, chunkStart + maxGamesPerNight),
        teamMap,
      );

      const roundBase = addDays(startDateTime, nightOffset * weekGapDays);

      nightlyPairs.forEach((pair, nightlyIndex) => {
        const batch = Math.floor(nightlyIndex / pitches);
        const pitchNumber = (nightlyIndex % pitches) + 1;
        const kickoffAt = addMinutes(roundBase, batch * slotMinutes);

        const homeTeam = teamMap.get(pair.homeId);
        const awayTeam = teamMap.get(pair.awayId);

        if (!homeTeam || !awayTeam) {
          throw new Error("Fixture generation failed because a team was missing.");
        }

        const allowed = isKickoffAllowed(kickoffAt, homeTeam, awayTeam);

        if (!allowed.allowed) {
          throw new Error(
            `Unable to generate fixtures. Week ${roundNumber} would place ${homeTeam.name} vs ${awayTeam.name} at ${formatTimeInLondon(kickoffAt)}, but ${allowed.reason}`,
          );
        }

        fixturesToCreate.push({
          leagueId,
          homeTeamId: pair.homeId,
          awayTeamId: pair.awayId,
          venueId,
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

  await prisma.fixture.createMany({
    data: fixturesToCreate,
  });

  revalidatePath("/admin/fixtures");
  revalidatePath(`/admin/leagues/${leagueId}/fixtures`);
  revalidatePath(`/admin/leagues/${leagueId}`);

  if (league.slug) {
    revalidatePath(`/leagues/${league.slug}`);
    revalidatePath(`/leagues/${league.slug}/fixtures`);
  }

  redirect("/admin/fixtures");
}
