import { randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getPlayerRecruitmentMatches } from "./player-data-health-matches";

export type PlayerDataHealthExclusion = {
  recordType: string;
  recordId: string;
  userId: string;
};

export async function getPlayerDataHealthExclusions(db: Pick<typeof prisma, "$queryRaw"> = prisma) {
  return db.$queryRaw<PlayerDataHealthExclusion[]>(Prisma.sql`
    SELECT "recordType", "recordId", "userId"
    FROM "PlayerDataHealthExclusion"
  `).catch(() => [] as PlayerDataHealthExclusion[]);
}

export async function markPlayerDataHealthDifferentPeople(input: {
  kind: string;
  recordId: string;
  userId: string;
  fingerprint: string;
  actorUserId: string;
  reason: string;
}) {
  if (!["LEAD", "PROSPECT"].includes(input.kind)) throw new Error("Invalid recruitment record type.");
  const reason = input.reason.trim();
  if (reason.length < 5 || reason.length > 1000) throw new Error("Add a brief reason (5–1000 characters).");
  const actor = await prisma.user.findUnique({ where: { id: input.actorUserId }, select: { role: true } });
  if (actor?.role !== "ADMIN") throw new Error("Administrator access is required.");

  return prisma.$transaction(async (db) => {
    const match = (await getPlayerRecruitmentMatches(db)).find(
      (row) => row.record.kind === input.kind && row.record.id === input.recordId,
    );
    if (!match || match.fingerprint !== input.fingerprint) {
      throw new Error("This review has changed. Refresh and check it again.");
    }
    if (!match.candidates.some((candidate) => candidate.userId === input.userId)) {
      throw new Error("That registered player is no longer a possible match.");
    }

    await db.$executeRaw(Prisma.sql`
      INSERT INTO "PlayerDataHealthExclusion" (
        "id", "recordType", "recordId", "userId", "actorUserId", "reason", "fingerprint", "createdAt"
      ) VALUES (
        ${randomUUID()}, ${input.kind}, ${input.recordId}, ${input.userId}, ${input.actorUserId}, ${reason}, ${input.fingerprint}, NOW()
      )
      ON CONFLICT ("recordType", "recordId", "userId") DO UPDATE SET
        "actorUserId" = EXCLUDED."actorUserId",
        "reason" = EXCLUDED."reason",
        "fingerprint" = EXCLUDED."fingerprint",
        "createdAt" = NOW()
    `);
    return { recordId: input.recordId, userId: input.userId, enquiryTeamId: match.record.teamId };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, maxWait: 5000, timeout: 15000 });
}
