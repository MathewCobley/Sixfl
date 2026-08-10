import { randomUUID } from "node:crypto";

import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";

export type PlayerDataHealthChange = {
  id: string;
  runId: string;
  userId: string | null;
  playerName: string | null;
  email: string | null;
  teamNames: string | null;
  recordType: string;
  recordId: string;
  recordLabel: string | null;
  previousStatus: string | null;
  newStatus: string | null;
  reason: string | null;
  reconstructed: boolean;
  createdAt: Date;
};

type RunWindow = {
  id: string;
  startedAt: Date;
  completedAt: Date | null;
};

async function ensurePlayerDataHealthChangeTable() {
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "PlayerDataHealthChange" (
      "id" TEXT NOT NULL,
      "runId" TEXT NOT NULL,
      "userId" TEXT,
      "playerName" TEXT,
      "email" TEXT,
      "teamNames" TEXT,
      "recordType" TEXT NOT NULL,
      "recordId" TEXT NOT NULL,
      "recordLabel" TEXT,
      "previousStatus" TEXT,
      "newStatus" TEXT,
      "reason" TEXT,
      "reconstructed" BOOLEAN NOT NULL DEFAULT false,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "PlayerDataHealthChange_pkey" PRIMARY KEY ("id")
    );
  `);
  await prisma.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS "PlayerDataHealthChange_runId_idx"
    ON "PlayerDataHealthChange"("runId", "createdAt");
  `);
  await prisma.$executeRawUnsafe(`
    CREATE UNIQUE INDEX IF NOT EXISTS "PlayerDataHealthChange_run_record_key"
    ON "PlayerDataHealthChange"("runId", "recordType", "recordId", "newStatus");
  `);
}

export async function recordPlayerDataHealthChange(input: {
  runId: string;
  userId?: string | null;
  playerName?: string | null;
  email?: string | null;
  teamNames?: string | null;
  recordType: string;
  recordId: string;
  recordLabel?: string | null;
  previousStatus?: string | null;
  newStatus?: string | null;
  reason?: string | null;
}) {
  await ensurePlayerDataHealthChangeTable();
  await prisma.$executeRaw(Prisma.sql`
    INSERT INTO "PlayerDataHealthChange" (
      "id", "runId", "userId", "playerName", "email", "teamNames",
      "recordType", "recordId", "recordLabel", "previousStatus", "newStatus",
      "reason", "reconstructed", "createdAt"
    ) VALUES (
      ${randomUUID()}, ${input.runId}, ${input.userId ?? null}, ${input.playerName ?? null},
      ${input.email ?? null}, ${input.teamNames ?? null}, ${input.recordType},
      ${input.recordId}, ${input.recordLabel ?? null}, ${input.previousStatus ?? null},
      ${input.newStatus ?? null}, ${input.reason ?? null}, false, NOW()
    )
    ON CONFLICT ("runId", "recordType", "recordId", "newStatus") DO NOTHING
  `);
}

async function getStoredChanges(runId: string) {
  await ensurePlayerDataHealthChangeTable();
  return prisma.$queryRaw<PlayerDataHealthChange[]>(Prisma.sql`
    SELECT *
    FROM "PlayerDataHealthChange"
    WHERE "runId" = ${runId}
    ORDER BY COALESCE("playerName", "email", "recordLabel", "recordId") ASC, "createdAt" ASC
  `);
}

