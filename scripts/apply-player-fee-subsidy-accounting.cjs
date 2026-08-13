const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");

function read(filePath) {
  return fs.readFileSync(path.join(root, filePath), "utf8");
}

function write(filePath, source) {
  fs.writeFileSync(path.join(root, filePath), source, "utf8");
}

function replaceRequired(source, before, after, label) {
  if (source.includes(after)) return source;
  if (!source.includes(before)) {
    throw new Error(`Expected ${label} source was not found.`);
  }
  return source.replace(before, after);
}

// ---------------------------------------------------------------------------
// Shared charge summaries: keep real cash separate from SIXFL-funded subsidy.
// ---------------------------------------------------------------------------
const chargeSummaryPath = "src/lib/payments/charge-summary.ts";
let chargeSummary = read(chargeSummaryPath);

if (!chargeSummary.includes('from "@/lib/payments/player-fee-coverage"')) {
  chargeSummary = chargeSummary.replace(
    "// ========================================\n\n",
    '// ========================================\n\nimport {\n  getPlayerFeeCashReceivedPence,\n  getPlayerFeeSubsidyPence,\n} from "@/lib/payments/player-fee-coverage";\n\n',
  );
}

chargeSummary = replaceRequired(
  chargeSummary,
  `type PaidPlayerMatchFeeForSummary = {\n  fixtureId: string;\n  amountPence: number;\n};`,
  `type PaidPlayerMatchFeeForSummary = {\n  fixtureId: string;\n  amountPence: number;\n  status: string;\n  note?: string | null;\n};`,
  "charge-summary player fee type",
);

chargeSummary = replaceRequired(
  chargeSummary,
  `export function buildPaidPlayerMatchFeeTotalsByFixture(\n  paidPlayerMatchFees: PaidPlayerMatchFeeForSummary[],\n) {\n  return paidPlayerMatchFees.reduce((totals, fee) => {\n    totals.set(fee.fixtureId, (totals.get(fee.fixtureId) ?? 0) + fee.amountPence);\n\n    return totals;\n  }, new Map<string, number>());\n}`,
  `export function buildPaidPlayerMatchFeeTotalsByFixture(\n  paidPlayerMatchFees: PaidPlayerMatchFeeForSummary[],\n) {\n  return paidPlayerMatchFees.reduce((totals, fee) => {\n    const cashPence = getPlayerFeeCashReceivedPence(fee);\n    totals.set(fee.fixtureId, (totals.get(fee.fixtureId) ?? 0) + cashPence);\n\n    return totals;\n  }, new Map<string, number>());\n}\n\nfunction buildPlayerMatchFeeSubsidyTotalsByFixture(\n  playerMatchFees: PaidPlayerMatchFeeForSummary[],\n) {\n  return playerMatchFees.reduce((totals, fee) => {\n    const subsidyPence = getPlayerFeeSubsidyPence(fee);\n    totals.set(fee.fixtureId, (totals.get(fee.fixtureId) ?? 0) + subsidyPence);\n    return totals;\n  }, new Map<string, number>());\n}`,
  "charge-summary subsidy totals",
);

chargeSummary = replaceRequired(
  chargeSummary,
  `  const playerMatchFeeTotalsByFixture = buildPaidPlayerMatchFeeTotalsByFixture(\n    paidPlayerMatchFees,\n  );\n\n  return charges.map((charge) => {\n    const directPaidPence = getDirectChargePaidTotal(charge.transactions);\n    const playerPaidPence = charge.fixtureId\n      ? playerMatchFeeTotalsByFixture.get(charge.fixtureId) ?? 0\n      : 0;\n    const paidPence = directPaidPence + playerPaidPence;\n    const displayStatus = getDisplayChargeStatus({\n      storedStatus: charge.status,\n      amountPence: charge.amountPence,\n      paidPence,\n    });\n    const outstandingPence = getDisplayChargeOutstandingPence({\n      displayStatus,\n      amountPence: charge.amountPence,\n      paidPence,\n    });\n\n    return {\n      charge,\n      directPaidPence,\n      playerPaidPence,\n      paidPence,\n      outstandingPence,\n      displayStatus,\n    };\n  });`,
  `  const playerMatchFeeTotalsByFixture = buildPaidPlayerMatchFeeTotalsByFixture(\n    paidPlayerMatchFees,\n  );\n  const playerMatchFeeSubsidyTotalsByFixture = buildPlayerMatchFeeSubsidyTotalsByFixture(\n    paidPlayerMatchFees,\n  );\n\n  return charges.map((charge) => {\n    const directPaidPence = getDirectChargePaidTotal(charge.transactions);\n    const playerPaidPence = charge.fixtureId\n      ? playerMatchFeeTotalsByFixture.get(charge.fixtureId) ?? 0\n      : 0;\n    const playerSubsidyPence = charge.fixtureId\n      ? playerMatchFeeSubsidyTotalsByFixture.get(charge.fixtureId) ?? 0\n      : 0;\n    const paidPence = directPaidPence + playerPaidPence;\n    const coveredPence = paidPence + playerSubsidyPence;\n    const displayStatus = getDisplayChargeStatus({\n      storedStatus: charge.status,\n      amountPence: charge.amountPence,\n      paidPence: coveredPence,\n    });\n    const outstandingPence = getDisplayChargeOutstandingPence({\n      displayStatus,\n      amountPence: charge.amountPence,\n      paidPence: coveredPence,\n    });\n\n    return {\n      charge,\n      directPaidPence,\n      playerPaidPence,\n      playerSubsidyPence,\n      paidPence,\n      coveredPence,\n      outstandingPence,\n      displayStatus,\n    };\n  });`,
  "charge-summary covered totals",
);

