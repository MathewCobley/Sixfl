import { randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { splitSixflTvUrls } from "@/lib/goal-of-week/community";
import { MONTHLY_FINALIST_LIMIT, MONTHLY_NOMINATION_LIMIT, monthKey, monthlyCycle, monthlyPeriod, nominationOpen } from "./calendar";

type Db = Pick<Prisma.TransactionClient, "$queryRaw" | "$executeRaw">;
export type MonthlyCandidate = {
  id: string; fixtureId: string; teamId: string; monthKey: string;
  goalNumber: number | null; clipAssetId: string | null; clipNumber: number | null;
  scorerTeamMemberId: string | null; scorerName: string | null; createdAt: Date;
  teamName: string; teamLogoUrl: string | null; opponentName: string;
  leagueName: string; kickoffAt: Date; sixflTvUrl: string;
  nominationCount: number; voteCount: number;
};
export type MonthlyClip = {
  id: string; fixtureId: string; clipNumber: number; filename: string;
};
export type MonthlySquadPlayer = {
  teamMemberId: string;
  teamId: string;
  name: string;
  squadNumber: number | null;
};
export type MonthlyFixture = {
  id: string; kickoffAt: Date; homeTeamId: string; awayTeamId: string;
  homeTeamName: string; awayTeamName: string; homeScore: number; awayScore: number;
  sixflTvUrl: string; leagueName: string; clips: MonthlyClip[]; squadPlayers: MonthlySquadPlayer[];
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
  const clipNumber = row.clipNumber == null ? null : Number(row.clipNumber);
  return {
    id: row.id, fixtureId: row.fixtureId, teamId: row.teamId, monthKey: row.monthKey,
    goalNumber: row.goalNumber == null ? null : Number(row.goalNumber),
    clipAssetId: row.clipAssetId, clipNumber, scorerTeamMemberId: row.scorerTeamMemberId, scorerName: row.scorerName,
    teamName: row.teamName, teamLogoUrl: row.teamLogoUrl, opponentName: row.opponentName,
    leagueName: row.leagueName, kickoffAt: row.kickoffAt.toISOString(),
    nominationCount: Number(row.nominationCount), voteCount: Number(row.voteCount),
    clipVideoUrl: row.clipAssetId ? `/api/goal-of-month/clips/${encodeURIComponent(row.id)}` : null,
    thumbnailUrl: row.clipAssetId ? `/api/goal-of-month/thumbnails/${encodeURIComponent(row.id)}?v=sixfl-gotm-5` : null,
    videoUrls: safeVideoLinks(row.sixflTvUrl),
  };
}

/** A candidate is one exact SIXFL TV clip when clipAssetId is present.
 * Older nominations retain their fixture/goalNumber identity unchanged. */
export async function getMonthlyCandidates(key: string, limit = 300, db: Db = prisma): Promise<MonthlyCandidate[]> {
  const period = monthlyPeriod(key);
  return db.$queryRaw<MonthlyCandidate[]>(Prisma.sql`
    SELECT c."id", c."fixtureId", c."teamId", c."monthKey", c."goalNumber", c."clipAssetId",
      clip."clipNumber", c."scorerTeamMemberId", c."scorerName", c."createdAt",
      t."name" AS "teamName", t."logoUrl" AS "teamLogoUrl",
      CASE WHEN f."homeTeamId" = c."teamId" THEN away."name" ELSE home."name" END AS "opponentName",
      l."name" AS "leagueName", f."kickoffAt", COALESCE(f."sixflTvUrl", '') AS "sixflTvUrl",
      COUNT(DISTINCT n."id")::int AS "nominationCount", COUNT(DISTINCT v."id")::int AS "voteCount"
    FROM "GoalOfMonthCandidate" c
    JOIN "Fixture" f ON f."id" = c."fixtureId"
    JOIN "Team" t ON t."id" = c."teamId"
    JOIN "Team" home ON home."id" = f."homeTeamId"
    JOIN "Team" away ON away."id" = f."awayTeamId"
    JOIN "League" l ON l."id" = f."leagueId"
    LEFT JOIN "SixflTvFootageAsset" clip
      ON clip."id" = c."clipAssetId"
      AND clip."fixtureId" = c."fixtureId"
      AND clip."kind" = 'CLIP'
    LEFT JOIN "GoalOfMonthNomination" n ON n."candidateId" = c."id"
    LEFT JOIN "GoalOfMonthVote" v ON v."candidateId" = c."id" AND v."monthKey" = c."monthKey"
    WHERE c."monthKey" = ${key} AND c."status" = 'ACTIVE'
      AND f."status"::text = 'COMPLETED' AND f."publishedAt" IS NOT NULL
      AND f."kickoffAt" >= ${period.startsAt} AND f."kickoffAt" < ${period.endsAt}
      AND c."teamId" IN (f."homeTeamId", f."awayTeamId")
      AND (
        (c."clipAssetId" IS NOT NULL AND clip."state" = 'READY' AND clip."clipNumber" IS NOT NULL)
        OR
        (c."clipAssetId" IS NULL AND f."sixflTvRecorded" = TRUE AND COALESCE(f."sixflTvUrl", '') <> '')
      )
    GROUP BY c."id", t."name", t."logoUrl", f."homeTeamId", away."name", home."name",
      l."name", f."kickoffAt", f."sixflTvUrl", clip."clipNumber"
    ORDER BY COUNT(DISTINCT n."id") DESC, c."createdAt" ASC, c."id" ASC
    LIMIT ${Math.max(1, Math.min(Math.trunc(limit), 1000))}
  `);
}

export async function getMonthlyFixtures(key: string, db: Db = prisma, fixtureId?: string): Promise<MonthlyFixture[]> {
  const period = monthlyPeriod(key);
  const fixtures = await db.$queryRaw<Omit<MonthlyFixture, "clips" | "squadPlayers">[]>(Prisma.sql`
    SELECT f."id", f."kickoffAt", f."homeTeamId", f."awayTeamId",
      home."name" AS "homeTeamName", away."name" AS "awayTeamName",
      r."homeScore"::int AS "homeScore", r."awayScore"::int AS "awayScore",
      COALESCE(f."sixflTvUrl", '') AS "sixflTvUrl", l."name" AS "leagueName"
    FROM "Fixture" f
    JOIN "Team" home ON home."id" = f."homeTeamId"
    JOIN "Team" away ON away."id" = f."awayTeamId"
    JOIN "League" l ON l."id" = f."leagueId"
    JOIN "MatchResult" r ON r."fixtureId" = f."id"
    WHERE f."kickoffAt" >= ${period.startsAt} AND f."kickoffAt" < ${period.endsAt}
      AND f."status"::text = 'COMPLETED' AND f."publishedAt" IS NOT NULL
      AND (
        (f."sixflTvRecorded" = TRUE AND COALESCE(f."sixflTvUrl", '') <> '')
        OR EXISTS (
          SELECT 1 FROM "SixflTvFootageAsset" a
          WHERE a."fixtureId" = f."id" AND a."kind" = 'CLIP'
            AND a."state" = 'READY' AND a."clipNumber" IS NOT NULL
        )
      )
      ${fixtureId ? Prisma.sql`AND f."id" = ${fixtureId}` : Prisma.empty}
    ORDER BY f."kickoffAt" DESC, f."id" ASC
  `);
  if (!fixtures.length) return [];

  const teamIds = [...new Set(fixtures.flatMap(row => [row.homeTeamId, row.awayTeamId]))];
  const [clips, squadPlayers] = await Promise.all([
    db.$queryRaw<MonthlyClip[]>(Prisma.sql`
      SELECT "id", "fixtureId", "clipNumber", "filename"
      FROM "SixflTvFootageAsset"
      WHERE "fixtureId" IN (${Prisma.join(fixtures.map(row => row.id))})
        AND "kind" = 'CLIP' AND "state" = 'READY' AND "clipNumber" IS NOT NULL
      ORDER BY "fixtureId", "clipNumber", "createdAt", "id"
    `),
    db.$queryRaw<MonthlySquadPlayer[]>(Prisma.sql`
      SELECT tm."id" AS "teamMemberId", tm."teamId",
        BTRIM(u."name") AS "name", p."squadNumber"::int AS "squadNumber"
      FROM "TeamMember" tm
      JOIN "User" u ON u."id" = tm."userId"
      LEFT JOIN "TeamMemberProfile" p ON p."teamMemberId" = tm."id"
      WHERE tm."teamId" IN (${Prisma.join(teamIds)})
        AND tm."role"::text <> 'COACH'
        AND NULLIF(BTRIM(COALESCE(u."name", '')), '') IS NOT NULL
      ORDER BY tm."teamId", p."squadNumber" NULLS LAST, LOWER(BTRIM(u."name")), tm."createdAt", tm."id"
    `),
  ]);
  const clipsByFixture = new Map<string, MonthlyClip[]>();
  for (const clip of clips) {
    const list = clipsByFixture.get(clip.fixtureId) ?? [];
    list.push({ ...clip, clipNumber: Number(clip.clipNumber) });
    clipsByFixture.set(clip.fixtureId, list);
  }
  const playersByTeam = new Map<string, MonthlySquadPlayer[]>();
  for (const player of squadPlayers) {
    const list = playersByTeam.get(player.teamId) ?? [];
    list.push({ ...player, squadNumber: player.squadNumber == null ? null : Number(player.squadNumber) });
    playersByTeam.set(player.teamId, list);
  }
  return fixtures.map(fixture => ({
    ...fixture,
    clips: clipsByFixture.get(fixture.id) ?? [],
    squadPlayers: [
      ...(playersByTeam.get(fixture.homeTeamId) ?? []),
      ...(playersByTeam.get(fixture.awayTeamId) ?? []),
    ],
  }));
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
      fixtures: fixtures.map(f => ({
        ...f,
        kickoffAt: f.kickoffAt.toISOString(),
        videoUrls: safeVideoLinks(f.sixflTvUrl),
        clips: f.clips.map(clip => ({
          ...clip,
          videoUrl: `/api/goal-of-month/fixtures/${encodeURIComponent(f.id)}/clips/${encodeURIComponent(clip.id)}`,
        })),
      })),
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

export async function switchLegacyMonthlyCandidateToClip(candidateId: string, clipAssetId: string, db: Db = prisma) {
  const [candidate] = await db.$queryRaw<Array<{
    id: string;
    fixtureId: string;
    status: string;
    clipAssetId: string | null;
  }>>(Prisma.sql`
    SELECT "id", "fixtureId", "status", "clipAssetId"
    FROM "GoalOfMonthCandidate"
    WHERE "id"=${candidateId}
    FOR UPDATE
  `);
  if (!candidate) throw new GoalAwardError("That Goal of the Month nomination no longer exists.", 404);
  if (candidate.status !== "ACTIVE") throw new GoalAwardError("Only an active nominee can be switched to an exact clip.");
  if (candidate.clipAssetId) throw new GoalAwardError("This nominee already uses an exact SIXFL TV clip.");

  const [clip] = await db.$queryRaw<Array<{ id: string; clipNumber: number }>>(Prisma.sql`
    SELECT "id", "clipNumber"::int AS "clipNumber"
    FROM "SixflTvFootageAsset"
    WHERE "id"=${clipAssetId}
      AND "fixtureId"=${candidate.fixtureId}
      AND "kind"='CLIP'
      AND "state"='READY'
      AND "clipNumber" IS NOT NULL
    LIMIT 1
  `);
  if (!clip) throw new GoalAwardError("Choose a ready SIXFL TV highlight clip from the same match.", 400);

  const [existing] = await db.$queryRaw<Array<{ id: string }>>(Prisma.sql`
    SELECT "id" FROM "GoalOfMonthCandidate"
    WHERE "clipAssetId"=${clipAssetId} AND "id"<>${candidateId}
    LIMIT 1
  `);
  if (existing) throw new GoalAwardError("That exact SIXFL TV clip is already attached to another Goal of the Month nominee.");

  await db.$executeRaw(Prisma.sql`
    UPDATE "GoalOfMonthCandidate"
    SET "clipAssetId"=${clipAssetId}, "goalNumber"=NULL, "updatedAt"=NOW()
    WHERE "id"=${candidateId} AND "clipAssetId" IS NULL
  `);
  await db.$executeRaw(Prisma.sql`
    INSERT INTO "GoalOfMonthClipRender" ("candidateId","sourceAssetId")
    VALUES (${candidateId},${clipAssetId})
    ON CONFLICT ("candidateId") DO UPDATE SET
      "sourceAssetId"=EXCLUDED."sourceAssetId",
      "state"='QUEUED',
      "leaseToken"=NULL,
      "busyUntil"=NULL,
      "error"=NULL,
      "completedAt"=NULL,
      "updatedAt"=NOW()
  `);
  const [counts] = await db.$queryRaw<Array<{ nominationCount: number; voteCount: number }>>(Prisma.sql`
    SELECT COUNT(DISTINCT n."id")::int AS "nominationCount", COUNT(DISTINCT v."id")::int AS "voteCount"
    FROM "GoalOfMonthCandidate" c
    LEFT JOIN "GoalOfMonthNomination" n ON n."candidateId"=c."id"
    LEFT JOIN "GoalOfMonthVote" v ON v."candidateId"=c."id"
    WHERE c."id"=${candidateId}
  `);
  return {
    candidateId,
    clipAssetId,
    clipNumber: Number(clip.clipNumber),
    nominationCount: Number(counts?.nominationCount ?? 0),
    voteCount: Number(counts?.voteCount ?? 0),
  };
}
export async function nominateMonthlyGoal(input: {
  userId: string;
  fixtureId: string;
  scoringTeamId: string;
  scorerTeamMemberId?: string | null;
  clipAssetId?: string | null;
  goalNumber?: number | null;
}, now = new Date()) {
  return prisma.$transaction(async tx => {
    const clipAssetId = input.clipAssetId ?? null;
    const goalNumber = input.goalNumber ?? null;
    const identity = clipAssetId ? `clip:${clipAssetId}` : `goal:${goalNumber ?? ""}`;

    await tx.$executeRaw(Prisma.sql`SELECT pg_advisory_xact_lock(hashtextextended(${'monthly-goal-user:' + input.userId}, 0))`);
    await tx.$executeRaw(Prisma.sql`SELECT pg_advisory_xact_lock(hashtextextended(${'monthly-goal:' + input.fixtureId + ':' + identity}, 0))`);

    const [fixtureDate] = await tx.$queryRaw<Array<{ kickoffAt: Date }>>(Prisma.sql`SELECT "kickoffAt" FROM "Fixture" WHERE "id" = ${input.fixtureId}`);
    if (!fixtureDate) throw new GoalAwardError("That fixture is not available to nominate.", 400);
    const key = monthKey(fixtureDate.kickoffAt);
    const transition = await getAwardTransition(tx);
    if (key < transition.firstMonth || !nominationOpen(key, now)) throw new GoalAwardError("Nominations for that match month are closed.");

    const [fixture] = await getMonthlyFixtures(key, tx, input.fixtureId);
    if (!fixture) throw new GoalAwardError("Choose a completed, published SIXFL TV fixture with available footage.", 400);
    if (![fixture.homeTeamId, fixture.awayTeamId].includes(input.scoringTeamId))
      throw new GoalAwardError("The scoring team must have played in that match.", 400);

    const scorerTeamMemberId = input.scorerTeamMemberId?.trim() || null;
    const [scorer] = scorerTeamMemberId
      ? await tx.$queryRaw<Array<{ teamMemberId: string; scorerName: string }>>(Prisma.sql`
          SELECT tm."id" AS "teamMemberId", BTRIM(u."name") AS "scorerName"
          FROM "TeamMember" tm
          JOIN "User" u ON u."id" = tm."userId"
          WHERE tm."id" = ${scorerTeamMemberId}
            AND tm."teamId" = ${input.scoringTeamId}
            AND tm."role"::text <> 'COACH'
            AND NULLIF(BTRIM(COALESCE(u."name", '')), '') IS NOT NULL
          LIMIT 1
        `)
      : [];
    const scorerName = scorer?.scorerName ?? null;

    let existing: { id: string; teamId: string; status: string; scorerTeamMemberId: string | null } | undefined;
    if (clipAssetId) {
      const clip = fixture.clips.find(row => row.id === clipAssetId);
      if (!clip) throw new GoalAwardError("Choose an available SIXFL TV clip from that match.", 400);
      [existing] = await tx.$queryRaw<Array<{ id: string; teamId: string; status: string; scorerTeamMemberId: string | null }>>(Prisma.sql`
        SELECT "id", "teamId", "status", "scorerTeamMemberId" FROM "GoalOfMonthCandidate"
        WHERE "clipAssetId" = ${clipAssetId}
      `);
    } else {
      const goals = Number(fixture.homeScore) + Number(fixture.awayScore);
      if (!Number.isInteger(goalNumber) || Number(goalNumber) < 1 || Number(goalNumber) > goals)
        throw new GoalAwardError("Choose a valid goal number from that match.", 400);
      [existing] = await tx.$queryRaw<Array<{ id: string; teamId: string; status: string; scorerTeamMemberId: string | null }>>(Prisma.sql`
        SELECT "id", "teamId", "status", "scorerTeamMemberId" FROM "GoalOfMonthCandidate"
        WHERE "fixtureId" = ${input.fixtureId} AND "clipAssetId" IS NULL AND "goalNumber" = ${goalNumber}
      `);
    }

    if (existing && (existing.status !== "ACTIVE" || existing.teamId !== input.scoringTeamId))
      throw new GoalAwardError("That goal was removed or has a different scoring team recorded. Ask SIXFL to review it.");
    if (!existing && !scorer) {
      throw new GoalAwardError("Choose the scorer from that team’s SIXFL squad. If they are missing, ask the captain to add them to the squad first.", 400);
    }
    if (existing?.scorerTeamMemberId && scorerTeamMemberId && existing.scorerTeamMemberId !== scorerTeamMemberId) {
      throw new GoalAwardError("This goal is already linked to a different squad player. Ask SIXFL to review the scorer.", 409);
    }
    if (existing && !existing.scorerTeamMemberId && scorer) {
      await tx.$executeRaw(Prisma.sql`
        UPDATE "GoalOfMonthCandidate"
        SET "scorerTeamMemberId"=${scorer.teamMemberId}, "scorerName"=${scorer.scorerName}, "updatedAt"=NOW()
        WHERE "id"=${existing.id} AND "scorerTeamMemberId" IS NULL
      `);
    }

    const mine = await tx.$queryRaw<Array<{ candidateId: string }>>(Prisma.sql`
      SELECT n."candidateId" FROM "GoalOfMonthNomination" n JOIN "GoalOfMonthCandidate" c ON c."id" = n."candidateId"
      WHERE n."userId" = ${input.userId} AND c."monthKey" = ${key} AND c."status" = 'ACTIVE'
    `);
    if (existing && mine.some(n => n.candidateId === existing.id)) return { candidateId: existing.id, monthKey: key, alreadyNominated: true };
    if (mine.length >= MONTHLY_NOMINATION_LIMIT) throw new GoalAwardError("You have used your three nominations for this month.");

    const candidateId = existing?.id ?? randomUUID();
    if (!existing) {
      await tx.$executeRaw(Prisma.sql`
        INSERT INTO "GoalOfMonthCandidate" ("id", "fixtureId", "teamId", "monthKey", "goalNumber", "clipAssetId", "scorerTeamMemberId", "scorerName")
        VALUES (${candidateId}, ${input.fixtureId}, ${input.scoringTeamId}, ${key}, ${goalNumber}, ${clipAssetId}, ${scorer!.teamMemberId}, ${scorer!.scorerName})
      `);
    }
    await tx.$executeRaw(Prisma.sql`
      INSERT INTO "GoalOfMonthNomination" ("id", "candidateId", "userId") VALUES (${randomUUID()}, ${candidateId}, ${input.userId})
      ON CONFLICT ("candidateId", "userId") DO NOTHING
    `);
    if (clipAssetId && !existing) {
      await tx.$executeRaw(Prisma.sql`
        INSERT INTO "GoalOfMonthClipRender" ("candidateId","sourceAssetId")
        VALUES (${candidateId}, ${clipAssetId})
        ON CONFLICT ("candidateId") DO NOTHING
      `);
    }
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
