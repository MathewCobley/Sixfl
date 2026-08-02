import { Prisma } from "@prisma/client";

import { isTeamKitSize, type TeamKitSize } from "@/lib/kits/constants";
import { prisma } from "@/lib/prisma";

export type KitAssignmentStatus = "ASSIGNED" | "SENT" | "OPENED" | "COMPLETED";

export type KitAssignableMember = {
  id: string;
  userId: string;
  name: string;
  email: string | null;
  role: string;
};

export type KitPlayerAssignment = {
  id: string;
  teamId: string;
  teamMemberId: string;
  position: number;
  token: string;
  status: KitAssignmentStatus;
  backName: string | null;
  shirtNumber: number | null;
  kitSize: TeamKitSize | null;
  sentAt: Date | null;
  lastSentAt: Date | null;
  openedAt: Date | null;
  completedAt: Date | null;
  lastDispatchId: string | null;
  createdByUserId: string | null;
  createdAt: Date;
  updatedAt: Date;
  playerName: string;
  playerEmail: string | null;
  dispatchStatus: string | null;
  dispatchSentAt: Date | null;
  dispatchFailureReason: string | null;
};

type AssignmentDbRow = Omit<
  KitPlayerAssignment,
  "kitSize" | "dispatchStatus" | "dispatchSentAt" | "dispatchFailureReason"
> & {
  kitSize: string | null;
};

export type PublicKitAssignment = {
  id: string;
  teamId: string;
  teamName: string;
  teamMemberId: string;
  playerName: string;
  playerEmail: string | null;
  position: number;
  token: string;
  status: KitAssignmentStatus;
  backName: string | null;
  shirtNumber: number | null;
  kitSize: TeamKitSize | null;
  sentAt: Date | null;
  openedAt: Date | null;
  completedAt: Date | null;
  orderStatus: string | null;
};

function mapKitSize(value: string | null): TeamKitSize | null {
  return value && isTeamKitSize(value) ? value : null;
}

export async function listAssignableKitMembers(
  teamId: string,
): Promise<KitAssignableMember[]> {
  const members = await prisma.teamMember.findMany({
    where: { teamId },
    orderBy: [{ role: "asc" }, { createdAt: "asc" }],
    select: {
      id: true,
      userId: true,
      role: true,
      user: {
        select: {
          name: true,
          email: true,
        },
      },
    },
  });

  return members.map((member) => ({
    id: member.id,
    userId: member.userId,
    name: member.user.name?.trim() || member.user.email?.trim() || "Unnamed player",
    email: member.user.email?.trim() || null,
    role: member.role,
  }));
}

export async function listKitPlayerAssignments(
  teamId: string,
): Promise<KitPlayerAssignment[]> {
  const rows = await prisma.$queryRaw<AssignmentDbRow[]>(Prisma.sql`
    SELECT
      assignment."id",
      assignment."teamId",
      assignment."teamMemberId",
      assignment."position",
      assignment."token",
      assignment."status",
      assignment."backName",
      assignment."shirtNumber",
      assignment."kitSize",
      assignment."sentAt",
      assignment."lastSentAt",
      assignment."openedAt",
      assignment."completedAt",
      assignment."lastDispatchId",
      assignment."createdByUserId",
      assignment."createdAt",
      assignment."updatedAt",
      COALESCE(NULLIF(BTRIM(player_user."name"), ''), player_user."email", 'Unnamed player') AS "playerName",
      player_user."email" AS "playerEmail"
    FROM "TeamKitPlayerAssignment" assignment
    INNER JOIN "TeamMember" member ON member."id" = assignment."teamMemberId"
    INNER JOIN "User" player_user ON player_user."id" = member."userId"
    WHERE assignment."teamId" = ${teamId}
    ORDER BY assignment."position" ASC
  `);

  const dispatchIds = rows
    .map((row) => row.lastDispatchId)
    .filter((value): value is string => Boolean(value));
  const dispatches = dispatchIds.length
    ? await prisma.notificationDispatch.findMany({
        where: { id: { in: dispatchIds } },
        select: {
          id: true,
          status: true,
          sentAt: true,
          failureReason: true,
        },
      })
    : [];
  const dispatchById = new Map(dispatches.map((dispatch) => [dispatch.id, dispatch]));

  return rows.map((row) => {
    const dispatch = row.lastDispatchId
      ? dispatchById.get(row.lastDispatchId) ?? null
      : null;

    return {
      ...row,
      kitSize: mapKitSize(row.kitSize),
      dispatchStatus: dispatch?.status ?? null,
      dispatchSentAt: dispatch?.sentAt ?? null,
      dispatchFailureReason: dispatch?.failureReason ?? null,
    };
  });
}

