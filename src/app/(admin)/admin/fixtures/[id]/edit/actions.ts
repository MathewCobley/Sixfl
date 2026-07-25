"use server";

import { randomUUID } from "node:crypto";
import {
  FixtureStatus,
  NotificationDispatchStatus,
  Prisma,
} from "@prisma/client";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import {
  formatTimeInLondon,
  getLondonMinutesSinceMidnight,
  parseLondonDateTime,
} from "@/lib/datetime/london";
import { syncFixtureMatchFeeCharges } from "@/lib/payments/fixture-match-fees";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/requireAdmin";
import { getFixturePlaceholderTeamIds } from "@/lib/teams/fixture-placeholders";

const FIXTURE_CONFIRMATION_CHASE_SOURCE_TYPES = [
  "FIXTURE_CONFIRMATION_CHASE_SMS",
  "FIXTURE_CONFIRMATION_AUTO_SMS_72H",
  "FIXTURE_CONFIRMATION_AUTO_SMS_24H",
] as const;

function parseRequiredString(value: FormDataEntryValue | null, fieldName: string) {
  const parsed = String(value ?? "").trim();
  if (!parsed) throw new Error(`${fieldName} is required.`);
  return parsed;
}

function parseOptionalString(value: FormDataEntryValue | null) {
  const parsed = String(value ?? "").trim();
  return parsed || null;
}

function parseOptionalInt(value: FormDataEntryValue | null, fieldName: string) {
  const parsed = String(value ?? "").trim();
  if (!parsed) return null;
  const number = Number(parsed);
  if (!Number.isInteger(number)) throw new Error(`${fieldName} must be a whole number.`);
  return number;
}

function parseOptionalMoneyToPence(value: FormDataEntryValue | null, fieldName: string) {
  const parsed = String(value ?? "").trim();
  if (!parsed) return null;
  const amount = Number(parsed.replace(/,/g, ""));
  if (!Number.isFinite(amount) || amount < 0) {
    throw new Error(`${fieldName} must be 0 or more.`);
  }
  return amount === 0 ? null : Math.round(amount * 100);
}

function parseFixtureStatus(value: FormDataEntryValue | null) {
  const parsed = String(value ?? "").trim();
  if (!Object.values(FixtureStatus).includes(parsed as FixtureStatus)) {
    throw new Error("Choose a valid fixture status.");
  }
  return parsed as FixtureStatus;
}

function parseKickoffAt(formData: FormData) {
  const date = parseRequiredString(formData.get("kickoffDate"), "Kick-off date");
  const time = parseRequiredString(formData.get("kickoffTime"), "Kick-off time");
  return parseLondonDateTime(date, time);
}

