// ========================================
// File: src/app/api/admin/night-board/update-match/route.ts
// ========================================

import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { FixtureStatus, NotificationDispatchStatus, Prisma, UserRole } from "@prisma/client";

import { parseLondonDateTime, toLondonDateInputValue } from "@/lib/datetime/london";
import {
  cancelQueuedMatchFeeNotificationDispatches,
  queueFixtureMatchFeeEmails,
  syncFixtureMatchFeeCharges,
} from "@/lib/payments/fixture-match-fees";
import { prisma } from "@/lib/prisma";
import {
  syncPublishedFixtureRefereeNightAssignmentAndRecalculate,
} from "@/lib/referee-night-assignment-sync";
import { requireAdmin } from "@/lib/requireAdmin";
import { recalculateRefereeNightCashup } from "@/lib/referee-nights";

export const dynamic = "force-dynamic";

const STALE_REFEREE_NIGHT_SOURCE_TYPES = [
  "REFEREE_NIGHT_BOOKED",
  "REFEREE_NIGHT_REMINDER_24H",
  "REFEREE_NIGHT_CONFIRMATION_MANUAL",
  "REFEREE_NIGHT_CONFIRMATION_AUTO72H",
  "REFEREE_NIGHT_CONFIRMATION_AUTO24H",
] as const;

type RefereeNightAssignmentRow = {
  refereeNightId: string;
  refereeId: string;
};

function parseFixtureStatus(value: string) {
  return Object.values(FixtureStatus).includes(value as FixtureStatus)
    ? (value as FixtureStatus)
    : FixtureStatus.SCHEDULED;
}

function parseOperationalKickoff(input: { currentKickoffAt: Date; timeInput: string }) {
  const time = input.timeInput.trim();
  if (!/^\d{2}:\d{2}$/.test(time)) return input.currentKickoffAt;
  return parseLondonDateTime(toLondonDateInputValue(input.currentKickoffAt), time);
}

function getSafeReturnTo(value: FormDataEntryValue | null) {
  const returnTo = String(value ?? "").trim();
  return returnTo.startsWith("/admin/night-board") ? returnTo : "/admin/night-board";
}

function getExistingTeamFee(input: {
  fixtureMatchFeePence: number | null;
  teamId: string;
  charges: Array<{ teamId: string; amountPence: number; status: string }>;
}) {
  const existing = input.charges.find(
    (charge) => charge.teamId === input.teamId && charge.status !== "VOID",
  );

  return existing?.amountPence ?? input.fixtureMatchFeePence ?? null;
}

async function clearStaleRefereeNightAssignment(input: {
  fixtureId: string;
  nextRefereeId: string | null;
}) {
  const rows = await prisma.$queryRaw<RefereeNightAssignmentRow[]>(Prisma.sql`
    SELECT rnf."refereeNightId", rn."refereeId"
    FROM "RefereeNightFixture" rnf
    JOIN "RefereeNight" rn ON rn."id" = rnf."refereeNightId"
    WHERE rnf."fixtureId" = ${input.fixtureId}
  `);

  const staleNightIds = rows
    .filter((row) => !input.nextRefereeId || row.refereeId !== input.nextRefereeId)
    .map((row) => row.refereeNightId);

  if (staleNightIds.length === 0) return [] as string[];

  await prisma.$transaction([
    prisma.$executeRaw(Prisma.sql`
      DELETE FROM "RefereeNightFixture"
      WHERE "fixtureId" = ${input.fixtureId}
        AND "refereeNightId" IN (${Prisma.join(staleNightIds)})
    `),
    prisma.$executeRaw(Prisma.sql`
      UPDATE "NotificationDispatch"
      SET
        "status" = 'CANCELLED'::"NotificationDispatchStatus",
        "cancelledAt" = NOW(),
        "failureReason" = COALESCE(
          "failureReason",
          'Cancelled because the referee assignment was changed on the Night Board before this queued referee message was sent.'
        )
      WHERE "sourceType" IN (${Prisma.join(STALE_REFEREE_NIGHT_SOURCE_TYPES)})
        AND "sourceId" IN (${Prisma.join(staleNightIds)})
        AND "status" IN ('QUEUED'::"NotificationDispatchStatus", 'PROCESSING'::"NotificationDispatchStatus")
    `),
    prisma.$executeRaw(Prisma.sql`
      UPDATE "RefereeNight"
      SET
        "confirmationStatus" = 'PENDING',
        "confirmationTokenHash" = NULL,
        "confirmationLastChasedAt" = NULL,
        "confirmationResponseNote" = 'Referee assignment changed on the Night Board. Previous confirmation links were invalidated.',
        "updatedAt" = NOW()
      WHERE "id" IN (${Prisma.join(staleNightIds)})
    `),
  ]);

  await Promise.all(staleNightIds.map((nightId) => recalculateRefereeNightCashup(nightId)));
  return staleNightIds;
}

