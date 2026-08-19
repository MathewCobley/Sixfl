// ========================================
// File: src/lib/managed-squad/squadStatus.ts
// ========================================

import {
  FixtureStatus,
  NotificationDispatchStatus,
  Prisma,
} from "@prisma/client";

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

const PLAYER_MATCH_FEE_NOTIFICATION_SOURCE_TYPES = [
  "PLAYER_MATCH_FEE_REQUEST",
  "PLAYER_MATCH_FEE_CHASE_24H",
  "PLAYER_MATCH_FEE_CHASE_72H",
];

const FIXTURE_SELECTION_NOTIFICATION_SOURCE_TYPES = [
  "FIXTURE_SELECTION_SELECTED",
  "FIXTURE_SELECTION_MATCHDAY_REMINDER",
];

const FUTURE_FIXTURE_STATUSES = [
  FixtureStatus.SCHEDULED,
  FixtureStatus.POSTPONED,
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

async function clearFutureActivityForInactivePlayer(input: {
  membershipId: string;
  teamId: string;
  db: DbClient;
}) {
  const [futureFees, futureSelections] = await Promise.all([
    input.db.playerMatchFee.findMany({
      where: {
        teamMemberId: input.membershipId,
        teamId: input.teamId,
        status: "OPEN",
        fixture: {
          status: { in: FUTURE_FIXTURE_STATUSES },
        },
      },
      select: {
        id: true,
        note: true,
      },
    }),
    input.db.fixtureSelection.findMany({
      where: {
        teamMemberId: input.membershipId,
        fixture: {
          status: { in: FUTURE_FIXTURE_STATUSES },
        },
      },
      select: {
        fixtureId: true,
      },
    }),
  ]);

  for (const fee of futureFees) {
    await input.db.playerMatchFee.update({
      where: { id: fee.id },
      data: {
        status: "CANCELLED",
        cancelledAt: new Date(),
        paymentUrl: null,
        paymentToken: null,
        note: [
          fee.note,
          "Cancelled automatically because this historic/former player was marked inactive before the fixture.",
        ]
          .filter(Boolean)
          .join("\n"),
      },
    });
  }

  if (futureSelections.length > 0) {
    await input.db.fixtureSelection.updateMany({
      where: {
        teamMemberId: input.membershipId,
        fixture: {
          status: { in: FUTURE_FIXTURE_STATUSES },
        },
      },
      data: {
        selectionStatus: "NOT_SELECTED",
        isCaptain: false,
        isGoalkeeper: false,
        note: "Removed from future selection because player was marked inactive.",
      },
    });
  }

  const feeIds = futureFees.map((fee) => fee.id);
  if (feeIds.length > 0) {
    await input.db.notificationDispatch.updateMany({
      where: {
        sourceType: { in: PLAYER_MATCH_FEE_NOTIFICATION_SOURCE_TYPES },
        sourceId: { in: feeIds },
        status: {
          in: [NotificationDispatchStatus.QUEUED, NotificationDispatchStatus.PROCESSING],
        },
      },
      data: {
        status: NotificationDispatchStatus.CANCELLED,
        cancelledAt: new Date(),
        failureReason: "Player was marked inactive before the fixture; future player-fee request cancelled.",
      },
    });
  }

  const selectionSourceIds = futureSelections.flatMap((selection) => [
    `${selection.fixtureId}:${input.membershipId}:selected`,
    `${selection.fixtureId}:${input.membershipId}:matchday-reminder`,
  ]);

  if (selectionSourceIds.length > 0) {
    await input.db.notificationDispatch.updateMany({
      where: {
        sourceType: { in: FIXTURE_SELECTION_NOTIFICATION_SOURCE_TYPES },
        sourceId: { in: selectionSourceIds },
        status: {
          in: [NotificationDispatchStatus.QUEUED, NotificationDispatchStatus.PROCESSING],
        },
      },
      data: {
        status: NotificationDispatchStatus.CANCELLED,
        cancelledAt: new Date(),
        failureReason: "Player was marked inactive; future fixture-selection message cancelled.",
      },
    });
  }
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
    await Promise.all([
      cancelQueuedAvailabilityChasesForUnavailablePlayer({
        membershipId: input.membershipId,
        db,
        reason: "Player marked inactive; future availability chase cancelled.",
      }),
      clearFutureActivityForInactivePlayer({
        membershipId: input.membershipId,
        teamId: input.teamId,
        db,
      }),
    ]);
  }

  return didUpdate;
}
