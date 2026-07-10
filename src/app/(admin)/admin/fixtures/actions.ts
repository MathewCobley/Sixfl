// ========================================
// File: src/app/(admin)/admin/fixtures/actions.ts
// ========================================

"use server";

import { FixtureStatus, NotificationDispatchStatus } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { parseLondonDateTime } from "@/lib/datetime/london";
import {
  cancelQueuedMatchFeeNotificationDispatches,
  queueFixtureMatchFeeEmails,
  syncFixtureMatchFeeCharges,
  voidFixtureMatchFeeChargesOrThrow,
} from "@/lib/payments/fixture-match-fees";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/requireAdmin";

type FixtureNotificationDbClient = Pick<
  typeof prisma,
  "notificationDispatch" | "paymentCharge"
>;

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

function parseOptionalInt(value: FormDataEntryValue | null, fieldName: string) {
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
  min = 0,
) {
  const str = String(value ?? "").trim();
  const num = Number(str);

  if (!Number.isInteger(num) || num < min) {
    throw new Error(`${fieldName} must be ${min} or more.`);
  }

  return num;
}

function parseOptionalMoneyToPence(
  value: FormDataEntryValue | null,
  fieldName: string,
) {
  const str = String(value ?? "").trim();

  if (!str) return null;

  const normalised = str.replace(/,/g, "");
  const amount = Number(normalised);

  if (!Number.isFinite(amount) || amount < 0) {
    throw new Error(`${fieldName} must be 0 or more.`);
  }

  if (amount === 0) {
    return null;
  }

  return Math.round(amount * 100);
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

function parseFixtureTeamFees(formData: FormData) {
  const homeMatchFeePence = parseOptionalMoneyToPence(
    formData.get("homeMatchFeePounds"),
    "Team 1 fee",
  );
  const awayMatchFeePence = parseOptionalMoneyToPence(
    formData.get("awayMatchFeePounds"),
    "Team 2 fee",
  );

  const fixtureMatchFeePence = Math.max(
    homeMatchFeePence ?? 0,
    awayMatchFeePence ?? 0,
  );

  return {
    homeMatchFeePence,
    awayMatchFeePence,
    fixtureMatchFeePence: fixtureMatchFeePence > 0 ? fixtureMatchFeePence : null,
  };
}

function getSafeAdminFixturesReturnTo(value: FormDataEntryValue | null) {
  const returnTo = String(value ?? "").trim();
  return returnTo.startsWith("/admin/fixtures") ? returnTo : "/admin/fixtures";
}

async function cancelQueuedFixtureReminderDispatches(
  fixtureIds: string[],
  db: FixtureNotificationDbClient = prisma,
  options?: { reason?: string },
) {
  if (fixtureIds.length === 0) {
    return;
  }

  await db.notificationDispatch.updateMany({
    where: {
      sourceType: "FIXTURE_REMINDER",
      OR: fixtureIds.flatMap((fixtureId) => [
        { sourceId: fixtureId },
        { sourceId: { startsWith: `${fixtureId}:` } },
      ]),
      status: NotificationDispatchStatus.QUEUED,
    },
    data: {
      status: NotificationDispatchStatus.CANCELLED,
      cancelledAt: new Date(),
      failureReason:
        options?.reason ?? "Fixture deleted before reminder was sent.",
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
  const returnTo = getSafeAdminFixturesReturnTo(formData.get("returnTo"));

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

  await cancelQueuedFixtureReminderDispatches([fixtureId], prisma, {
    reason: "Fixture was completed before queued reminder email was sent.",
  });

  revalidatePath("/admin/fixtures");
  revalidatePath(returnTo);
  revalidatePath(`/admin/leagues/${fixture.leagueId}/fixtures`);
  revalidatePath(`/admin/leagues/${fixture.leagueId}`);

  if (fixture.league.slug) {
    revalidatePath(`/leagues/${fixture.league.slug}`);
    revalidatePath(`/leagues/${fixture.league.slug}/fixtures`);
  }

  redirect(returnTo);
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
  const {
    homeMatchFeePence,
    awayMatchFeePence,
    fixtureMatchFeePence,
  } = parseFixtureTeamFees(formData);

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
        matchFeePence: fixtureMatchFeePence,
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
      homeMatchFeePence,
      awayMatchFeePence,
    });

    return {
      fixture,
      activeCharges: chargeSync.activeCharges,
    };
  });

  if (created.activeCharges.length > 0) {
    try {
      await queueFixtureMatchFeeEmails({
        fixtureId: created.fixture.id,
        leagueId,
        leagueName: league.name,
        leagueSeason: league.season,
        kickoffAt,
        homeTeam,
        awayTeam,
        homeMatchFeePence,
        awayMatchFeePence,
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
  const {
    homeMatchFeePence,
    awayMatchFeePence,
    fixtureMatchFeePence,
  } = parseFixtureTeamFees(formData);

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
          status: true,
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
        matchFeePence: fixtureMatchFeePence,
      },
    });

    const chargeSync = await syncFixtureMatchFeeCharges({
      db: tx,
      fixtureId,
      leagueId,
      leagueName: league.name,
      leagueSeason: league.season,
      kickoffAt,
      homeTeam,
      awayTeam,
      homeMatchFeePence,
      awayMatchFeePence,
    });

    return {
      fixture: updatedFixture,
      activeCharges: chargeSync.activeCharges,
    };
  });

  await cancelQueuedFixtureReminderDispatches([fixtureId], prisma, {
    reason: "Fixture was changed before queued reminder email was sent.",
  });

  const hadExistingFee = (fixture.matchFeePence ?? 0) > 0;
  const hasMatchFee = (fixtureMatchFeePence ?? 0) > 0;
  const teamsChanged =
    fixture.homeTeamId !== homeTeamId || fixture.awayTeamId !== awayTeamId;
  const feeAmountChanged =
    (fixture.matchFeePence ?? 0) !== (fixtureMatchFeePence ?? 0);
  const reactivatedFixture =
    fixture.status !== FixtureStatus.SCHEDULED && status === FixtureStatus.SCHEDULED;

  const shouldSendInitialFeeEmail =
    !hadExistingFee || teamsChanged || feeAmountChanged || reactivatedFixture;

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
        homeMatchFeePence,
        awayMatchFeePence,
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
    select: { leagueId: true, league: { select: { slug: true } } },
  });

  if (!fixture) {
    throw new Error("Fixture not found.");
  }

  await prisma.$transaction(async (tx) => {
    await voidFixtureMatchFeeChargesOrThrow([id], tx);
    await tx.fixture.delete({ where: { id } });
  });

  await cancelQueuedFixtureNotificationDispatches([id]);

  revalidatePath("/admin/fixtures");
  revalidatePath(`/admin/leagues/${fixture.leagueId}/fixtures`);
  revalidatePath(`/admin/leagues/${fixture.leagueId}`);

  if (fixture.league.slug) {
    revalidatePath(`/leagues/${fixture.league.slug}`);
    revalidatePath(`/leagues/${fixture.league.slug}/fixtures`);
  }

  redirect("/admin/fixtures");
}
