import { Prisma } from "@prisma/client";

import {
  parseLondonDateTime,
  toLondonDateInputValue,
} from "@/lib/datetime/london";
import { prisma } from "@/lib/prisma";

export type CommunityGoalCandidate = {
  id: string;
  fixtureId: string;
  teamId: string;
  weekOf: Date;
  goalNumber: number;
  scorerName: string | null;
  createdAt: Date;
  teamName: string;
  teamLogoUrl: string | null;
  opponentName: string;
  leagueName: string;
  leagueSeason: string | null;
  kickoffAt: Date;
  sixflTvUrl: string;
  nominationCount: number;
  voteCount: number;
};

export type CommunityGoalCycle = {
  nominationWeekStart: Date;
  nominationWeekEnd: Date;
  votingWeekStart: Date;
  votingOpensAt: Date;
  votingClosesAt: Date;
  votingOpen: boolean;
  latestClosedCandidateWeek: Date;
};

function addCalendarDays(dateInput: string, days: number) {
  const [year, month, day] = dateInput.split("-").map(Number);
  const value = new Date(Date.UTC(year, month - 1, day + days, 12, 0, 0));
  return value.toISOString().slice(0, 10);
}

export function getLondonWeekStart(value: Date = new Date()) {
  const dateInput = toLondonDateInputValue(value);
  const midday = new Date(`${dateInput}T12:00:00.000Z`);
  const mondayOffset = (midday.getUTCDay() + 6) % 7;
  return parseLondonDateTime(addCalendarDays(dateInput, -mondayOffset), "00:00");
}

export function addLondonDays(value: Date, days: number, time = "00:00") {
  return parseLondonDateTime(addCalendarDays(toLondonDateInputValue(value), days), time);
}

export function getCommunityGoalCycle(now: Date = new Date()): CommunityGoalCycle {
  const nominationWeekStart = getLondonWeekStart(now);
  const nominationWeekEnd = addLondonDays(nominationWeekStart, 7, "00:00");
  const votingWeekStart = addLondonDays(nominationWeekStart, -7, "00:00");
  const votingOpensAt = nominationWeekStart;
  const votingClosesAt = addLondonDays(nominationWeekStart, 1, "18:00");
  const votingOpen = now >= votingOpensAt && now < votingClosesAt;
  const latestClosedCandidateWeek = votingOpen
    ? addLondonDays(nominationWeekStart, -14, "00:00")
    : votingWeekStart;

  return {
    nominationWeekStart,
    nominationWeekEnd,
    votingWeekStart,
    votingOpensAt,
    votingClosesAt,
    votingOpen,
    latestClosedCandidateWeek,
  };
}

export function splitSixflTvUrls(value: string | null | undefined) {
  return (value ?? "")
    .split(/[\n,]+/)
    .map((item) => item.trim())
    .filter(Boolean);
}

export async function getCommunityGoalBallot(
  weekOf: Date,
  limit = 6,
): Promise<CommunityGoalCandidate[]> {
  const rows = await prisma.$queryRaw<CommunityGoalCandidate[]>(Prisma.sql`
    SELECT
      candidate."id",
      candidate."fixtureId",
      candidate."teamId",
      candidate."weekOf",
      candidate."goalNumber",
      candidate."scorerName",
      candidate."createdAt",
      scoring_team."name" AS "teamName",
      scoring_team."logoUrl" AS "teamLogoUrl",
      CASE
        WHEN fixture."homeTeamId" = candidate."teamId" THEN away_team."name"
        ELSE home_team."name"
      END AS "opponentName",
      league."name" AS "leagueName",
      league."season" AS "leagueSeason",
      fixture."kickoffAt",
      fixture."sixflTvUrl" AS "sixflTvUrl",
      COUNT(DISTINCT nomination."id")::int AS "nominationCount",
      COUNT(DISTINCT vote."id")::int AS "voteCount"
    FROM "GoalOfWeekCandidate" candidate
    JOIN "Fixture" fixture ON fixture."id" = candidate."fixtureId"
    JOIN "Team" scoring_team ON scoring_team."id" = candidate."teamId"
    JOIN "Team" home_team ON home_team."id" = fixture."homeTeamId"
    JOIN "Team" away_team ON away_team."id" = fixture."awayTeamId"
    JOIN "League" league ON league."id" = fixture."leagueId"
    LEFT JOIN "GoalOfWeekNomination" nomination
      ON nomination."candidateId" = candidate."id"
    LEFT JOIN "GoalOfWeekVote" vote
      ON vote."candidateId" = candidate."id"
     AND vote."weekOf" = candidate."weekOf"
    WHERE candidate."weekOf" = ${weekOf}
      AND candidate."status" = 'ACTIVE'
      AND fixture."sixflTvUrl" IS NOT NULL
      AND fixture."sixflTvUrl" <> ''
    GROUP BY
      candidate."id",
      candidate."fixtureId",
      candidate."teamId",
      candidate."weekOf",
      candidate."goalNumber",
      candidate."scorerName",
      candidate."createdAt",
      scoring_team."name",
      scoring_team."logoUrl",
      fixture."homeTeamId",
      away_team."name",
      home_team."name",
      league."name",
      league."season",
      fixture."kickoffAt",
      fixture."sixflTvUrl"
    ORDER BY
      COUNT(DISTINCT nomination."id") DESC,
      candidate."createdAt" ASC,
      candidate."id" ASC
    LIMIT ${limit}
  `);

  return rows.map((row) => ({
    ...row,
    goalNumber: Number(row.goalNumber),
    nominationCount: Number(row.nominationCount),
    voteCount: Number(row.voteCount),
  }));
}

export function pickCommunityGoalWinner(candidates: CommunityGoalCandidate[]) {
  if (!candidates.length) return null;
  const ranked = [...candidates].sort((a, b) => {
    if (b.voteCount !== a.voteCount) return b.voteCount - a.voteCount;
    if (b.nominationCount !== a.nominationCount) {
      return b.nominationCount - a.nominationCount;
    }
    return a.createdAt.getTime() - b.createdAt.getTime();
  });
  return ranked[0]?.voteCount > 0 ? ranked[0] : null;
}

export async function getLatestCommunityGoalWinner(now: Date = new Date()) {
  const cycle = getCommunityGoalCycle(now);
  const weeks = await prisma.$queryRaw<Array<{ weekOf: Date }>>(Prisma.sql`
    SELECT DISTINCT candidate."weekOf"
    FROM "GoalOfWeekCandidate" candidate
    WHERE candidate."status" = 'ACTIVE'
      AND candidate."weekOf" <= ${cycle.latestClosedCandidateWeek}
    ORDER BY candidate."weekOf" DESC
    LIMIT 12
  `);

  for (const row of weeks) {
    const ballot = await getCommunityGoalBallot(row.weekOf, 6);
    const winner = pickCommunityGoalWinner(ballot);
    if (winner) return winner;
  }

  return null;
}
