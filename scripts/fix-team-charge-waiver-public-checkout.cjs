const fs = require("node:fs");
const path = require("node:path");

const routePath = path.join(
  process.cwd(),
  "src/app/pay/charge/[token]/start/route.ts",
);
let source = fs.readFileSync(routePath, "utf8");

function replaceRequired(before, after, label) {
  if (source.includes(after)) return;
  if (!source.includes(before)) {
    throw new Error(`Expected ${label} source was not found.`);
  }
  source = source.replace(before, after);
}

const oldInitialBalance = `  let paidTotalPence = getChargePaidTotal(charge.transactions);
  let outstandingPence = getChargeOutstandingPence(
    charge.amountPence,
    paidTotalPence,
  );`;

const waiverAwareInitialBalance = `  const playerMatchFees = charge.fixtureId
    ? await prisma.playerMatchFee.findMany({
        where: {
          teamId: charge.teamId,
          fixtureId: charge.fixtureId,
          status: { in: [PlayerMatchFeeStatus.PAID, PlayerMatchFeeStatus.WAIVED] },
        },
        select: { fixtureId: true, amountPence: true, status: true, note: true },
      })
    : [];
  const chargeAmountPence = charge.amountPence;
  const chargeFixtureId = charge.fixtureId;
  const chargeStatus = charge.status;
  const chargeDescription = charge.description;

  function getWaiverAwareOutstandingPence(
    transactions: Array<{ amountPence: number; notes?: string | null }>,
  ) {
    const [summary] = summariseChargesWithPlayerMatchFees(
      [
        {
          amountPence: chargeAmountPence,
          fixtureId: chargeFixtureId,
          status: chargeStatus,
          description: chargeDescription,
          transactions,
        },
      ],
      playerMatchFees,
    );
    return summary?.outstandingPence ?? chargeAmountPence;
  }

  let outstandingPence = getWaiverAwareOutstandingPence(charge.transactions);`;

replaceRequired(
  oldInitialBalance,
  waiverAwareInitialBalance,
  "team-credit-cap initial checkout balance",
);

const oldRefreshBalance = `    const refreshedTransactions = await prisma.paymentTransaction.findMany({
      where: { chargeId: charge.id },
      select: { amountPence: true },
    });
    paidTotalPence = getChargePaidTotal(refreshedTransactions);
    outstandingPence = getChargeOutstandingPence(
      charge.amountPence,
      paidTotalPence,
    );`;

const waiverAwareRefreshBalance = `    const refreshedTransactions = await prisma.paymentTransaction.findMany({
      where: { chargeId: charge.id },
      select: { amountPence: true, notes: true },
    });
    outstandingPence = getWaiverAwareOutstandingPence(refreshedTransactions);`;

replaceRequired(
  oldRefreshBalance,
  waiverAwareRefreshBalance,
  "team-credit-cap refreshed checkout balance",
);

if (
  !source.includes('summariseChargesWithPlayerMatchFees') ||
  !source.includes('PlayerMatchFeeStatus.PAID') ||
  !source.includes('getWaiverAwareOutstandingPence') ||
  !source.includes('const chargeAmountPence = charge.amountPence;') ||
  source.includes('getChargePaidTotal(') ||
  source.includes('getChargeOutstandingPence(')
) {
  throw new Error(
    "Public team checkout is not fully using the waiver-aware balance after team credit application.",
  );
}

fs.writeFileSync(routePath, source, "utf8");
console.log(
  "Public team checkout now combines team-credit-first application with player coverage and SIXFL waiver settlement.",
);

require("./apply-late-player-payment-waiver-recovery.cjs");
