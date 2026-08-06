import { randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";

type AuditClient = Pick<typeof prisma, "$executeRawUnsafe" | "$queryRaw">;

export type SquadMembershipAudit = {
  teamMemberId: string;
  source: string;
  createdByUserId: string | null;
  sourceRecordId: string | null;
  detail: string | null;
  createdAt: Date;
};

async function ensureAuditTable(client: AuditClient) {
  await client.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "TeamMemberCreationAudit" (
      "id" TEXT NOT NULL,
      "teamMemberId" TEXT NOT NULL,
      "source" TEXT NOT NULL,
      "createdByUserId" TEXT,
      "sourceRecordId" TEXT,
      "detail" TEXT,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "TeamMemberCreationAudit_pkey" PRIMARY KEY ("id")
    );
  `);

  await client.$executeRawUnsafe(`
    CREATE UNIQUE INDEX IF NOT EXISTS "TeamMemberCreationAudit_teamMemberId_key"
    ON "TeamMemberCreationAudit"("teamMemberId");
  `);

  await client.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS "TeamMemberCreationAudit_createdByUserId_idx"
    ON "TeamMemberCreationAudit"("createdByUserId");
  `);

  await client.$executeRawUnsafe(`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'TeamMemberCreationAudit_teamMemberId_fkey'
      ) THEN
        ALTER TABLE "TeamMemberCreationAudit"
          ADD CONSTRAINT "TeamMemberCreationAudit_teamMemberId_fkey"
          FOREIGN KEY ("teamMemberId") REFERENCES "TeamMember"("id")
          ON DELETE CASCADE ON UPDATE CASCADE;
      END IF;
    END $$;
  `);
}

export async function recordSquadMembershipCreation(input: {
  client?: AuditClient;
  teamMemberId: string;
  source: string;
  createdByUserId?: string | null;
  sourceRecordId?: string | null;
  detail?: string | null;
}) {
  const client = input.client ?? prisma;
  await ensureAuditTable(client);

  await client.$executeRawUnsafe(
    `
      INSERT INTO "TeamMemberCreationAudit" (
        "id", "teamMemberId", "source", "createdByUserId",
        "sourceRecordId", "detail", "createdAt"
      ) VALUES ($1, $2, $3, $4, $5, $6, NOW())
      ON CONFLICT ("teamMemberId") DO UPDATE SET
        "source" = EXCLUDED."source",
        "createdByUserId" = COALESCE(EXCLUDED."createdByUserId", "TeamMemberCreationAudit"."createdByUserId"),
        "sourceRecordId" = COALESCE(EXCLUDED."sourceRecordId", "TeamMemberCreationAudit"."sourceRecordId"),
        "detail" = COALESCE(EXCLUDED."detail", "TeamMemberCreationAudit"."detail")
    `,
    randomUUID(),
    input.teamMemberId,
    input.source,
    input.createdByUserId ?? null,
    input.sourceRecordId ?? null,
    input.detail ?? null,
  );
}

export async function getSquadMembershipAudits(teamMemberIds: string[]) {
  if (teamMemberIds.length === 0) return new Map<string, SquadMembershipAudit>();

  try {
    await ensureAuditTable(prisma);
    const rows = await prisma.$queryRaw<SquadMembershipAudit[]>(Prisma.sql`
      SELECT
        "teamMemberId",
        "source",
        "createdByUserId",
        "sourceRecordId",
        "detail",
        "createdAt"
      FROM "TeamMemberCreationAudit"
      WHERE "teamMemberId" IN (${Prisma.join(teamMemberIds)})
    `);
    return new Map(rows.map((row) => [row.teamMemberId, row]));
  } catch {
    return new Map<string, SquadMembershipAudit>();
  }
}
