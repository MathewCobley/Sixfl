import { randomUUID } from "node:crypto";

import { FixtureStatus, Prisma, UserRole } from "@prisma/client";
import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";

import { authOptions } from "@/auth";
import {
  getCommunityGoalBallot,
  getCommunityGoalCycle,
  getLatestCommunityGoalWinner,
  splitSixflTvUrls,
} from "@/lib/goal-of-week/community";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const noStoreHeaders = { "Cache-Control": "no-store, max-age=0" };
const MAX_WEEKLY_NOMINATIONS = 3;

type Viewer = {
  id: string;
  role: UserRole;
  canManageTeam: boolean;
  isVerifiedPlayer: boolean;
};

type NominationFixtureRow = {
  id: string;
  kickoffAt: Date;
  homeTeamId: string;
  awayTeamId: string;
  homeTeamName: string;
  awayTeamName: string;
  homeScore: number;
  awayScore: number;
  sixflTvUrl: string;
  leagueName: string;
  leagueSeason: string | null;
};

function cleanText(value: unknown, maxLength: number) {
  const text = String(value ?? "").trim();
  return text ? text.slice(0, maxLength) : null;
}

function asPositiveInt(value: unknown) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

async function getViewer(teamId: string): Promise<Viewer | null> {
  const session = await getServerSession(authOptions);
  const email = session?.user?.email?.trim().toLowerCase();
  if (!email || !teamId) return null;

  const user = await prisma.user.findUnique({
    where: { email },
    select: {
      id: true,
      role: true,
      teamMembers: {
        where: { teamId },
        select: { id: true },
        take: 1,
      },
      _count: { select: { teamMembers: true } },
    },
  });
  if (!user) return null;

  const team = await prisma.team.findUnique({
    where: { id: teamId },
    select: { captainUserId: true },
  });
  if (!team) return null;

  const isCaptain = team.captainUserId === user.id;
  const canManageTeam =
    user.role === UserRole.ADMIN || user.teamMembers.length > 0 || isCaptain;
  if (!canManageTeam) return null;

  const isCaptainAnywhere = await prisma.team.count({
    where: { captainUserId: user.id },
  });

  return {
    id: user.id,
    role: user.role,
    canManageTeam,
    isVerifiedPlayer: user._count.teamMembers > 0 || isCaptainAnywhere > 0,
  };
}

