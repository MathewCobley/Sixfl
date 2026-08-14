const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");

function read(filePath) {
  return fs.readFileSync(path.join(root, filePath), "utf8");
}

function write(filePath, source) {
  fs.writeFileSync(path.join(root, filePath), source, "utf8");
}

function ensureImport(source, anchor, importLine, label) {
  if (source.includes(importLine)) return source;
  if (!source.includes(anchor)) {
    throw new Error(`Expected ${label} import anchor was not found.`);
  }
  return source.replace(anchor, `${anchor}\n${importLine}`);
}

function replaceRequired(source, before, after, label) {
  if (source.includes(after)) return source;
  if (!source.includes(before)) {
    throw new Error(`Expected ${label} source was not found.`);
  }
  return source.replace(before, after);
}

// ---------------------------------------------------------------------------
// Captain player collection: existing credit is consumed first, and the total
// real collectible player cash can only cover the fixture plus enough excess
// to leave at most one match fee in team credit.
// ---------------------------------------------------------------------------
const collectionActionPath =
  "src/app/captain/team/[teamid]/player-payments/actions.ts";
let collectionAction = read(collectionActionPath);

collectionAction = ensureImport(
  collectionAction,
  'import { getTeamPaymentLedger } from "@/lib/payments/team-payment-ledger";',
  'import {\n  applyExistingTeamCreditToChargeFirst,\n  getMaximumAdditionalCollectionPence,\n} from "@/lib/payments/team-credit-policy";',
  "captain collection credit policy",
);

collectionAction = replaceRequired(
  collectionAction,
  '  const ledger = await getTeamPaymentLedger(teamId);\n  const ledgerEntry =',
  '  const creditApplication = await applyExistingTeamCreditToChargeFirst({\n    teamId,\n    chargeId: activeTeamCharge.id,\n    fixtureFeePence: teamFeePence,\n    description: `Team credit automatically used against ${activeTeamCharge.title} before creating new player payment links.`,\n  });\n\n  const ledger = await getTeamPaymentLedger(teamId);\n  const ledgerEntry =',
  "captain automatic credit use",
);

collectionAction = replaceRequired(
  collectionAction,
  '  // A positive fixture charge may collect more than its balance. Any excess\n  // is reconciled into the team credit pot after player payments complete.\n  const selectedMemberIds = players',
  '  const playerAllocationBudgetPence =\n    ledgerEntry.playerPaidPence +\n    getMaximumAdditionalCollectionPence({\n      outstandingFixturePence: ledgerEntry.outstandingPence,\n      creditHeadroomPence: creditApplication.policy.creditHeadroomPence,\n    });\n\n  const selectedMemberIds = players',
  "bounded player allocation budget",
);

collectionAction = replaceRequired(
  collectionAction,
  '    const playerAmountPence = zeroFeePlayer\n      ? enteredAmountPence\n      : method === "waived"\n        ? 0\n        : enteredAmountPence;\n\n    proposedAllocationPence += playerAmountPence;',
  '    const collectiblePlayerPence =\n      zeroFeePlayer || method === "waived" ? 0 : enteredAmountPence;\n\n    proposedAllocationPence += collectiblePlayerPence;',
  "real collectible allocation total",
);

collectionAction = replaceRequired(
  collectionAction,
  '  // proposedAllocationPence is intentionally allowed to exceed the fixture\n  // charge. Reconciliation converts completed excess payments into team credit.\n  void proposedAllocationPence;\n\n  const createdOrUpdatedFeeIds: string[] = [];',
  '  if (proposedAllocationPence > playerAllocationBudgetPence) {\n    redirect(\n      getPlayerPaymentsPath(teamId, fixtureId, "&error=allocation_exceeds_fee"),\n    );\n  }\n\n  const createdOrUpdatedFeeIds: string[] = [];',
  "one-match-fee allocation cap",
);

write(collectionActionPath, collectionAction);

// ---------------------------------------------------------------------------
// Captain collection page: explain the new limit when an allocation is blocked.
// ---------------------------------------------------------------------------
const collectionPagePath =
  "src/app/captain/team/[teamid]/player-payments/PaymentPageServer.tsx";
let collectionPage = read(collectionPagePath);
collectionPage = collectionPage.replace(
  'return "The selected player shares exceed the amount available to collect for this fixture. Reduce the amounts before saving.";',
  'return "The selected player payments would take the team above its credit limit. Team credit is capped at one match fee and existing credit is used against the next fixture first. Reduce the player amounts before saving.";',
);
write(collectionPagePath, collectionPage);

