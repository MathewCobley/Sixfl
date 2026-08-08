import { randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";

type RawDbClient = Pick<typeof prisma, "$executeRaw" | "$queryRaw">;

export type FixturePlaceholderTeamRow = {
  id: string;
  name: string;
  leagueId: string;
};

/**
 * Some older SIXFL placeholder rows pre-date the isFixturePlaceholder flag and
 * are simply named TBC. Treat both representations as placeholders so legacy
 * data cannot accidentally behave like a real club.
 */
export async function isFixturePlaceholderTeam(
  teamId: string,
  client: RawDbClient = prisma,
) {
  const rows = await client.$queryRaw<Array<{ value: boolean }>>(Prisma.sql`
    SELECT (
      COALESCE("isFixturePlaceholder", false)
      OR UPPER(TRIM("name")) = 'TBC'
    ) AS "value"
    FROM "Team"
    WHERE "id" = ${teamId}
    LIMIT 1
  `);

  return Boolean(rows[0]?.value);
}

export async function getFixturePlaceholderTeamIds(
  teamIds?: string[],
  client: RawDbClient = prisma,
) {
  if (teamIds && teamIds.length === 0) return new Set<string>();

  const rows = teamIds
    ? await client.$queryRaw<Array<{ id: string }>>(Prisma.sql`
        SELECT "id"
        FROM "Team"
        WHERE (
          "isFixturePlaceholder" = true
          OR UPPER(TRIM("name")) = 'TBC'
        )
          AND "id" IN (${Prisma.join(teamIds)})
      `)
    : await client.$queryRaw<Array<{ id: string }>>(Prisma.sql`
        SELECT "id"
        FROM "Team"
        WHERE "isFixturePlaceholder" = true
          OR UPPER(TRIM("name")) = 'TBC'
      `);

  return new Set(rows.map((row) => row.id));
}

export async function fixtureHasPlaceholderTeam(
  fixtureId: string,
  client: RawDbClient = prisma,
) {
  const rows = await client.$queryRaw<Array<{ value: boolean }>>(Prisma.sql`
    SELECT EXISTS (
      SELECT 1
      FROM "Fixture" f
      JOIN "Team" home_team ON home_team."id" = f."homeTeamId"
      JOIN "Team" away_team ON away_team."id" = f."awayTeamId"
      WHERE f."id" = ${fixtureId}
        AND (
          home_team."isFixturePlaceholder" = true
          OR UPPER(TRIM(home_team."name")) = 'TBC'
          OR away_team."isFixturePlaceholder" = true
          OR UPPER(TRIM(away_team."name")) = 'TBC'
        )
    ) AS "value"
  `);

  return Boolean(rows[0]?.value);
}

export async function assertFixtureHasNoPlaceholderTeam(
  fixtureId: string,
  actionLabel: string,
  client: RawDbClient = prisma,
) {
  if (await fixtureHasPlaceholderTeam(fixtureId, client)) {
    throw new Error(
      `Replace TBC with the confirmed team before ${actionLabel}.`,
    );
  }
}

export async function getLeagueFixturePlaceholderTeam(
  leagueId: string,
  client: RawDbClient = prisma,
) {
  const rows = await client.$queryRaw<FixturePlaceholderTeamRow[]>(Prisma.sql`
    SELECT
      t."id",
      t."name",
      lst."leagueId"
    FROM "LeagueSeasonTeam" lst
    JOIN "Team" t ON t."id" = lst."teamId"
    WHERE lst."leagueId" = ${leagueId}
      AND lst."isActive" = true
      AND (
        t."isFixturePlaceholder" = true
        OR UPPER(TRIM(t."name")) = 'TBC'
      )
    ORDER BY t."createdAt" ASC
    LIMIT 1
  `);

  return rows[0] ?? null;
}

async function suppressFixturePlaceholderNotifications(
  teamId: string,
  client: RawDbClient,
) {
  await client.$executeRaw(Prisma.sql`
    UPDATE "NotificationPreference"
    SET
      "emailEnabled" = false,
      "smsEnabled" = false,
      "urgentSmsEnabled" = false,
      "marketingEmailEnabled" = false,
      "marketingSmsEnabled" = false,
      "updatedAt" = NOW()
    WHERE "recipientId" IN (
      SELECT "id"
      FROM "NotificationRecipient"
      WHERE "sourceType" = 'TEAM'
        AND "sourceId" = ${teamId}
    )
  `);

  await client.$executeRaw(Prisma.sql`
    UPDATE "NotificationDispatch"
    SET
      "status" = 'CANCELLED',
      "cancelledAt" = NOW(),
      "failureReason" = 'Fixture placeholder teams do not receive notifications.',
      "updatedAt" = NOW()
    WHERE "recipientId" IN (
      SELECT "id"
      FROM "NotificationRecipient"
      WHERE "sourceType" = 'TEAM'
        AND "sourceId" = ${teamId}
    )
      AND "status" IN ('QUEUED', 'PROCESSING')
  `);

  await client.$executeRaw(Prisma.sql`
    UPDATE "NotificationRecipient"
    SET
      "displayName" = 'TBC placeholder',
      "email" = NULL,
      "phone" = NULL,
      "emailNormalized" = NULL,
      "phoneNormalized" = NULL,
      "marketingEmailOptIn" = false,
      "marketingSmsOptIn" = false,
      "transactionalEmailOptIn" = false,
      "transactionalSmsOptIn" = false,
      "isSuppressed" = true,
      "suppressionReason" = 'Fixture placeholder teams do not receive notifications.',
      "lastSyncedAt" = NOW(),
      "updatedAt" = NOW()
    WHERE "sourceType" = 'TEAM'
      AND "sourceId" = ${teamId}
  `);

  await client.$executeRaw(Prisma.sql`
    UPDATE "MessageThread"
    SET
      "teamId" = NULL,
      "status" = 'ARCHIVED',
      "unreadForAdminCount" = 0,
      "unreadForCaptainCount" = 0,
      "updatedAt" = NOW()
    WHERE "teamId" = ${teamId}
  `);
}

export async function markTeamAsFixturePlaceholder(input: {
  teamId: string;
  leagueId: string;
  client?: RawDbClient;
}) {
  const client = input.client ?? prisma;
  const existing = await getLeagueFixturePlaceholderTeam(input.leagueId, client);

  if (existing && existing.id !== input.teamId) {
    throw new Error("This league already has a fixture placeholder team.");
  }

  const placeholderClaimCode = `TBC-${randomUUID().slice(0, 12).toUpperCase()}`;

  await client.$executeRaw(Prisma.sql`
    UPDATE "Team"
    SET
      "claimCode" = ${placeholderClaimCode},
      "isFixturePlaceholder" = true,
      "leagueId" = NULL,
      "divisionId" = NULL,
      "competitionId" = NULL,
      "teamMode" = 'STANDARD',
      "isRecruiting" = false,
      "joinSlug" = NULL,
      "contactName" = NULL,
      "contactEmail" = NULL,
      "contactPhone" = NULL,
      "secondaryContactName" = NULL,
      "secondaryContactEmail" = NULL,
      "secondaryContactPhone" = NULL,
      "latestKickoffTime" = NULL,
      "createdByUserId" = NULL,
      "captainUserId" = NULL,
      "captainLinkedAt" = NULL,
      "captainLinkedSource" = NULL,
      "captainInviteSentAt" = NULL,
      "captainInviteSentTo" = NULL,
      "captainClaimedAt" = NULL,
      "captainClaimSource" = NULL,
      "updatedAt" = NOW()
    WHERE "id" = ${input.teamId}
  `);

  await client.$executeRaw(Prisma.sql`
    DELETE FROM "TeamMember"
    WHERE "teamId" = ${input.teamId}
  `);

  await client.$executeRaw(Prisma.sql`
    UPDATE "InterestLead"
    SET
      "convertedTeamId" = NULL,
      "updatedAt" = NOW()
    WHERE "convertedTeamId" = ${input.teamId}
  `);

  await suppressFixturePlaceholderNotifications(input.teamId, client);

  await client.$executeRaw(Prisma.sql`
    INSERT INTO "LeagueSeasonTeam" (
      "id",
      "leagueId",
      "teamId",
      "divisionId",
      "isActive",
      "createdAt",
      "updatedAt"
    )
    VALUES (
      ${randomUUID()},
      ${input.leagueId},
      ${input.teamId},
      NULL,
      true,
      NOW(),
      NOW()
    )
    ON CONFLICT ("leagueId", "teamId") DO UPDATE
    SET
      "divisionId" = NULL,
      "isActive" = true,
      "updatedAt" = NOW()
  `);
}
