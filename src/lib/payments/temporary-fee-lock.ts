import { Prisma } from "@prisma/client";

export async function lockTemporaryFixtureFee(
  tx: Pick<Prisma.TransactionClient, "$executeRaw">,
  input: { fixtureId: string; teamId: string; userId: string },
) {
  // The pass route and approved-guest route must use the same identity lock.
  const key = JSON.stringify(["sixfl-temporary-fee", input.fixtureId, input.teamId, input.userId]);
  await tx.$executeRaw(Prisma.sql`SELECT pg_advisory_xact_lock(hashtextextended(${key}, 0))`);
}
