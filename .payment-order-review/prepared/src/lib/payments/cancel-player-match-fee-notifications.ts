// ========================================
// File: src/lib/payments/cancel-player-match-fee-notifications.ts
// ========================================

import { NotificationDispatchStatus } from "@prisma/client";

import { prisma } from "@/lib/prisma";

const PLAYER_MATCH_FEE_NOTIFICATION_SOURCE_TYPES = [
  "PLAYER_MATCH_FEE_REQUEST",
  "PLAYER_MATCH_FEE_CHASE_24H",
  "PLAYER_MATCH_FEE_CHASE_72H",
];

export async function cancelQueuedPlayerMatchFeeNotificationDispatches(
  feeIds: string[],
  reason = "Player match fee was voided before queued payment reminders were sent.",
) {
  const uniqueFeeIds = Array.from(new Set(feeIds.filter(Boolean)));

  if (uniqueFeeIds.length === 0) {
    return;
  }

  await prisma.notificationDispatch.updateMany({
    where: {
      sourceType: {
        in: PLAYER_MATCH_FEE_NOTIFICATION_SOURCE_TYPES,
      },
      sourceId: {
        in: uniqueFeeIds,
      },
      status: NotificationDispatchStatus.QUEUED,
    },
    data: {
      status: NotificationDispatchStatus.CANCELLED,
      cancelledAt: new Date(),
      failureReason: reason,
    },
  });
}
