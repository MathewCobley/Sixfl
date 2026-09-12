import { randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { ensurePlayerDataHealthRunTable as ensureRunTable, type PlayerDataHealthSummary } from "./player-data-health";
import { getPlayerRecruitmentMatches } from "./player-data-health-matches";
import { reconcileRecruitmentMatch, emptyHealthChanges } from "./player-data-health-reconcile";

function currentMonthRunKey() {
  const now = new Date();
  return `monthly-safe:${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
}

export async function runSafePlayerDataHealthCleanup(input: {
  source: "MANUAL" | "MONTHLY";
  force?: boolean;
  actorUserId?: string | null;
}): Promise<PlayerDataHealthSummary> {
  if (input.source === "MANUAL") {
    const actor = input.actorUserId ? await prisma.user.findUnique({ where: { id: input.actorUserId }, select: { role: true } }) : null;
    if (actor?.role !== "ADMIN") throw new Error("Administrator access is required for manual cleanup.");
  }
  await ensureRunTable();
  const runKey =
    input.source === "MONTHLY" && !input.force
      ? currentMonthRunKey()
      : `${input.source.toLowerCase()}-safe:${new Date().toISOString()}:${randomUUID()}`;

  if (input.source === "MONTHLY" && !input.force) {
    const existing = await prisma.$queryRaw<Array<{ id: string; status: string }>>(Prisma.sql`
      SELECT "id", "status"
      FROM "PlayerDataHealthRun"
      WHERE "runKey" = ${runKey}
      LIMIT 1
    `);
    if (existing[0]?.status === "COMPLETED" || existing[0]?.status === "STARTED") {
      return {
        runId: existing[0].id,
        runKey,
        source: input.source,
        alreadyRun: true,
        scannedUsers: 0,
        affectedUsers: 0,
        prospectsActivated: 0,
        prospectsClosedAsDuplicate: 0,
        playerPoolProfilesJoined: 0,
        requestsJoined: 0,
        requestsClosed: 0,
        leadsClosed: 0,
      };
    }
  }

  const runId = randomUUID();
  await prisma.$executeRaw(Prisma.sql`
    INSERT INTO "PlayerDataHealthRun" ("id", "runKey", "source", "status", "startedAt")
    VALUES (${runId}, ${runKey}, ${input.source}, 'STARTED', NOW())
    ON CONFLICT ("runKey") DO UPDATE SET
      "id" = EXCLUDED."id",
      "source" = EXCLUDED."source",
      "status" = 'STARTED',
      "startedAt" = NOW(),
      "completedAt" = NULL,
      "error" = NULL
  `);

  try {
    const issues = await getPlayerRecruitmentMatches();
    const totals = {
      affectedUsers: 0,
      prospectsActivated: 0,
      prospectsClosedAsDuplicate: 0,
      playerPoolProfilesJoined: 0,
      requestsJoined: 0,
      requestsClosed: 0,
      leadsClosed: 0,
    };

    const affectedUserIds = new Set<string>();
    for (const issue of issues) {
      if (!issue.safe) continue;
      const result = await reconcileRecruitmentMatch({ match: issue, runId, actorUserId: input.actorUserId });
      if (result.changed) affectedUserIds.add(issue.candidates[0].userId);
      totals.affectedUsers = affectedUserIds.size;
      totals.prospectsActivated += result.prospectsActivated;
      totals.prospectsClosedAsDuplicate += result.prospectsClosedAsDuplicate;
      totals.playerPoolProfilesJoined += result.playerPoolProfilesJoined;
      totals.requestsJoined += result.requestsJoined;
      totals.requestsClosed += result.requestsClosed;
      totals.leadsClosed += result.leadsClosed;
    }

    await prisma.$executeRaw(Prisma.sql`
      UPDATE "PlayerDataHealthRun"
      SET
        "status" = 'COMPLETED',
        "scannedUsers" = ${new Set(issues.flatMap(m => m.candidates.map(c => c.userId))).size},
        "affectedUsers" = ${totals.affectedUsers},
        "prospectsActivated" = ${totals.prospectsActivated},
        "prospectsClosedAsDuplicate" = ${totals.prospectsClosedAsDuplicate},
        "playerPoolProfilesJoined" = ${totals.playerPoolProfilesJoined},
        "requestsJoined" = ${totals.requestsJoined},
        "requestsClosed" = ${totals.requestsClosed},
        "leadsClosed" = ${totals.leadsClosed},
        "completedAt" = NOW(),
        "error" = NULL
      WHERE "id" = ${runId}
    `);

    return {
      runId,
      runKey,
      source: input.source,
      alreadyRun: false,
      scannedUsers: new Set(issues.flatMap(m => m.candidates.map(c => c.userId))).size,
      ...totals,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await prisma.$executeRaw(Prisma.sql`
      UPDATE "PlayerDataHealthRun"
      SET "status" = 'FAILED', "completedAt" = NOW(), "error" = ${message}
      WHERE "id" = ${runId}
    `);
    throw error;
  }
}

export async function reconcilePlayerRecruitmentStateForUser(userId: string) {
  const matches = await getPlayerRecruitmentMatches();
  const totals = emptyHealthChanges();
  for (const match of matches.filter(m => m.safe && m.candidates[0].userId === userId)) {
    const result = await reconcileRecruitmentMatch({ match, runId: `membership:${userId}:${randomUUID()}` });
    totals.changed ||= result.changed;
    for (const key of ["prospectsActivated", "prospectsClosedAsDuplicate", "playerPoolProfilesJoined", "requestsJoined", "requestsClosed", "leadsClosed"] as const) totals[key] += result[key];
  }
  return totals;
}