export async function getPublicKitAssignment(
  token: string,
): Promise<PublicKitAssignment | null> {
  const rows = await prisma.$queryRaw<
    Array<Omit<PublicKitAssignment, "kitSize"> & { kitSize: string | null }>
  >(Prisma.sql`
    SELECT
      assignment."id",
      assignment."teamId",
      team."name" AS "teamName",
      assignment."teamMemberId",
      COALESCE(NULLIF(BTRIM(player_user."name"), ''), player_user."email", 'Player') AS "playerName",
      player_user."email" AS "playerEmail",
      assignment."position",
      assignment."token",
      assignment."status",
      assignment."backName",
      assignment."shirtNumber",
      assignment."kitSize",
      assignment."sentAt",
      assignment."openedAt",
      assignment."completedAt",
      kit_order."status" AS "orderStatus"
    FROM "TeamKitPlayerAssignment" assignment
    INNER JOIN "Team" team ON team."id" = assignment."teamId"
    INNER JOIN "TeamMember" member ON member."id" = assignment."teamMemberId"
    INNER JOIN "User" player_user ON player_user."id" = member."userId"
    LEFT JOIN "TeamKitOrder" kit_order ON kit_order."teamId" = assignment."teamId"
    WHERE assignment."token" = ${token}
    LIMIT 1
  `);

  const row = rows[0];
  return row ? { ...row, kitSize: mapKitSize(row.kitSize) } : null;
}

export async function markKitAssignmentOpened(token: string) {
  await prisma.$executeRaw(Prisma.sql`
    UPDATE "TeamKitPlayerAssignment"
    SET
      "status" = CASE WHEN "status" = 'COMPLETED' THEN "status" ELSE 'OPENED' END,
      "openedAt" = COALESCE("openedAt", NOW()),
      "updatedAt" = NOW()
    WHERE "token" = ${token}
  `);
}

function cleanBackName(value: string) {
  return value
    .toUpperCase()
    .replace(/\s+/g, " ")
    .replace(/[^A-Z0-9 '&.-]/g, "")
    .trim()
    .slice(0, 18);
}

export class KitAssignmentValidationError extends Error {
  constructor(
    public readonly code:
      | "not_found"
      | "order_locked"
      | "invalid_number"
      | "invalid_size"
      | "number_taken",
  ) {
    super(code);
  }
}

export async function completeKitPlayerAssignment(input: {
  token: string;
  backName: string;
  shirtNumber: number;
  kitSize: string;
}) {
  if (!Number.isInteger(input.shirtNumber) || input.shirtNumber < 1 || input.shirtNumber > 99) {
    throw new KitAssignmentValidationError("invalid_number");
  }
  if (!isTeamKitSize(input.kitSize)) {
    throw new KitAssignmentValidationError("invalid_size");
  }

  const assignment = await getPublicKitAssignment(input.token);
  if (!assignment) throw new KitAssignmentValidationError("not_found");
  if (assignment.orderStatus && assignment.orderStatus !== "DRAFT") {
    throw new KitAssignmentValidationError("order_locked");
  }

  const duplicateRows = await prisma.$queryRaw<Array<{ source: string }>>(Prisma.sql`
    SELECT 'assignment' AS source
    FROM "TeamKitPlayerAssignment"
    WHERE "teamId" = ${assignment.teamId}
      AND "position" <> ${assignment.position}
      AND "status" = 'COMPLETED'
      AND "shirtNumber" = ${input.shirtNumber}
    UNION ALL
    SELECT 'order' AS source
    FROM "TeamKitOrderItem" item
    INNER JOIN "TeamKitOrder" kit_order ON kit_order."id" = item."orderId"
    WHERE kit_order."teamId" = ${assignment.teamId}
      AND item."position" <> ${assignment.position}
      AND item."shirtNumber" = ${input.shirtNumber}
    LIMIT 1
  `);
  if (duplicateRows.length > 0) {
    throw new KitAssignmentValidationError("number_taken");
  }

  const backName = cleanBackName(input.backName) || null;

  await prisma.$transaction(async (tx) => {
    await tx.$executeRaw(Prisma.sql`
      UPDATE "TeamKitPlayerAssignment"
      SET
        "status" = 'COMPLETED',
        "backName" = ${backName},
        "shirtNumber" = ${input.shirtNumber},
        "kitSize" = ${input.kitSize},
        "openedAt" = COALESCE("openedAt", NOW()),
        "completedAt" = NOW(),
        "updatedAt" = NOW()
      WHERE "token" = ${input.token}
    `);

    await tx.$executeRaw(Prisma.sql`
      UPDATE "TeamKitOrderItem" item
      SET
        "backName" = ${backName},
        "shirtNumber" = ${input.shirtNumber},
        "kitSize" = ${input.kitSize}::"TeamKitSize",
        "updatedAt" = NOW()
      FROM "TeamKitOrder" kit_order
      WHERE item."orderId" = kit_order."id"
        AND kit_order."teamId" = ${assignment.teamId}
        AND kit_order."status" = 'DRAFT'
        AND item."position" = ${assignment.position}
    `);
  });

  return getPublicKitAssignment(input.token);
}
