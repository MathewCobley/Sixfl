import { randomUUID } from "node:crypto";

import { Prisma } from "@prisma/client";

import {
  getPlayerDataHealthIssues,
  type PlayerDataHealthIssue,
  type PlayerDataHealthSummary,
} from "@/lib/players/player-data-health";
import { recordPlayerDataHealthChange } from "@/lib/players/player-data-health-audit";
import {
  normalisePlayerIdentityName,
  playerNamesMatch,
} from "@/lib/players/player-identity-safety";
import { prisma } from "@/lib/prisma";

type ProspectRow = {
  id: string;
  teamId: string | null;
  teamName: string | null;
  firstName: string;
  lastName: string | null;
  status: string;
};

type PlayerPoolRow = {
  id: string;
  publicCode: string;
  status: string;
};

type RequestRow = {
  id: string;
  teamId: string;
  teamName: string | null;
  status: string;
  prospectId: string;
};

type LeadRow = {
  id: string;
  contactName: string | null;
  status: string;
};

type SourceProspectRow = { sourceProspectId: string };

function normaliseEmail(value: string | null | undefined) {
  return value?.trim().toLowerCase() || "";
}

function prospectName(row: ProspectRow) {
  return [row.firstName, row.lastName].filter(Boolean).join(" ").trim();
}

async function ensureRunTable() {
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
}

function emptyResult() {
  return {
    changed: false,
    prospectsActivated: 0,
    prospectsClosedAsDuplicate: 0,
    playerPoolProfilesJoined: 0,
    requestsJoined: 0,
    requestsClosed: 0,
    leadsClosed: 0,
  };
}

async function logChange(input: {
  runId: string;
  issue: PlayerDataHealthIssue;
  recordType: string;
  recordId: string;
  recordLabel: string;
  previousStatus: string;
  newStatus: string;
  reason: string;
}) {
  await recordPlayerDataHealthChange({
    runId: input.runId,
    userId: input.issue.userId,
    playerName: input.issue.name,
    email: input.issue.email,
    teamNames: input.issue.teamNames,
    recordType: input.recordType,
    recordId: input.recordId,
    recordLabel: input.recordLabel,
    previousStatus: input.previousStatus,
    newStatus: input.newStatus,
    reason: input.reason,
  });
}