function parseTimeToMinutes(value: string | null) {
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

function assertLatestKickoffAllowed(input: {
  kickoffAt: Date;
  team: { name: string; latestKickoffTime: string | null };
}) {
  const latestMinutes = parseTimeToMinutes(input.team.latestKickoffTime);
  if (latestMinutes === null) return;
  if (getLondonMinutesSinceMidnight(input.kickoffAt) <= latestMinutes) return;
  throw new Error(
    `${input.team.name} has latest KO ${input.team.latestKickoffTime}, so ${formatTimeInLondon(input.kickoffAt)} is too late. Change the fixture time or update the team's Latest KO first.`,
  );
}

async function teamCanPlayInLeague(input: { teamId: string; leagueId: string }) {
  const team = await prisma.team.findUnique({
    where: { id: input.teamId },
    select: { leagueId: true },
  });
  if (!team) return false;
  if (team.leagueId === input.leagueId) return true;

  try {
    const rows = await prisma.$queryRaw<Array<{ id: string }>>(Prisma.sql`
      SELECT "id"
      FROM "LeagueSeasonTeam"
      WHERE "teamId" = ${input.teamId}
        AND "leagueId" = ${input.leagueId}
        AND "isActive" = true
      LIMIT 1
    `);
    return Boolean(rows[0]);
  } catch (error) {
    console.error("Could not check LeagueSeasonTeam while editing fixture", {
      teamId: input.teamId,
      leagueId: input.leagueId,
      error,
    });
    return false;
  }
}

async function cancelQueuedFixtureConfirmationChases(input: {
  fixtureId: string;
  reason: string;
}) {
  await prisma.notificationDispatch.updateMany({
    where: {
      sourceType: { in: [...FIXTURE_CONFIRMATION_CHASE_SOURCE_TYPES] },
      sourceId: { startsWith: `${input.fixtureId}:` },
      status: NotificationDispatchStatus.QUEUED,
    },
    data: {
      status: NotificationDispatchStatus.CANCELLED,
      cancelledAt: new Date(),
      failureReason: input.reason,
    },
  });
}

function safeFixturesReturnTo(value: FormDataEntryValue | null) {
  const parsed = String(value ?? "").trim();
  return parsed === "/admin/fixtures" || parsed.startsWith("/admin/fixtures?")
    ? parsed
    : "/admin/fixtures";
}

function editPageUrl(input: {
  fixtureId: string;
  returnTo: string;
  message: string;
  requestId: string;
}) {
  const params = new URLSearchParams({
    returnTo: input.returnTo,
    editError: input.message,
    requestId: input.requestId,
  });
  return `/admin/fixtures/${encodeURIComponent(input.fixtureId)}/edit?${params.toString()}`;
}

function friendlyError(error: unknown) {
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    switch (error.code) {
      case "P2002":
        return "A conflicting fixture record already exists. Refresh the fixture list and check the teams and kick-off time.";
      case "P2003":
        return "A selected team, venue, referee or league is no longer valid. Refresh the page and select it again.";
      case "P2025":
        return "The fixture or one of its linked records could not be found. Refresh the fixture list.";
      default:
        return `The fixture database rejected the change (${error.code}).`;
    }
  }
  if (error instanceof Error && error.message.trim()) return error.message.trim();
  return "The fixture could not be updated.";
}