function candidatePayload(candidate: Awaited<ReturnType<typeof getCommunityGoalBallot>>[number]) {
  const links = splitSixflTvUrls(candidate.sixflTvUrl);
  return {
    id: candidate.id,
    fixtureId: candidate.fixtureId,
    teamId: candidate.teamId,
    teamName: candidate.teamName,
    teamLogoUrl: candidate.teamLogoUrl,
    opponentName: candidate.opponentName,
    scorerName: candidate.scorerName,
    goalNumber: candidate.goalNumber,
    nominationCount: candidate.nominationCount,
    voteCount: candidate.voteCount,
    kickoffAt: candidate.kickoffAt.toISOString(),
    leagueName: candidate.leagueName,
    leagueSeason: candidate.leagueSeason,
    videoUrl: links[0] ?? links[1] ?? null,
    fullMatchUrl: links[1] ?? null,
    weekOf: candidate.weekOf.toISOString(),
  };
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const teamId = url.searchParams.get("teamId")?.trim() ?? "";
  const viewer = await getViewer(teamId);
  if (!viewer) {
    return NextResponse.json({ error: "Not authorised." }, { status: 403 });
  }

  const now = new Date();
  const cycle = getCommunityGoalCycle(now);

  try {
    const [fixtures, ballot, currentVote, currentNominations, latestWinner] =
      await Promise.all([
        prisma.$queryRaw<NominationFixtureRow[]>(Prisma.sql`
          SELECT
            fixture."id",
            fixture."kickoffAt",
            fixture."homeTeamId",
            fixture."awayTeamId",
            home_team."name" AS "homeTeamName",
            away_team."name" AS "awayTeamName",
            result."homeScore"::int AS "homeScore",
            result."awayScore"::int AS "awayScore",
            fixture."sixflTvUrl" AS "sixflTvUrl",
            league."name" AS "leagueName",
            league."season" AS "leagueSeason"
          FROM "Fixture" fixture
          JOIN "Team" home_team ON home_team."id" = fixture."homeTeamId"
          JOIN "Team" away_team ON away_team."id" = fixture."awayTeamId"
          JOIN "League" league ON league."id" = fixture."leagueId"
          JOIN "MatchResult" result ON result."fixtureId" = fixture."id"
          WHERE fixture."kickoffAt" >= ${cycle.nominationWeekStart}
            AND fixture."kickoffAt" < ${cycle.nominationWeekEnd}
            AND fixture."sixflTvRecorded" = TRUE
            AND fixture."sixflTvUrl" IS NOT NULL
            AND fixture."sixflTvUrl" <> ''
            AND fixture."status" = ${FixtureStatus.COMPLETED}::"FixtureStatus"
          ORDER BY fixture."kickoffAt" DESC
        `),
        getCommunityGoalBallot(cycle.votingWeekStart, 6),
        prisma.$queryRaw<Array<{ candidateId: string }>>(Prisma.sql`
          SELECT vote."candidateId"
          FROM "GoalOfWeekVote" vote
          WHERE vote."userId" = ${viewer.id}
            AND vote."weekOf" = ${cycle.votingWeekStart}
          LIMIT 1
        `),
        prisma.$queryRaw<Array<{ candidateId: string }>>(Prisma.sql`
          SELECT nomination."candidateId"
          FROM "GoalOfWeekNomination" nomination
          JOIN "GoalOfWeekCandidate" candidate
            ON candidate."id" = nomination."candidateId"
          WHERE nomination."userId" = ${viewer.id}
            AND candidate."weekOf" = ${cycle.nominationWeekStart}
            AND candidate."status" = 'ACTIVE'
        `),
        getLatestCommunityGoalWinner(now),
      ]);

    return NextResponse.json(
      {
        nomination: {
          weekOf: cycle.nominationWeekStart.toISOString(),
          closesAt: cycle.nominationWeekEnd.toISOString(),
          fixtures: fixtures.map((fixture) => ({
            ...fixture,
            kickoffAt: fixture.kickoffAt.toISOString(),
            totalGoals: Number(fixture.homeScore) + Number(fixture.awayScore),
            videoUrl: splitSixflTvUrls(fixture.sixflTvUrl)[0] ?? null,
          })),
          nominatedCandidateIds: currentNominations.map((row) => row.candidateId),
          usedNominations: currentNominations.length,
          maxNominations: MAX_WEEKLY_NOMINATIONS,
        },
        voting: {
          weekOf: cycle.votingWeekStart.toISOString(),
          closesAt: cycle.votingClosesAt.toISOString(),
          open: cycle.votingOpen && viewer.isVerifiedPlayer,
          verifiedPlayer: viewer.isVerifiedPlayer,
          selectedCandidateId: currentVote[0]?.candidateId ?? null,
          candidates: ballot.map(candidatePayload),
        },
        latestWinner: latestWinner ? candidatePayload(latestWinner) : null,
      },
      { headers: noStoreHeaders },
    );
  } catch (error) {
    console.error("Could not load community Goal of the Week", error);
    return NextResponse.json(
      { error: "Goal of the Week voting is not available yet." },
      { status: 503, headers: noStoreHeaders },
    );
  }
}

type CommunityAction = {
  action?: unknown;
  teamId?: unknown;
  fixtureId?: unknown;
  goalNumber?: unknown;
  scoringTeamId?: unknown;
  scorerName?: unknown;
  comment?: unknown;
  candidateId?: unknown;
};

