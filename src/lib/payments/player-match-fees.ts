// ========================================
// File: src/lib/payments/player-match-fees.ts
// ========================================

import { randomBytes } from "node:crypto";
import { PlayerMatchFeeStatus } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { getPublicSiteUrl } from "@/lib/stripe/client";

function createPlayerMatchFeeToken() {
  return randomBytes(24).toString("hex");
}

export function buildPlayerMatchFeePaymentPath(paymentToken: string) {
  return `/pay/player-match-fee/${paymentToken}`;
}

export function buildPlayerMatchFeePaymentUrl(paymentToken: string) {
  return new URL(
    buildPlayerMatchFeePaymentPath(paymentToken),
    `${getPublicSiteUrl()}/`,
  ).toString();
}

export async function ensurePlayerMatchFeePaymentDetails(feeId: string) {
  const fee = await prisma.playerMatchFee.findUnique({
    where: { id: feeId },
    select: {
      id: true,
      paymentToken: true,
      paymentUrl: true,
      status: true,
    },
  });

  if (!fee) return null;

  if (fee.status !== PlayerMatchFeeStatus.OPEN) {
    return fee;
  }

  const token = fee.paymentToken || createPlayerMatchFeeToken();
  const paymentUrl = buildPlayerMatchFeePaymentUrl(token);

  if (fee.paymentToken === token && fee.paymentUrl === paymentUrl) {
    return fee;
  }

  return prisma.playerMatchFee.update({
    where: { id: fee.id },
    data: {
      paymentToken: token,
      paymentUrl,
    },
    select: {
      id: true,
      paymentToken: true,
      paymentUrl: true,
      status: true,
    },
  });
}

export async function ensurePlayerMatchFeePaymentDetailsForFees(feeIds: string[]) {
  const uniqueFeeIds = Array.from(new Set(feeIds.filter(Boolean)));

  for (const feeId of uniqueFeeIds) {
    await ensurePlayerMatchFeePaymentDetails(feeId);
  }
}