write(chargeSummaryPath, chargeSummary);

// ---------------------------------------------------------------------------
// Team payment ledger: subsidy covers the fixture but never counts as cash or
// creates team credit.
// ---------------------------------------------------------------------------
const ledgerPath = "src/lib/payments/team-payment-ledger.ts";
let ledger = read(ledgerPath);

if (!ledger.includes('from "@/lib/payments/player-fee-coverage"')) {
  ledger = ledger.replace(
    'import { isMatchFeeChargePayable } from "@/lib/payments/match-day-billing";',
    'import { isMatchFeeChargePayable } from "@/lib/payments/match-day-billing";\nimport {\n  getPlayerFeeCashReceivedPence,\n  getPlayerFeeSubsidyPence,\n} from "@/lib/payments/player-fee-coverage";',
  );
}

ledger = replaceRequired(
  ledger,
  `type PlayerFeeRow = {\n  teamId: string;\n  fixtureId: string;\n  amountPence: number;\n};`,
  `type PlayerFeeRow = {\n  teamId: string;\n  fixtureId: string;\n  amountPence: number;\n  status: string;\n  note: string | null;\n};`,
  "ledger player fee type",
);

ledger = replaceRequired(
  ledger,
  `  playerPaidPence: number;\n  playerOpenPence: number;\n  paidPence: number;`,
  `  playerPaidPence: number;\n  playerSubsidyPence: number;\n  playerOpenPence: number;\n  paidPence: number;\n  coveredPence: number;`,
  "ledger subsidy fields",
);

if (!ledger.includes("function buildPlayerFeeCoverageByTeamFixture")) {
  ledger = ledger.replace(
    `function buildPlayerFeeTotalsByTeamFixture(fees: PlayerFeeRow[]) {\n  const totals = new Map<string, number>();\n  for (const fee of fees) {\n    const key = playerFeeKey(fee.teamId, fee.fixtureId);\n    totals.set(key, (totals.get(key) ?? 0) + fee.amountPence);\n  }\n  return totals;\n}`,
    `function buildPlayerFeeTotalsByTeamFixture(fees: PlayerFeeRow[]) {\n  const totals = new Map<string, number>();\n  for (const fee of fees) {\n    const key = playerFeeKey(fee.teamId, fee.fixtureId);\n    totals.set(key, (totals.get(key) ?? 0) + fee.amountPence);\n  }\n  return totals;\n}\n\nfunction buildPlayerFeeCoverageByTeamFixture(fees: PlayerFeeRow[]) {\n  const totals = new Map<string, { cashPence: number; subsidyPence: number }>();\n  for (const fee of fees) {\n    const key = playerFeeKey(fee.teamId, fee.fixtureId);\n    const current = totals.get(key) ?? { cashPence: 0, subsidyPence: 0 };\n    current.cashPence += getPlayerFeeCashReceivedPence(fee);\n    current.subsidyPence += getPlayerFeeSubsidyPence(fee);\n    totals.set(key, current);\n  }\n  return totals;\n}`,
  );
}

ledger = replaceRequired(
  ledger,
  `  const [charges, paidPlayerFees, openPlayerFees] = await Promise.all([`,
  `  const [charges, coveredPlayerFees, openPlayerFees] = await Promise.all([`,
  "ledger promise names",
);

