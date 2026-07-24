// ========================================
// File: src/lib/fixtures/shin-pad-warning-records.ts
// ========================================

import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";

export type TeamShinPadWarningRecord = {
  id: string;
  teamId: string;
  fixtureId: string;
  refereeNightId: string | null;
  createdAt: Date;
  kickoffAt: Date;
  homeTeamName: string;
  awayTeamName: string;
  leagueName: string;
  venueName: string | null;
  reportedByName: string | null;
  reportedByEmail: string | null;
  emailSentTo: string | null;
  emailQueuedAt: Date | null;
  emailSentAt: Date | null;
  notificationStatus: string | null;
  notificationFailureReason: string | null;
};

export async function getTeamShinPadWarningRecords(teamId: string) {
  return prisma.$queryRaw<TeamShinPadWarningRecord[]>(Prisma.sql`
    SELECT
      warning."id",
      warning."teamId",
      warning."fixtureId",
      warning."refereeNightId",
      warning."createdAt",
      fixture."kickoffAt",
      home_team."name" AS "homeTeamName",
      away_team."name" AS "awayTeamName",
      league."name" AS "leagueName",
      venue."name" AS "venueName",
      reporter."name" AS "reportedByName",
      reporter."email" AS "reportedByEmail",
      warning."emailSentTo",
      warning."emailQueuedAt",
      warning."emailSentAt",
      dispatch."status"::text AS "notificationStatus",
      dispatch."failureReason" AS "notificationFailureReason"
    FROM "TeamShinPadWarning" warning
    INNER JOIN "Fixture" fixture
      ON fixture."id" = warning."fixtureId"
    INNER JOIN "Team" home_team
      ON home_team."id" = fixture."homeTeamId"
    INNER JOIN "Team" away_team
      ON away_team."id" = fixture."awayTeamId"
    INNER JOIN "League" league
      ON league."id" = fixture."leagueId"
    LEFT JOIN "Venue" venue
      ON venue."id" = fixture."venueId"
    LEFT JOIN "User" reporter
      ON reporter."id" = warning."reportedByUserId"
    LEFT JOIN "NotificationDispatch" dispatch
      ON dispatch."id" = warning."notificationDispatchId"
    WHERE warning."teamId" = ${teamId}
    ORDER BY warning."createdAt" DESC
  `);
}
