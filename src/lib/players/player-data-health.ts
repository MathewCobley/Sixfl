import { randomUUID } from "node:crypto";

import { Prisma } from "@prisma/client";

import { ensurePlayerPoolTables } from "@/lib/player-pool/storage";
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

type ProspectRow = {
  id: string;
  teamId: string | null;
  status: string;
};

type RequestRow = {
  id: string;
  teamId: string;
  status: string;
};

type CountRow = { count: number | bigint };

function asNumber(value: number | bigint | null | undefined) {
  return typeof value === "bigint" ? Number(value) : Number(value ?? 0);
}

function normaliseEmail(value: string | null | undefined) {
  return value?.trim().toLowerCase() || "";
}

async function ensurePlayerDataHealthRunTable() {
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

export async function getPlayerDataHealthIssues(): Promise<PlayerDataHealthIssue[]> {
  await ensurePlayerPoolTables();

  const rows = await prisma.$queryRaw<
    Array<
      Omit<
        PlayerDataHealthIssue,
        "prospectCount" | "playerPoolCount" | "requestCount" | "leadCount"
      > & {
        prospectCount: number | bigint;
        playerPoolCount: number | bigint;
        requestCount: number | bigint;
        leadCount: number | bigint;
      }
    >
  >(Prisma.sql`
    WITH active_people AS (
      SELECT
        u."id" AS "userId",
        u."name",
        u."email",
        LOWER(TRIM(u."email")) AS "emailNormalized",
        ARRAY_AGG(DISTINCT member."teamId") AS "teamIds",
        STRING_AGG(DISTINCT team."name", ', ' ORDER BY team."name") AS "teamNames"
      FROM "User" u
      JOIN "TeamMember" member ON member."userId" = u."id"
      JOIN "Team" team ON team."id" = member."teamId"
      WHERE u."email" IS NOT NULL
        AND TRIM(u."email") <> ''
      GROUP BY u."id", u."name", u."email"
    )
    SELECT
      person."userId",
      person."name",
      person."email",
      person."emailNormalized",
      person."teamIds",
      person."teamNames",
      (
        SELECT COUNT(*)::int
        FROM "TeamPlayerProspect" prospect
        WHERE prospect."email" IS NOT NULL
          AND LOWER(TRIM(prospect."email")) = person."emailNormalized"
          AND (
            prospect."status" NOT IN ('DECLINED', 'DUPLICATE', 'ACTIVE_SQUAD')
            OR (
              prospect."status" = 'ACTIVE_SQUAD'
              AND (
                prospect."teamId" IS NULL
                OR NOT (prospect."teamId" = ANY(person."teamIds"))
              )
            )
          )
      ) AS "prospectCount",
      (
        SELECT COUNT(*)::int
        FROM "PlayerPoolProfile" profile
        WHERE LOWER(TRIM(profile."emailNormalized")) = person."emailNormalized"
          AND profile."status" <> 'JOINED'
      ) AS "playerPoolCount",
      (
        SELECT COUNT(*)::int
        FROM "PlayerPoolIntroductionRequest" request
        JOIN "PlayerPoolProfile" profile ON profile."id" = request."profileId"
        WHERE LOWER(TRIM(profile."emailNormalized")) = person."emailNormalized"
          AND request."status" IN ('REQUESTED', 'INTRODUCED')
      ) AS "requestCount",
      (
        SELECT COUNT(*)::int
        FROM "InterestLead" lead
        WHERE lead."interestType" = 'PLAYER'::"InterestType"
          AND lead."email" IS NOT NULL
          AND LOWER(TRIM(lead."email")) = person."emailNormalized"
          AND lead."status" <> 'CLOSED'::"LeadStatus"
      ) AS "leadCount"
    FROM active_people person
    WHERE
      EXISTS (
        SELECT 1
        FROM "TeamPlayerProspect" prospect
        WHERE prospect."email" IS NOT NULL
          AND LOWER(TRIM(prospect."email")) = person."emailNormalized"
          AND (
            prospect."status" NOT IN ('DECLINED', 'DUPLICATE', 'ACTIVE_SQUAD')
            OR (
              prospect."status" = 'ACTIVE_SQUAD'
              AND (
                prospect."teamId" IS NULL
                OR NOT (prospect."teamId" = ANY(person."teamIds"))
              )
            )
          )
      )
      OR EXISTS (
        SELECT 1
        FROM "PlayerPoolProfile" profile
        WHERE LOWER(TRIM(profile."emailNormalized")) = person."emailNormalized"
          AND profile."status" <> 'JOINED'
      )
      OR EXISTS (
        SELECT 1
        FROM "PlayerPoolIntroductionRequest" request
        JOIN "PlayerPoolProfile" profile ON profile."id" = request."profileId"
        WHERE LOWER(TRIM(profile."emailNormalized")) = person."emailNormalized"
          AND request."status" IN ('REQUESTED', 'INTRODUCED')
      )
      OR EXISTS (
        SELECT 1
        FROM "InterestLead" lead
        WHERE lead."interestType" = 'PLAYER'::"InterestType"
          AND lead."email" IS NOT NULL
          AND LOWER(TRIM(lead."email")) = person."emailNormalized"
          AND lead."status" <> 'CLOSED'::"LeadStatus"
      )
    ORDER BY person."teamNames" ASC, person."name" ASC NULLS LAST, person."email" ASC
  `);

  return rows.map((row) => ({
    ...row,
    teamIds: Array.isArray(row.teamIds) ? row.teamIds : [],
    prospectCount: asNumber(row.prospectCount),
    playerPoolCount: asNumber(row.playerPoolCount),
    requestCount: asNumber(row.requestCount),
    leadCount: asNumber(row.leadCount),
  }));
}

async function reconcileActivePlayer(issue: PlayerDataHealthIssue) {
  const email = normaliseEmail(issue.email);
  if (!email || issue.teamIds.length === 0) {
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

  const prospects = await prisma.$queryRaw<ProspectRow[]>(Prisma.sql`
    SELECT "id", "teamId", "status"::text AS "status"
    FROM "TeamPlayerProspect"
    WHERE "email" IS NOT NULL
      AND LOWER(TRIM("email")) = ${email}
  `);

  let prospectsActivated = 0;
  let prospectsClosedAsDuplicate = 0;
  const teamIds = new Set(issue.teamIds);

  for (const prospect of prospects) {
    if (prospect.teamId && teamIds.has(prospect.teamId)) {
      if (prospect.status !== "ACTIVE_SQUAD") {
        await prisma.$executeRaw(Prisma.sql`
          UPDATE "TeamPlayerProspect"
          SET
            "status" = 'ACTIVE_SQUAD',
            "notes" = CASE
              WHEN COALESCE(TRIM("notes"), '') = ''
                THEN 'Player data health: linked email is already an active SIXFL squad member.'
              WHEN "notes" NOT ILIKE '%Player data health:%'
                THEN "notes" || E'\nPlayer data health: linked email is already an active SIXFL squad member.'
              ELSE "notes"
            END,
            "updatedAt" = NOW()
          WHERE "id" = ${prospect.id}
        `);
        prospectsActivated += 1;
      }
      continue;
    }

    if (prospect.status !== "DECLINED" && prospect.status !== "DUPLICATE") {
      await prisma.$executeRaw(Prisma.sql`
        UPDATE "TeamPlayerProspect"
        SET
          "status" = 'DUPLICATE',
          "notes" = CASE
            WHEN COALESCE(TRIM("notes"), '') = ''
              THEN 'Player data health: closed because this email already belongs to an active SIXFL squad account.'
            WHEN "notes" NOT ILIKE '%Player data health:%'
              THEN "notes" || E'\nPlayer data health: closed because this email already belongs to an active SIXFL squad account.'
            ELSE "notes"
          END,
          "updatedAt" = NOW()
        WHERE "id" = ${prospect.id}
      `);
      prospectsClosedAsDuplicate += 1;
    }
  }

  const playerPoolProfilesJoined = await prisma.$executeRaw(Prisma.sql`
    UPDATE "PlayerPoolProfile"
    SET "status" = 'JOINED', "updatedAt" = NOW()
    WHERE LOWER(TRIM("emailNormalized")) = ${email}
      AND "status" <> 'JOINED'
  `);

  const requestRows = await prisma.$queryRaw<RequestRow[]>(Prisma.sql`
    SELECT request."id", request."teamId", request."status"
    FROM "PlayerPoolIntroductionRequest" request
    JOIN "PlayerPoolProfile" profile ON profile."id" = request."profileId"
    WHERE LOWER(TRIM(profile."emailNormalized")) = ${email}
      AND request."status" IN ('REQUESTED', 'INTRODUCED')
  `);

  let requestsJoined = 0;
  let requestsClosed = 0;
  for (const request of requestRows) {
    const status = teamIds.has(request.teamId) ? "JOINED" : "CLOSED";
    await prisma.$executeRaw(Prisma.sql`
      UPDATE "PlayerPoolIntroductionRequest"
      SET
        "status" = ${status},
        "resolvedAt" = COALESCE("resolvedAt", NOW()),
        "updatedAt" = NOW()
      WHERE "id" = ${request.id}
    `);
    if (status === "JOINED") requestsJoined += 1;
    else requestsClosed += 1;
  }

  const leadsClosed = await prisma.$executeRaw(Prisma.sql`
    UPDATE "InterestLead"
    SET
      "status" = 'CLOSED'::"LeadStatus",
      "closedAt" = COALESCE("closedAt", NOW()),
      "updatedAt" = NOW()
    WHERE "interestType" = 'PLAYER'::"InterestType"
      AND "email" IS NOT NULL
      AND LOWER(TRIM("email")) = ${email}
      AND "status" <> 'CLOSED'::"LeadStatus"
  `);

  const changed =
    prospectsActivated +
      prospectsClosedAsDuplicate +
      playerPoolProfilesJoined +
      requestsJoined +
      requestsClosed +
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
  return `monthly:${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
}

export async function runPlayerDataHealthCleanup(input: {
  source: "MANUAL" | "MONTHLY";
  force?: boolean;
}): Promise<PlayerDataHealthSummary> {
  await ensurePlayerPoolTables();
  await ensurePlayerDataHealthRunTable();

  const runKey =
    input.source === "MONTHLY" && !input.force
      ? currentMonthRunKey()
      : `${input.source.toLowerCase()}:${new Date().toISOString()}:${randomUUID()}`;

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
    INSERT INTO "PlayerDataHealthRun" (
      "id", "runKey", "source", "status", "startedAt"
    ) VALUES (
      ${runId}, ${runKey}, ${input.source}, 'STARTED', NOW()
    )
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
      const result = await reconcileActivePlayer(issue);
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