// ---------------------------------------------------------------------------
// Public player fee page: old links remain visible only while this individual
// payment can fit inside the remaining fixture balance + remaining credit cap.
// ---------------------------------------------------------------------------
const publicFeePagePath = "src/app/pay/player-match-fee/[token]/page.tsx";
let publicFeePage = read(publicFeePagePath);
publicFeePage = ensureImport(
  publicFeePage,
  'import { getTeamPaymentLedger } from "@/lib/payments/team-payment-ledger";',
  'import {\n  getMaximumAdditionalCollectionPence,\n  getTeamCreditPolicySnapshot,\n} from "@/lib/payments/team-credit-policy";',
  "public player fee credit policy",
);
publicFeePage = replaceRequired(
  publicFeePage,
  '  const canPay =\n    fee.status === PlayerMatchFeeStatus.OPEN &&\n    Boolean(fee.paymentToken) &&\n    Boolean(chargeEntry) &&\n    (chargeEntry?.amountPence ?? 0) > 0;',
  '  const creditPolicy = chargeEntry\n    ? await getTeamCreditPolicySnapshot({\n        teamId: fee.team.id,\n        fixtureFeePence: chargeEntry.amountPence,\n      })\n    : null;\n  const maximumAdditionalCollectionPence = chargeEntry\n    ? getMaximumAdditionalCollectionPence({\n        outstandingFixturePence: chargeEntry.outstandingPence,\n        creditHeadroomPence: creditPolicy?.creditHeadroomPence ?? 0,\n      })\n    : 0;\n  const canPay =\n    fee.status === PlayerMatchFeeStatus.OPEN &&\n    Boolean(fee.paymentToken) &&\n    Boolean(chargeEntry) &&\n    fee.amountPence <= maximumAdditionalCollectionPence;',
  "public player fee bounded availability",
);
write(publicFeePagePath, publicFeePage);

// ---------------------------------------------------------------------------
// Player checkout: consume existing credit first, then re-check the link against
// the remaining fixture balance + one-match-fee credit headroom.
// ---------------------------------------------------------------------------
const publicFeeStartPath = "src/app/pay/player-match-fee/[token]/start/route.ts";
let publicFeeStart = read(publicFeeStartPath);
publicFeeStart = ensureImport(
  publicFeeStart,
  'import { getTeamPaymentLedger } from "@/lib/payments/team-payment-ledger";',
  'import {\n  applyExistingTeamCreditToChargeFirst,\n  getMaximumAdditionalCollectionPence,\n} from "@/lib/payments/team-credit-policy";',
  "player checkout credit policy",
);

const startOldGate = [
  '  if (!chargeEntry || chargeEntry.amountPence <= 0) {',
  '    return NextResponse.redirect(',
  '      buildReturnUrl({',
  '        teamId: fee.team.id,',
  '        paymentToken: token,',
  '        state: "not_available",',
  '      }),',
  '      303,',
  '    );',
  '  }',
].join("\n");
const startNewGate = [
  '  if (!chargeEntry || chargeEntry.amountPence <= 0) {',
  '    return NextResponse.redirect(',
  '      buildReturnUrl({',
  '        teamId: fee.team.id,',
  '        paymentToken: token,',
  '        state: "not_available",',
  '      }),',
  '      303,',
  '    );',
  '  }',
  '',
  '  const creditApplication = await applyExistingTeamCreditToChargeFirst({',
  '    teamId: fee.team.id,',
  '    chargeId: chargeEntry.chargeId,',
  '    fixtureFeePence: chargeEntry.amountPence,',
  '    description: `Team credit automatically used against ${chargeEntry.title} before a player payment.`,',
  '  });',
  '  const refreshedLedger = await getTeamPaymentLedger(fee.team.id);',
  '  const refreshedChargeEntry =',
  '    refreshedLedger?.entries.find(',
  '      (entry) =>',
  '        entry.fixtureId === fee.fixture.id &&',
  '        entry.teamId === fee.team.id &&',
  '        entry.displayStatus !== "VOID",',
  '    ) ?? null;',
  '  const maximumAdditionalCollectionPence = refreshedChargeEntry',
  '    ? getMaximumAdditionalCollectionPence({',
  '        outstandingFixturePence: refreshedChargeEntry.outstandingPence,',
  '        creditHeadroomPence: creditApplication.policy.creditHeadroomPence,',
  '      })',
  '    : 0;',
  '',
  '  if (!refreshedChargeEntry || fee.amountPence > maximumAdditionalCollectionPence) {',
  '    return NextResponse.redirect(',
  '      buildReturnUrl({',
  '        teamId: fee.team.id,',
  '        paymentToken: token,',
  '        state: "not_available",',
  '      }),',
  '      303,',
  '    );',
  '  }',
].join("\n");
publicFeeStart = replaceRequired(
  publicFeeStart,
  startOldGate,
  startNewGate,
  "player checkout one-match-fee gate",
);
write(publicFeeStartPath, publicFeeStart);

