// ========================================
// File: src/lib/managed-squad/squadStatus.ts
// ========================================

import { NotificationDispatchStatus, Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";

type DbClient = typeof prisma | Prisma.TransactionClient;

export type TeamMemberSquadStatus = "ACTIVE" | "INJURED" | "INACTIVE";

export type TeamMemberSquadStatusRow = {
  id: string;
  squadStatus: TeamMemberSquadStatus;
  squadStatusUpdatedAt: Date | null;
  squadStatusNote: string | null;
};

const MANAGED_SQUAD_AVAILABILITY_SOURCE_TYPES = [
  "MANAGED_SQUAD_AVAILABILITY_REQUEST",
  "MANAGED_SQUAD_AVAILABILITY_CHASE_24H",
  "MANAGED_SQUAD_AVAILABILITY_CHASE_72H",
];

export async function ensureTeamMemberSquadStatusColumns(db: DbClient = prisma) {
  await db.$executeRaw(Prisma.sql`
    ALTER TABLE "TeamMember"
      ADD COLUMN IF NOT EXISTS "squadStatus" TEXT NOT NULL DEFAULT 'ACTIVE'
  `);

  await db.$executeRaw(Prisma.sql`
    ALTER TABLE "TeamMember"
      ADD COLUMN IF NOT EXISTS "squadStatusUpdatedAt" TIMESTAMP(3)
  `);

  await db.$executeRaw(Prisma.sql`
    ALTER TABLE "TeamMember"
      ADD COLUMN IF NOT EXISTS "squadStatusNote" TEXT
  `);

  await db.$executeRaw(Prisma.sql`
    CREATE INDEX IF NOT EXISTS "TeamMember_teamId_squadStatus_idx"
      ON "TeamMember"("teamId", "squadStatus")
  `);
}

async function cancelQueuedAvailabilityChasesForUnavailablePlayer(input: {
  membershipId: string;
  db: DbClient;
  reason: string;
}) {
  await input.db.notificationDispatch.updateMany({
    where: {
      sourceType: {
        in: MANAGED_SQUAD_AVAILABILITY_SOURCE_TYPES,
      },
      sourceId: {
        endsWith: `:${input.membershipId}`,
      },
      status: {
        in: [NotificationDispatchStatus.QUEUED, NotificationDispatchStatus.PROCESSING],
      },
    },
    data: {
      status: NotificationDispatchStatus.CANCELLED,
      cancelledAt: new Date(),
      failureReason: input.reason,
    },
  });
}

export async function getTeamMemberSquadStatusMap(teamId: string, db: DbClient = prisma) {
  await ensureTeamMemberSquadStatusColumns(db);

  const rows = await db.$queryRaw<TeamMemberSquadStatusRow[]>(Prisma.sql`
    SELECT
      "id",
      CASE
        WHEN "squadStatus" = 'INJURED' THEN 'INJURED'
        WHEN "squadStatus" = 'INACTIVE' THEN 'INACTIVE'
        ELSE 'ACTIVE'
      END AS "squadStatus",
      "squadStatusUpdatedAt",
      "squadStatusNote"
    FROM "TeamMember"
    WHERE "teamId" = ${teamId}
  `);

  return new Map(rows.map((row) => [row.id, row]));
}

export async function setTeamMemberSquadStatus(input: {
  teamId: string;
  membershipId: string;
  status: TeamMemberSquadStatus;
  note?: string | null;
  db?: DbClient;
}) {
  const db = input.db ?? prisma;
  await ensureTeamMemberSquadStatusColumns(db);

  const note = input.note?.trim() || null;

  const updated = await db.$executeRaw(Prisma.sql`
    UPDATE "TeamMember"
    SET
      "squadStatus" = ${input.status},
      "squadStatusUpdatedAt" = NOW(),
      "squadStatusNote" = ${note}
    WHERE "id" = ${input.membershipId}
      AND "teamId" = ${input.teamId}
  `);

  const didUpdate = Number(updated) > 0;

  if (didUpdate && input.status === "INJURED") {
    await cancelQueuedAvailabilityChasesForUnavailablePlayer({
      membershipId: input.membershipId,
      db,
      reason: "Player marked injured; future availability chase cancelled.",
    });
  }

  if (didUpdate && input.status === "INACTIVE") {
    await cancelQueuedAvailabilityChasesForUnavailablePlayer({
      membershipId: input.membershipId,
      db,
      reason: "Player marked inactive; future availability chase cancelled.",
    });
  }

  return didUpdate;
}
