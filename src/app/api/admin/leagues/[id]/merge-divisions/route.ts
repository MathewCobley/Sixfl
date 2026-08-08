import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/requireAdmin";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type CountRow = { count: number | bigint };

function countValue(rows: CountRow[]) {
  return Number(rows[0]?.count ?? 0);
}

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  await requireAdmin();
  const { id } = await params;

  const league = await prisma.league.findUnique({
    where: { id },
    select: { id: true, slug: true, name: true },
  });

  if (!league) {
    return NextResponse.json({ error: "League not found." }, { status: 404 });
  }

  const activeDivisionRows = await prisma.$queryRaw<CountRow[]>(Prisma.sql`
    SELECT COUNT(*)::int AS "count"
    FROM "LeagueDivision"
    WHERE "leagueId" = ${league.id}
      AND "isActive" = true
  `);

  if (countValue(activeDivisionRows) === 0) {
    return NextResponse.json({
      ok: true,
      alreadyMerged: true,
      message: "This league already uses one combined table.",
    });
  }

  const summary = await prisma.$transaction(async (tx) => {
    const activeTeams = await tx.$queryRaw<CountRow[]>(Prisma.sql`
      SELECT COUNT(*)::int AS "count"
      FROM "LeagueSeasonTeam"
      WHERE "leagueId" = ${league.id}
        AND "isActive" = true
    `);

    const savedResults = await tx.$queryRaw<CountRow[]>(Prisma.sql`
      SELECT COUNT(*)::int AS "count"
      FROM "Fixture" f
      WHERE f."leagueId" = ${league.id}
        AND EXISTS (
          SELECT 1
          FROM "MatchResult" r
          WHERE r."fixtureId" = f."id"
        )
    `);

    const unplayedDivisionFixtures = await tx.$queryRaw<CountRow[]>(Prisma.sql`
      SELECT COUNT(*)::int AS "count"
      FROM "Fixture" f
      WHERE f."leagueId" = ${league.id}
        AND f."divisionId" IS NOT NULL
        AND NOT EXISTS (
          SELECT 1
          FROM "MatchResult" r
          WHERE r."fixtureId" = f."id"
        )
    `);

    await tx.$executeRaw(Prisma.sql`
      UPDATE "LeagueSeasonTeam"
      SET
        "divisionId" = NULL,
        "updatedAt" = NOW()
      WHERE "leagueId" = ${league.id}
        AND "isActive" = true
    `);

    // Keep the legacy compatibility field aligned with the new single-table
    // structure. Season participation itself remains controlled by
    // LeagueSeasonTeam.isActive.
    await tx.$executeRaw(Prisma.sql`
      UPDATE "Team" t
      SET
        "divisionId" = NULL,
        "updatedAt" = NOW()
      WHERE EXISTS (
        SELECT 1
        FROM "LeagueSeasonTeam" lst
        WHERE lst."leagueId" = ${league.id}
          AND lst."teamId" = t."id"
          AND lst."isActive" = true
      )
    `);

    // Completed fixtures keep their original divisionId as historical metadata.
    // Only unplayed fixtures are moved into the new combined future fixture pool.
    await tx.$executeRaw(Prisma.sql`
      UPDATE "Fixture" f
      SET "divisionId" = NULL
      WHERE f."leagueId" = ${league.id}
        AND f."divisionId" IS NOT NULL
        AND NOT EXISTS (
          SELECT 1
          FROM "MatchResult" r
          WHERE r."fixtureId" = f."id"
        )
    `);

    // Deactivate rather than delete the old divisions so completed fixtures can
    // retain their historic Premiership/Championship reference safely.
    await tx.$executeRaw(Prisma.sql`
      UPDATE "LeagueDivision"
      SET
        "isActive" = false,
        "updatedAt" = NOW()
      WHERE "leagueId" = ${league.id}
        AND "isActive" = true
    `);

    return {
      activeTeams: countValue(activeTeams),
      savedResults: countValue(savedResults),
      futureFixturesMerged: countValue(unplayedDivisionFixtures),
    };
  });

  revalidatePath(`/admin/leagues/${league.id}`);
  revalidatePath(`/admin/leagues/${league.id}/fixtures`);
  revalidatePath(`/leagues/${league.slug}`);
  revalidatePath(`/leagues/${league.slug}/fixtures`);
  revalidatePath("/admin/fixtures");
  revalidatePath("/admin/league-tables");

  return NextResponse.json({
    ok: true,
    league: { id: league.id, name: league.name },
    ...summary,
    message: `${league.name} now uses one combined table. All saved results were preserved.`,
  });
}
