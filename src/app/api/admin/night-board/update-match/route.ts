// ========================================
// File: src/app/api/admin/night-board/update-match/route.ts
// ========================================

import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { FixtureStatus, NotificationDispatchStatus, UserRole } from "@prisma/client";

import { parseLondonDateTime, toLondonDateInputValue } from "@/lib/datetime/london";
import {
  cancelQueuedMatchFeeNotificationDispatches,
  queueFixtureMatchFeeEmails,
  syncFixtureMatchFeeCharges,
} from "@/lib/payments/fixture-match-fees";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/requireAdmin";

export const dynamic = "force-dynamic";

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
  await requireAdmin();

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
      matchFeePence: true,
      league: { select: { name: true, season: true, slug: true } },
      homeTeam: { select: { id: true, name: true, logoUrl: true } },
      awayTeam: { select: { id: true, name: true, logoUrl: true } },
      paymentCharges: { select: { id: true, teamId: true, amountPence: true, status: true } },
    },
  });

  if (!fixture) {
    return NextResponse.json({ ok: false, error: "Fixture not found.", returnTo }, { status: 404 });
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

  await prisma.fixture.update({
    where: { id: fixture.id },
    data: {
      kickoffAt,
      pitch: pitch || null,
      venueId,
      refereeId: referee?.id ?? null,
      status,
    },
  });

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

  if (fixture.league.slug) {
    revalidatePath(`/leagues/${fixture.league.slug}`);
    revalidatePath(`/leagues/${fixture.league.slug}/fixtures`);
  }

  return NextResponse.json({ ok: true, returnTo, ...sync });
}
