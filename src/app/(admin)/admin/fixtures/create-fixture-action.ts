// ========================================
// File: src/app/(admin)/admin/fixtures/create-fixture-action.ts
// ========================================

"use server";

import { randomUUID } from "node:crypto";
import { FixtureStatus, Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { parseLondonDateTime } from "@/lib/datetime/london";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/requireAdmin";
import { getFixturePlaceholderTeamIds } from "@/lib/teams/fixture-placeholders";
import { createFixtureAction as createFixtureLegacyAction } from "./actions-legacy";

function isNextRedirect(error: unknown) {
  if (!error || typeof error !== "object" || !("digest" in error)) return false;
  return String((error as { digest?: unknown }).digest ?? "").startsWith("NEXT_REDIRECT");
}

function getFriendlyCreateError(error: unknown) {
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    switch (error.code) {
      case "P2002":
        return "A conflicting fixture already exists. Refresh the fixture list and check the teams, week and kick-off time.";
      case "P2003":
        return "One of the selected teams, the venue, referee or league is no longer valid. Refresh the page and select it again.";
      case "P2025":
        return "A selected team, venue, referee or league could not be found. Refresh the page and try again.";
      default:
        return `The fixture database rejected the request (${error.code}).`;
    }
  }

  if (error instanceof Error) {
    const message = error.message.trim();
    if (
      message &&
      !message.includes("Invalid `prisma") &&
      !message.toLowerCase().includes("database")
    ) {
      return message;
    }
  }

  return "The fixture could not be created. Check every required field and try again.";
}

function buildFixturesReturnUrl(input: {
  leagueId: string;
  state: "success" | "error";
  message?: string;
  requestId?: string;
}) {
  const params = new URLSearchParams();
  if (input.leagueId) params.set("leagueId", input.leagueId);
  params.set("fixtureCreate", input.state);
  if (input.message) params.set("fixtureCreateMessage", input.message);
  if (input.requestId) params.set("fixtureRequestId", input.requestId);
  return `/admin/fixtures?${params.toString()}`;
}

function required(formData: FormData, name: string, label: string) {
  const value = String(formData.get(name) ?? "").trim();
  if (!value) throw new Error(`${label} is required.`);
  return value;
}

function optional(formData: FormData, name: string) {
  const value = String(formData.get(name) ?? "").trim();
  return value || null;
}

function optionalInteger(formData: FormData, name: string, label: string) {
  const raw = String(formData.get(name) ?? "").trim();
  if (!raw) return null;
  const value = Number(raw);
  if (!Number.isInteger(value)) throw new Error(`${label} must be a whole number.`);
  return value;
}

async function teamCanPlayInLeague(teamId: string, leagueId: string) {
  const rows = await prisma.$queryRaw<Array<{ value: boolean }>>(Prisma.sql`
    SELECT EXISTS (
      SELECT 1
      FROM "Team" team
      WHERE team."id" = ${teamId}
        AND team."leagueId" = ${leagueId}

      UNION ALL

      SELECT 1
      FROM "LeagueSeasonTeam" membership
      WHERE membership."teamId" = ${teamId}
        AND membership."leagueId" = ${leagueId}
        AND membership."isActive" = true
    ) AS "value"
  `);

  return Boolean(rows[0]?.value);
}

