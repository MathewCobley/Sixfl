// ========================================
// File: src/lib/payments/player-match-fee-snapshots.ts
// ========================================

import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";

export type PlayerMatchFeeSnapshot = {
  name: string | null;
  email: string | null;
  phone: string | null;
};

type SnapshotRow = {
  id: string;
  playerNameSnapshot: string | null;
  playerEmailSnapshot: string | null;
  playerPhoneSnapshot: string | null;
};

export function cleanSnapshotValue(value: string | null | undefined) {
  const cleaned = value?.trim();
  return cleaned || null;
}

export function buildPlayerNameSnapshot(input: {
  name?: string | null;
  email?: string | null;
  phone?: string | null;
  firstName?: string | null;
  lastName?: string | null;
}) {
  const fullName = [input.firstName, input.lastName]
    .map((part) => cleanSnapshotValue(part))
    .filter(Boolean)
    .join(" ")
    .trim();

  return (
    cleanSnapshotValue(input.name) ||
    cleanSnapshotValue(fullName) ||
    cleanSnapshotValue(input.email) ||
    cleanSnapshotValue(input.phone)
  );
}

export async function setPlayerMatchFeeSnapshot(input: {
  feeId: string;
  snapshot: PlayerMatchFeeSnapshot;
}) {
  await prisma.$executeRaw`
    UPDATE "PlayerMatchFee"
    SET
      "playerNameSnapshot" = COALESCE(${cleanSnapshotValue(input.snapshot.name)}, "playerNameSnapshot"),
      "playerEmailSnapshot" = COALESCE(${cleanSnapshotValue(input.snapshot.email)}, "playerEmailSnapshot"),
      "playerPhoneSnapshot" = COALESCE(${cleanSnapshotValue(input.snapshot.phone)}, "playerPhoneSnapshot")
    WHERE "id" = ${input.feeId}
  `;
}

export async function getPlayerMatchFeeSnapshots(feeIds: string[]) {
  const uniqueFeeIds = Array.from(new Set(feeIds.filter(Boolean)));
  if (uniqueFeeIds.length === 0) return new Map<string, PlayerMatchFeeSnapshot>();

  const rows = await prisma.$queryRaw<SnapshotRow[]>`
    SELECT
      "id",
      "playerNameSnapshot",
      "playerEmailSnapshot",
      "playerPhoneSnapshot"
    FROM "PlayerMatchFee"
    WHERE "id" IN (${Prisma.join(uniqueFeeIds)})
  `;

  return new Map(
    rows.map((row) => [
      row.id,
      {
        name: row.playerNameSnapshot,
        email: row.playerEmailSnapshot,
        phone: row.playerPhoneSnapshot,
      },
    ]),
  );
}

export async function recoverPlayerMatchFeeSnapshotFromNotifications(feeId: string) {
  const rows = await prisma.$queryRaw<Array<{
    displayName: string | null;
    email: string | null;
    phone: string | null;
  }>>`
    SELECT
      nr."displayName",
      nr."email",
      nr."phone"
    FROM "NotificationDispatch" nd
    JOIN "NotificationRecipient" nr ON nr."id" = nd."recipientId"
    WHERE nd."sourceType" IN (
      'PLAYER_MATCH_FEE_REQUEST',
      'PLAYER_MATCH_FEE_CHASE_24H',
      'PLAYER_MATCH_FEE_CHASE_72H'
    )
      AND nd."sourceId" = ${feeId}
    ORDER BY COALESCE(nd."sentAt", nd."scheduledFor", nd."createdAt") DESC
    LIMIT 1
  `;

  const row = rows[0];
  if (!row) return null;

  const snapshot = {
    name: buildPlayerNameSnapshot({
      name: row.displayName,
      email: row.email,
      phone: row.phone,
    }),
    email: cleanSnapshotValue(row.email),
    phone: cleanSnapshotValue(row.phone),
  };

  await setPlayerMatchFeeSnapshot({ feeId, snapshot });
  return snapshot;
}