ledger = replaceRequired(
  ledger,
  `    prisma.playerMatchFee.findMany({\n      where: {\n        teamId: { in: relatedTeamIds },\n        status: "PAID",\n      },\n      select: { teamId: true, fixtureId: true, amountPence: true },\n    }),`,
  `    prisma.playerMatchFee.findMany({\n      where: {\n        teamId: { in: relatedTeamIds },\n        status: { in: ["PAID", "WAIVED"] },\n      },\n      select: {\n        teamId: true,\n        fixtureId: true,\n        amountPence: true,\n        status: true,\n        note: true,\n      },\n    }),`,
  "ledger covered fee query",
);

ledger = replaceRequired(
  ledger,
  `      select: { teamId: true, fixtureId: true, amountPence: true },\n    }),\n  ]);\n\n  const paidByTeamFixture = buildPlayerFeeTotalsByTeamFixture(paidPlayerFees);\n  const openByTeamFixture = buildPlayerFeeTotalsByTeamFixture(openPlayerFees);`,
  `      select: {\n        teamId: true,\n        fixtureId: true,\n        amountPence: true,\n        status: true,\n        note: true,\n      },\n    }),\n  ]);\n\n  const coverageByTeamFixture = buildPlayerFeeCoverageByTeamFixture(coveredPlayerFees);\n  const openByTeamFixture = buildPlayerFeeTotalsByTeamFixture(openPlayerFees);`,
  "ledger totals setup",
);

ledger = replaceRequired(
  ledger,
  `    const directPaidPence = getDirectChargePaidTotal(charge.transactions);\n    const playerPaidPence = fixtureKey ? paidByTeamFixture.get(fixtureKey) ?? 0 : 0;\n    const playerOpenPence = fixtureKey ? openByTeamFixture.get(fixtureKey) ?? 0 : 0;\n    const paidPence = directPaidPence + playerPaidPence;\n    const displayStatus = getDisplayChargeStatus({\n      storedStatus: charge.status,\n      amountPence: charge.amountPence,\n      paidPence,\n    });\n    const outstandingPence = getDisplayChargeOutstandingPence({\n      displayStatus,\n      amountPence: charge.amountPence,\n      paidPence,\n    });`,
  `    const directPaidPence = getDirectChargePaidTotal(charge.transactions);\n    const playerCoverage = fixtureKey ? coverageByTeamFixture.get(fixtureKey) : null;\n    const playerPaidPence = playerCoverage?.cashPence ?? 0;\n    const playerSubsidyPence = playerCoverage?.subsidyPence ?? 0;\n    const playerOpenPence = fixtureKey ? openByTeamFixture.get(fixtureKey) ?? 0 : 0;\n    const paidPence = directPaidPence + playerPaidPence;\n    const coveredPence = paidPence + playerSubsidyPence;\n    const displayStatus = getDisplayChargeStatus({\n      storedStatus: charge.status,\n      amountPence: charge.amountPence,\n      paidPence: coveredPence,\n    });\n    const outstandingPence = getDisplayChargeOutstandingPence({\n      displayStatus,\n      amountPence: charge.amountPence,\n      paidPence: coveredPence,\n    });`,
  "ledger coverage calculation",
);

ledger = replaceRequired(
  ledger,
  `      playerPaidPence,\n      playerOpenPence,\n      paidPence,\n      outstandingPence,`,
  `      playerPaidPence,\n      playerSubsidyPence,\n      playerOpenPence,\n      paidPence,\n      coveredPence,\n      outstandingPence,`,
  "ledger coverage return",
);

write(ledgerPath, ledger);

// ---------------------------------------------------------------------------
// Player-payment reconciliation: a capped/zero-fee subsidy can cover a charge,
// but overpayment credit continues to use real cash only.
// ---------------------------------------------------------------------------
const reconciliationPath = "src/lib/payments/player-match-fee-reconciliation.ts";
let reconciliation = read(reconciliationPath);

if (!reconciliation.includes('from "@/lib/payments/player-fee-coverage"')) {
  reconciliation = reconciliation.replace(
    'import { cancelQueuedMatchFeeNotificationDispatches } from "@/lib/payments/fixture-match-fees";',
    'import { cancelQueuedMatchFeeNotificationDispatches } from "@/lib/payments/fixture-match-fees";\nimport {\n  getPlayerFeeCashReceivedPence,\n  getPlayerFeeSubsidyPence,\n} from "@/lib/payments/player-fee-coverage";',
  );
}

