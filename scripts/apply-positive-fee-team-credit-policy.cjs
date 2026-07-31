const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");

function patchFile(filePath, replacements) {
  const absolutePath = path.join(root, filePath);
  let source = fs.readFileSync(absolutePath, "utf8");

  for (const replacement of replacements) {
    const { before, after, label } = replacement;

    if (source.includes(after)) continue;
    if (!source.includes(before)) {
      throw new Error(`Expected ${label} source was not found in ${filePath}`);
    }

    source = source.replace(before, after);
  }

  fs.writeFileSync(absolutePath, source, "utf8");
}

const collectionActionPath =
  "src/app/captain/team/[teamid]/player-payments/actions.ts";
const collectionPagePath =
  "src/app/captain/team/[teamid]/player-payments/PaymentPageServer.tsx";
const publicFeePagePath = "src/app/pay/player-match-fee/[token]/page.tsx";
const publicFeeStartPath = "src/app/pay/player-match-fee/[token]/start/route.ts";
const webhookPath = "src/app/api/stripe/webhook/route.ts";

patchFile(collectionActionPath, [
  {
    label: "covered-charge collection block",
    before: [
      '  const playerAllocationBudgetPence = Math.max(',
      '    ledgerEntry.amountPence - ledgerEntry.directPaidPence,',
      '    0,',
      '  );',
      '',
      '  if (playerAllocationBudgetPence <= 0) {',
      '    redirect(getPlayerPaymentsPath(teamId, fixtureId, "&error=charge_covered"));',
      '  }',
      '',
      '  const selectedMemberIds = players',
    ].join("\n"),
    after: [
      '  // A positive fixture charge may collect more than its balance. Any excess',
      '  // is reconciled into the team credit pot after player payments complete.',
      '  const selectedMemberIds = players',
    ].join("\n"),
  },
  {
    label: "player allocation cap",
    before: [
      '  if (proposedAllocationPence > playerAllocationBudgetPence) {',
      '    redirect(getPlayerPaymentsPath(teamId, fixtureId, "&error=allocation_exceeds_fee"));',
      '  }',
      '',
      '  const createdOrUpdatedFeeIds: string[] = [];',
    ].join("\n"),
    after: [
      '  // proposedAllocationPence is intentionally allowed to exceed the fixture',
      '  // charge. Reconciliation converts completed excess payments into team credit.',
      '  void proposedAllocationPence;',
      '',
      '  const createdOrUpdatedFeeIds: string[] = [];',
    ].join("\n"),
  },
]);

patchFile(collectionPagePath, [
  {
    label: "covered collection form",
    before: '          {selectedFixture && selectedFixtureEditable && stillToCoverPence > 0 ? (',
    after: '          {selectedFixture && selectedFixtureEditable ? (',
  },
  {
    label: "team credit collection copy",
    before: '          <p className="mt-1 text-sm text-white/55">Create player links only for fixtures attached to this current team record. Historical ledger charges stay visible but are settled through Team payments.</p>',
    after: '          <p className="mt-1 text-sm text-white/55">Create player links only for fixtures attached to this current team record. If player payments exceed a positive team charge, the excess is added to team credit. Historical ledger charges stay visible but are settled through Team payments.</p>',
  },
]);

patchFile(publicFeePagePath, [
  {
    label: "public player fee over-allocation gate",
    before: [
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
    after: [
      '  const canPay =',
      '    fee.status === PlayerMatchFeeStatus.OPEN &&',
      '    Boolean(fee.paymentToken) &&',
      '    Boolean(chargeEntry) &&',
      '    (chargeEntry?.amountPence ?? 0) > 0;',
    ].join("\n"),
  },
]);

patchFile(publicFeeStartPath, [
  {
    label: "checkout over-allocation gate",
    before: [
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
      '    return NextResponse.redirect(',
      '      buildReturnUrl({',
      '        teamId: fee.team.id,',
      '        paymentToken: token,',
      '        state: "not_available",',
      '      }),',
      '      303,',
      '    );',
      '  }',
    ].join("\n"),
    after: [
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
    ].join("\n"),
  },
]);

patchFile(webhookPath, [
  {
    label: "webhook over-allocation refund gate",
    before: [
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
    after: [
      '  if (!chargeEntry || chargeEntry.amountPence <= 0) {',
      '    await refundInvalidPlayerMatchFeeCheckout({',
      '      session,',
      '      stripe,',
      '      reason: `Player fee ${fee.id} no longer has a positive active fixture charge.`,',
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
      '      "Player fee checkout was automatically refunded because no positive fixture charge remained.",',
      '    );',
      '    return true;',
      '  }',
    ].join("\n"),
  },
]);

console.log(
  "Applied positive-fee team credit policy: overpayments are accepted and reconciled to team credit, while zero/no-charge links remain blocked.",
);