async function createPlaceholderFixture(formData: FormData) {
  const leagueId = required(formData, "leagueId", "League");
  const homeTeamId = required(formData, "homeTeamId", "Team 1");
  const awayTeamId = required(formData, "awayTeamId", "Team 2");
  const kickoffDate = required(formData, "kickoffDate", "Kick-off date");
  const kickoffTime = required(formData, "kickoffTime", "Kick-off time");
  const venueId = optional(formData, "venueId");
  const refereeId = optional(formData, "refereeId");
  const round = optionalInteger(formData, "round", "Week");
  const position = optionalInteger(formData, "position", "Position");
  const pitch = optional(formData, "pitch");
  const requestedStatus = String(formData.get("status") ?? "SCHEDULED").trim();
  const status = Object.values(FixtureStatus).includes(requestedStatus as FixtureStatus)
    ? (requestedStatus as FixtureStatus)
    : FixtureStatus.SCHEDULED;

  if (homeTeamId === awayTeamId) {
    throw new Error("Team 1 and Team 2 cannot be the same team.");
  }

  if (status === FixtureStatus.COMPLETED) {
    throw new Error("Replace TBC with the confirmed team before completing the fixture.");
  }

  const kickoffAt = parseLondonDateTime(kickoffDate, kickoffTime);

  const [league, homeTeam, awayTeam, homeAllowed, awayAllowed, venue, referee] =
    await Promise.all([
      prisma.league.findUnique({
        where: { id: leagueId },
        select: { id: true, slug: true },
      }),
      prisma.team.findUnique({
        where: { id: homeTeamId },
        select: { id: true, name: true },
      }),
      prisma.team.findUnique({
        where: { id: awayTeamId },
        select: { id: true, name: true },
      }),
      teamCanPlayInLeague(homeTeamId, leagueId),
      teamCanPlayInLeague(awayTeamId, leagueId),
      venueId
        ? prisma.venue.findUnique({ where: { id: venueId }, select: { id: true } })
        : Promise.resolve(null),
      refereeId
        ? prisma.user.findUnique({
            where: { id: refereeId },
            select: { id: true, role: true },
          })
        : Promise.resolve(null),
    ]);

  if (!league) throw new Error("Selected league was not found.");
  if (!homeTeam) throw new Error("Selected Team 1 was not found.");
  if (!awayTeam) throw new Error("Selected Team 2 was not found.");
  if (!homeAllowed) throw new Error("Team 1 is not attached to this league season.");
  if (!awayAllowed) throw new Error("Team 2 is not attached to this league season.");
  if (venueId && !venue) throw new Error("Selected venue was not found.");
  if (refereeId && (!referee || referee.role !== "REFEREE")) {
    throw new Error("Selected referee was not found.");
  }

  const fixture = await prisma.fixture.create({
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
      matchFeePence: null,
    },
    select: { id: true },
  });

  await prisma.fixtureCaptainConfirmation.deleteMany({
    where: { fixtureId: fixture.id },
  });

  revalidatePath("/admin/fixtures");
  revalidatePath(`/admin/leagues/${leagueId}`);
  revalidatePath(`/admin/leagues/${leagueId}/fixtures`);
  if (league.slug) {
    revalidatePath(`/leagues/${league.slug}`);
    revalidatePath(`/leagues/${league.slug}/fixtures`);
  }
}

export async function createFixtureAction(formData: FormData) {
  await requireAdmin();

  const leagueId = String(formData.get("leagueId") ?? "").trim();
  const homeTeamId = String(formData.get("homeTeamId") ?? "").trim();
  const awayTeamId = String(formData.get("awayTeamId") ?? "").trim();
  const requestId = randomUUID().slice(0, 8);

  try {
    const placeholderIds = await getFixturePlaceholderTeamIds(
      [homeTeamId, awayTeamId].filter(Boolean),
    );

    if (placeholderIds.size > 0) {
      await createPlaceholderFixture(formData);
      redirect(buildFixturesReturnUrl({ leagueId, state: "success" }));
    }

    await createFixtureLegacyAction(formData);
  } catch (error) {
    if (isNextRedirect(error)) {
      redirect(buildFixturesReturnUrl({ leagueId, state: "success" }));
    }

    const message = getFriendlyCreateError(error);
    console.error("Manual fixture creation failed", {
      requestId,
      leagueId,
      message,
      error,
    });

    redirect(
      buildFixturesReturnUrl({
        leagueId,
        state: "error",
        message,
        requestId,
      }),
    );
  }
}