reconciliation = replaceRequired(
  reconciliation,
  `    prisma.playerMatchFee.findMany({\n      where: {\n        teamId: input.teamId,\n        fixtureId: input.fixtureId,\n        status: "PAID",\n      },\n      select: {\n        id: true,\n        amountPence: true,\n      },\n    }),`,
  `    prisma.playerMatchFee.findMany({\n      where: {\n        teamId: input.teamId,\n        fixtureId: input.fixtureId,\n        status: { in: ["PAID", "WAIVED"] },\n      },\n      select: {\n        id: true,\n        amountPence: true,\n        status: true,\n        note: true,\n      },\n    }),`,
  "reconciliation covered fees query",
);

reconciliation = replaceRequired(
  reconciliation,
  `  const paidTotalPence = paidFees.reduce((sum, fee) => sum + fee.amountPence, 0);\n\n  if (paidTotalPence <= 0) return null;`,
  `  const paidTotalPence = paidFees.reduce(\n    (sum, fee) => sum + getPlayerFeeCashReceivedPence(fee),\n    0,\n  );\n  const subsidyPence = paidFees.reduce(\n    (sum, fee) => sum + getPlayerFeeSubsidyPence(fee),\n    0,\n  );\n  const coveredTotalPence = paidTotalPence + subsidyPence;\n\n  if (coveredTotalPence <= 0) return null;`,
  "reconciliation subsidy totals",
);

reconciliation = reconciliation.replace(
  "    playerMatchFeeIds: paidFees.map((fee) => fee.id),",
  '    playerMatchFeeIds: paidFees.filter((fee) => fee.status === "PAID").map((fee) => fee.id),',
);

reconciliation = replaceRequired(
  reconciliation,
  `  if (paidTotalPence < matchingCharge.amountPence) {\n    return {\n      chargeId: matchingCharge.id,\n      paidTotalPence,\n      covered: false,\n      overpaymentPence,\n    };\n  }`,
  `  if (coveredTotalPence < matchingCharge.amountPence) {\n    return {\n      chargeId: matchingCharge.id,\n      paidTotalPence,\n      subsidyPence,\n      coveredTotalPence,\n      covered: false,\n      overpaymentPence,\n    };\n  }`,
  "reconciliation coverage threshold",
);

reconciliation = replaceRequired(
  reconciliation,
  `        appendCoveredNote(matchingCharge.description, paidTotalPence),`,
  `        appendCoveredNote(matchingCharge.description, coveredTotalPence),`,
  "reconciliation covered note",
);

reconciliation = replaceRequired(
  reconciliation,
  `    chargeId: matchingCharge.id,\n    paidTotalPence,\n    covered: true,`,
  `    chargeId: matchingCharge.id,\n    paidTotalPence,\n    subsidyPence,\n    coveredTotalPence,\n    covered: true,`,
  "reconciliation covered return",
);

write(reconciliationPath, reconciliation);

// ---------------------------------------------------------------------------
// Team credit usage: subsidy affects outstanding balance, but cannot itself be
// transformed into team credit.
// ---------------------------------------------------------------------------
const creditsPath = "src/lib/payments/team-credits.ts";
let credits = read(creditsPath);

credits = credits.replaceAll(
  '          status: "PAID",',
  '          status: { in: ["PAID", "WAIVED"] },',
);
credits = credits.replaceAll(
  '        select: { fixtureId: true, amountPence: true },',
  '        select: { fixtureId: true, amountPence: true, status: true, note: true },',
);
credits = replaceRequired(
  credits,
  `    const paidPenceAfterCredit = current.summary.paidPence + amountUsedPence;\n    const nextStatus = getDisplayChargeStatus({\n      storedStatus: current.charge.status,\n      amountPence: current.charge.amountPence,\n      paidPence: paidPenceAfterCredit,\n    }) as PaymentChargeStatus;`,
  `    const coveredPenceAfterCredit = current.summary.coveredPence + amountUsedPence;\n    const nextStatus = getDisplayChargeStatus({\n      storedStatus: current.charge.status,\n      amountPence: current.charge.amountPence,\n      paidPence: coveredPenceAfterCredit,\n    }) as PaymentChargeStatus;`,
  "team credit covered balance",
);
write(creditsPath, credits);

// ---------------------------------------------------------------------------
// Admin Payments: include waived £0 rows in coverage and show subsidies as a
// separate internal figure.
// ---------------------------------------------------------------------------
const adminPaymentsPath = "src/app/(admin)/admin/payments/page.tsx";
let adminPayments = read(adminPaymentsPath);