async function reconcileIssue(issue: PlayerDataHealthIssue, runId: string) {
  const email = normaliseEmail(issue.email);
  if (!email || issue.teamIds.length === 0) return emptyResult();

  const [prospects, sourceProspectRows] = await Promise.all([
    prisma.$queryRaw<ProspectRow[]>(Prisma.sql`
      SELECT
        prospect."id",
        prospect."teamId",
        team."name" AS "teamName",
        prospect."firstName",
        prospect."lastName",
        prospect."status"::text AS "status"
      FROM "TeamPlayerProspect" prospect
      LEFT JOIN "Team" team ON team."id" = prospect."teamId"
      WHERE prospect."email" IS NOT NULL
        AND LOWER(TRIM(prospect."email")) = ${email}
    `),
    prisma.$queryRaw<SourceProspectRow[]>(Prisma.sql`
      SELECT DISTINCT profile."sourceProspectId"
      FROM "TeamMember" member
      JOIN "TeamMemberProfile" profile ON profile."teamMemberId" = member."id"
      WHERE member."userId" = ${issue.userId}
        AND profile."sourceProspectId" IS NOT NULL
    `),
  ]);

  const exactProspectLinks = new Set(
    sourceProspectRows.map((row) => row.sourceProspectId),
  );
  const teamIds = new Set(issue.teamIds);
  const safeProspectIds = new Set<string>();
  let prospectsActivated = 0;
  let prospectsClosedAsDuplicate = 0;

  for (const prospect of prospects) {
    const exactLink = exactProspectLinks.has(prospect.id);
    const nameMatch = playerNamesMatch(issue.name, prospectName(prospect));
    const identitySafe = exactLink || nameMatch;
    if (!identitySafe) continue;

    safeProspectIds.add(prospect.id);

    if (prospect.teamId && teamIds.has(prospect.teamId)) {
      if (prospect.status !== "ACTIVE_SQUAD") {
        const reason = "Verified player is already an active member of this squad.";
        await prisma.$executeRaw(Prisma.sql`
          UPDATE "TeamPlayerProspect"
          SET
            "status" = 'ACTIVE_SQUAD',
            "notes" = CASE
              WHEN COALESCE(TRIM("notes"), '') = ''
                THEN 'Player data health: this player is already an active member of this squad.'
              WHEN "notes" NOT ILIKE '%Player data health:%'
                THEN "notes" || E'\nPlayer data health: this player is already an active member of this squad.'
              ELSE "notes"
            END,
            "updatedAt" = NOW()
          WHERE "id" = ${prospect.id}
        `);
        await logChange({
          runId,
          issue,
          recordType: "PROSPECT",
          recordId: prospect.id,
          recordLabel: `Prospect · ${prospect.teamName ?? "current team"}`,
          previousStatus: prospect.status,
          newStatus: "ACTIVE_SQUAD",
          reason,
        });
        prospectsActivated += 1;
      }
      continue;
    }

    // An unassigned recruitment record is stale once the same verified person
    // is already in a squad. A prospect deliberately assigned to another team is
    // left alone because SIXFL permits legitimate multi-team participation.
    if (
      prospect.teamId === null &&
      prospect.status !== "DECLINED" &&
      prospect.status !== "DUPLICATE"
    ) {
      const reason = "Verified player is already in a SIXFL squad, so this unassigned recruitment copy is no longer live.";
      await prisma.$executeRaw(Prisma.sql`
        UPDATE "TeamPlayerProspect"
        SET
          "status" = 'DUPLICATE',
          "notes" = CASE
            WHEN COALESCE(TRIM("notes"), '') = ''
              THEN 'Player data health: unassigned recruitment record closed because this verified player is already in a SIXFL squad.'
            WHEN "notes" NOT ILIKE '%Player data health:%'
              THEN "notes" || E'\nPlayer data health: unassigned recruitment record closed because this verified player is already in a SIXFL squad.'
            ELSE "notes"
          END,
          "updatedAt" = NOW()
        WHERE "id" = ${prospect.id}
      `);
      await logChange({
        runId,
        issue,
        recordType: "PROSPECT",
        recordId: prospect.id,
        recordLabel: "Unassigned prospect",
        previousStatus: prospect.status,
        newStatus: "DUPLICATE",
        reason,
      });
      prospectsClosedAsDuplicate += 1;
    }
  }

  const safeIds = Array.from(safeProspectIds);
  let playerPoolProfilesJoined = 0;
  let requestsJoined = 0;
  const requestsClosed = 0;

  if (safeIds.length > 0) {
    const profiles = await prisma.$queryRaw<PlayerPoolRow[]>(Prisma.sql`
      SELECT "id", "publicCode", "status"::text AS "status"
      FROM "PlayerPoolProfile"
      WHERE "prospectId" IN (${Prisma.join(safeIds)})
        AND "status" <> 'JOINED'
    `);

    for (const profile of profiles) {
      await prisma.$executeRaw(Prisma.sql`
        UPDATE "PlayerPoolProfile"
        SET "status" = 'JOINED', "updatedAt" = NOW()
        WHERE "id" = ${profile.id}
      `);
      await logChange({
        runId,
        issue,
        recordType: "PLAYER_POOL",
        recordId: profile.id,
        recordLabel: `PlayerPool ${profile.publicCode}`,
        previousStatus: profile.status,
        newStatus: "JOINED",
        reason: "The verified player is now in a squad, so this PlayerPool profile is fulfilled rather than still available.",
      });
      playerPoolProfilesJoined += 1;
    }

    const requests = await prisma.$queryRaw<RequestRow[]>(Prisma.sql`
      SELECT
        request."id",
        request."teamId",
        team."name" AS "teamName",
        request."status"::text AS "status",
        profile."prospectId"
      FROM "PlayerPoolIntroductionRequest" request
      JOIN "PlayerPoolProfile" profile ON profile."id" = request."profileId"
      LEFT JOIN "Team" team ON team."id" = request."teamId"
      WHERE profile."prospectId" IN (${Prisma.join(safeIds)})
        AND request."status" IN ('REQUESTED', 'INTRODUCED')
    `);

    for (const request of requests) {
      if (!teamIds.has(request.teamId)) continue;
      await prisma.$executeRaw(Prisma.sql`
        UPDATE "PlayerPoolIntroductionRequest"
        SET
          "status" = 'JOINED',
          "resolvedAt" = COALESCE("resolvedAt", NOW()),
          "updatedAt" = NOW()
        WHERE "id" = ${request.id}
      `);
      await logChange({
        runId,
        issue,
        recordType: "PLAYER_POOL_REQUEST",
        recordId: request.id,
        recordLabel: `Introduction · ${request.teamName ?? "joined team"}`,
        previousStatus: request.status,
        newStatus: "JOINED",
        reason: "The player is now a member of the team that requested the introduction.",
      });
      requestsJoined += 1;
    }
  }

  let leadsClosed = 0;
  if (normalisePlayerIdentityName(issue.name)) {
    const leads = await prisma.$queryRaw<LeadRow[]>(Prisma.sql`
      SELECT lead."id", lead."contactName", lead."status"::text AS "status"
      FROM "InterestLead" lead
      WHERE lead."interestType" = 'PLAYER'::"InterestType"
        AND lead."email" IS NOT NULL
        AND LOWER(TRIM(lead."email")) = ${email}
        AND lead."status" <> 'CLOSED'::"LeadStatus"
    `);

    for (const lead of leads) {
      if (!playerNamesMatch(issue.name, lead.contactName)) continue;
      await prisma.$executeRaw(Prisma.sql`
        UPDATE "InterestLead"
        SET
          "status" = 'CLOSED'::"LeadStatus",
          "closedAt" = COALESCE("closedAt", NOW()),
          "updatedAt" = NOW()
        WHERE "id" = ${lead.id}
      `);
      await logChange({
        runId,
        issue,
        recordType: "LEAD",
        recordId: lead.id,
        recordLabel: "Player lead",
        previousStatus: lead.status,
        newStatus: "CLOSED",
        reason: "This player lead has been fulfilled by an active squad membership.",
      });
      leadsClosed += 1;
    }
  }

  const changed =
    prospectsActivated +
      prospectsClosedAsDuplicate +
      playerPoolProfilesJoined +
      requestsJoined +
      leadsClosed >
    0;

  return {
    changed,
    prospectsActivated,
    prospectsClosedAsDuplicate,
    playerPoolProfilesJoined,
    requestsJoined,
    requestsClosed,
    leadsClosed,
  };
}

function currentMonthRunKey() {
  const now = new Date();
  return `monthly-safe:${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
}

export async function runSafePlayerDataHealthCleanup(input: {
  source: "MANUAL" | "MONTHLY";
  force?: boolean;
}): Promise<PlayerDataHealthSummary> {
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
    const issues = await getPlayerDataHealthIssues();
    const totals = {
      affectedUsers: 0,
      prospectsActivated: 0,
      prospectsClosedAsDuplicate: 0,
      playerPoolProfilesJoined: 0,
      requestsJoined: 0,
      requestsClosed: 0,
      leadsClosed: 0,
    };

    for (const issue of issues) {
      const result = await reconcileIssue(issue, runId);
      if (result.changed) totals.affectedUsers += 1;
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
        "scannedUsers" = ${issues.length},
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
      scannedUsers: issues.length,
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
  const issues = await getPlayerDataHealthIssues();
  const issue = issues.find((item) => item.userId === userId);
  if (!issue) return emptyResult();

  // Immediate membership reconciliation deliberately has no cleanup run record.
  // It uses a synthetic id so any changed recruitment rows remain traceable in
  // the itemised audit table without appearing as a monthly/manual run.
  return reconcileIssue(issue, `membership:${userId}`);
}
