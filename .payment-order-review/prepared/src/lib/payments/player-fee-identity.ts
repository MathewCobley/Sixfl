import { NotificationRecipientSourceType } from "@prisma/client";

import { prisma } from "@/lib/prisma";

export type HistoricalPlayerFeeIdentity = {
  feeId: string;
  displayName: string | null;
  email: string | null;
  phone: string | null;
  recoveredFrom: "recipient" | "dispatch";
};

const PLAYER_FEE_DISPATCH_TYPES = [
  "PLAYER_MATCH_FEE_REQUEST",
  "PLAYER_MATCH_FEE_CHASE_24H",
  "PLAYER_MATCH_FEE_CHASE_72H",
];

function clean(value: string | null | undefined) {
  const trimmed = value?.trim();
  return trimmed || null;
}

export async function getHistoricalPlayerFeeIdentities(feeIds: string[]) {
  const uniqueFeeIds = Array.from(new Set(feeIds.filter(Boolean)));
  const result = new Map<string, HistoricalPlayerFeeIdentity>();

  if (uniqueFeeIds.length === 0) return result;

  const recipientSourceIds = uniqueFeeIds.map((feeId) => `player-match-fee:${feeId}`);
  const recipients = await prisma.notificationRecipient.findMany({
    where: {
      sourceType: NotificationRecipientSourceType.GENERAL,
      sourceId: { in: recipientSourceIds },
    },
    select: {
      sourceId: true,
      displayName: true,
      email: true,
      phone: true,
    },
  });

  for (const recipient of recipients) {
    const sourceId = recipient.sourceId ?? "";
    const feeId = sourceId.startsWith("player-match-fee:")
      ? sourceId.slice("player-match-fee:".length)
      : "";
    if (!feeId) continue;

    result.set(feeId, {
      feeId,
      displayName: clean(recipient.displayName),
      email: clean(recipient.email),
      phone: clean(recipient.phone),
      recoveredFrom: "recipient",
    });
  }

  const missingFeeIds = uniqueFeeIds.filter((feeId) => !result.has(feeId));
  if (missingFeeIds.length === 0) return result;

  const dispatches = await prisma.notificationDispatch.findMany({
    where: {
      sourceId: { in: missingFeeIds },
      sourceType: { in: PLAYER_FEE_DISPATCH_TYPES },
    },
    orderBy: [{ createdAt: "desc" }],
    select: {
      sourceId: true,
      recipient: {
        select: {
          displayName: true,
          email: true,
          phone: true,
        },
      },
    },
  });

  for (const dispatch of dispatches) {
    const feeId = dispatch.sourceId ?? "";
    if (!feeId || result.has(feeId)) continue;

    result.set(feeId, {
      feeId,
      displayName: clean(dispatch.recipient.displayName),
      email: clean(dispatch.recipient.email),
      phone: clean(dispatch.recipient.phone),
      recoveredFrom: "dispatch",
    });
  }

  return result;
}
