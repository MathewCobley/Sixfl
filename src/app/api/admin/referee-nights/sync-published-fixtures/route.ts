// ========================================
// File: src/app/api/admin/referee-nights/sync-published-fixtures/route.ts
// ========================================

import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";

import { syncPublishedFixtureRefereeNightAssignmentsAndRecalculate } from "@/lib/referee-night-assignment-sync";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/requireAdmin";

export const dynamic = "force-dynamic";

type FixtureToSyncRow = {
  id: string;
};

export async function POST() {
  const { user } = await requireAdmin();

  const rows = await prisma.$queryRaw<FixtureToSyncRow[]>(Prisma.sql`
    SELECT DISTINCT f.id
    FROM "Fixture" f
    LEFT JOIN "RefereeNightFixture" rnf ON rnf."fixtureId" = f.id
    WHERE f."publishedAt" IS NOT NULL
      AND (
        f."refereeId" IS NOT NULL
        OR rnf."fixtureId" IS NOT NULL
      )
  `);

  const fixtureIds = rows.map((row) => row.id);

  if (fixtureIds.length === 0) {
    return NextResponse.json({ syncedFixtures: 0, affectedNights: 0 });
  }

  const affectedNightIds = await syncPublishedFixtureRefereeNightAssignmentsAndRecalculate({
    fixtureIds,
    createdByUserId: user?.id ?? null,
  });

  return NextResponse.json({
    syncedFixtures: fixtureIds.length,
    affectedNights: affectedNightIds.length,
  });
}
