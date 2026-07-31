const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");

function replaceOnce(filePath, before, after, label) {
  const absolutePath = path.join(root, filePath);
  const source = fs.readFileSync(absolutePath, "utf8");

  if (source.includes(after)) return;
  if (!source.includes(before)) {
    throw new Error(`Expected ${label} source was not found in ${filePath}`);
  }

  fs.writeFileSync(absolutePath, source.replace(before, after), "utf8");
}

const webhookPath = "src/app/api/stripe/webhook/route.ts";

replaceOnce(
  webhookPath,
  [
    'import { cancelQueuedPlayerMatchFeeNotificationDispatches } from "@/lib/payments/cancel-player-match-fee-notifications";',
    'import { reconcileFixtureChargeFromPlayerPayments } from "@/lib/payments/player-match-fee-reconciliation";',
  ].join("\n"),
  [
    'import { cancelQueuedPlayerMatchFeeNotificationDispatches } from "@/lib/payments/cancel-player-match-fee-notifications";',
    'import { getTeamPaymentLedger } from "@/lib/payments/team-payment-ledger";',
    'import { reconcileFixtureChargeFromPlayerPayments } from "@/lib/payments/player-match-fee-reconciliation";',
  ].join("\n"),
  "player fee webhook ledger import",
);

replaceOnce(
  webhookPath,
  [
    'async function handleCompletedPlayerMatchFeeCheckoutSession(',
    '  session: Stripe.Checkout.Session,',
    ') {',
  ].join("\n"),
  [
    'async function refundInvalidPlayerMatchFeeCheckout(input: {',
    '  session: Stripe.Checkout.Session;',
    '  stripe: Stripe;',
    '  reason: string;',
    '}) {',
    '  const paymentIntentId = getPaymentIntentId(input.session);',
    '  if (!paymentIntentId) return;',
    '',
    '  await input.stripe.refunds.create(',
    '    {',
    '      payment_intent: paymentIntentId,',
    '      reason: "requested_by_customer",',
    '      metadata: {',
    '        paymentType: "PLAYER_MATCH_FEE_AUTOMATIC_REFUND",',
    '        checkoutSessionId: input.session.id,',
    '        refundReason: input.reason.slice(0, 450),',
    '      },',
    '    },',
    '    { idempotencyKey: `invalid-player-match-fee-${input.session.id}` },',
    '  );',
    '}',
    '',
    'async function handleCompletedPlayerMatchFeeCheckoutSession(',
    '  session: Stripe.Checkout.Session,',
    '  stripe: Stripe,',
    ') {',
  ].join("\n"),
  "player fee webhook refund helper",
);

replaceOnce(
  webhookPath,
  [
    '  if (!fee) return true;',
    '',
    '  if (fee.status !== "OPEN") {',
    '    if (fee.status === "PAID") {',
    '      await closePlayerMatchFeeFromStripeSession({',
    '        playerMatchFeeId: fee.id,',
    '        paidAt,',
    '        paidAmountPence: amountPence,',
    '      });',
    '    }',
    '',
    '    return true;',
    '  }',
    '',
    '  if (amountPence <= 0) return true;',
    '',
    '  const paymentIntentId = getPaymentIntentId(session);',
  ].join("\n"),
  [
    '  if (!fee) return true;',
    '',
    '  const paymentIntentId = getPaymentIntentId(session);',
    '',
    '  if (fee.status !== "OPEN") {',
    '    if (fee.status === "PAID") {',
    '      await closePlayerMatchFeeFromStripeSession({',
    '        playerMatchFeeId: fee.id,',
    '        paidAt,',
    '        paidAmountPence: amountPence,',
    '      });',
    '    } else if (amountPence > 0) {',
    '      await refundInvalidPlayerMatchFeeCheckout({',
    '        session,',
    '        stripe,',
    '        reason: `Player fee ${fee.id} was ${fee.status.toLowerCase()} before payment completed.`,',
    '      });',
    '    }',
    '',
    '    return true;',
    '  }',
    '',
    '  if (amountPence <= 0) return true;',
    '',
    '  const ledger = await getTeamPaymentLedger(fee.teamId);',
    '  const chargeEntry =',
    '    ledger?.entries.find(',
    '      (entry) =>',
    '        entry.fixtureId === fee.fixtureId &&',
    '        entry.teamId === fee.teamId &&',
    '        entry.displayStatus !== "VOID",',
    '    ) ?? null;',
    '  const activeAllocation = await prisma.playerMatchFee.aggregate({',
    '    where: {',
    '      teamId: fee.teamId,',
    '      fixtureId: fee.fixtureId,',
    '      status: { in: ["OPEN", "PAID", "WAIVED"] },',
    '    },',
    '    _sum: { amountPence: true },',
    '  });',
    '  const allocationBudgetPence = chargeEntry',
    '    ? Math.max(chargeEntry.amountPence - chargeEntry.directPaidPence, 0)',
    '    : 0;',
    '  const allocationTotalPence = activeAllocation._sum.amountPence ?? 0;',
    '',
    '  if (',
    '    !chargeEntry ||',
    '    allocationTotalPence > allocationBudgetPence ||',
    '    chargeEntry.outstandingPence < amountPence',
    '  ) {',
    '    await refundInvalidPlayerMatchFeeCheckout({',
    '      session,',
    '      stripe,',
    '      reason: !chargeEntry',
    '        ? `Player fee ${fee.id} no longer has an active fixture charge.`',
    '        : allocationTotalPence > allocationBudgetPence',
    '          ? `Player fee allocation exceeds the fixture charge for ${fee.fixtureId}.`',
    '          : `The remaining fixture balance is below the completed player payment amount.`,',
    '    });',
    '',
    '    await prisma.playerMatchFee.update({',
    '      where: { id: fee.id },',
    '      data: {',
    '        status: "CANCELLED",',
    '        paymentUrl: null,',
    '        paymentToken: null,',
    '        cancelledAt: new Date(),',
    '      },',
    '    });',
    '    await cancelQueuedPlayerMatchFeeNotificationDispatches(',
    '      [fee.id],',
    '      "Player fee checkout was automatically refunded because the fixture balance was no longer available.",',
    '    );',
    '    return true;',
    '  }',
  ].join("\n"),
  "player fee webhook balance validation",
);

replaceOnce(
  webhookPath,
  '  const handledPlayerMatchFee = await handleCompletedPlayerMatchFeeCheckoutSession(session);',
  '  const handledPlayerMatchFee = await handleCompletedPlayerMatchFeeCheckoutSession(session, stripe);',
  "player fee webhook stripe client",
);

console.log(
  "Applied automatic refunds for invalid or stale player payment checkouts.",
);
