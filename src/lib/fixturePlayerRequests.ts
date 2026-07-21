import { randomUUID } from "crypto";
import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";

export type FixturePlayerRequestType = "WITHDRAWAL" | "WAITLIST";
export type FixturePlayerRequestStatus = "OPEN" | "RESOLVED" | "CANCELLED";

export type FixturePlayerRequest = {
  id: string;
  fixtureId: string;
  teamId: string;
  teamMemberId: string;
  type: FixturePlayerRequestType;
  status: FixturePlayerRequestStatus;
  reason: string | null;
  createdAt: Date;
  updatedAt: Date;
};

export type FixturePlayerRequestWithDetails = FixturePlayerRequest & {
  playerName: string;
  playerEmail: string | null;
  kickoffAt: Date;
  homeTeamName: string;
  awayTeamName: string;
};

let tableReady: Promise<void> | null = null;

export function ensureFixturePlayerRequestTable() {
  if (!tableReady) {
    tableReady = (async () => {
      await prisma.$executeRawUnsafe(`
        CREATE TABLE IF NOT EXISTS "FixturePlayerRequest" (
          "id" TEXT NOT NULL,
          "fixtureId" TEXT NOT NULL,
          "teamId" TEXT NOT NULL,
          "teamMemberId" TEXT NOT NULL,
          "type" TEXT NOT NULL,
          "status" TEXT NOT NULL DEFAULT 'OPEN',
          "reason" TEXT,
          "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
          "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
          CONSTRAINT "FixturePlayerRequest_pkey" PRIMARY KEY ("id"),
          CONSTRAINT "FixturePlayerRequest_fixtureId_fkey" FOREIGN KEY ("fixtureId") REFERENCES "Fixture"("id") ON DELETE CASCADE ON UPDATE CASCADE,
          CONSTRAINT "FixturePlayerRequest_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE CASCADE ON UPDATE CASCADE,
          CONSTRAINT "FixturePlayerRequest_teamMemberId_fkey" FOREIGN KEY ("teamMemberId") REFERENCES "TeamMember"("id") ON DELETE CASCADE ON UPDATE CASCADE
        );
      `);
      await prisma.$executeRawUnsafe(`
        CREATE UNIQUE INDEX IF NOT EXISTS "FixturePlayerRequest_open_key"
        ON "FixturePlayerRequest"("fixtureId", "teamMemberId", "type")
        WHERE "status" = 'OPEN';
      `);
      await prisma.$executeRawUnsafe(`
        CREATE INDEX IF NOT EXISTS "FixturePlayerRequest_team_fixture_status_idx"
        ON "FixturePlayerRequest"("teamId", "fixtureId", "status");
      `);
    })().catch((error) => {
      tableReady = null;
      throw error;
    });
  }

  return tableReady;
}

export async function getOpenFixturePlayerRequests(input: {
  teamId: string;
  fixtureIds?: string[];
  teamMemberId?: string;
}) {
  await ensureFixturePlayerRequestTable();

  const fixtureFilter = input.fixtureIds?.length
    ? Prisma.sql`AND request."fixtureId" IN (${Prisma.join(input.fixtureIds)})`
    : Prisma.empty;
  const memberFilter = input.teamMemberId
    ? Prisma.sql`AND request."teamMemberId" = ${input.teamMemberId}`
    : Prisma.empty;

  return prisma.$queryRaw<FixturePlayerRequestWithDetails[]>(Prisma.sql`
    SELECT
      request."id",
      request."fixtureId",
      request."teamId",
      request."teamMemberId",
      request."type",
      request."status",
      request."reason",
      request."createdAt",
      request."updatedAt",
      COALESCE(member_user."name", member_user."email", 'Player') AS "playerName",
      member_user."email" AS "playerEmail",
      fixture."kickoffAt",
      home_team."name" AS "homeTeamName",
      away_team."name" AS "awayTeamName"
    FROM "FixturePlayerRequest" request
    INNER JOIN "TeamMember" member ON member."id" = request."teamMemberId"
    INNER JOIN "User" member_user ON member_user."id" = member."userId"
    INNER JOIN "Fixture" fixture ON fixture."id" = request."fixtureId"
    INNER JOIN "Team" home_team ON home_team."id" = fixture."homeTeamId"
    INNER JOIN "Team" away_team ON away_team."id" = fixture."awayTeamId"
    WHERE request."teamId" = ${input.teamId}
      AND request."status" = 'OPEN'
      ${fixtureFilter}
      ${memberFilter}
    ORDER BY request."createdAt" ASC
  `);
}

export async function upsertOpenFixturePlayerRequest(input: {
  fixtureId: string;
  teamId: string;
  teamMemberId: string;
  type: FixturePlayerRequestType;
  reason?: string | null;
}) {
  await ensureFixturePlayerRequestTable();

  const existing = await prisma.$queryRaw<FixturePlayerRequest[]>(Prisma.sql`
    SELECT *
    FROM "FixturePlayerRequest"
    WHERE "fixtureId" = ${input.fixtureId}
      AND "teamMemberId" = ${input.teamMemberId}
      AND "type" = ${input.type}
      AND "status" = 'OPEN'
    LIMIT 1
  `);

  if (existing[0]) {
    const updated = await prisma.$queryRaw<FixturePlayerRequest[]>(Prisma.sql`
      UPDATE "FixturePlayerRequest"
      SET "reason" = ${input.reason ?? null}, "updatedAt" = NOW()
      WHERE "id" = ${existing[0].id}
      RETURNING *
    `);
    return updated[0];
  }

  const created = await prisma.$queryRaw<FixturePlayerRequest[]>(Prisma.sql`
    INSERT INTO "FixturePlayerRequest" (
      "id", "fixtureId", "teamId", "teamMemberId", "type", "status", "reason"
    ) VALUES (
      ${randomUUID()}, ${input.fixtureId}, ${input.teamId}, ${input.teamMemberId}, ${input.type}, 'OPEN', ${input.reason ?? null}
    )
    RETURNING *
  `);

  return created[0];
}

export async function closeFixturePlayerRequest(input: {
  requestId?: string;
  fixtureId?: string;
  teamId: string;
  teamMemberId?: string;
  type?: FixturePlayerRequestType;
  status: Extract<FixturePlayerRequestStatus, "RESOLVED" | "CANCELLED">;
}) {
  await ensureFixturePlayerRequestTable();

  if (input.requestId) {
    await prisma.$executeRaw`
      UPDATE "FixturePlayerRequest"
      SET "status" = ${input.status}, "updatedAt" = NOW()
      WHERE "id" = ${input.requestId}
        AND "teamId" = ${input.teamId}
        AND "status" = 'OPEN'
    `;
    return;
  }

  if (!input.fixtureId || !input.teamMemberId || !input.type) return;

  await prisma.$executeRaw`
    UPDATE "FixturePlayerRequest"
    SET "status" = ${input.status}, "updatedAt" = NOW()
    WHERE "fixtureId" = ${input.fixtureId}
      AND "teamId" = ${input.teamId}
      AND "teamMemberId" = ${input.teamMemberId}
      AND "type" = ${input.type}
      AND "status" = 'OPEN'
  `;
}
