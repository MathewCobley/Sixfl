import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import {
  ensureTemporaryPlayerPassTable,
  redeemTemporaryPlayerPass,
  TemporaryPlayerPassError,
} from "@/lib/temporary-player-passes";

export type PendingTemporaryPlayerRequest = {
  id: string;
  displayName: string;
  createdAt: Date;
  expiresAt: Date;
};

type RequestRow = PendingTemporaryPlayerRequest & { code: string };

export async function listPendingTemporaryPlayerRequests(input: {
  teamId: string;
  fixtureId: string;
}) {
  await ensureTemporaryPlayerPassTable();

  await prisma.$executeRaw`
    UPDATE "TemporaryPlayerPass"
    SET "status" = 'EXPIRED', "updatedAt" = NOW()
    WHERE "teamId" = ${input.teamId}
      AND "fixtureId" = ${input.fixtureId}
      AND "status" = 'OPEN'
      AND "expiresAt" <= NOW()
  `;

  return prisma.$queryRaw<PendingTemporaryPlayerRequest[]>(Prisma.sql`
    SELECT
      pass."id",
      CASE
        WHEN TRIM(COALESCE(player."name", '')) = '' THEN 'SIXFL player'
        WHEN ARRAY_LENGTH(REGEXP_SPLIT_TO_ARRAY(TRIM(player."name"), '\\s+'), 1) > 1
          THEN SPLIT_PART(TRIM(player."name"), ' ', 1) || ' ' ||
            UPPER(LEFT((REGEXP_SPLIT_TO_ARRAY(TRIM(player."name"), '\\s+'))[2], 1)) || '.'
        ELSE SPLIT_PART(TRIM(player."name"), ' ', 1)
      END AS "displayName",
      pass."createdAt",
      pass."expiresAt"
    FROM "TemporaryPlayerPass" pass
    INNER JOIN "User" player ON player."id" = pass."userId"
    WHERE pass."teamId" = ${input.teamId}
      AND pass."fixtureId" = ${input.fixtureId}
      AND pass."status" = 'OPEN'
      AND pass."expiresAt" > NOW()
    ORDER BY pass."createdAt" ASC
  `);
}

async function getOpenRequest(input: {
  requestId: string;
  teamId: string;
  fixtureId: string;
}) {
  await ensureTemporaryPlayerPassTable();

  const rows = await prisma.$queryRaw<RequestRow[]>(Prisma.sql`
    SELECT
      pass."id",
      pass."code",
      CASE
        WHEN TRIM(COALESCE(player."name", '')) = '' THEN 'SIXFL player'
        WHEN ARRAY_LENGTH(REGEXP_SPLIT_TO_ARRAY(TRIM(player."name"), '\\s+'), 1) > 1
          THEN SPLIT_PART(TRIM(player."name"), ' ', 1) || ' ' ||
            UPPER(LEFT((REGEXP_SPLIT_TO_ARRAY(TRIM(player."name"), '\\s+'))[2], 1)) || '.'
        ELSE SPLIT_PART(TRIM(player."name"), ' ', 1)
      END AS "displayName",
      pass."createdAt",
      pass."expiresAt"
    FROM "TemporaryPlayerPass" pass
    INNER JOIN "User" player ON player."id" = pass."userId"
    WHERE pass."id" = ${input.requestId}
      AND pass."teamId" = ${input.teamId}
      AND pass."fixtureId" = ${input.fixtureId}
      AND pass."status" = 'OPEN'
      AND pass."expiresAt" > NOW()
    LIMIT 1
  `);

  return rows[0] ?? null;
}

export async function acceptTemporaryPlayerRequest(input: {
  requestId: string;
  teamId: string;
  fixtureId: string;
  amountPence: number;
  acceptedByUserId: string | null;
}) {
  const request = await getOpenRequest(input);
  if (!request) {
    throw new TemporaryPlayerPassError(
      "INVALID_PASS",
      "That temporary-player request is no longer available.",
    );
  }

  return redeemTemporaryPlayerPass({
    code: request.code,
    fixtureId: input.fixtureId,
    teamId: input.teamId,
    amountPence: input.amountPence,
    acceptedByUserId: input.acceptedByUserId,
  });
}

export async function declineTemporaryPlayerRequest(input: {
  requestId: string;
  teamId: string;
  fixtureId: string;
}) {
  await ensureTemporaryPlayerPassTable();

  const rows = await prisma.$queryRaw<{ displayName: string }[]>(Prisma.sql`
    WITH declined AS (
      UPDATE "TemporaryPlayerPass"
      SET "status" = 'REVOKED', "updatedAt" = NOW()
      WHERE "id" = ${input.requestId}
        AND "teamId" = ${input.teamId}
        AND "fixtureId" = ${input.fixtureId}
        AND "status" = 'OPEN'
        AND "expiresAt" > NOW()
      RETURNING "userId"
    )
    SELECT
      CASE
        WHEN TRIM(COALESCE(player."name", '')) = '' THEN 'SIXFL player'
        WHEN ARRAY_LENGTH(REGEXP_SPLIT_TO_ARRAY(TRIM(player."name"), '\\s+'), 1) > 1
          THEN SPLIT_PART(TRIM(player."name"), ' ', 1) || ' ' ||
            UPPER(LEFT((REGEXP_SPLIT_TO_ARRAY(TRIM(player."name"), '\\s+'))[2], 1)) || '.'
        ELSE SPLIT_PART(TRIM(player."name"), ' ', 1)
      END AS "displayName"
    FROM declined
    INNER JOIN "User" player ON player."id" = declined."userId"
  `);

  if (!rows[0]) {
    throw new TemporaryPlayerPassError(
      "INVALID_PASS",
      "That temporary-player request is no longer available.",
    );
  }

  return rows[0];
}
