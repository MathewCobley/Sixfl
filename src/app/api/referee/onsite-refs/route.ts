// ========================================
// File: src/app/api/referee/onsite-refs/route.ts
// ========================================

import { NextResponse } from "next/server";
import { Prisma, UserRole } from "@prisma/client";

import { requireReferee } from "@/lib/admin";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

type OnsiteRefereeRow = {
  nightId: string;
  totalReferees: number | bigint;
  refereeNames: string[] | null;
};

function normaliseName(value: string | null | undefined) {
  return (value ?? "").replace(/\s+/g, " ").trim();
}

export async function GET() {
  const { user, authenticatedUser, isAdminPreview } = await requireReferee();

  if (authenticatedUser.role === UserRole.ADMIN && !isAdminPreview) {
    return NextResponse.json({ nights: [] });
  }

  const currentRefereeName = normaliseName(user.name) || normaliseName(user.email) || "You";

  const rows = await prisma.$queryRaw<OnsiteRefereeRow[]>(Prisma.sql`
    WITH my_nights AS (
      SELECT id, "leagueId", "venueId", "nightDate"
      FROM "RefereeNight"
      WHERE "refereeId" = ${user.id}
        AND status <> 'CANCELLED'
    )
    SELECT
      mn.id AS "nightId",
      COUNT(DISTINCT rn."refereeId")::int AS "totalReferees",
      ARRAY_AGG(
        DISTINCT COALESCE(NULLIF(u.name, ''), u.email)
        ORDER BY COALESCE(NULLIF(u.name, ''), u.email)
      ) AS "refereeNames"
    FROM my_nights mn
    JOIN "RefereeNight" rn
      ON rn."leagueId" = mn."leagueId"
      AND rn."nightDate" = mn."nightDate"
      AND rn."venueId" IS NOT DISTINCT FROM mn."venueId"
      AND rn.status <> 'CANCELLED'
    JOIN "User" u ON u.id = rn."refereeId"
    GROUP BY mn.id
  `);

  return NextResponse.json({
    currentRefereeName,
    nights: rows.map((row) => {
      const refereeNames = (row.refereeNames ?? [])
        .map(normaliseName)
        .filter(Boolean);
      const coReferees = refereeNames.filter((name) => name !== currentRefereeName);

      return {
        nightId: row.nightId,
        totalReferees: Number(row.totalReferees ?? refereeNames.length),
        refereeNames,
        coReferees,
      };
    }),
  });
}
