// ========================================
// File: src/lib/admin/squadLoginStatus.ts
// ========================================

import { prisma } from "@/lib/prisma";

export type SquadLoginStatus = {
  membershipId: string;
  userId: string;
  email: string | null;
  hasLoggedIn: boolean;
  hasActiveSession: boolean;
  activeSessionCount: number;
  lastLoginAt: string | null;
  latestSessionExpires: string | null;
};

type LoginStatusRow = {
  membershipId: string;
  userId: string;
  email: string | null;
  lastLoginAt: Date | null;
  activeSessionCount: number;
  latestSessionExpires: Date | null;
};

type ColumnExistsRow = {
  exists: boolean;
};

async function hasLastLoginAtColumn() {
  try {
    const rows = await prisma.$queryRaw<ColumnExistsRow[]>`
      SELECT EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'User'
          AND column_name = 'lastLoginAt'
      ) AS "exists"
    `;

    return Boolean(rows[0]?.exists);
  } catch {
    return false;
  }
}

async function getLoginStatusRowsWithLastLogin(teamId: string) {
  return prisma.$queryRaw<LoginStatusRow[]>`
    SELECT
      tm."id" AS "membershipId",
      u."id" AS "userId",
      u."email" AS "email",
      u."lastLoginAt" AS "lastLoginAt",
      COUNT(s."id")::int AS "activeSessionCount",
      MAX(s."expires") AS "latestSessionExpires"
    FROM "TeamMember" tm
    INNER JOIN "User" u ON u."id" = tm."userId"
    LEFT JOIN "Session" s ON s."userId" = u."id" AND s."expires" > NOW()
    WHERE tm."teamId" = ${teamId}
    GROUP BY tm."id", u."id", u."email", u."lastLoginAt"
  `;
}

async function getLoginStatusRowsWithoutLastLogin(teamId: string) {
  return prisma.$queryRaw<LoginStatusRow[]>`
    SELECT
      tm."id" AS "membershipId",
      u."id" AS "userId",
      u."email" AS "email",
      NULL::timestamp AS "lastLoginAt",
      COUNT(s."id")::int AS "activeSessionCount",
      MAX(s."expires") AS "latestSessionExpires"
    FROM "TeamMember" tm
    INNER JOIN "User" u ON u."id" = tm."userId"
    LEFT JOIN "Session" s ON s."userId" = u."id" AND s."expires" > NOW()
    WHERE tm."teamId" = ${teamId}
    GROUP BY tm."id", u."id", u."email"
  `;
}

async function getLoginStatusRows(teamId: string) {
  const canReadLastLogin = await hasLastLoginAtColumn();

  if (canReadLastLogin) {
    return getLoginStatusRowsWithLastLogin(teamId);
  }

  return getLoginStatusRowsWithoutLastLogin(teamId);
}

export async function getSquadLoginStatuses(teamId: string): Promise<SquadLoginStatus[]> {
  if (!teamId.trim()) return [];

  const rows = await getLoginStatusRows(teamId);

  return rows.map((row) => ({
    membershipId: row.membershipId,
    userId: row.userId,
    email: row.email,
    hasLoggedIn: Boolean(row.lastLoginAt),
    hasActiveSession: Number(row.activeSessionCount) > 0,
    activeSessionCount: Number(row.activeSessionCount) || 0,
    lastLoginAt: row.lastLoginAt?.toISOString() ?? null,
    latestSessionExpires: row.latestSessionExpires?.toISOString() ?? null,
  }));
}

export async function getSquadLoginStatusMap(teamId: string) {
  const statuses = await getSquadLoginStatuses(teamId);
  return new Map(statuses.map((status) => [status.membershipId, status]));
}
