import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";

export const CAPTAIN_COLLECTED_NOTE_MARKERS = [
  "No individual player payment link: captain/organiser marked this",
  "Paid captain directly: captain collected",
] as const;

export type CaptainCollectedRemittanceEntry = {
  chargeId: string;
  teamId: string;
  fixtureId: string;
};

export type CaptainCollectedRemittanceSnapshot = {
  collectedPence: number;
  collectedPlayerCount: number;
  remittedPence: number;
  unremittedPence: number;
};

function key(teamId: string, fixtureId: string) {
  return `${teamId}:${fixtureId}`;
}

export async function getCaptainCollectedRemittanceSnapshots(
  entries: CaptainCollectedRemittanceEntry[],
) {
  const uniqueEntries = Array.from(
    new Map(entries.map((entry) => [entry.chargeId, entry])).values(),
  );
  const snapshots = new Map<string, CaptainCollectedRemittanceSnapshot>();

  for (const entry of uniqueEntries) {
    snapshots.set(entry.chargeId, {
      collectedPence: 0,
      collectedPlayerCount: 0,
      remittedPence: 0,
      unremittedPence: 0,
    });
  }

  if (uniqueEntries.length === 0) return snapshots;

  const teamIds = Array.from(new Set(uniqueEntries.map((entry) => entry.teamId)));
  const fixtureIds = Array.from(new Set(uniqueEntries.map((entry) => entry.fixtureId)));
  const chargeIds = uniqueEntries.map((entry) => entry.chargeId);

  const [collectedFees, remittedRows] = await Promise.all([
    prisma.playerMatchFee.findMany({
      where: {
        teamId: { in: teamIds },
        fixtureId: { in: fixtureIds },
        status: "WAIVED",
        OR: CAPTAIN_COLLECTED_NOTE_MARKERS.map((marker) => ({
          note: { contains: marker, mode: "insensitive" as const },
        })),
      },
      select: {
        teamId: true,
        fixtureId: true,
        amountPence: true,
      },
    }),
    prisma.$queryRaw<Array<{ chargeId: string; remittedPence: number }>>(Prisma.sql`
      SELECT
        remittance."chargeId" AS "chargeId",
        COALESCE(SUM(remittance."amountPence"), 0)::int AS "remittedPence"
      FROM "CaptainCollectedRemittanceCheckout" remittance
      INNER JOIN "PaymentTransaction" payment
        ON payment."stripeCheckoutSessionId" = remittance."checkoutSessionId"
      WHERE remittance."chargeId" IN (${Prisma.join(chargeIds)})
      GROUP BY remittance."chargeId"
    `),
  ]);

  const collectedByTeamFixture = new Map<
    string,
    { amountPence: number; playerCount: number }
  >();

  for (const fee of collectedFees) {
    const feeKey = key(fee.teamId, fee.fixtureId);
    const current = collectedByTeamFixture.get(feeKey) ?? {
      amountPence: 0,
      playerCount: 0,
    };
    current.amountPence += fee.amountPence;
    current.playerCount += 1;
    collectedByTeamFixture.set(feeKey, current);
  }

  const remittedByCharge = new Map(
    remittedRows.map((row) => [row.chargeId, Number(row.remittedPence ?? 0)]),
  );

  for (const entry of uniqueEntries) {
    const collected = collectedByTeamFixture.get(key(entry.teamId, entry.fixtureId)) ?? {
      amountPence: 0,
      playerCount: 0,
    };
    const remittedPence = remittedByCharge.get(entry.chargeId) ?? 0;
    snapshots.set(entry.chargeId, {
      collectedPence: collected.amountPence,
      collectedPlayerCount: collected.playerCount,
      remittedPence,
      unremittedPence: Math.max(collected.amountPence - remittedPence, 0),
    });
  }

  return snapshots;
}

export async function getCaptainCollectedRemittanceSnapshot(
  entry: CaptainCollectedRemittanceEntry,
) {
  const snapshots = await getCaptainCollectedRemittanceSnapshots([entry]);
  return (
    snapshots.get(entry.chargeId) ?? {
      collectedPence: 0,
      collectedPlayerCount: 0,
      remittedPence: 0,
      unremittedPence: 0,
    }
  );
}