// ---------------------------------------------------------------------------
// Normal team checkout: credit must be used before Stripe can collect the next
// fixture balance, so captains cannot leave credit untouched and pay in full.
// ---------------------------------------------------------------------------
const teamChargeStartPath = "src/app/pay/charge/[token]/start/route.ts";
let teamChargeStart = read(teamChargeStartPath);
teamChargeStart = ensureImport(
  teamChargeStart,
  'import { prisma } from "@/lib/prisma";',
  'import { applyExistingTeamCreditToChargeFirst } from "@/lib/payments/team-credit-policy";',
  "team charge credit policy",
);
teamChargeStart = replaceRequired(
  teamChargeStart,
  '  const paidTotalPence = getChargePaidTotal(charge.transactions);\n  const outstandingPence = getChargeOutstandingPence(\n    charge.amountPence,\n    paidTotalPence,\n  );',
  '  let paidTotalPence = getChargePaidTotal(charge.transactions);\n  let outstandingPence = getChargeOutstandingPence(\n    charge.amountPence,\n    paidTotalPence,\n  );',
  "mutable team charge balance",
);
teamChargeStart = replaceRequired(
  teamChargeStart,
  '  if (outstandingPence <= 0) {',
  '  if (charge.fixtureId) {\n    await applyExistingTeamCreditToChargeFirst({\n      teamId: charge.teamId,\n      chargeId: charge.id,\n      fixtureFeePence: charge.amountPence,\n      description: `Team credit automatically used against ${charge.title} before Stripe payment.`,\n    });\n\n    const refreshedTransactions = await prisma.paymentTransaction.findMany({\n      where: { chargeId: charge.id },\n      select: { amountPence: true },\n    });\n    paidTotalPence = getChargePaidTotal(refreshedTransactions);\n    outstandingPence = getChargeOutstandingPence(\n      charge.amountPence,\n      paidTotalPence,\n    );\n  }\n\n  if (outstandingPence <= 0) {',
  "automatic credit use before team checkout",
);
write(teamChargeStartPath, teamChargeStart);

// ---------------------------------------------------------------------------
// Stripe webhook: final defence for old links or simultaneous payments. Credit
// is used first, then a payment is refunded/cancelled if it would push the team
// beyond one full match fee of credit.
// ---------------------------------------------------------------------------
const webhookPath = "src/app/api/stripe/webhook/route.ts";
let webhook = read(webhookPath);
webhook = ensureImport(
  webhook,
  'import { reconcileFixtureChargeFromPlayerPayments } from "@/lib/payments/player-match-fee-reconciliation";',
  'import {\n  applyExistingTeamCreditToChargeFirst,\n  getMaximumAdditionalCollectionPence,\n} from "@/lib/payments/team-credit-policy";',
  "webhook credit policy",
);

const webhookOldGate = [
  '  if (!chargeEntry || chargeEntry.amountPence <= 0) {',
  '    await refundInvalidPlayerMatchFeeCheckout({',
  '      session,',
  '      stripe,',
  '      reason: `Player fee ${fee.id} no longer has a positive active fixture charge.`,',
  '    });',
].join("\n");
const webhookNewGate = [
  '  if (!chargeEntry || chargeEntry.amountPence <= 0) {',
  '    await refundInvalidPlayerMatchFeeCheckout({',
  '      session,',
  '      stripe,',
  '      reason: `Player fee ${fee.id} no longer has a positive active fixture charge.`,',
  '    });',
].join("\n");

