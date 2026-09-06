import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

type Tx = Pick<Prisma.TransactionClient, "$queryRaw">;
type Db = { $transaction<T>(fn: (tx: Tx) => Promise<T>, options?: { timeout: number }): Promise<T> };

/** Queue mutex only: the callback commits its normal outbox writes, not money changes. */
export async function withTemporaryRequestLock<T>(feeId: string, queue: () => Promise<T>, db: Db = prisma) {
  return db.$transaction(async (tx) => {
    const key = `sixfl-temporary-fee-email:${feeId}`;
    const rows = await tx.$queryRaw<Array<{ locked: boolean }>>(Prisma.sql`
      SELECT pg_try_advisory_xact_lock(hashtextextended(${key}, 0)) AS locked
    `);
    if (!rows[0]?.locked) return { queued: 0, skipped: 0, status: "processing" as const };
    // The normal queue checks persisted QUEUED/PROCESSING/SENT rows. A lost response
    // is therefore safe to retry after the mutex is released. No provider send here.
    return queue();
  }, { timeout: 20000 });
}