adminPayments = adminPayments.replaceAll(
  "          status: PlayerMatchFeeStatus.PAID,",
  '          status: { in: [PlayerMatchFeeStatus.PAID, PlayerMatchFeeStatus.WAIVED] },',
);
adminPayments = adminPayments.replaceAll(
  "      where: { status: PlayerMatchFeeStatus.PAID },",
  '      where: { status: { in: [PlayerMatchFeeStatus.PAID, PlayerMatchFeeStatus.WAIVED] } },',
);
adminPayments = adminPayments.replaceAll(
  "        select: { fixtureId: true, amountPence: true },",
  "        select: { fixtureId: true, amountPence: true, status: true, note: true },",
);
adminPayments = adminPayments.replaceAll(
  `        amountPence: true,\n      },\n    }),\n  ]);`,
  `        amountPence: true,\n        status: true,\n        note: true,\n      },\n    }),\n  ]);`,
);

adminPayments = replaceRequired(
  adminPayments,
  `                        {row.summary.playerPaidPence > 0 ? <span className="rounded-full border border-emerald-400/20 bg-emerald-500/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-emerald-200">Squad paid {formatMoney(row.summary.playerPaidPence)}</span> : null}`,
  `                        {row.summary.playerPaidPence > 0 ? <span className="rounded-full border border-emerald-400/20 bg-emerald-500/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-emerald-200">Squad cash {formatMoney(row.summary.playerPaidPence)}</span> : null}\n                        {row.summary.playerSubsidyPence > 0 ? <span className="rounded-full border border-violet-400/20 bg-violet-500/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-violet-200">SIXFL subsidy {formatMoney(row.summary.playerSubsidyPence)}</span> : null}`,
  "admin subsidy badge",
);

adminPayments = replaceRequired(
  adminPayments,
  `<div className="mt-1 text-sm text-white/55">Paid {formatMoney(row.summary.paidPence)} · Outstanding {formatMoney(row.summary.outstandingPence)}</div>`,
  `<div className="mt-1 text-sm text-white/55">Cash received {formatMoney(row.summary.paidPence)} · Subsidy {formatMoney(row.summary.playerSubsidyPence)} · Covered {formatMoney(row.summary.coveredPence)} · Outstanding {formatMoney(row.summary.outstandingPence)}</div>`,
  "admin subsidy totals display",
);

write(adminPaymentsPath, adminPayments);

// ---------------------------------------------------------------------------
// Captain team-payments page: show only total coverage, not the hidden subsidy
// split, so the admin-only cap remains private.
// ---------------------------------------------------------------------------
const captainPaymentsPath = "src/app/captain/team/[teamid]/payments/page.tsx";
let captainPayments = read(captainPaymentsPath);

captainPayments = replaceRequired(
  captainPayments,
  `                          Paid {formatMoney(entry.paidPence)} · Outstanding {" "}\n                          {formatMoney(entry.outstandingPence)}`,
  `                          Covered {formatMoney(entry.coveredPence)} · Outstanding {" "}\n                          {formatMoney(entry.outstandingPence)}`,
  "captain covered balance",
);

captainPayments = replaceRequired(
  captainPayments,
  `                        {entry.playerPaidPence > 0 || entry.playerOpenPence > 0 ? (\n                          <div className="mt-1 text-xs text-white/45">\n                            Squad paid {formatMoney(entry.playerPaidPence)} · player links open {formatMoney(entry.playerOpenPence)}\n                          </div>\n                        ) : null}`,
  `                        {entry.playerPaidPence > 0 || entry.playerSubsidyPence > 0 || entry.playerOpenPence > 0 ? (\n                          <div className="mt-1 text-xs text-white/45">\n                            Squad shares covered {formatMoney(entry.playerPaidPence + entry.playerSubsidyPence)} · player links open {formatMoney(entry.playerOpenPence)}\n                          </div>\n                        ) : null}`,
  "captain hidden subsidy detail",
);

write(captainPaymentsPath, captainPayments);

// Sanity checks: a build must fail rather than silently deploy half the model.
for (const [filePath, required] of [
  [chargeSummaryPath, "playerSubsidyPence"],
  [ledgerPath, "coveredPence"],
  [reconciliationPath, "subsidyPence"],
  [creditsPath, "coveredPenceAfterCredit"],
  [adminPaymentsPath, "SIXFL subsidy"],
  [captainPaymentsPath, "Squad shares covered"],
]) {
  if (!read(filePath).includes(required)) {
    throw new Error(`Player fee subsidy accounting did not complete for ${filePath}.`);
  }
}

console.log(
  "Applied player-fee subsidy accounting: cash and SIXFL subsidy are separated while both can cover a fixture charge.",
);
