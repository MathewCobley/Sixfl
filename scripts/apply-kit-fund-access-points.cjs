const fs = require("node:fs");
const path = require("node:path");

const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const write = (file, source) => fs.writeFileSync(path.join(root, file), source, "utf8");

function ensureImport(source, anchor, importLine, label) {
  if (source.includes(importLine)) return source;
  if (!source.includes(anchor)) throw new Error(`Missing ${label} import anchor.`);
  return source.replace(anchor, `${anchor}\n${importLine}`);
}

function replaceRequired(source, before, after, label) {
  if (source.includes(after)) return source;
  if (!source.includes(before)) throw new Error(`Missing ${label} anchor.`);
  return source.replace(before, after);
}

// Make the compact kit-fund control directly linkable from other captain pages.
{
  const file = "src/components/captain/TeamKitFundTransferPanel.tsx";
  let source = read(file);
  source = source.replace(
    '    <div className="space-y-3">',
    '    <div id="kit-fund" className="space-y-3">',
  );
  write(file, source);
}

// Team credit ledger: put the same compact kit-fund control beside the credit audit.
{
  const file = "src/app/captain/team/[teamid]/payments/credit-ledger/page.tsx";
  let source = read(file);

  source = ensureImport(
    source,
    'import Link from "next/link";',
    'import TeamKitFundTransferPanel from "@/components/captain/TeamKitFundTransferPanel";',
    "credit ledger kit fund component",
  );
  source = ensureImport(
    source,
    'import { formatDateTimeInLondon } from "@/lib/datetime/london";',
    'import { getKitFundLedger } from "@/lib/kits/kit-fund";',
    "credit ledger kit fund ledger",
  );

  source = replaceRequired(
    source,
    '  const creditLedger = await getTeamCreditLedger(paymentLedger.relatedTeamIds);',
    '  const [creditLedger, kitFundLedger] = await Promise.all([\n    getTeamCreditLedger(paymentLedger.relatedTeamIds),\n    getKitFundLedger(teamid),\n  ]);',
    "credit and kit ledger load",
  );

  if (!source.includes("<TeamKitFundTransferPanel")) {
    const marker = '      <section className="overflow-hidden rounded-3xl border border-white/10 bg-black/20">';
    const panel = `      <TeamKitFundTransferPanel\n        teamId={team.id}\n        teamCreditPence={Math.max(creditLedger.balancePence, 0)}\n        kitFundBalancePence={Math.max(kitFundLedger.balancePence, 0)}\n        entries={kitFundLedger.entries.slice(0, 8).map((entry) => ({\n          id: entry.id,\n          entryType: entry.entryType,\n          amountPence: entry.amountPence,\n          description: entry.description,\n          createdAtIso: entry.createdAt.toISOString(),\n        }))}\n      />\n\n${marker}`;
    source = replaceRequired(source, marker, panel, "credit ledger kit fund panel");
  }

  write(file, source);
}

// Team kit page: surface the same compact fund control where captains actually order kits.
{
  const file = "src/app/captain/team/[teamid]/kit/page.tsx";
  let source = read(file);

  source = ensureImport(
    source,
    'import TeamKitOrderForm from "@/components/captain/TeamKitOrderForm";',
    'import TeamKitFundTransferPanel from "@/components/captain/TeamKitFundTransferPanel";',
    "kit page fund component",
  );
  source = ensureImport(
    source,
    'import { getTeamKitOrder, listKitDesigns } from "@/lib/kits/db";',
    'import { getKitFundLedger } from "@/lib/kits/kit-fund";',
    "kit page fund ledger",
  );
  source = ensureImport(
    source,
    'import { getKitFundLedger } from "@/lib/kits/kit-fund";',
    'import { getTeamCreditLedger } from "@/lib/payments/team-credits";',
    "kit page team credit",
  );
  source = ensureImport(
    source,
    'import { getTeamCreditLedger } from "@/lib/payments/team-credits";',
    'import { getRelatedTeamIdsForPaymentLedger } from "@/lib/payments/team-payment-ledger";',
    "kit page related teams",
  );

  source = replaceRequired(
    source,
    '  const [allDesigns, order] = await Promise.all([\n    listKitDesigns({ includeInactive: true }),\n    getTeamKitOrder(teamid),\n  ]);',
    '  const paymentIdentity = await getRelatedTeamIdsForPaymentLedger(teamid);\n  const relatedTeamIds = paymentIdentity?.relatedTeamIds ?? [teamid];\n\n  const [allDesigns, order, creditLedger, kitFundLedger] = await Promise.all([\n    listKitDesigns({ includeInactive: true }),\n    getTeamKitOrder(teamid),\n    getTeamCreditLedger(relatedTeamIds),\n    getKitFundLedger(teamid),\n  ]);',
    "kit page financial snapshot",
  );

  if (!source.includes("kitFundLedger.entries.slice(0, 8)")) {
    const marker = '      {sp.saved === "1" ? (';
    const panel = `      <TeamKitFundTransferPanel\n        teamId={team.id}\n        teamCreditPence={Math.max(creditLedger.balancePence, 0)}\n        kitFundBalancePence={Math.max(kitFundLedger.balancePence, 0)}\n        entries={kitFundLedger.entries.slice(0, 8).map((entry) => ({\n          id: entry.id,\n          entryType: entry.entryType,\n          amountPence: entry.amountPence,\n          description: entry.description,\n          createdAtIso: entry.createdAt.toISOString(),\n        }))}\n      />\n\n${marker}`;
    source = replaceRequired(source, marker, panel, "kit page fund panel");
  }

  write(file, source);
}

for (const [file, markers] of [
  ["src/components/captain/TeamKitFundTransferPanel.tsx", ['id="kit-fund"']],
  ["src/app/captain/team/[teamid]/payments/credit-ledger/page.tsx", ["TeamKitFundTransferPanel", "getKitFundLedger(teamid)"]],
  ["src/app/captain/team/[teamid]/kit/page.tsx", ["TeamKitFundTransferPanel", "getTeamCreditLedger(relatedTeamIds)", "getKitFundLedger(teamid)"]],
]) {
  const source = read(file);
  for (const marker of markers) {
    if (!source.includes(marker)) throw new Error(`Kit fund access marker ${marker} missing from ${file}.`);
  }
}

console.log("Kit fund is now available from Team payments, Team credit ledger and Team kit.");
