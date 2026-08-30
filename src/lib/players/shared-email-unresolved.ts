import { randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";

export type UnresolvedSharedEmailRecipient = {
  id: string;
  sourceType: string;
  sourceId: string | null;
  displayName: string | null;
  email: string | null;
  phone: string | null;
  sourceKind: "player-match-fee" | "fixture-selection" | "team-prospect";
};

function normaliseEmail(value: string) {
  const email = value.trim().toLowerCase();
  return /^[^\s@]+@[^\s@]+$/.test(email) ? email : null;
}

function normaliseName(value: string) {
  const name = value.trim().replace(/\s+/g, " ").toLowerCase();
  return name || null;
}

export async function getUnresolvedSharedEmailPlayerRecipients(input: {
  sharedEmail: string;
  separateName: string;
}): Promise<UnresolvedSharedEmailRecipient[]> {
  const sharedEmail = normaliseEmail(input.sharedEmail);
  const separateName = normaliseName(input.separateName);
  if (!sharedEmail || !separateName) return [];

  return prisma.$queryRaw<UnresolvedSharedEmailRecipient[]>(Prisma.sql`
    SELECT
      recipient."id",
      recipient."sourceType"::text AS "sourceType",
      recipient."sourceId",
      recipient."displayName",
      COALESCE(NULLIF(BTRIM(recipient."emailNormalized"), ''), NULLIF(BTRIM(recipient."email"), '')) AS "email",
      COALESCE(NULLIF(BTRIM(recipient."phoneNormalized"), ''), NULLIF(BTRIM(recipient."phone"), '')) AS "phone",
      CASE
        WHEN recipient."sourceId" LIKE 'player-match-fee:%' THEN 'player-match-fee'
        WHEN recipient."sourceId" LIKE 'fixture-selection:%' THEN 'fixture-selection'
        ELSE 'team-prospect'
      END AS "sourceKind"
    FROM "NotificationRecipient" recipient
    WHERE LOWER(COALESCE(NULLIF(BTRIM(recipient."emailNormalized"), ''), NULLIF(BTRIM(recipient."email"), ''))) = ${sharedEmail}
      AND LOWER(REGEXP_REPLACE(BTRIM(COALESCE(recipient."displayName", '')), '[[:space:]]+', ' ', 'g')) = ${separateName}
      AND (
        (
          recipient."sourceId" LIKE 'player-match-fee:%'
          AND NOT EXISTS (
            SELECT 1
            FROM "PlayerMatchFee" fee
            WHERE recipient."sourceId" = 'player-match-fee:' || fee."id"
          )
        )
        OR (
          recipient."sourceId" LIKE 'fixture-selection:%'
          AND NOT EXISTS (
            SELECT 1
            FROM "FixtureSelection" selection
            WHERE recipient."sourceId" = 'fixture-selection:' || selection."fixtureId" || ':' || selection."teamMemberId"
          )
        )
        OR (
          recipient."sourceId" LIKE 'team-prospect:%'
          AND NOT EXISTS (
            SELECT 1
            FROM "TeamPlayerProspect" prospect
            WHERE recipient."sourceId" = 'team-prospect:' || prospect."id"
          )
        )
      )
    ORDER BY recipient."updatedAt" DESC
  `);
}

export async function quarantineUnresolvedSharedEmailPlayerRecipients(input: {
  sharedEmail: string;
  separateName: string;
  actorUserId?: string | null;
  actorEmail?: string | null;
}) {
  const sharedEmail = normaliseEmail(input.sharedEmail);
  const separateName = normaliseName(input.separateName);
  if (!sharedEmail || !separateName) {
    throw new Error("Enter a valid shared email and player name before quarantining metadata.");
  }

  return prisma.$transaction(async (tx) => {
    const rows = await tx.$queryRaw<UnresolvedSharedEmailRecipient[]>(Prisma.sql`
      SELECT
        recipient."id",
        recipient."sourceType"::text AS "sourceType",
        recipient."sourceId",
        recipient."displayName",
        COALESCE(NULLIF(BTRIM(recipient."emailNormalized"), ''), NULLIF(BTRIM(recipient."email"), '')) AS "email",
        COALESCE(NULLIF(BTRIM(recipient."phoneNormalized"), ''), NULLIF(BTRIM(recipient."phone"), '')) AS "phone",
        CASE
          WHEN recipient."sourceId" LIKE 'player-match-fee:%' THEN 'player-match-fee'
          WHEN recipient."sourceId" LIKE 'fixture-selection:%' THEN 'fixture-selection'
          ELSE 'team-prospect'
        END AS "sourceKind"
      FROM "NotificationRecipient" recipient
      WHERE LOWER(COALESCE(NULLIF(BTRIM(recipient."emailNormalized"), ''), NULLIF(BTRIM(recipient."email"), ''))) = ${sharedEmail}
        AND LOWER(REGEXP_REPLACE(BTRIM(COALESCE(recipient."displayName", '')), '[[:space:]]+', ' ', 'g')) = ${separateName}
        AND (
          (
            recipient."sourceId" LIKE 'player-match-fee:%'
            AND NOT EXISTS (
              SELECT 1 FROM "PlayerMatchFee" fee
              WHERE recipient."sourceId" = 'player-match-fee:' || fee."id"
            )
          )
          OR (
            recipient."sourceId" LIKE 'fixture-selection:%'
            AND NOT EXISTS (
              SELECT 1 FROM "FixtureSelection" selection
              WHERE recipient."sourceId" = 'fixture-selection:' || selection."fixtureId" || ':' || selection."teamMemberId"
            )
          )
          OR (
            recipient."sourceId" LIKE 'team-prospect:%'
            AND NOT EXISTS (
              SELECT 1 FROM "TeamPlayerProspect" prospect
              WHERE recipient."sourceId" = 'team-prospect:' || prospect."id"
            )
          )
        )
      FOR UPDATE
    `);

    if (rows.length === 0) {
      return { quarantined: 0, rows: [] as UnresolvedSharedEmailRecipient[] };
    }

    const ids = rows.map((row) => row.id);

    await tx.$executeRaw(Prisma.sql`
      UPDATE "NotificationRecipient"
      SET
        "metadata" = COALESCE("metadata", '{}'::jsonb) || jsonb_build_object(
          'identityQuarantinedAt', NOW()::text,
          'identityQuarantineReason', 'Shared email repair: underlying player source no longer exists',
          'identityQuarantinePreviousEmail', COALESCE(NULLIF(BTRIM("emailNormalized"), ''), NULLIF(BTRIM("email"), '')),
          'identityQuarantinePreviousPhone', COALESCE(NULLIF(BTRIM("phoneNormalized"), ''), NULLIF(BTRIM("phone"), '')),
          'identityQuarantineSourceId', "sourceId"
        ),
        "email" = NULL,
        "emailNormalized" = NULL,
        "phone" = NULL,
        "phoneNormalized" = NULL,
        "lastSyncedAt" = NOW(),
        "updatedAt" = NOW()
      WHERE "id" IN (${Prisma.join(ids)})
    `);

    await tx.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "SharedEmailRecipientQuarantineAudit" (
        "id" TEXT PRIMARY KEY,
        "sharedEmail" TEXT NOT NULL,
        "separateName" TEXT NOT NULL,
        "recipientIds" JSONB NOT NULL,
        "actorUserId" TEXT,
        "actorEmail" TEXT,
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await tx.$executeRaw(Prisma.sql`
      INSERT INTO "SharedEmailRecipientQuarantineAudit" (
        "id", "sharedEmail", "separateName", "recipientIds", "actorUserId", "actorEmail", "createdAt"
      ) VALUES (
        ${randomUUID()}, ${sharedEmail}, ${input.separateName.trim()}, ${JSON.stringify(ids)}::jsonb,
        ${input.actorUserId ?? null}, ${input.actorEmail ?? null}, NOW()
      )
    `);

    return { quarantined: rows.length, rows };
  });
}