export async function POST(request: Request) {
  const payload = (await request.json().catch(() => null)) as CommunityAction | null;
  const action = String(payload?.action ?? "").trim();
  const teamId = String(payload?.teamId ?? "").trim();
  const viewer = await getViewer(teamId);
  if (!viewer) {
    return NextResponse.json({ error: "Not authorised." }, { status: 403 });
  }

  const now = new Date();
  const cycle = getCommunityGoalCycle(now);

  if (action === "nominate") {
    if (now >= cycle.nominationWeekEnd) {
      return NextResponse.json(
        { error: "Nominations for this fixture week have closed." },
        { status: 409 },
      );
    }

    const fixtureId = String(payload?.fixtureId ?? "").trim();
    const goalNumber = asPositiveInt(payload?.goalNumber);
    const scoringTeamId = String(payload?.scoringTeamId ?? "").trim();
    const scorerName = cleanText(payload?.scorerName, 100);
    const comment = cleanText(payload?.comment, 180);

    if (!fixtureId || !goalNumber || !scoringTeamId) {
      return NextResponse.json(
        { error: "Choose the fixture, goal number and scoring team." },
        { status: 400 },
      );
    }

    const fixtures = await prisma.$queryRaw<NominationFixtureRow[]>(Prisma.sql`
      SELECT
        fixture."id",
        fixture."kickoffAt",
        fixture."homeTeamId",
        fixture."awayTeamId",
        home_team."name" AS "homeTeamName",
        away_team."name" AS "awayTeamName",
        result."homeScore"::int AS "homeScore",
        result."awayScore"::int AS "awayScore",
        fixture."sixflTvUrl" AS "sixflTvUrl",
        league."name" AS "leagueName",
        league."season" AS "leagueSeason"
      FROM "Fixture" fixture
      JOIN "Team" home_team ON home_team."id" = fixture."homeTeamId"
      JOIN "Team" away_team ON away_team."id" = fixture."awayTeamId"
      JOIN "League" league ON league."id" = fixture."leagueId"
      JOIN "MatchResult" result ON result."fixtureId" = fixture."id"
      WHERE fixture."id" = ${fixtureId}
        AND fixture."kickoffAt" >= ${cycle.nominationWeekStart}
        AND fixture."kickoffAt" < ${cycle.nominationWeekEnd}
        AND fixture."sixflTvRecorded" = TRUE
        AND fixture."sixflTvUrl" IS NOT NULL
        AND fixture."sixflTvUrl" <> ''
        AND fixture."status" = ${FixtureStatus.COMPLETED}::"FixtureStatus"
      LIMIT 1
    `);
    const fixture = fixtures[0];
    if (!fixture) {
      return NextResponse.json(
        { error: "That completed SIXFL TV fixture is not available to nominate." },
        { status: 400 },
      );
    }

    const totalGoals = Number(fixture.homeScore) + Number(fixture.awayScore);
    if (goalNumber > totalGoals) {
      return NextResponse.json(
        { error: `That match had ${totalGoals} goal${totalGoals === 1 ? "" : "s"}. Choose a valid goal number.` },
        { status: 400 },
      );
    }

    if (scoringTeamId !== fixture.homeTeamId && scoringTeamId !== fixture.awayTeamId) {
      return NextResponse.json(
        { error: "The scoring team must be one of the teams in that fixture." },
        { status: 400 },
      );
    }

    const existing = await prisma.$queryRaw<
      Array<{ id: string; teamId: string; status: string }>
    >(Prisma.sql`
      SELECT "id", "teamId", "status"
      FROM "GoalOfWeekCandidate"
      WHERE "fixtureId" = ${fixtureId}
        AND "goalNumber" = ${goalNumber}
      LIMIT 1
    `);

    let candidateId = existing[0]?.id ?? null;
    if (existing[0] && existing[0].teamId !== scoringTeamId) {
      return NextResponse.json(
        {
          error:
            "That goal has already been nominated with the other team recorded as the scorer. Ask SIXFL to correct the existing nomination rather than creating a duplicate.",
        },
        { status: 409 },
      );
    }
    if (existing[0]?.status === "REMOVED") {
      return NextResponse.json(
        { error: "That nomination has been removed by SIXFL and cannot be re-added." },
        { status: 409 },
      );
    }

    const existingViewerNomination = candidateId
      ? await prisma.$queryRaw<Array<{ id: string }>>(Prisma.sql`
          SELECT nomination."id"
          FROM "GoalOfWeekNomination" nomination
          WHERE nomination."candidateId" = ${candidateId}
            AND nomination."userId" = ${viewer.id}
          LIMIT 1
        `)
      : [];

    if (existingViewerNomination.length === 0) {
      const weeklyNominationCount = await prisma.$queryRaw<Array<{ count: number }>>(Prisma.sql`
        SELECT COUNT(*)::int AS "count"
        FROM "GoalOfWeekNomination" nomination
        JOIN "GoalOfWeekCandidate" candidate
          ON candidate."id" = nomination."candidateId"
        WHERE nomination."userId" = ${viewer.id}
          AND candidate."weekOf" = ${cycle.nominationWeekStart}
          AND candidate."status" = 'ACTIVE'
      `);

      if (Number(weeklyNominationCount[0]?.count ?? 0) >= MAX_WEEKLY_NOMINATIONS) {
        return NextResponse.json(
          {
            error: `You can nominate up to ${MAX_WEEKLY_NOMINATIONS} different goals each week. Your nominations have already been used for this week.`,
          },
          { status: 409 },
        );
      }
    }

    if (!candidateId) {
      candidateId = randomUUID();
      await prisma.$executeRaw(Prisma.sql`
        INSERT INTO "GoalOfWeekCandidate" (
          "id", "fixtureId", "teamId", "weekOf", "goalNumber", "scorerName",
          "status", "createdAt", "updatedAt"
        ) VALUES (
          ${candidateId}, ${fixtureId}, ${scoringTeamId},
          ${cycle.nominationWeekStart}, ${goalNumber}, ${scorerName},
          'ACTIVE', NOW(), NOW()
        )
      `);
    } else if (scorerName) {
      await prisma.$executeRaw(Prisma.sql`
        UPDATE "GoalOfWeekCandidate"
        SET "scorerName" = COALESCE("scorerName", ${scorerName}), "updatedAt" = NOW()
        WHERE "id" = ${candidateId}
      `);
    }

    await prisma.$executeRaw(Prisma.sql`
      INSERT INTO "GoalOfWeekNomination" (
        "id", "candidateId", "userId", "comment", "createdAt", "updatedAt"
      ) VALUES (
        ${randomUUID()}, ${candidateId}, ${viewer.id}, ${comment}, NOW(), NOW()
      )
      ON CONFLICT ("candidateId", "userId") DO UPDATE
      SET "comment" = EXCLUDED."comment", "updatedAt" = NOW()
    `);

    return NextResponse.json({ ok: true, candidateId });
  }

  if (action === "vote") {
    if (!viewer.isVerifiedPlayer) {
      return NextResponse.json(
        { error: "Voting is limited to verified SIXFL players and captains." },
        { status: 403 },
      );
    }
    if (!cycle.votingOpen) {
      return NextResponse.json(
        { error: "Voting for this week's ballot has closed." },
        { status: 409 },
      );
    }

    const candidateId = String(payload?.candidateId ?? "").trim();
    const ballot = await getCommunityGoalBallot(cycle.votingWeekStart, 6);
    if (!ballot.some((candidate) => candidate.id === candidateId)) {
      return NextResponse.json(
        { error: "That goal is not on this week's six-goal ballot." },
        { status: 400 },
      );
    }

    await prisma.$executeRaw(Prisma.sql`
      INSERT INTO "GoalOfWeekVote" (
        "id", "candidateId", "userId", "weekOf", "createdAt", "updatedAt"
      ) VALUES (
        ${randomUUID()}, ${candidateId}, ${viewer.id}, ${cycle.votingWeekStart}, NOW(), NOW()
      )
      ON CONFLICT ("userId", "weekOf") DO UPDATE
      SET "candidateId" = EXCLUDED."candidateId", "updatedAt" = NOW()
    `);

    return NextResponse.json({ ok: true, candidateId });
  }

  return NextResponse.json({ error: "Unknown Goal of the Week action." }, { status: 400 });
}
