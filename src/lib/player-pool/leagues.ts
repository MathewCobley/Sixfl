import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";

export const PLAYER_POOL_LEAGUE_AVAILABILITY = {
  AVAILABLE: "AVAILABLE",
  MOST_WEEKS: "MOST_WEEKS",
  SOMETIMES: "SOMETIMES",
  NOT_AVAILABLE: "NOT_AVAILABLE",
} as const;

export type PlayerPoolLeagueAvailability =
  (typeof PLAYER_POOL_LEAGUE_AVAILABILITY)[keyof typeof PLAYER_POOL_LEAGUE_AVAILABILITY];

export type PlayerPoolLeagueOption = {
  id: string;
  name: string;
  season: string | null;
  area: string | null;
  dayOfWeek: string | null;
  venueName: string | null;
  kickoffInfo: string | null;
  leagueType: string | null;
};

export type PlayerPoolLeaguePreference = {
  leagueId: string;
  availabilityStatus: PlayerPoolLeagueAvailability;
  isPrimary: boolean;
};

export async function listPlayerPoolLeagueOptions(input?: {
  includeLeagueIds?: string[];
}) {
  const includeLeagueIds = Array.from(
    new Set((input?.includeLeagueIds ?? []).map((value) => value.trim()).filter(Boolean)),
  );

  const includeClause = includeLeagueIds.length
    ? Prisma.sql`OR league."id" IN (${Prisma.join(includeLeagueIds)})`
    : Prisma.empty;

  return prisma.$queryRaw<PlayerPoolLeagueOption[]>(Prisma.sql`
    SELECT
      league."id",
      COALESCE(competition."name", league."name") AS "name",
      league."season",
      COALESCE(competition."area", league."area") AS "area",
      COALESCE(competition."dayOfWeek", league."dayOfWeek")::text AS "dayOfWeek",
      COALESCE(league."venueName", competition."venueName") AS "venueName",
      league."kickoffInfo",
      COALESCE(competition."leagueType", league."leagueType")::text AS "leagueType"
    FROM "League" league
    LEFT JOIN "LeagueCompetition" competition
      ON competition."id" = league."competitionId"
    WHERE (
      (
        league."isActive" = TRUE
        AND (competition."id" IS NULL OR competition."isActive" = TRUE)
        AND (
          league."competitionId" IS NULL
          OR competition."currentLeagueId" = league."id"
        )
      )
      ${includeClause}
    )
    ORDER BY
      COALESCE(competition."area", league."area") ASC NULLS LAST,
      COALESCE(competition."dayOfWeek", league."dayOfWeek") ASC NULLS LAST,
      COALESCE(competition."name", league."name") ASC,
      league."season" DESC NULLS LAST
  `);
}

export async function getPlayerPoolLeaguePreferences(profileId: string) {
  if (!profileId) return [];

  return prisma.$queryRaw<PlayerPoolLeaguePreference[]>`
    SELECT
      preference."leagueId",
      preference."availabilityStatus",
      preference."isPrimary"
    FROM "PlayerPoolLeaguePreference" preference
    WHERE preference."profileId" = ${profileId}
    ORDER BY preference."isPrimary" DESC, preference."createdAt" ASC
  `;
}

export function isPlayerPoolLeagueAvailability(
  value: string,
): value is PlayerPoolLeagueAvailability {
  return Object.values(PLAYER_POOL_LEAGUE_AVAILABILITY).includes(
    value as PlayerPoolLeagueAvailability,
  );
}
