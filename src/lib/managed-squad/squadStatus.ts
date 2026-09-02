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

/**
 * Compatibility entry point retained for callers that pre-date the real schema
 * migration. The TeamMember squad-status columns, constraint and index are now
 * owned by Prisma migrations; request handling must never run ALTER TABLE.
 */
export function ensureTeamMemberSquadStatusColumns(db: DbClient = prisma) {
  void db;
  return Promise.resolve();
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

async function runInactiveCleanupSafely(
  label: string,
  task: () => Promise<unknown>,
) {
  try {
    await task();
  } catch (error) {
    console.error(`Inactive squad cleanup failed: ${label}`, error);
  }
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

async function persistSquadStatus(input: {
  db: DbClient;
  teamId: string;
  membershipId: string;
  status: TeamMemberSquadStatus;
  note: string | null;
}) {
  const rows = await input.db.$queryRaw<Array<{ squadStatus: string }>>(Prisma.sql`
    UPDATE "TeamMember"
    SET
      "squadStatus" = ${input.status},
      "squadStatusUpdatedAt" = NOW(),
      "squadStatusNote" = ${input.note}
    WHERE "id" = ${input.membershipId}
      AND "teamId" = ${input.teamId}
    RETURNING "squadStatus"
  `);

  if (rows.length === 0) return false;

  if (rows[0]?.squadStatus !== input.status) {
    throw new Error(
      `Squad status persistence mismatch for ${input.membershipId}: expected ${input.status}, got ${rows[0]?.squadStatus ?? "missing"}.`,
    );
  }

  return true;
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

  const didUpdate = await persistSquadStatus({
    db,
    teamId: input.teamId,
    membershipId: input.membershipId,
    status: input.status,
    note,
  });

  if (!didUpdate) return false;

  if (input.status === "INJURED") {
    await cancelQueuedAvailabilityChasesForUnavailablePlayer({
      membershipId: input.membershipId,
      db,
      reason: "Player marked injured; future availability chase cancelled.",
    });
  }

  if (input.status === "INACTIVE") {
    await Promise.all([
      runInactiveCleanupSafely("availability chases", () =>
        cancelQueuedAvailabilityChasesForUnavailablePlayer({
          membershipId: input.membershipId,
          db,
          reason: "Player marked inactive; future availability chase cancelled.",
        }),
      ),
      runInactiveCleanupSafely("future squad activity", () =>
        clearFutureActivityForInactivePlayer({
          membershipId: input.membershipId,
          teamId: input.teamId,
          db,
        }),
      ),
    ]);

    // The status is the source of truth. Write it once more after all cleanup so
    // no cleanup-side effect, legacy trigger or overlapping request can leave a
    // former player looking ACTIVE again after the captain has saved INACTIVE.
    const stillInactive = await persistSquadStatus({
      db,
      teamId: input.teamId,
      membershipId: input.membershipId,
      status: "INACTIVE",
      note,
    });

    if (!stillInactive) {
      throw new Error(`Inactive squad member disappeared while saving ${input.membershipId}.`);
    }
  }

  const persistedRows = await db.$queryRaw<Array<{ squadStatus: string }>>(Prisma.sql`
    SELECT "squadStatus"
    FROM "TeamMember"
    WHERE "id" = ${input.membershipId}
      AND "teamId" = ${input.teamId}
    LIMIT 1
  `);
  const persistedStatus = persistedRows[0]?.squadStatus ?? null;

  if (persistedStatus !== input.status) {
    throw new Error(
      `Squad status did not remain saved for ${input.membershipId}: expected ${input.status}, got ${persistedStatus ?? "missing"}.`,
    );
  }

  return true;
}
