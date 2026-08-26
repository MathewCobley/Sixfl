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

{
  const file = "src/components/captain/TeamKitFundTransferPanel.tsx";
  let source = read(file);
  source = source.replace(
    '    <div className="space-y-3">',
    '    <div id="kit-fund" className="space-y-3">',
  );
  write(file, source);
}

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

for (const [file, markers] of [
  ["src/components/captain/TeamKitFundTransferPanel.tsx", ['id="kit-fund"']],
  ["src/app/captain/team/[teamid]/payments/credit-ledger/page.tsx", ["TeamKitFundTransferPanel", "getKitFundLedger(teamid)"]],
]) {
  const source = read(file);
  for (const marker of markers) {
    if (!source.includes(marker)) throw new Error(`Kit fund access marker ${marker} missing from ${file}.`);
  }
}

console.log("Kit fund is now available from Team payments and Team credit ledger.");
