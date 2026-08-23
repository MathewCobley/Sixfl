const fs = require("node:fs");
const path = require("node:path");

const root = process.cwd();

function read(relativePath) {
  return fs.readFileSync(path.join(root, ...relativePath.split("/")), "utf8");
}

function write(relativePath, source) {
  fs.writeFileSync(path.join(root, ...relativePath.split("/")), source, "utf8");
}

function replaceRequired(source, before, after, label) {
  if (source.includes(after)) return source;
  if (!source.includes(before)) {
    throw new Error(`Expected ${label} source was not found.`);
  }
  return source.replace(before, after);
}

// ---------------------------------------------------------------------------
// Admin payments: show waiver as settlement, not as cash, so the figures add up.
// ---------------------------------------------------------------------------
const adminPaymentsPath = "src/app/(admin)/admin/payments/page.tsx";
let adminPayments = read(adminPaymentsPath);

if (!adminPayments.includes('from "@/lib/payments/team-charge-waivers"')) {
  adminPayments = adminPayments.replace(
    'import { prisma } from "@/lib/prisma";',
    'import { stripTeamChargeWaiverMarkers } from "@/lib/payments/team-charge-waivers";\nimport { prisma } from "@/lib/prisma";',
  );
}

adminPayments = replaceRequired(
  adminPayments,
  `function formatChargeStatusLabel(status: string) {\n  if (status === "PART_PAID") return "PART PAID";\n  return status.replaceAll("_", " ");\n}`,
  `function formatChargeStatusLabel(status: string, waivedPence = 0) {\n  if (status === "PAID" && waivedPence > 0) return "SETTLED";\n  if (status === "PART_PAID") return "PART PAID";\n  return status.replaceAll("_", " ");\n}`,
  "admin payment settled status label",
);

adminPayments = replaceRequired(
  adminPayments,
  `<div className="mt-1 text-sm text-white/55">{row.charge.description || "No description"}</div>`,
  `<div className="mt-1 text-sm text-white/55">{stripTeamChargeWaiverMarkers(row.charge.description) || "No description"}</div>`,
  "admin payment clean waiver description",
);

adminPayments = replaceRequired(
  adminPayments,
  `<div className="mt-1 text-sm text-white/55">Paid {formatMoney(row.summary.paidPence)} · Outstanding {formatMoney(row.summary.outstandingPence)}</div>\n                      <div className="mt-1 text-xs uppercase tracking-[0.14em] text-white/45">\n                        {formatChargeStatusLabel(row.summary.displayStatus)}{statusChanged ? \` · stored \${formatChargeStatusLabel(row.charge.status)}\` : ""}\n                      </div>`,
  `<div className="mt-1 text-sm text-white/55">\n                        Paid {formatMoney(row.summary.paidPence)}\n                        {row.summary.waivedPence > 0 ? \` · SIXFL waiver \${formatMoney(row.summary.waivedPence)}\` : ""}\n                        {\` · Outstanding \${formatMoney(row.summary.outstandingPence)}\`}\n                      </div>\n                      <div className="mt-1 text-xs uppercase tracking-[0.14em] text-white/45">\n                        {formatChargeStatusLabel(row.summary.displayStatus, row.summary.waivedPence)}{statusChanged ? \` · stored \${formatChargeStatusLabel(row.charge.status, row.summary.waivedPence)}\` : ""}\n                      </div>`,
  "admin payment waiver arithmetic",
);

write(adminPaymentsPath, adminPayments);

// ---------------------------------------------------------------------------
// Captain player collection: a team waiver can settle the team balance while
// individual player requests intentionally remain collectible.
// ---------------------------------------------------------------------------
const playerCollectionPath = "src/app/captain/team/[teamid]/player-payments/PaymentPageServer.tsx";
let playerCollection = read(playerCollectionPath);

playerCollection = replaceRequired(
  playerCollection,
  `  const playerOutstandingPence = selectedEntry?.playerOpenPence ?? 0;\n  const stillToCoverPence = selectedEntry?.outstandingPence ?? 0;`,
  `  const playerOutstandingPence = selectedEntry?.playerOpenPence ?? 0;\n  const sixflWaivedPence = selectedEntry?.waivedPence ?? 0;\n  const stillToCoverPence = selectedEntry?.outstandingPence ?? 0;`,
  "captain player collection waiver amount",
);

playerCollection = replaceRequired(
  playerCollection,
  `  if (selectedEntry && stillToCoverPence <= 0) {\n    summaryTitle = "This fixture fee is fully covered.";\n    summaryText = \`${'${formatMoney(selectedEntry.amountPence)}'} has been covered: ${'${formatMoney(directPaidPence)}'} paid directly by the team and ${'${formatMoney(captainSettledPence)}'} of player shares settled.\`;\n  } else if (selectedEntry && !hasPlayerCollection) {`,
  `  if (selectedEntry && stillToCoverPence <= 0) {\n    if (sixflWaivedPence > 0 && playerOutstandingPence > 0) {\n      summaryTitle = "Team balance settled — player links remain open.";\n      summaryText = \`${'${formatMoney(selectedEntry.amountPence)}'} is currently settled: ${'${formatMoney(directPaidPence)}'} paid directly by the team, ${'${formatMoney(captainSettledPence)}'} of player shares settled and a ${'${formatMoney(sixflWaivedPence)}'} SIXFL waiver. ${'${formatMoney(playerOutstandingPence)}'} is still available to collect through the existing player links. Any later player payment reduces the SIXFL waiver first and does not become team credit while a waiver remains.\`;\n    } else {\n      summaryTitle = sixflWaivedPence > 0\n        ? "This fixture fee is settled."\n        : "This fixture fee is fully covered.";\n      summaryText = sixflWaivedPence > 0\n        ? \`${'${formatMoney(selectedEntry.amountPence)}'} is settled: ${'${formatMoney(directPaidPence)}'} paid directly by the team, ${'${formatMoney(captainSettledPence)}'} of player shares settled and a ${'${formatMoney(sixflWaivedPence)}'} SIXFL waiver.\`\n        : \`${'${formatMoney(selectedEntry.amountPence)}'} has been covered: ${'${formatMoney(directPaidPence)}'} paid directly by the team and ${'${formatMoney(captainSettledPence)}'} of player shares settled.\`;\n    }\n  } else if (selectedEntry && !hasPlayerCollection) {`,
  "captain player collection settled summary",
);