export async function updateFixtureFromEditPageAction(formData: FormData) {
  await requireAdmin();

  const fixtureId = String(formData.get("fixtureId") ?? "").trim();
  const returnTo = safeFixturesReturnTo(formData.get("returnTo"));
  const requestId = randomUUID().slice(0, 8);

  try {
    if (!fixtureId) throw new Error("Fixture ID is required.");

    const leagueId = parseRequiredString(formData.get("leagueId"), "League");
    const homeTeamId = parseRequiredString(formData.get("homeTeamId"), "Team 1");
    const awayTeamId = parseRequiredString(formData.get("awayTeamId"), "Team 2");
    const venueId = parseOptionalString(formData.get("venueId"));
    const refereeId = parseOptionalString(formData.get("refereeId"));
    const kickoffAt = parseKickoffAt(formData);
    const round = parseOptionalInt(formData.get("round"), "Week");
    const position = parseOptionalInt(formData.get("position"), "Game position");
    const pitch = parseOptionalString(formData.get("pitch"));
    const status = parseFixtureStatus(formData.get("status"));
    const requestedHomeMatchFeePence = parseOptionalMoneyToPence(
      formData.get("homeMatchFeePounds"),
      "Team 1 fee",
    );
    const requestedAwayMatchFeePence = parseOptionalMoneyToPence(
      formData.get("awayMatchFeePounds"),
      "Team 2 fee",
    );

    if (homeTeamId === awayTeamId) {
      throw new Error("Team 1 and Team 2 cannot be the same team.");
    }

    const [fixture, league, homeTeam, awayTeam, venue, referee, homeAllowed, awayAllowed] =
      await Promise.all([
        prisma.fixture.findUnique({
          where: { id: fixtureId },
          select: {
            id: true,
            leagueId: true,
            result: { select: { id: true } },
            league: { select: { slug: true } },
          },
        }),
        prisma.league.findUnique({
          where: { id: leagueId },
          select: { id: true, name: true, season: true, slug: true },
        }),
        prisma.team.findUnique({
          where: { id: homeTeamId },
          select: {
            id: true,
            name: true,
            leagueId: true,
            logoUrl: true,
            latestKickoffTime: true,
          },
        }),
        prisma.team.findUnique({
          where: { id: awayTeamId },
          select: {
            id: true,
            name: true,
            leagueId: true,
            logoUrl: true,
            latestKickoffTime: true,
          },
        }),
        venueId
          ? prisma.venue.findUnique({ where: { id: venueId }, select: { id: true } })
          : Promise.resolve(null),
        refereeId
          ? prisma.user.findUnique({
              where: { id: refereeId },
              select: { id: true, role: true },
            })
          : Promise.resolve(null),
        teamCanPlayInLeague({ teamId: homeTeamId, leagueId }),
        teamCanPlayInLeague({ teamId: awayTeamId, leagueId }),
      ]);

    if (!fixture) throw new Error("Fixture not found.");
    if (!league) throw new Error("Selected league was not found.");
    if (!homeTeam) throw new Error("Selected Team 1 was not found.");
    if (!awayTeam) throw new Error("Selected Team 2 was not found.");
    if (!homeAllowed) throw new Error("Team 1 is not attached to this league season.");
    if (!awayAllowed) throw new Error("Team 2 is not attached to this league season.");
    if (venueId && !venue) throw new Error("Selected venue was not found.");
    if (refereeId && (!referee || referee.role !== "REFEREE")) {
      throw new Error("Selected referee was not found.");
    }

    const placeholderTeamIds = await getFixturePlaceholderTeamIds([
      homeTeamId,
      awayTeamId,
    ]);
    const hasFixturePlaceholder = placeholderTeamIds.size > 0;

    if (hasFixturePlaceholder && fixture.result) {
      throw new Error(
        "Remove the existing result before changing this fixture to TBC.",
      );
    }

    if (hasFixturePlaceholder && status === FixtureStatus.COMPLETED) {
      throw new Error(
        "Replace TBC with the confirmed team before completing the fixture.",
      );
    }

    if (status === FixtureStatus.SCHEDULED || status === FixtureStatus.COMPLETED) {
      assertLatestKickoffAllowed({ kickoffAt, team: homeTeam });
      assertLatestKickoffAllowed({ kickoffAt, team: awayTeam });
    }

    const homeMatchFeePence = hasFixturePlaceholder
      ? null
      : requestedHomeMatchFeePence;
    const awayMatchFeePence = hasFixturePlaceholder
      ? null
      : requestedAwayMatchFeePence;
    const fixtureMatchFeePence = hasFixturePlaceholder
      ? null
      : Math.max(homeMatchFeePence ?? 0, awayMatchFeePence ?? 0) || null;

    await prisma.$transaction(async (tx) => {
      await tx.fixture.update({
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

      if (hasFixturePlaceholder) {
        await tx.fixtureCaptainConfirmation.deleteMany({
          where: { fixtureId },
        });
        await tx.$executeRaw(Prisma.sql`
          DELETE FROM "FixtureAiPrediction"
          WHERE "fixtureId" = ${fixtureId}
        `);
      }

      await syncFixtureMatchFeeCharges({
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
    });

    if (
      hasFixturePlaceholder ||
      status === FixtureStatus.POSTPONED ||
      status === FixtureStatus.CANCELLED
    ) {
      await cancelQueuedFixtureConfirmationChases({
        fixtureId,
        reason: hasFixturePlaceholder
          ? "Fixture contains TBC and does not require team confirmation yet."
          : status === FixtureStatus.POSTPONED
            ? "Fixture was postponed before queued confirmation SMS was sent."
            : "Fixture was cancelled before queued confirmation SMS was sent.",
      });
    }

    revalidatePath("/admin/fixtures");
    revalidatePath(returnTo);
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
  } catch (error) {
    const message = friendlyError(error);
    console.error("Fixture edit failed", { requestId, fixtureId, message, error });
    redirect(editPageUrl({ fixtureId, returnTo, message, requestId }));
  }

  redirect(returnTo);
}
