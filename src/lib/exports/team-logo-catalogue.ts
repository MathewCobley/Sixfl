import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import type { TeamLogoExportChoice } from "@/lib/team-logo-export-contract";

/** Read-only artwork catalogue, not a standings calculation. An explicit inactive
 * season membership wins over legacy affiliation. Never call backfill-on-read. */
export async function getTeamLogoExportChoices(): Promise<TeamLogoExportChoice[]> {
  return prisma.$queryRaw<TeamLogoExportChoice[]>(Prisma.sql`
    SELECT team."id", team."name", team."logoUrl",
      COALESCE('competition:' || competition."id", 'league:' || league."id", 'unassigned') AS "leagueKey",
      COALESCE(competition."name", league."name", 'Unassigned teams') AS "leagueName",
      league."season",
      (team."leagueId" IS NOT NULL AND COALESCE(current_league."isActive", false)
        AND COALESCE(membership."isActive", team."leagueId" = current_league."id", false)) AS "isCurrent"
    FROM "Team" team
    LEFT JOIN "League" league ON league."id" = team."leagueId"
    LEFT JOIN "LeagueCompetition" competition
      ON competition."id" = COALESCE(team."competitionId", league."competitionId")
      AND team."leagueId" IS NOT NULL
    LEFT JOIN "League" current_league ON current_league."id" = COALESCE(competition."currentLeagueId", league."id")
    LEFT JOIN "LeagueSeasonTeam" membership ON membership."teamId" = team."id" AND membership."leagueId" = current_league."id"
    WHERE COALESCE(team."isFixturePlaceholder", false) = false
    ORDER BY team."name" ASC, team."id" ASC
  `);
}
