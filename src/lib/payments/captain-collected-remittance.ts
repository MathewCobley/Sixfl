import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";

export const CAPTAIN_COLLECTED_NOTE_MARKERS = [
  "No individual player payment link: captain/organiser marked this",
  "Paid captain directly: captain collected",
] as const;

export const CAPTAIN_COLLECTION_REMOVED_NOTE_MARKER =
  "Removed from captain collection: resolved privately";

export type CaptainCollectedRemittanceEntry = {
  chargeId: string;
  teamId: string;
  fixtureId: string;
};

export type CaptainCollectedRemittanceSnapshot = {
  collectedPence: number;
  collectedPlayerCount: number;
  removedPence: number;
  removedPlayerCount: number;
  removalNotes: string[];
  remittedPence: number;
  pendingPence: number;
  unremittedPence: number;
  availablePence: number;
};

function key(teamId: string, fixtureId: string) {
  return `${teamId}:${fixtureId}`;
}

function lastIndexOfInsensitive(value: string, marker: string) {
  return value.toLowerCase().lastIndexOf(marker.toLowerCase());
}

function latestCaptainCollectedIndex(note?: string | null) {
  const value = note ?? "";
  return Math.max(
    ...CAPTAIN_COLLECTED_NOTE_MARKERS.map((marker) =>
      lastIndexOfInsensitive(value, marker),
    ),
  );
}

export function isCaptainCollectionRemovedNote(note?: string | null) {
  const value = note ?? "";
  const removedIndex = lastIndexOfInsensitive(
    value,
    CAPTAIN_COLLECTION_REMOVED_NOTE_MARKER,
  );
  const collectedIndex = latestCaptainCollectedIndex(value);

  return removedIndex >= 0 && removedIndex > collectedIndex;
}

export function isCaptainCollectionActiveNote(note?: string | null) {
  const value = note ?? "";
  const collectedIndex = latestCaptainCollectedIndex(value);
  const removedIndex = lastIndexOfInsensitive(
    value,
    CAPTAIN_COLLECTION_REMOVED_NOTE_MARKER,
  );

  return collectedIndex >= 0 && collectedIndex > removedIndex;
}

export function getLatestCaptainCollectionRemovalNote(note?: string | null) {
  const lines = (note ?? "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  for (let index = lines.length - 1; index >= 0; index -= 1) {
    if (
      lines[index]
        .toLowerCase()
        .includes(CAPTAIN_COLLECTION_REMOVED_NOTE_MARKER.toLowerCase())
    ) {
      return lines[index];
    }
  }

  return null;
}

