import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import {
  getPaymentReceiptKind,
  getPaymentReceiptPlayerFeeId,
} from "@/lib/payments/payment-receipt-presentation";
import { LEDGER_TRANSACTION_PREFIX } from "@/lib/payments/player-ledger-markers";
import type { AdminActivityItem } from "./latest-activity";

const feeSelect = {
  id: true,
  amountPence: true,
  paidAt: true,
  team: { select: { id: true, name: true } },
  teamMember: { select: { user: { select: { name: true, email: true } } } },
  prospect: { select: { firstName: true, lastName: true, email: true } },
} satisfies Prisma.PlayerMatchFeeSelect;

type FeeIdentity = Prisma.PlayerMatchFeeGetPayload<{ select: typeof feeSelect }>;

function playerName(fee: FeeIdentity | undefined) {
  const user = fee?.teamMember?.user;
  const prospect = fee?.prospect;
  return user?.name?.trim() ||
    [prospect?.firstName, prospect?.lastName].filter(Boolean).join(" ").trim() ||
    user?.email?.trim() || prospect?.email?.trim() || "Player";
}

function money(amountPence: number) {
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: "GBP",
  }).format(amountPence / 100);
}

/** Read-only presentation. A transaction is a receipt; a fee's PAID state is
 * not a second payment. Use the explicit fee reference, never amount/name/time.
 * Unmatched historic fee records remain visible rather than guessing a match. */
export async function getAdminPaymentActivity(limit: number): Promise<AdminActivityItem[]> {
  const take = Math.max(1, Math.min(100, Math.trunc(limit) || 50));
  const [receipts, fallbackIds] = await Promise.all([
    prisma.paymentTransaction.findMany({
      where: { amountPence: { not: 0 } },
      orderBy: [{ paidAt: "desc" }, { id: "desc" }],
      take,
      select: {
        id: true,
        amountPence: true,
        paidAt: true,
        method: true,
        reference: true,
        notes: true,
        team: { select: { id: true, name: true } },
        charge: { select: { title: true } },
      },
    }),
    // Exclude mirrored fee states BEFORE limiting the history. Looking only at
    // the recent receipt page could resurrect a duplicate whose receipt is old.
    // These two explicit markers match getPaymentReceiptPlayerFeeId, including
    // its case-sensitive modern prefix and case-insensitive reference labels.
    prisma.$queryRaw<Array<{ id: string }>>(Prisma.sql`
      SELECT fee."id"
      FROM "PlayerMatchFee" fee
      WHERE fee."status" = 'PAID' AND fee."paidAt" IS NOT NULL
        AND fee."amountPence" > 0
        AND NOT EXISTS (
          SELECT 1 FROM "PaymentTransaction" receipt
          WHERE receipt."teamId" = fee."teamId"
            AND receipt."amountPence" > 0
            AND CASE
              WHEN LEFT(COALESCE(receipt."notes", ''), LENGTH(${LEDGER_TRANSACTION_PREFIX})) = ${LEDGER_TRANSACTION_PREFIX}
              THEN SUBSTRING(receipt."notes" FROM '(?i)Account fee reference:[[:space:]]*([a-zA-Z0-9_-]+)')
              ELSE SUBSTRING(receipt."notes" FROM '(?i)Player fee ID:[[:space:]]*([a-zA-Z0-9_-]+)')
            END = fee."id"
        )
      ORDER BY fee."paidAt" DESC, fee."id" DESC
      LIMIT ${take}
    `),
  ]);

  const feeIds = new Set(fallbackIds.map((fee) => fee.id));
  for (const receipt of receipts) {
    if (getPaymentReceiptKind(receipt) !== "PLAYER") continue;
    const feeId = getPaymentReceiptPlayerFeeId(receipt.notes);
    if (feeId) feeIds.add(feeId);
  }
  // Include OPEN/PART_PAID fee identities too: each partial receipt is real and
  // must not disappear just because the player's overall fee is not PAID yet.
  const fees = feeIds.size
    ? await prisma.playerMatchFee.findMany({
        where: { id: { in: [...feeIds] } },
        select: feeSelect,
      })
    : [];
  const feesById = new Map(fees.map((fee) => [fee.id, fee]));
  const activity: AdminActivityItem[] = [];

  for (const receipt of receipts) {
    const kind = getPaymentReceiptKind(receipt);
    const feeId = kind === "PLAYER" ? getPaymentReceiptPlayerFeeId(receipt.notes) : null;
    const candidate = feeId ? feesById.get(feeId) : undefined;
    const fee = candidate?.team.id === receipt.team.id ? candidate : undefined;
    const amount = money(Math.abs(receipt.amountPence));
    const refund = receipt.amountPence < 0;
    const detail = receipt.charge?.title ||
      (kind === "PLAYER" ? "player match fee" : `Team payment · ${receipt.method.toLowerCase().replace(/_/g, " ")}`);

    activity.push({
      // Always use the receipt identity: two equal payments stay two events.
      id: `team-payment:${receipt.id}`,
      kind: kind === "PLAYER" ? "PLAYER_PAYMENT" : "TEAM_PAYMENT",
      title: kind === "PLAYER"
        ? refund
          ? `${playerName(fee)} received a ${amount} refund`
          : `${playerName(fee)} paid ${amount}`
        : kind === "TEAM_CREDIT"
          ? `${amount} team credit ${refund ? "reversed" : "used"} · ${receipt.team.name}`
          : refund
            ? `${amount} refunded to ${receipt.team.name}`
            : `${amount} payment received from ${receipt.team.name}`,
      detail: kind === "PLAYER" ? `${receipt.team.name} · ${detail}` : detail,
      occurredAt: receipt.paidAt,
      href: `/admin/payments?teamId=${encodeURIComponent(receipt.team.id)}&view=${kind === "PLAYER" ? "playerFees" : "recentPayments"}`,
    });
  }

  for (const { id } of fallbackIds) {
    const fee = feesById.get(id);
    if (!fee?.paidAt) continue;
    // A receipt could have arrived between the two reads. Do not show both.
    if (receipts.some((receipt) => receipt.amountPence > 0 &&
      receipt.team.id === fee.team.id &&
      getPaymentReceiptKind(receipt) === "PLAYER" &&
      getPaymentReceiptPlayerFeeId(receipt.notes) === id)) continue;
    activity.push({
      id: `player-payment:${fee.id}`,
      kind: "PLAYER_PAYMENT",
      title: `${playerName(fee)} paid ${money(fee.amountPence)}`,
      detail: `${fee.team.name} · player match fee`,
      occurredAt: fee.paidAt,
      href: `/admin/payments?teamId=${encodeURIComponent(fee.team.id)}&view=playerFees`,
    });
  }

  return activity;
}