async function resyncMatchFeeMessages(input: {
  fixtureId: string;
  leagueId: string;
  leagueName: string;
  leagueSeason: string | null;
  kickoffAt: Date;
  status: FixtureStatus;
  homeTeam: { id: string; name: string; logoUrl: string | null };
  awayTeam: { id: string; name: string; logoUrl: string | null };
  homeMatchFeePence: number | null;
  awayMatchFeePence: number | null;
}) {
  const chargeSync = await syncFixtureMatchFeeCharges({
    fixtureId: input.fixtureId,
    leagueId: input.leagueId,
    leagueName: input.leagueName,
    leagueSeason: input.leagueSeason,
    kickoffAt: input.kickoffAt,
    homeTeam: input.homeTeam,
    awayTeam: input.awayTeam,
    homeMatchFeePence: input.homeMatchFeePence,
    awayMatchFeePence: input.awayMatchFeePence,
  });

  const allCharges = await prisma.paymentCharge.findMany({
    where: { fixtureId: input.fixtureId },
    select: { id: true },
  });

  if (input.status === FixtureStatus.POSTPONED || input.status === FixtureStatus.CANCELLED) {
    await cancelQueuedMatchFeeNotificationDispatches(
      allCharges.map((charge) => charge.id),
      prisma,
      {
        reason:
          input.status === FixtureStatus.POSTPONED
            ? "Fixture was postponed before queued match fee reminders were sent."
            : "Fixture was cancelled before queued match fee reminders were sent.",
      },
    );
    return { queued: 0, activeChargeCount: chargeSync.activeCharges.length };
  }

  if (chargeSync.activeCharges.length === 0) {
    return { queued: 0, activeChargeCount: 0 };
  }

  const chargeIds = chargeSync.activeCharges.map((charge) => charge.id);
  const [queuedInitial, sentInitial] = await Promise.all([
    prisma.notificationDispatch.count({
      where: {
        sourceType: "FIXTURE_MATCH_FEE",
        sourceId: { in: chargeIds },
        status: NotificationDispatchStatus.QUEUED,
      },
    }),
    prisma.notificationDispatch.count({
      where: {
        sourceType: "FIXTURE_MATCH_FEE",
        sourceId: { in: chargeIds },
        status: NotificationDispatchStatus.SENT,
      },
    }),
  ]);

  const shouldRequeueInitialRequest = queuedInitial > 0 || sentInitial === 0;

  await cancelQueuedMatchFeeNotificationDispatches(chargeIds, prisma, {
    includeInitialRequest: shouldRequeueInitialRequest,
    includeReminders: true,
    reason: shouldRequeueInitialRequest
      ? "Night Board match time changed before queued match fee emails were sent."
      : "Night Board match time changed before queued match fee reminders were sent.",
  });

  const queued = await queueFixtureMatchFeeEmails({
    fixtureId: input.fixtureId,
    leagueId: input.leagueId,
    leagueName: input.leagueName,
    leagueSeason: input.leagueSeason,
    kickoffAt: input.kickoffAt,
    homeTeam: input.homeTeam,
    awayTeam: input.awayTeam,
    homeMatchFeePence: input.homeMatchFeePence,
    awayMatchFeePence: input.awayMatchFeePence,
    charges: chargeSync.activeCharges,
    mode: shouldRequeueInitialRequest ? "all" : "reminders_only",
  });

  return { queued: queued.queued, activeChargeCount: chargeSync.activeCharges.length };
}

