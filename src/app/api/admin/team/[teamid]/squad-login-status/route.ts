// ========================================
// File: src/app/api/admin/team/[teamid]/squad-login-status/route.ts
// ========================================

import { NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/requireAdmin";

export const dynamic = "force-dynamic";

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

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ teamid: string }> },
) {
  await requireAdmin();

  const { teamid } = await params;

  if (!teamid?.trim()) {
    return NextResponse.json({ items: [] });
  }

  const rows = await getLoginStatusRows(teamid);

  return NextResponse.json({
    items: rows.map((row) => ({
      membershipId: row.membershipId,
      userId: row.userId,
      email: row.email,
      hasLoggedIn: Boolean(row.lastLoginAt),
      hasActiveSession: Number(row.activeSessionCount) > 0,
      activeSessionCount: Number(row.activeSessionCount) || 0,
      lastLoginAt: row.lastLoginAt?.toISOString() ?? null,
      latestSessionExpires: row.latestSessionExpires?.toISOString() ?? null,
    })),
  });
}