playerCollection = replaceRequired(
  playerCollection,
  `                ? "Amount still owed to SIXFL."\n                : "Fixture fee fully covered."`,
  `                ? "Amount still owed to SIXFL."\n                : sixflWaivedPence > 0\n                  ? \`Settled with a ${'${formatMoney(sixflWaivedPence)}'} SIXFL waiver${'${playerOutstandingPence > 0 ? "; player links remain open" : ""}'}.\`\n                  : "Fixture fee fully covered."`,
  "captain player collection balance explanation",
);

write(playerCollectionPath, playerCollection);

// ---------------------------------------------------------------------------
// Late-payment review: a partial/full team debt waiver must reduce the amount
// considered outstanding for warnings and £10 admin-fee decisions.
// ---------------------------------------------------------------------------
const lateFeeActionsPath = "src/app/(admin)/admin/fixtures/late-fees/actions.ts";
let lateFeeActions = read(lateFeeActionsPath);

if (!lateFeeActions.includes('from "@/lib/payments/team-charge-waivers"')) {
  lateFeeActions = lateFeeActions.replace(
    'import { prisma } from "@/lib/prisma";',
    'import { getTeamChargeWaivedPence } from "@/lib/payments/team-charge-waivers";\nimport { prisma } from "@/lib/prisma";',
  );
}

lateFeeActions = replaceRequired(
  lateFeeActions,
  `    const outstandingBeforeDecision = charge.amountPence - charge.paidTotalPence;`,
  `    const debtWaivedPence = getTeamChargeWaivedPence(charge.description);\n    const outstandingBeforeDecision = Math.max(\n      charge.amountPence - charge.paidTotalPence - debtWaivedPence,\n      0,\n    );`,
  "late payment decision waiver-aware balance",
);

write(lateFeeActionsPath, lateFeeActions);

const lateFeePagePath = "src/app/(admin)/admin/fixtures/late-fees/page.tsx";
let lateFeePage = read(lateFeePagePath);

if (!lateFeePage.includes('from "@/lib/payments/team-charge-waivers"')) {
  lateFeePage = lateFeePage.replace(
    'import { formatDateTimeInLondon } from "@/lib/datetime/london";',
    'import { formatDateTimeInLondon } from "@/lib/datetime/london";\nimport {\n  getTeamChargeWaivedPence,\n  stripTeamChargeWaiverMarkers,\n} from "@/lib/payments/team-charge-waivers";',
  );
}

lateFeePage = replaceRequired(
  lateFeePage,
  `  const auditItems = getPaymentLateFeeAuditItems(row);\n\n  return (`,
  `  const auditItems = getPaymentLateFeeAuditItems(row);\n  const debtWaivedPence = getTeamChargeWaivedPence(row.description);\n  const netOutstandingPence = Math.max(row.outstandingPence - debtWaivedPence, 0);\n  const displayDescription = stripTeamChargeWaiverMarkers(row.description);\n\n  return (`,
  "late fee card waiver values",
);

lateFeePage = replaceRequired(
  lateFeePage,
  `<p className="mt-1 text-sm text-white/55">{row.description || getPaymentFixtureLabel(row)}</p>`,
  `<p className="mt-1 text-sm text-white/55">{displayDescription || getPaymentFixtureLabel(row)}</p>`,
  "late fee clean waiver description",
);

lateFeePage = replaceRequired(
  lateFeePage,
  `<div>Paid: {formatMoney(row.paidTotalPence)}</div>\n            <div>Outstanding: {formatMoney(row.outstandingPence)}</div>`,
  `<div>Paid: {formatMoney(row.paidTotalPence)}</div>\n            {debtWaivedPence > 0 ? <div>SIXFL debt waiver: {formatMoney(debtWaivedPence)}</div> : null}\n            <div>Outstanding: {formatMoney(netOutstandingPence)}</div>`,
  "late fee waiver arithmetic",
);

write(lateFeePagePath, lateFeePage);

// ---------------------------------------------------------------------------
// Build-time contract: all key payment views/actions must recognise the waiver.
// ---------------------------------------------------------------------------
const checks = [
  [adminPayments.includes("row.summary.waivedPence") && adminPayments.includes("SETTLED"), "admin payments must display SIXFL waiver settlement"],
  [playerCollection.includes("player links remain open") && playerCollection.includes("sixflWaivedPence"), "captain player collection must explain recoverable waivers"],
  [lateFeeActions.includes("getTeamChargeWaivedPence(charge.description)"), "late fee decisions must use the net debt after waiver"],
  [lateFeePage.includes("SIXFL debt waiver") && lateFeePage.includes("netOutstandingPence"), "late fee review must display the net debt after waiver"],
];

const failures = checks.filter(([ok]) => !ok);
if (failures.length > 0) {
  console.error("Recoverable team waiver payment-view contract failed:");
  for (const [, message] of failures) console.error(`- ${message}`);
  process.exit(1);
}

console.log("Payment tabs and late-fee review now consistently support recoverable SIXFL team waivers.");