async function reconstructLegacyRun(run: RunWindow): Promise<PlayerDataHealthChange[]> {
  const start = new Date(run.startedAt.getTime() - 120_000);
  const endBase = run.completedAt ?? new Date(run.startedAt.getTime() + 10 * 60_000);
  const end = new Date(endBase.getTime() + 120_000);

  const prospects = await prisma.$queryRaw<Array<{
    id: string;
    firstName: string;
    lastName: string | null;
    email: string | null;
    status: string;
    notes: string | null;
    updatedAt: Date;
    teamName: string | null;
    userId: string | null;
    userName: string | null;
    userTeams: string | null;
  }>>(Prisma.sql`
    SELECT
      prospect."id",
      prospect."firstName",
      prospect."lastName",
      prospect."email",
      prospect."status"::text AS "status",
      prospect."notes",
      prospect."updatedAt",
      team."name" AS "teamName",
      active_user."id" AS "userId",
      active_user."name" AS "userName",
      active_teams."teamNames" AS "userTeams"
    FROM "TeamPlayerProspect" prospect
    LEFT JOIN "Team" team ON team."id" = prospect."teamId"
    LEFT JOIN LATERAL (
      SELECT u."id", u."name"
      FROM "User" u
      WHERE prospect."email" IS NOT NULL
        AND u."email" IS NOT NULL
        AND LOWER(TRIM(u."email")) = LOWER(TRIM(prospect."email"))
      LIMIT 1
    ) active_user ON true
    LEFT JOIN LATERAL (
      SELECT STRING_AGG(DISTINCT t."name", ', ' ORDER BY t."name") AS "teamNames"
      FROM "TeamMember" tm
      JOIN "Team" t ON t."id" = tm."teamId"
      WHERE tm."userId" = active_user."id"
    ) active_teams ON true
    WHERE prospect."updatedAt" BETWEEN ${start} AND ${end}
      AND prospect."notes" ILIKE '%Player data health:%'
  `);

  const profiles = await prisma.$queryRaw<Array<{
    id: string;
    publicCode: string;
    emailNormalized: string;
    updatedAt: Date;
    prospectId: string;
    prospectName: string | null;
    userId: string | null;
    userName: string | null;
    userTeams: string | null;
  }>>(Prisma.sql`
    SELECT
      profile."id",
      profile."publicCode",
      profile."emailNormalized",
      profile."updatedAt",
      profile."prospectId",
      NULLIF(TRIM(CONCAT_WS(' ', prospect."firstName", prospect."lastName")), '') AS "prospectName",
      active_user."id" AS "userId",
      active_user."name" AS "userName",
      active_teams."teamNames" AS "userTeams"
    FROM "PlayerPoolProfile" profile
    LEFT JOIN "TeamPlayerProspect" prospect ON prospect."id" = profile."prospectId"
    LEFT JOIN LATERAL (
      SELECT u."id", u."name"
      FROM "User" u
      WHERE u."email" IS NOT NULL
        AND LOWER(TRIM(u."email")) = LOWER(TRIM(profile."emailNormalized"))
      LIMIT 1
    ) active_user ON true
    LEFT JOIN LATERAL (
      SELECT STRING_AGG(DISTINCT t."name", ', ' ORDER BY t."name") AS "teamNames"
      FROM "TeamMember" tm
      JOIN "Team" t ON t."id" = tm."teamId"
      WHERE tm."userId" = active_user."id"
    ) active_teams ON true
    WHERE profile."status" = 'JOINED'
      AND profile."updatedAt" BETWEEN ${start} AND ${end}
  `).catch(() => []);

  const leads = await prisma.$queryRaw<Array<{
    id: string;
    contactName: string | null;
    email: string | null;
    closedAt: Date | null;
    userId: string | null;
    userName: string | null;
    userTeams: string | null;
  }>>(Prisma.sql`
    SELECT
      lead."id",
      lead."contactName",
      lead."email",
      lead."closedAt",
      active_user."id" AS "userId",
      active_user."name" AS "userName",
      active_teams."teamNames" AS "userTeams"
    FROM "InterestLead" lead
    LEFT JOIN LATERAL (
      SELECT u."id", u."name"
      FROM "User" u
      WHERE lead."email" IS NOT NULL
        AND u."email" IS NOT NULL
        AND LOWER(TRIM(u."email")) = LOWER(TRIM(lead."email"))
      LIMIT 1
    ) active_user ON true
    LEFT JOIN LATERAL (
      SELECT STRING_AGG(DISTINCT t."name", ', ' ORDER BY t."name") AS "teamNames"
      FROM "TeamMember" tm
      JOIN "Team" t ON t."id" = tm."teamId"
      WHERE tm."userId" = active_user."id"
    ) active_teams ON true
    WHERE lead."interestType" = 'PLAYER'::"InterestType"
      AND lead."status" = 'CLOSED'::"LeadStatus"
      AND lead."closedAt" BETWEEN ${start} AND ${end}
  `).catch(() => []);

  const items: PlayerDataHealthChange[] = [];
  for (const prospect of prospects) {
    const name = prospect.userName || [prospect.firstName, prospect.lastName].filter(Boolean).join(" ").trim() || null;
    items.push({
      id: `reconstructed:prospect:${prospect.id}`,
      runId: run.id,
      userId: prospect.userId,
      playerName: name,
      email: prospect.email,
      teamNames: prospect.userTeams,
      recordType: "PROSPECT",
      recordId: prospect.id,
      recordLabel: prospect.teamName ? `Prospect · ${prospect.teamName}` : "Unassigned prospect",
      previousStatus: null,
      newStatus: prospect.status,
      reason: prospect.notes?.split("\n").find((line) => line.includes("Player data health:")) ?? "Matched from cleanup timestamp and audit note.",
      reconstructed: true,
      createdAt: prospect.updatedAt,
    });
  }

  for (const profile of profiles) {
    items.push({
      id: `reconstructed:playerpool:${profile.id}`,
      runId: run.id,
      userId: profile.userId,
      playerName: profile.userName || profile.prospectName,
      email: profile.emailNormalized,
      teamNames: profile.userTeams,
      recordType: "PLAYER_POOL",
      recordId: profile.id,
      recordLabel: `PlayerPool ${profile.publicCode}`,
      previousStatus: null,
      newStatus: "JOINED",
      reason: "Matched from PlayerPool status timestamp during this cleanup window.",
      reconstructed: true,
      createdAt: profile.updatedAt,
    });
  }

  for (const lead of leads) {
    items.push({
      id: `reconstructed:lead:${lead.id}`,
      runId: run.id,
      userId: lead.userId,
      playerName: lead.userName || lead.contactName,
      email: lead.email,
      teamNames: lead.userTeams,
      recordType: "LEAD",
      recordId: lead.id,
      recordLabel: "Player lead",
      previousStatus: null,
      newStatus: "CLOSED",
      reason: "Matched from lead closure timestamp during this cleanup window.",
      reconstructed: true,
      createdAt: lead.closedAt ?? run.startedAt,
    });
  }

  return items.sort((a, b) => {
    const left = (a.playerName || a.email || a.recordLabel || "").toLowerCase();
    const right = (b.playerName || b.email || b.recordLabel || "").toLowerCase();
    return left.localeCompare(right) || a.createdAt.getTime() - b.createdAt.getTime();
  });
}

export async function getPlayerDataHealthRunChanges(run: RunWindow) {
  const stored = await getStoredChanges(run.id);
  if (stored.length > 0) return stored;
  return reconstructLegacyRun(run);
}
