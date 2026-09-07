import { randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { splitSixflTvUrls } from "@/lib/goal-of-week/community";
import { MONTHLY_FINALIST_LIMIT, MONTHLY_NOMINATION_LIMIT, monthKey, monthlyCycle, monthlyPeriod, nominationOpen } from "./calendar";

type Db = Pick<Prisma.TransactionClient, "$queryRaw" | "$executeRaw">;
export type MonthlyCandidate = {
  id: string; fixtureId: string; teamId: string; monthKey: string;
  goalNumber: number; scorerName: string | null; createdAt: Date;
  teamName: string; teamLogoUrl: string | null; opponentName: string;
  leagueName: string; kickoffAt: Date; sixflTvUrl: string;
  nominationCount: number; voteCount: number;
};
export type MonthlyFixture = {
  id: string; kickoffAt: Date; homeTeamId: string; awayTeamId: string;
  homeTeamName: string; awayTeamName: string; homeScore: number; awayScore: number;
  sixflTvUrl: string; leagueName: string;
};
export type AwardTransition = {
  firstMonth: string; weeklyNominationsCloseAt: Date; weeklyVotingClosesAt: Date;
};

export async function getAwardTransition(db: Db = prisma): Promise<AwardTransition> {
  const [row] = await db.$queryRaw<AwardTransition[]>(Prisma.sql`
    SELECT "firstMonth", "weeklyNominationsCloseAt", "weeklyVotingClosesAt"
    FROM "GoalAwardTransition" WHERE "id" = 'monthly'
  `);
  if (!row) throw new Error("Goal of the Month is not ready yet.");
  return row;
}

export function safeVideoLinks(value: string): string[] {
  return [...new Set(splitSixflTvUrls(value).filter(link => {
    try { const url = new URL(link); return url.protocol === "https:" && !url.username && !url.password; }
    catch { return false; }
  }))];
}

export function monthlyCandidatePayload(row: MonthlyCandidate) {
  return {
    id: row.id, fixtureId: row.fixtureId, teamId: row.teamId, monthKey: row.monthKey,
    goalNumber: Number(row.goalNumber), scorerName: row.scorerName,
    teamName: row.teamName, teamLogoUrl: row.teamLogoUrl, opponentName: row.opponentName,
    leagueName: row.leagueName, kickoffAt: row.kickoffAt.toISOString(),
    nominationCount: Number(row.nominationCount), voteCount: Number(row.voteCount),
    videoUrls: safeVideoLinks(row.sixflTvUrl),
  };
}

/** A candidate is one fixture/goal, irrespective of how many people nominate it.
 * Nominations close before voting begins, so this ordering cannot change through
 * another player nomination once the six-goal ballot is open. */
export async function getMonthlyCandidates(key: string, limit = 300, db: Db = prisma): Promise<MonthlyCandidate[]> {
  const period = monthlyPeriod(key);
  return db.$queryRaw<MonthlyCandidate[]>(Prisma.sql`
    SELECT c."id", c."fixtureId", c."teamId", c."monthKey", c."goalNumber", c."scorerName", c."createdAt",
      t."name" AS "teamName", t."logoUrl" AS "teamLogoUrl",
      CASE WHEN f."homeTeamId" = c."teamId" THEN away."name" ELSE home."name" END AS "opponentName",
      l."name" AS "leagueName", f."kickoffAt", f."sixflTvUrl",
      COUNT(DISTINCT n."id")::int AS "nominationCount", COUNT(DISTINCT v."id")::int AS "voteCount"
    FROM "GoalOfMonthCandidate" c
    JOIN "Fixture" f ON f."id" = c."fixtureId"
    JOIN "Team" t ON t."id" = c."teamId"
    JOIN "Team" home ON home."id" = f."homeTeamId"
    JOIN "Team" away ON away."id" = f."awayTeamId"
    JOIN "League" l ON l."id" = f."leagueId"
    LEFT JOIN "GoalOfMonthNomination" n ON n."candidateId" = c."id"
    LEFT JOIN "GoalOfMonthVote" v ON v."candidateId" = c."id" AND v."monthKey" = c."monthKey"
    WHERE c."monthKey" = ${key} AND c."status" = 'ACTIVE'
      AND f."status"::text = 'COMPLETED' AND f."publishedAt" IS NOT NULL
      AND f."kickoffAt" >= ${period.startsAt} AND f."kickoffAt" < ${period.endsAt}
      AND f."sixflTvRecorded" = TRUE AND COALESCE(f."sixflTvUrl", '') <> ''
      AND c."teamId" IN (f."homeTeamId", f."awayTeamId")
    GROUP BY c."id", t."name", t."logoUrl", f."homeTeamId", away."name", home."name", l."name", f."kickoffAt", f."sixflTvUrl"
    ORDER BY COUNT(DISTINCT n."id") DESC, c."createdAt" ASC, c."id" ASC
    LIMIT ${Math.max(1, Math.min(Math.trunc(limit), 1000))}
  `);
}

export async function getMonthlyFixtures(key: string, db: Db = prisma, fixtureId?: string): Promise<MonthlyFixture[]> {
  const period = monthlyPeriod(key);
  return db.$queryRaw<MonthlyFixture[]>(Prisma.sql`
    SELECT f."id", f."kickoffAt", f."homeTeamId", f."awayTeamId",
      home."name" AS "homeTeamName", away."name" AS "awayTeamName",
      r."homeScore"::int AS "homeScore", r."awayScore"::int AS "awayScore",
      f."sixflTvUrl", l."name" AS "leagueName"
    FROM "Fixture" f
    JOIN "Team" home ON home."id" = f."homeTeamId"
    JOIN "Team" away ON away."id" = f."awayTeamId"
    JOIN "League" l ON l."id" = f."leagueId"
    JOIN "MatchResult" r ON r."fixtureId" = f."id"
    WHERE f."kickoffAt" >= ${period.startsAt} AND f."kickoffAt" < ${period.endsAt}
      AND f."status"::text = 'COMPLETED' AND f."publishedAt" IS NOT NULL
      AND f."sixflTvRecorded" = TRUE AND COALESCE(f."sixflTvUrl", '') <> ''
      ${fixtureId ? Prisma.sql`AND f."id" = ${fixtureId}` : Prisma.empty}
    ORDER BY f."kickoffAt" DESC, f."id" ASC
  `);
}

export function pickMonthlyWinner(candidates: MonthlyCandidate[]): MonthlyCandidate | null {
  const ranked = [...candidates].sort((a, b) =>
    Number(b.voteCount) - Number(a.voteCount) || Number(b.nominationCount) - Number(a.nominationCount)
    || a.createdAt.getTime() - b.createdAt.getTime() || a.id.localeCompare(b.id));
  return ranked[0] && Number(ranked[0].voteCount) > 0 ? ranked[0] : null;
}

export async function getMonthlyWinners(now = new Date(), limit = 24): Promise<MonthlyCandidate[]> {
  const cycle = monthlyCycle(now);
  const months = await prisma.$queryRaw<Array<{ monthKey: string }>>(Prisma.sql`
    SELECT DISTINCT "monthKey" FROM "GoalOfMonthCandidate"
    WHERE "status" = 'ACTIVE' AND "monthKey" <= ${cycle.latestClosedMonth}
    ORDER BY "monthKey" DESC LIMIT ${Math.max(1, Math.min(limit * 2, 48))}
  `);
  const winners: MonthlyCandidate[] = [];
  for (const month of months) {
    const winner = pickMonthlyWinner(await getMonthlyCandidates(month.monthKey, MONTHLY_FINALIST_LIMIT));
    if (winner) winners.push(winner);
    if (winners.length >= limit) break;
  }
  return winners;
}

export async function getMonthlyPageData(viewerId: string | null, now = new Date()) {
  const transition = await getAwardTransition();
  const cycle = monthlyCycle(now);
  const nominationMonths = cycle.nominationMonths.filter(key => key >= transition.firstMonth);
  const nominations = await Promise.all(nominationMonths.map(async key => {
    const period = monthlyPeriod(key);
    const [fixtures, candidates, mine] = await Promise.all([
      getMonthlyFixtures(key), getMonthlyCandidates(key),
      viewerId ? prisma.$queryRaw<Array<{ candidateId: string }>>(Prisma.sql`
        SELECT n."candidateId" FROM "GoalOfMonthNomination" n
        JOIN "GoalOfMonthCandidate" c ON c."id" = n."candidateId"
        WHERE n."userId" = ${viewerId} AND c."monthKey" = ${key} AND c."status" = 'ACTIVE'
      `) : Promise.resolve([]),
    ]);
    return {
      key, label: period.label, closesAt: period.nominationsCloseAt.toISOString(),
      fixtures: fixtures.map(f => ({ ...f, kickoffAt: f.kickoffAt.toISOString(), videoUrls: safeVideoLinks(f.sixflTvUrl) })),
      candidates: candidates.map(monthlyCandidatePayload), nominatedCandidateIds: mine.map(n => n.candidateId),
      usedNominations: mine.length, maxNominations: MONTHLY_NOMINATION_LIMIT,
    };
  }));
  const period = monthlyPeriod(cycle.votingMonth);
  const [ballot, vote, winners] = await Promise.all([
    cycle.votingOpen && cycle.votingMonth >= transition.firstMonth ? getMonthlyCandidates(cycle.votingMonth, MONTHLY_FINALIST_LIMIT) : Promise.resolve([]),
    viewerId ? prisma.$queryRaw<Array<{ candidateId: string }>>(Prisma.sql`
      SELECT "candidateId" FROM "GoalOfMonthVote" WHERE "userId" = ${viewerId} AND "monthKey" = ${cycle.votingMonth} LIMIT 1
    `) : Promise.resolve([]),
    getMonthlyWinners(now),
  ]);
  return {
    nominations,
    voting: { key: cycle.votingMonth, label: period.label, open: cycle.votingOpen && cycle.votingMonth >= transition.firstMonth,
      closesAt: period.votingClosesAt.toISOString(), candidates: ballot.map(monthlyCandidatePayload), selectedCandidateId: vote[0]?.candidateId ?? null },
    winners: winners.map(monthlyCandidatePayload),
    legacy: { nominationsOpen: now < transition.weeklyNominationsCloseAt, votingMayBeOpen: now < transition.weeklyVotingClosesAt,
      nominationsCloseAt: transition.weeklyNominationsCloseAt.toISOString(), votingClosesAt: transition.weeklyVotingClosesAt.toISOString() },
  };
}

export class GoalAwardError extends Error {
  constructor(message: string, public status = 409) { super(message); }
}

export async function nominateMonthlyGoal(input: { userId: string; fixtureId: string; scoringTeamId: string; goalNumber: number; scorerName: string | null }, now = new Date()) {
  return prisma.$transaction(async tx => {
    // Serialize the user's allowance and this fixture's goal identity separately.
    await tx.$executeRaw(Prisma.sql`SELECT pg_advisory_xact_lock(hashtextextended(${'monthly-goal-user:' + input.userId}, 0))`);
    await tx.$executeRaw(Prisma.sql`SELECT pg_advisory_xact_lock(hashtextextended(${'monthly-goal:' + input.fixtureId + ':' + input.goalNumber}, 0))`);
    const [fixtureDate] = await tx.$queryRaw<Array<{ kickoffAt: Date }>>(Prisma.sql`SELECT "kickoffAt" FROM "Fixture" WHERE "id" = ${input.fixtureId}`);
    if (!fixtureDate) throw new GoalAwardError("That fixture is not available to nominate.", 400);
    const key = monthKey(fixtureDate.kickoffAt);
    const transition = await getAwardTransition(tx);
    if (key < transition.firstMonth || !nominationOpen(key, now)) throw new GoalAwardError("Nominations for that match month are closed.");
    const [fixture] = await getMonthlyFixtures(key, tx, input.fixtureId);
    if (!fixture || !safeVideoLinks(fixture.sixflTvUrl).length) throw new GoalAwardError("Choose a completed, published SIXFL TV fixture with available footage.", 400);
    const goals = Number(fixture.homeScore) + Number(fixture.awayScore);
    if (!Number.isInteger(input.goalNumber) || input.goalNumber < 1 || input.goalNumber > goals)
      throw new GoalAwardError("Choose a valid goal number from that match.", 400);
    if (![fixture.homeTeamId, fixture.awayTeamId].includes(input.scoringTeamId))
      throw new GoalAwardError("The scoring team must have played in that match.", 400);
    const [existing] = await tx.$queryRaw<Array<{ id: string; teamId: string; status: string }>>(Prisma.sql`
      SELECT "id", "teamId", "status" FROM "GoalOfMonthCandidate" WHERE "fixtureId" = ${input.fixtureId} AND "goalNumber" = ${input.goalNumber}
    `);
    if (existing && (existing.status !== 'ACTIVE' || existing.teamId !== input.scoringTeamId))
      throw new GoalAwardError("That goal was removed or has a different scoring team recorded. Ask SIXFL to review it.");
    const mine = await tx.$queryRaw<Array<{ candidateId: string }>>(Prisma.sql`
      SELECT n."candidateId" FROM "GoalOfMonthNomination" n JOIN "GoalOfMonthCandidate" c ON c."id" = n."candidateId"
      WHERE n."userId" = ${input.userId} AND c."monthKey" = ${key} AND c."status" = 'ACTIVE'
    `);
    if (existing && mine.some(n => n.candidateId === existing.id)) return { candidateId: existing.id, monthKey: key, alreadyNominated: true };
    if (mine.length >= MONTHLY_NOMINATION_LIMIT) throw new GoalAwardError("You have used your three nominations for this month.");
    const candidateId = existing?.id ?? randomUUID();
    if (!existing) await tx.$executeRaw(Prisma.sql`
      INSERT INTO "GoalOfMonthCandidate" ("id", "fixtureId", "teamId", "monthKey", "goalNumber", "scorerName")
      VALUES (${candidateId}, ${input.fixtureId}, ${input.scoringTeamId}, ${key}, ${input.goalNumber}, ${input.scorerName})
    `);
    await tx.$executeRaw(Prisma.sql`
      INSERT INTO "GoalOfMonthNomination" ("id", "candidateId", "userId") VALUES (${randomUUID()}, ${candidateId}, ${input.userId})
      ON CONFLICT ("candidateId", "userId") DO NOTHING
    `);
    return { candidateId, monthKey: key, alreadyNominated: false };
  });
}

export async function voteMonthlyGoal(userId: string, candidateId: string, now = new Date()) {
  const cycle = monthlyCycle(now);
  const transition = await getAwardTransition();
  if (!cycle.votingOpen || cycle.votingMonth < transition.firstMonth) throw new GoalAwardError("Monthly voting is not open.");
  const ballot = await getMonthlyCandidates(cycle.votingMonth, MONTHLY_FINALIST_LIMIT);
  if (!ballot.some(c => c.id === candidateId)) throw new GoalAwardError("Choose a goal from this month's six finalists.", 400);
  await prisma.$executeRaw(Prisma.sql`
    INSERT INTO "GoalOfMonthVote" ("id", "candidateId", "userId", "monthKey")
    VALUES (${randomUUID()}, ${candidateId}, ${userId}, ${cycle.votingMonth})
    ON CONFLICT ("userId", "monthKey") DO UPDATE SET "candidateId" = EXCLUDED."candidateId", "updatedAt" = NOW()
  `);
  return { candidateId, monthKey: cycle.votingMonth };
}
