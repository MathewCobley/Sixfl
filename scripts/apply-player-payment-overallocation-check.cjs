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

const publicFeePagePath = "src/app/pay/player-match-fee/[token]/page.tsx";
const publicFeeStartPath = "src/app/pay/player-match-fee/[token]/start/route.ts";

replaceOnce(
  publicFeePagePath,
  [
    '  const canPay =',
    '    fee.status === PlayerMatchFeeStatus.OPEN &&',
    '    Boolean(fee.paymentToken) &&',
    '    Boolean(chargeEntry) &&',
    '    (chargeEntry?.outstandingPence ?? 0) >= fee.amountPence;',
  ].join("\n"),
  [
    '  const activeAllocation = await prisma.playerMatchFee.aggregate({',
    '    where: {',
    '      teamId: fee.team.id,',
    '      fixtureId: fee.fixture.id,',
    '      status: {',
    '        in: [',
    '          PlayerMatchFeeStatus.OPEN,',
    '          PlayerMatchFeeStatus.PAID,',
    '          PlayerMatchFeeStatus.WAIVED,',
    '        ],',
    '      },',
    '    },',
    '    _sum: { amountPence: true },',
    '  });',
    '  const allocationBudgetPence = chargeEntry',
    '    ? Math.max(chargeEntry.amountPence - chargeEntry.directPaidPence, 0)',
    '    : 0;',
    '  const allocationTotalPence = activeAllocation._sum.amountPence ?? 0;',
    '  const allocationIsValid = allocationTotalPence <= allocationBudgetPence;',
    '  const canPay =',
    '    fee.status === PlayerMatchFeeStatus.OPEN &&',
    '    Boolean(fee.paymentToken) &&',
    '    Boolean(chargeEntry) &&',
    '    allocationIsValid &&',
    '    (chargeEntry?.outstandingPence ?? 0) >= fee.amountPence;',
  ].join("\n"),
  "public player fee over-allocation guard",
);

replaceOnce(
  publicFeeStartPath,
  '  if (!chargeEntry || chargeEntry.outstandingPence < fee.amountPence) {',
  [
    '  const activeAllocation = await prisma.playerMatchFee.aggregate({',
    '    where: {',
    '      teamId: fee.team.id,',
    '      fixtureId: fee.fixture.id,',
    '      status: {',
    '        in: [',
    '          PlayerMatchFeeStatus.OPEN,',
    '          PlayerMatchFeeStatus.PAID,',
    '          PlayerMatchFeeStatus.WAIVED,',
    '        ],',
    '      },',
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
    '    chargeEntry.outstandingPence < fee.amountPence',
    '  ) {',
  ].join("\n"),
  "player fee checkout over-allocation guard",
);

console.log(
  "Applied payment-time blocking for overallocated player collections.",
);
