// ========================================
// File: scripts/backfill-fixture-match-fee-team-threads.ts
// ========================================

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

type Candidate = {
  threadId: string;
  teamId: string;
  leagueId: string | null;
  contactName: string;
  contactEmail: string | null;
  contactPhone: string | null;
  recipientId: string | null;
  emailNormalized: string | null;
  phoneNormalized: string | null;
};

async function main() {
  const candidates = await prisma.$queryRaw<Candidate[]>`
    SELECT DISTINCT ON (mt."id")
      mt."id" AS "threadId",
      pc."teamId" AS "teamId",
      pc."leagueId" AS "leagueId",
      t."name" AS "contactName",
      t."contactEmail" AS "contactEmail",
      t."contactPhone" AS "contactPhone",
      nd."recipientId" AS "recipientId",
      nr."emailNormalized" AS "emailNormalized",
      nr."phoneNormalized" AS "phoneNormalized"
    FROM "MessageThread" mt
    INNER JOIN "MessageEntry" me
      ON me."threadId" = mt."id"
    INNER JOIN "NotificationDispatch" nd
      ON nd."id" = me."notificationDispatchId"
    INNER JOIN "PaymentCharge" pc
      ON pc."id" = COALESCE(NULLIF(nd."sourceId", ''), nd."metadata"->>'chargeId')
    INNER JOIN "Team" t
      ON t."id" = pc."teamId"
    LEFT JOIN "NotificationRecipient" nr
      ON nr."id" = nd."recipientId"
    WHERE nd."sourceType" IN ('FIXTURE_MATCH_FEE', 'FIXTURE_MATCH_FEE_REMINDER')
      AND (
        mt."sourceType" IS DISTINCT FROM 'TEAM'
        OR mt."sourceId" IS DISTINCT FROM pc."teamId"
        OR mt."teamId" IS DISTINCT FROM pc."teamId"
        OR mt."leagueId" IS DISTINCT FROM pc."leagueId"
      )
    ORDER BY mt."id", nd."createdAt" DESC
  `;

  let updated = 0;

  for (const candidate of candidates) {
    await prisma.messageThread.update({
      where: { id: candidate.threadId },
      data: {
        recipientId: candidate.recipientId,
        teamId: candidate.teamId,
        leagueId: candidate.leagueId,
        sourceType: "TEAM",
        sourceId: candidate.teamId,
        contactName: candidate.contactName,
        contactEmail: candidate.contactEmail,
        contactPhone: candidate.contactPhone,
        emailNormalized: candidate.emailNormalized,
        phoneNormalized: candidate.phoneNormalized,
      },
    });

    updated += 1;
  }

  console.log(
    `Fixture match fee thread backfill complete. Updated ${updated} thread(s).`,
  );
}

main()
  .catch((error) => {
    console.error("backfill-fixture-match-fee-team-threads failed", error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
