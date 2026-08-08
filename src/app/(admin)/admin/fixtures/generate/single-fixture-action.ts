"use server";

import { FixtureStatus, Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import {
  getLondonMinutesSinceMidnight,
  parseLondonDateTime,
} from "@/lib/datetime/london";
import { ensureSeasonTeamRowsForLeague } from "@/lib/league-season-teams";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/requireAdmin";

type TeamRow = {
  id: string;
  name: string;
  divisionId: string | null;
  latestKickoffTime: string | null;
  standardMatchFeePence: number | null;
};

function required(formData: FormData, name: string, label: string) {
  const value = String(formData.get(name) ?? "").trim();
  if (!value) throw new Error(`${label} is required.`);
  return value;
}

function optional(formData: FormData, name: string) {
  const value = String(formData.get(name) ?? "").trim();
  return value || null;
}

function optionalPositiveInt(formData: FormData, name: string, label: string) {
  const raw = String(formData.get(name) ?? "").trim();
  if (!raw) return null;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < 1) {
    throw new Error(`${label} must be a whole number of 1 or more.`);
  }
  return value;
}

function parseStatus(value: FormDataEntryValue | null) {
  const raw = String(value ?? "SCHEDULED").trim();
  if (
    raw !== FixtureStatus.SCHEDULED &&
    raw !== FixtureStatus.POSTPONED &&
    raw !== FixtureStatus.CANCELLED
  ) {
    throw new Error("Choose a valid fixture status.");
  }
  return raw as FixtureStatus;
}

function timeToMinutes(value: string | null) {
  if (!value) return null;
  const match = /^(\d{1,2}):(\d{2})(?::\d{2})?$/.exec(value.trim());
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return null;
  return hours * 60 + minutes;
}

function assertKickoffAllowed(kickoffAt: Date, team: TeamRow) {
  const latest = timeToMinutes(team.latestKickoffTime);
  if (latest === null) return;
  if (getLondonMinutesSinceMidnight(kickoffAt) <= latest) return;
  throw new Error(
    `${team.name} cannot kick off later than ${team.latestKickoffTime}. Choose an earlier time, tick the override box for this fixture, or update the team's latest kick-off preference.`,
  );
}

function buildReturnUrl(input: {
  created?: boolean;
  fixtureId?: string;
  error?: string;
}) {
  const params = new URLSearchParams();
  if (input.created) params.set("singleCreated", "1");
  if (input.fixtureId) params.set("singleFixtureId", input.fixtureId);
  if (input.error) params.set("singleError", input.error.slice(0, 240));
  const query = params.toString();
  return `/admin/fixtures/generate${query ? `?${query}` : ""}`;
}

function friendlyError(error: unknown) {
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    if (error.code === "P2002") return "That fixture conflicts with an existing fixture record.";
    if (error.code === "P2003") return "One of the selected teams, league, venue or referee is no longer valid.";
  }
  if (error instanceof Error && error.message.trim()) return error.message.trim();
  return "The fixture could not be created.";
}

