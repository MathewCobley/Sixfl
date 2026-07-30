import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/requireAdmin";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type TeamCountRow = {
  teamId: string;
  linkCount: number | bigint;
};

export async function GET() {
  await requireAdmin();

  const rows = await prisma.$queryRaw<TeamCountRow[]>(Prisma.sql`
    WITH team_context AS (
      SELECT
        team."id" AS "teamId",
        LOWER(BTRIM(team."name")) AS "teamNameKey",
        COALESCE(competition."currentLeagueId", team."leagueId") AS "currentLeagueId"
      FROM "Team" team
      LEFT JOIN "League" league ON league."id" = team."leagueId"
      LEFT JOIN "LeagueCompetition" competition ON competition."id" = league."competitionId"
    ),
    fixture_links AS (
      SELECT
        fixture."leagueId",
        LOWER(BTRIM(home_team."name")) AS "homeTeamNameKey",
        LOWER(BTRIM(away_team."name")) AS "awayTeamNameKey",
        BTRIM(link.value) AS "url"
      FROM "Fixture" fixture
      JOIN "Team" home_team ON home_team."id" = fixture."homeTeamId"
      JOIN "Team" away_team ON away_team."id" = fixture."awayTeamId"
      CROSS JOIN LATERAL regexp_split_to_table(
        fixture."sixflTvUrl",
        E'[\\n,]+'
      ) AS link(value)
      WHERE fixture."publishedAt" IS NOT NULL
        AND fixture."sixflTvRecorded" = true
        AND fixture."sixflTvUrl" IS NOT NULL
        AND BTRIM(link.value) <> ''
    )
    SELECT
      context."teamId",
      COUNT(link."url")::int AS "linkCount"
    FROM team_context context
    LEFT JOIN fixture_links link
      ON link."leagueId" = context."currentLeagueId"
      AND (
        link."homeTeamNameKey" = context."teamNameKey"
        OR link."awayTeamNameKey" = context."teamNameKey"
      )
    GROUP BY context."teamId"
  `);

  return NextResponse.json({
    counts: Object.fromEntries(
      rows.map((row) => [row.teamId, Number(row.linkCount)]),
    ),
  });
}