export async function POST(request: Request) {
  const { user } = await requireAdmin();

  const formData = await request.formData();
  const fixtureId = String(formData.get("fixtureId") ?? "").trim();
  const returnTo = getSafeReturnTo(formData.get("returnTo"));

  if (!fixtureId) {
    return NextResponse.json({ ok: false, error: "Missing fixture id.", returnTo }, { status: 400 });
  }

  const fixture = await prisma.fixture.findUnique({
    where: { id: fixtureId },
    select: {
      id: true,
      leagueId: true,
      kickoffAt: true,
      status: true,
      matchFeePence: true,
      refereeId: true,
      league: { select: { name: true, season: true, slug: true } },
      homeTeam: { select: { id: true, name: true, logoUrl: true } },
      awayTeam: { select: { id: true, name: true, logoUrl: true } },
      paymentCharges: { select: { id: true, teamId: true, amountPence: true, status: true } },
    },
  });

  if (!fixture) {
    return NextResponse.json({ ok: false, error: "Fixture not found.", returnTo }, { status: 404 });
  }

  if (fixture.status === FixtureStatus.COMPLETED) {
    return NextResponse.json(
      {
        ok: false,
        error: "This completed fixture is locked and cannot be changed.",
        returnTo,
      },
      { status: 409 },
    );
  }

  const pitch = String(formData.get("pitch") ?? "").trim();
  const refereeId = String(formData.get("refereeId") ?? "").trim() || null;
  const venueId = String(formData.get("venueId") ?? "").trim() || null;
  const kickoffTime = String(formData.get("kickoffTime") ?? "").trim();
  const status = parseFixtureStatus(String(formData.get("status") ?? "").trim());
  const kickoffAt = parseOperationalKickoff({ currentKickoffAt: fixture.kickoffAt, timeInput: kickoffTime });

  const referee = refereeId
    ? await prisma.user.findFirst({
        where: { id: refereeId, role: { in: [UserRole.REFEREE, UserRole.ADMIN] } },
        select: { id: true },
      })
    : null;

  const nextRefereeId = referee?.id ?? null;
  const changedRefereeNightIds = fixture.refereeId !== nextRefereeId
    ? await clearStaleRefereeNightAssignment({ fixtureId: fixture.id, nextRefereeId })
    : [];

  await prisma.fixture.update({
    where: { id: fixture.id },
    data: {
      kickoffAt,
      pitch: pitch || null,
      venueId,
      refereeId: nextRefereeId,
      status,
    },
  });

  const syncedRefereeNightIds =
    await syncPublishedFixtureRefereeNightAssignmentAndRecalculate({
      fixtureId: fixture.id,
      createdByUserId: user?.id ?? null,
    });
  const affectedRefereeNightIds = Array.from(
    new Set([...changedRefereeNightIds, ...syncedRefereeNightIds]),
  );

  const homeMatchFeePence = getExistingTeamFee({
    fixtureMatchFeePence: fixture.matchFeePence,
    teamId: fixture.homeTeam.id,
    charges: fixture.paymentCharges,
  });
  const awayMatchFeePence = getExistingTeamFee({
    fixtureMatchFeePence: fixture.matchFeePence,
    teamId: fixture.awayTeam.id,
    charges: fixture.paymentCharges,
  });

  const sync = await resyncMatchFeeMessages({
    fixtureId: fixture.id,
    leagueId: fixture.leagueId,
    leagueName: fixture.league.name,
    leagueSeason: fixture.league.season,
    kickoffAt,
    status,
    homeTeam: fixture.homeTeam,
    awayTeam: fixture.awayTeam,
    homeMatchFeePence,
    awayMatchFeePence,
  });

  revalidatePath("/admin/night-board");
  revalidatePath("/admin/fixtures");
  revalidatePath("/admin/referee-nights");
  revalidatePath(`/admin/leagues/${fixture.leagueId}/fixtures`);
  revalidatePath(`/admin/leagues/${fixture.leagueId}`);

  for (const refereeNightId of affectedRefereeNightIds) {
    revalidatePath(`/admin/referee-nights/${refereeNightId}`);
  }

  if (fixture.league.slug) {
    revalidatePath(`/leagues/${fixture.league.slug}`);
    revalidatePath(`/leagues/${fixture.league.slug}/fixtures`);
  }

  return NextResponse.json({
    ok: true,
    returnTo,
    staleRefereeNightMessagesCleared: changedRefereeNightIds.length,
    refereeNightsSynced: syncedRefereeNightIds.length,
    ...sync,
  });
}