export async function createSingleDraftFixtureAction(formData: FormData) {
  await requireAdmin();

  try {
    const leagueId = required(formData, "leagueId", "League");
    const requestedDivisionId = optional(formData, "divisionId");
    const homeTeamId = required(formData, "homeTeamId", "Team 1");
    const awayTeamId = required(formData, "awayTeamId", "Team 2");
    const fixtureDate = required(formData, "fixtureDate", "Fixture date");
    const fixtureTime = required(formData, "fixtureTime", "Kick-off time");
    const venueId = optional(formData, "venueId");
    const refereeId = optional(formData, "refereeId");
    const pitch = optional(formData, "pitch");
    const round = optionalPositiveInt(formData, "round", "Week");
    const position = optionalPositiveInt(formData, "position", "Game position");
    const status = parseStatus(formData.get("status"));
    const overrideLatestKickoff =
      String(formData.get("overrideLatestKickoff") ?? "").trim() === "on";

    if (homeTeamId === awayTeamId) {
      throw new Error("Team 1 and Team 2 cannot be the same team.");
    }

    const kickoffAt = parseLondonDateTime(fixtureDate, fixtureTime);
    await ensureSeasonTeamRowsForLeague(leagueId);

    const [league, teams, division, venue, referee] = await Promise.all([
      prisma.league.findUnique({
        where: { id: leagueId },
        select: { id: true, slug: true },
      }),
      prisma.$queryRaw<TeamRow[]>(Prisma.sql`
        SELECT
          t."id",
          t."name",
          lst."divisionId",
          t."latestKickoffTime",
          t."standardMatchFeePence"::int AS "standardMatchFeePence"
        FROM "LeagueSeasonTeam" lst
        JOIN "Team" t ON t."id" = lst."teamId"
        WHERE lst."leagueId" = ${leagueId}
          AND lst."isActive" = TRUE
          AND t."leagueId" = ${leagueId}
          AND t."id" IN (${Prisma.join([homeTeamId, awayTeamId])})
      `),
      requestedDivisionId
        ? prisma.leagueDivision.findFirst({
            where: { id: requestedDivisionId, leagueId, isActive: true },
            select: { id: true },
          })
        : Promise.resolve(null),
      venueId
        ? prisma.venue.findUnique({ where: { id: venueId }, select: { id: true } })
        : Promise.resolve(null),
      refereeId
        ? prisma.user.findFirst({
            where: { id: refereeId, role: { in: ["REFEREE", "ADMIN"] } },
            select: { id: true },
          })
        : Promise.resolve(null),
    ]);

    if (!league) throw new Error("Selected league was not found.");
    if (requestedDivisionId && !division) {
      throw new Error("Selected division does not belong to this league.");
    }
    if (venueId && !venue) throw new Error("Selected venue was not found.");
    if (refereeId && !referee) throw new Error("Selected referee was not found.");

    const homeTeam = teams.find((team) => team.id === homeTeamId);
    const awayTeam = teams.find((team) => team.id === awayTeamId);
    if (!homeTeam || !awayTeam) {
      throw new Error("Both teams must be active members of this current league season.");
    }

    if (
      requestedDivisionId &&
      (homeTeam.divisionId !== requestedDivisionId ||
        awayTeam.divisionId !== requestedDivisionId)
    ) {
      throw new Error("Both teams must belong to the selected division.");
    }

    let divisionId = requestedDivisionId;
    if (!divisionId) {
      if (homeTeam.divisionId !== awayTeam.divisionId) {
        throw new Error("These teams are in different divisions. Choose teams from the same division.");
      }
      divisionId = homeTeam.divisionId;
    }

    if (status === FixtureStatus.SCHEDULED && !overrideLatestKickoff) {
      assertKickoffAllowed(kickoffAt, homeTeam);
      assertKickoffAllowed(kickoffAt, awayTeam);
    }

    const clash = await prisma.fixture.findFirst({
      where: {
        kickoffAt,
        status: { in: [FixtureStatus.SCHEDULED, FixtureStatus.COMPLETED] },
        OR: [
          { homeTeamId },
          { awayTeamId: homeTeamId },
          { homeTeamId: awayTeamId },
          { awayTeamId },
        ],
      },
      select: { id: true },
    });
    if (clash) {
      throw new Error("One of these teams already has a fixture at this exact kick-off time.");
    }

    const standardFeePence = Math.max(
      homeTeam.standardMatchFeePence ?? 0,
      awayTeam.standardMatchFeePence ?? 0,
    );

    const fixture = await prisma.fixture.create({
      data: {
        leagueId,
        divisionId,
        homeTeamId,
        awayTeamId,
        venueId,
        refereeId: referee?.id ?? null,
        kickoffAt,
        round,
        position,
        pitch,
        status,
        matchFeePence: standardFeePence > 0 ? standardFeePence : null,
        publishedAt: null,
      },
      select: { id: true },
    });

    revalidatePath("/admin/fixtures");
    revalidatePath("/admin/fixtures/generate");
    revalidatePath(`/admin/leagues/${leagueId}`);
    revalidatePath(`/admin/leagues/${leagueId}/fixtures`);
    if (league.slug) {
      revalidatePath(`/leagues/${league.slug}`);
      revalidatePath(`/leagues/${league.slug}/fixtures`);
    }

    redirect(buildReturnUrl({ created: true, fixtureId: fixture.id }));
  } catch (error) {
    const digest =
      error && typeof error === "object" && "digest" in error
        ? String((error as { digest?: unknown }).digest ?? "")
        : "";
    if (digest.startsWith("NEXT_REDIRECT")) throw error;
    redirect(buildReturnUrl({ error: friendlyError(error) }));
  }
}
