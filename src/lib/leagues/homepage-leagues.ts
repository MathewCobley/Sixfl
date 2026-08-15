import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";

export const HOMEPAGE_LEAGUE_STAGES = [
  "LIVE",
  "FORMING",
  "PLANNED",
  "HIDDEN",
] as const;

export type HomepageLeagueStage = (typeof HOMEPAGE_LEAGUE_STAGES)[number];

export type HomepageLeague = {
  id: string;
  name: string;
  slug: string;
  season: string | null;
  area: string | null;
  venueName: string | null;
  dayOfWeek: string | null;
  kickoffInfo: string | null;
  description: string | null;
  heroImageUrl: string | null;
  homepageStage: HomepageLeagueStage;
  homepagePriority: number;
  proposedStartDate: Date | null;
  costPerTeamPerMatchPence: number | null;
  targetTeamCount: number | null;
  teamCount: number;
  publishedFixtureCount: number;
};

type HomepageLeagueRow = Omit<
  HomepageLeague,
  "homepageStage" | "homepagePriority" | "teamCount" | "publishedFixtureCount"
> & {
  homepageStage: string | null;
  homepagePriority: number | bigint | null;
  teamCount: number | bigint | null;
  publishedFixtureCount: number | bigint | null;
};

function normaliseStage(value: string | null): HomepageLeagueStage {
  return HOMEPAGE_LEAGUE_STAGES.includes(value as HomepageLeagueStage)
    ? (value as HomepageLeagueStage)
    : "HIDDEN";
}

export async function getHomepageLeagues(options?: { includeHidden?: boolean }) {
  const includeHidden = Boolean(options?.includeHidden);

  const rows = await prisma.$queryRaw<HomepageLeagueRow[]>(Prisma.sql`
    SELECT
      league."id",
      league."name",
      league."slug",
      league."season",
      league."area",
      league."venueName",
      league."dayOfWeek"::text AS "dayOfWeek",
      league."kickoffInfo",
      league."description",
      league."heroImageUrl",
      COALESCE(league."homepageStage", 'HIDDEN') AS "homepageStage",
      COALESCE(league."homepagePriority", 100)::int AS "homepagePriority",
      league."proposedStartDate",
      league."costPerTeamPerMatchPence"::int AS "costPerTeamPerMatchPence",
      league."targetTeamCount"::int AS "targetTeamCount",
      (
        CASE
          WHEN EXISTS (
            SELECT 1
            FROM "LeagueSeasonTeam" any_membership
            WHERE any_membership."leagueId" = league."id"
          ) THEN (
            SELECT COUNT(*)::int
            FROM "LeagueSeasonTeam" active_membership
            WHERE active_membership."leagueId" = league."id"
              AND active_membership."isActive" = TRUE
          )
          ELSE (
            SELECT COUNT(*)::int
            FROM "Team" direct_team
            WHERE direct_team."leagueId" = league."id"
          )
        END
      ) AS "teamCount",
      (
        SELECT COUNT(*)::int
        FROM "Fixture" published_fixture
        WHERE published_fixture."leagueId" = league."id"
          AND published_fixture."publishedAt" IS NOT NULL
      ) AS "publishedFixtureCount"
    FROM "League" league
    LEFT JOIN "LeagueCompetition" competition
      ON competition."id" = league."competitionId"
    WHERE league."isActive" = TRUE
      AND (
        league."competitionId" IS NULL
        OR competition."currentLeagueId" = league."id"
      )
      AND (
        ${includeHidden}
        OR COALESCE(league."homepageStage", 'HIDDEN') <> 'HIDDEN'
      )
    ORDER BY
      CASE COALESCE(league."homepageStage", 'HIDDEN')
        WHEN 'LIVE' THEN 1
        WHEN 'FORMING' THEN 2
        WHEN 'PLANNED' THEN 3
        ELSE 4
      END,
      COALESCE(league."homepagePriority", 100) ASC,
      league."proposedStartDate" ASC NULLS LAST,
      league."name" ASC
  `);

  return rows.map<HomepageLeague>((row) => ({
    ...row,
    homepageStage: normaliseStage(row.homepageStage),
    homepagePriority: Number(row.homepagePriority ?? 100),
    teamCount: Number(row.teamCount ?? 0),
    publishedFixtureCount: Number(row.publishedFixtureCount ?? 0),
  }));
}
