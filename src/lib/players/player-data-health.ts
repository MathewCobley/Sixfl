
import { Prisma } from "@prisma/client";

import { getPlayerRecruitmentMatches } from "./player-data-health-matches";
import { prisma } from "@/lib/prisma";

export type PlayerDataHealthIssue = {
  userId: string;
  name: string | null;
  email: string;
  emailNormalized: string;
  teamIds: string[];
  teamNames: string;
  prospectCount: number;
  playerPoolCount: number;
  requestCount: number;
  leadCount: number;
};

export type PlayerDataHealthSummary = {
  runId: string;
  runKey: string;
  source: "MANUAL" | "MONTHLY";
  alreadyRun: boolean;
  scannedUsers: number;
  affectedUsers: number;
  prospectsActivated: number;
  prospectsClosedAsDuplicate: number;
  playerPoolProfilesJoined: number;
  requestsJoined: number;
  requestsClosed: number;
  leadsClosed: number;
};

export type PlayerDataHealthRun = {
  id: string;
  runKey: string;
  source: string;
  status: string;
  scannedUsers: number;
  affectedUsers: number;
  prospectsActivated: number;
  prospectsClosedAsDuplicate: number;
  playerPoolProfilesJoined: number;
  requestsJoined: number;
  requestsClosed: number;
  leadsClosed: number;
  startedAt: Date;
  completedAt: Date | null;
  error: string | null;
};

function asNumber(value: number | bigint | null | undefined) {
  return typeof value === "bigint" ? Number(value) : Number(value ?? 0);
}

export async function ensurePlayerDataHealthRunTable() {
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "PlayerDataHealthRun" (
      "id" TEXT NOT NULL,
      "runKey" TEXT NOT NULL,
      "source" TEXT NOT NULL,
      "status" TEXT NOT NULL,
      "scannedUsers" INTEGER NOT NULL DEFAULT 0,
      "affectedUsers" INTEGER NOT NULL DEFAULT 0,
      "prospectsActivated" INTEGER NOT NULL DEFAULT 0,
      "prospectsClosedAsDuplicate" INTEGER NOT NULL DEFAULT 0,
      "playerPoolProfilesJoined" INTEGER NOT NULL DEFAULT 0,
      "requestsJoined" INTEGER NOT NULL DEFAULT 0,
      "requestsClosed" INTEGER NOT NULL DEFAULT 0,
      "leadsClosed" INTEGER NOT NULL DEFAULT 0,
      "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "completedAt" TIMESTAMP(3),
      "error" TEXT,
      CONSTRAINT "PlayerDataHealthRun_pkey" PRIMARY KEY ("id")
    );
  `);
  await prisma.$executeRawUnsafe(`
    CREATE UNIQUE INDEX IF NOT EXISTS "PlayerDataHealthRun_runKey_key"
    ON "PlayerDataHealthRun"("runKey");
  `);
  await prisma.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS "PlayerDataHealthRun_startedAt_idx"
    ON "PlayerDataHealthRun"("startedAt" DESC);
  `);
}

// Kept as a compatibility summary; the detailed UI and cleanup use the same matcher.
export async function getPlayerDataHealthIssues(): Promise<PlayerDataHealthIssue[]> {
  const matches = await getPlayerRecruitmentMatches();
  const issues = new Map<string, PlayerDataHealthIssue>();
  for (const match of matches) for (const candidate of match.candidates) {
    const issue = issues.get(candidate.userId) || { userId: candidate.userId, name: candidate.name,
      email: candidate.email || "", emailNormalized: candidate.email?.trim().toLowerCase() || "",
      teamIds: candidate.teams.map(t => t.id), teamNames: candidate.teams.map(t => t.name).join(", "),
      prospectCount: 0, playerPoolCount: 0, requestCount: 0, leadCount: 0 };
    if (match.record.kind === "LEAD") issue.leadCount++; else issue.prospectCount++;
    if (match.record.profileId) issue.playerPoolCount++;
    issue.requestCount += match.record.openRequestTeamIds?.length || 0;
    issues.set(candidate.userId, issue);
  }
  return [...issues.values()];
}

// No alternative email-only writer: all callers share the safe reconciliation path.
export async function runPlayerDataHealthCleanup(input: { source: "MANUAL" | "MONTHLY"; force?: boolean }) {
  const { runSafePlayerDataHealthCleanup } = await import("./player-data-health-safe");
  return runSafePlayerDataHealthCleanup(input);
}

export async function getPlayerDataHealthRuns(limit = 12): Promise<PlayerDataHealthRun[]> {
  await ensurePlayerDataHealthRunTable();
  const safeLimit = Math.max(1, Math.min(limit, 50));
  const rows = await prisma.$queryRaw<
    Array<
      Omit<
        PlayerDataHealthRun,
        | "scannedUsers"
        | "affectedUsers"
        | "prospectsActivated"
        | "prospectsClosedAsDuplicate"
        | "playerPoolProfilesJoined"
        | "requestsJoined"
        | "requestsClosed"
        | "leadsClosed"
      > & {
        scannedUsers: number | bigint;
        affectedUsers: number | bigint;
        prospectsActivated: number | bigint;
        prospectsClosedAsDuplicate: number | bigint;
        playerPoolProfilesJoined: number | bigint;
        requestsJoined: number | bigint;
        requestsClosed: number | bigint;
        leadsClosed: number | bigint;
      }
    >
  >(Prisma.sql`
    SELECT *
    FROM "PlayerDataHealthRun"
    ORDER BY "startedAt" DESC
    LIMIT ${safeLimit}
  `);

  return rows.map((row) => ({
    ...row,
    scannedUsers: asNumber(row.scannedUsers),
    affectedUsers: asNumber(row.affectedUsers),
    prospectsActivated: asNumber(row.prospectsActivated),
    prospectsClosedAsDuplicate: asNumber(row.prospectsClosedAsDuplicate),
    playerPoolProfilesJoined: asNumber(row.playerPoolProfilesJoined),
    requestsJoined: asNumber(row.requestsJoined),
    requestsClosed: asNumber(row.requestsClosed),
    leadsClosed: asNumber(row.leadsClosed),
  }));
}