if (!webhook.includes("maximumAdditionalCollectionPence")) {
  if (!webhook.includes(webhookOldGate)) {
    throw new Error("Expected webhook positive-charge gate was not found.");
  }

  const gateEndMarker = [
    '    await cancelQueuedPlayerMatchFeeNotificationDispatches(',
    '      [fee.id],',
    '      "Player fee checkout was automatically refunded because no positive fixture charge remained.",',
    '    );',
    '    return true;',
    '  }',
  ].join("\n");
  const gateEndIndex = webhook.indexOf(gateEndMarker, webhook.indexOf(webhookOldGate));
  if (gateEndIndex < 0) {
    throw new Error("Expected webhook positive-charge gate end was not found.");
  }
  const insertAt = gateEndIndex + gateEndMarker.length;
  const boundedGate = [
    '',
    '',
    '  const creditApplication = await applyExistingTeamCreditToChargeFirst({',
    '    teamId: fee.teamId,',
    '    chargeId: chargeEntry.chargeId,',
    '    fixtureFeePence: chargeEntry.amountPence,',
    '    description: `Team credit automatically used against ${chargeEntry.title} before completing a player payment.`,',
    '  });',
    '  const refreshedLedger = await getTeamPaymentLedger(fee.teamId);',
    '  const refreshedChargeEntry =',
    '    refreshedLedger?.entries.find(',
    '      (entry) =>',
    '        entry.fixtureId === fee.fixtureId &&',
    '        entry.teamId === fee.teamId &&',
    '        entry.displayStatus !== "VOID",',
    '    ) ?? null;',
    '  const maximumAdditionalCollectionPence = refreshedChargeEntry',
    '    ? getMaximumAdditionalCollectionPence({',
    '        outstandingFixturePence: refreshedChargeEntry.outstandingPence,',
    '        creditHeadroomPence: creditApplication.policy.creditHeadroomPence,',
    '      })',
    '    : 0;',
    '',
    '  if (!refreshedChargeEntry || amountPence > maximumAdditionalCollectionPence) {',
    '    await refundInvalidPlayerMatchFeeCheckout({',
    '      session,',
    '      stripe,',
    '      reason: `Player fee ${fee.id} would take team credit above the one-match-fee limit.`,',
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
    '      "Player fee checkout was automatically refunded because the team credit limit had been reached.",',
    '    );',
    '    return true;',
    '  }',
  ].join("\n");

  webhook = webhook.slice(0, insertAt) + boundedGate + webhook.slice(insertAt);
}
write(webhookPath, webhook);

// ---------------------------------------------------------------------------
// Team credit calculation must recognise hidden SIXFL subsidies when deciding
// what remains outstanding; subsidies still never become cash or credit.
// ---------------------------------------------------------------------------
const teamCreditsPath = "src/lib/payments/team-credits.ts";
let teamCredits = read(teamCreditsPath);
teamCredits = teamCredits.replace(
  '          status: "PAID",\n        },\n        select: { fixtureId: true, amountPence: true },',
  '          status: { in: ["PAID", "WAIVED"] },\n        },\n        select: { fixtureId: true, amountPence: true, status: true, note: true },',
);
teamCredits = teamCredits.replace(
  '    const paidPenceAfterCredit = current.summary.paidPence + amountUsedPence;\n    const nextStatus = getDisplayChargeStatus({\n      storedStatus: current.charge.status,\n      amountPence: current.charge.amountPence,\n      paidPence: paidPenceAfterCredit,\n    }) as PaymentChargeStatus;',
  '    const coveredPenceAfterCredit = current.summary.coveredPence + amountUsedPence;\n    const nextStatus = getDisplayChargeStatus({\n      storedStatus: current.charge.status,\n      amountPence: current.charge.amountPence,\n      paidPence: coveredPenceAfterCredit,\n    }) as PaymentChargeStatus;',
);
write(teamCreditsPath, teamCredits);

for (const [filePath, marker] of [
  [collectionActionPath, "creditHeadroomPence"],
  [publicFeePagePath, "maximumAdditionalCollectionPence"],
  [publicFeeStartPath, "creditApplication"],
  [teamChargeStartPath, "Team credit automatically used"],
  [webhookPath, "one-match-fee limit"],
]) {
  if (!read(filePath).includes(marker)) {
    throw new Error(`One-match-fee credit policy did not complete for ${filePath}.`);
  }
}

console.log(
  "Applied one-match-fee team credit cap: existing credit is used first and further collection is blocked once the cap would be exceeded.",
);
