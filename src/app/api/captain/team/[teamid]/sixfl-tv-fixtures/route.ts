import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";

import { getCaptainRelatedTeamContext } from "@/lib/captain/related-teams";
import { prisma } from "@/lib/prisma";
import { requireCaptain } from "@/lib/requireCaptain";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type TvFixtureRow = {
  id: string;
  homeTeamName: string;
  awayTeamName: string;
  sixflTvUrl: string | null;
};

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ teamid: string }> },
) {
  const { teamid } = await params;
  await requireCaptain(teamid);

  const context = await getCaptainRelatedTeamContext(teamid);
  if (!context) {
    return NextResponse.json({ error: "Team not found." }, { status: 404 });
  }

  const rows = await prisma.$queryRaw<TvFixtureRow[]>(Prisma.sql`
    SELECT
      f."id",
      f."sixflTvUrl",
      home."name" AS "homeTeamName",
      away."name" AS "awayTeamName"
    FROM "Fixture" f
    JOIN "Team" home ON home."id" = f."homeTeamId"
    JOIN "Team" away ON away."id" = f."awayTeamId"
    WHERE f."sixflTvRecorded" = true
      AND f."sixflTvUrl" IS NOT NULL
      AND f."publishedAt" IS NOT NULL
      AND (
        f."homeTeamId" IN (${Prisma.join(context.relatedTeamIds)})
        OR f."awayTeamId" IN (${Prisma.join(context.relatedTeamIds)})
      )
  `);

  return NextResponse.json({
    fixtures: rows.map((row) => ({
      id: row.id,
      fullLabel: `${row.homeTeamName} vs ${row.awayTeamName}`,
      captainLabels: [`vs ${row.homeTeamName}`, `vs ${row.awayTeamName}`],
      sixflTvUrl: row.sixflTvUrl,
    })),
  });
}