export async function ensureCaptainCollectedRemittanceTable() {
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "CaptainCollectedRemittanceCheckout" (
      "checkoutSessionId" TEXT NOT NULL,
      "teamId" TEXT NOT NULL,
      "chargeId" TEXT NOT NULL,
      "fixtureId" TEXT NOT NULL,
      "amountPence" INTEGER NOT NULL,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "CaptainCollectedRemittanceCheckout_pkey" PRIMARY KEY ("checkoutSessionId")
    );
  `);

  await prisma.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS "CaptainCollectedRemittanceCheckout_chargeId_idx"
      ON "CaptainCollectedRemittanceCheckout"("chargeId");
  `);

  await prisma.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS "CaptainCollectedRemittanceCheckout_team_fixture_idx"
      ON "CaptainCollectedRemittanceCheckout"("teamId", "fixtureId");
  `);
}

function emptySnapshot(): CaptainCollectedRemittanceSnapshot {
  return {
    collectedPence: 0,
    collectedPlayerCount: 0,
    removedPence: 0,
    removedPlayerCount: 0,
    removalNotes: [],
    remittedPence: 0,
    pendingPence: 0,
    unremittedPence: 0,
    availablePence: 0,
  };
}

export async function getCaptainCollectedRemittanceSnapshots(
  entries: CaptainCollectedRemittanceEntry[],
) {
  const uniqueEntries = Array.from(
    new Map(entries.map((entry) => [entry.chargeId, entry])).values(),
  );
  const snapshots = new Map<string, CaptainCollectedRemittanceSnapshot>();

  for (const entry of uniqueEntries) {
    snapshots.set(entry.chargeId, emptySnapshot());
  }

  if (uniqueEntries.length === 0) return snapshots;

  await ensureCaptainCollectedRemittanceTable();

  const teamIds = Array.from(new Set(uniqueEntries.map((entry) => entry.teamId)));
  const fixtureIds = Array.from(new Set(uniqueEntries.map((entry) => entry.fixtureId)));
  const chargeIds = uniqueEntries.map((entry) => entry.chargeId);

  const [collectedFees, remittanceRows] = await Promise.all([
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
        note: true,
      },
    }),
    prisma.$queryRaw<
      Array<{ chargeId: string; remittedPence: number; pendingPence: number }>
    >(Prisma.sql`
      SELECT
        remittance."chargeId" AS "chargeId",
        COALESCE(SUM(
          CASE WHEN payment."id" IS NOT NULL THEN remittance."amountPence" ELSE 0 END
        ), 0)::int AS "remittedPence",
        COALESCE(SUM(
          CASE
            WHEN payment."id" IS NULL
              AND remittance."createdAt" >= CURRENT_TIMESTAMP - INTERVAL '24 hours'
            THEN remittance."amountPence"
            ELSE 0
          END
        ), 0)::int AS "pendingPence"
      FROM "CaptainCollectedRemittanceCheckout" remittance
      LEFT JOIN "PaymentTransaction" payment
        ON payment."stripeCheckoutSessionId" = remittance."checkoutSessionId"
      WHERE remittance."chargeId" IN (${Prisma.join(chargeIds)})
      GROUP BY remittance."chargeId"
    `),
  ]);

  const collectedByTeamFixture = new Map<
    string,
    { amountPence: number; playerCount: number }
  >();
  const removedByTeamFixture = new Map<
    string,
    { amountPence: number; playerCount: number; notes: string[] }
  >();

  for (const fee of collectedFees) {
    const feeKey = key(fee.teamId, fee.fixtureId);

    if (isCaptainCollectionActiveNote(fee.note)) {
      const current = collectedByTeamFixture.get(feeKey) ?? {
        amountPence: 0,
        playerCount: 0,
      };
      current.amountPence += fee.amountPence;
      current.playerCount += 1;
      collectedByTeamFixture.set(feeKey, current);
      continue;
    }

    if (isCaptainCollectionRemovedNote(fee.note)) {
      const current = removedByTeamFixture.get(feeKey) ?? {
        amountPence: 0,
        playerCount: 0,
        notes: [],
      };
      current.amountPence += fee.amountPence;
      current.playerCount += 1;
      const removalNote = getLatestCaptainCollectionRemovalNote(fee.note);
      if (removalNote && !current.notes.includes(removalNote)) {
        current.notes.push(removalNote);
      }
      removedByTeamFixture.set(feeKey, current);
    }
  }

  const remittanceByCharge = new Map(
    remittanceRows.map((row) => [
      row.chargeId,
      {
        remittedPence: Number(row.remittedPence ?? 0),
        pendingPence: Number(row.pendingPence ?? 0),
      },
    ]),
  );

  for (const entry of uniqueEntries) {
    const entryKey = key(entry.teamId, entry.fixtureId);
    const collected = collectedByTeamFixture.get(entryKey) ?? {
      amountPence: 0,
      playerCount: 0,
    };
    const removed = removedByTeamFixture.get(entryKey) ?? {
      amountPence: 0,
      playerCount: 0,
      notes: [],
    };
    const remittance = remittanceByCharge.get(entry.chargeId) ?? {
      remittedPence: 0,
      pendingPence: 0,
    };
    const unremittedPence = Math.max(
      collected.amountPence - remittance.remittedPence,
      0,
    );
    const availablePence = Math.max(
      unremittedPence - remittance.pendingPence,
      0,
    );

    snapshots.set(entry.chargeId, {
      collectedPence: collected.amountPence,
      collectedPlayerCount: collected.playerCount,
      removedPence: removed.amountPence,
      removedPlayerCount: removed.playerCount,
      removalNotes: removed.notes,
      remittedPence: remittance.remittedPence,
      pendingPence: remittance.pendingPence,
      unremittedPence,
      availablePence,
    });
  }

  return snapshots;
}

export async function getCaptainCollectedRemittanceSnapshot(
  entry: CaptainCollectedRemittanceEntry,
) {
  const snapshots = await getCaptainCollectedRemittanceSnapshots([entry]);
  return snapshots.get(entry.chargeId) ?? emptySnapshot();
}
