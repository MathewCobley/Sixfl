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

// Make the shared compact kit-fund control directly linkable.
{
  const file = "src/components/captain/TeamKitFundTransferPanel.tsx";
  let source = read(file);
  source = source.replace(
    '    <div className="space-y-3">',
    '    <div id="kit-fund" className="space-y-3">',
  );
  write(file, source);
}

// Team credit ledger: the full compact fund control belongs next to the credit audit,
// because this is where a captain can see exactly how much credit is available to move.
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

// Team kit: keep this screen light. Give captains a clear route to the same fund
// rather than duplicating a second full finance panel in an already busy kit flow.
{
  const file = "src/app/captain/team/[teamid]/kit/page.tsx";
  let source = read(file);

  if (!source.includes("Manage kit fund")) {
    const marker = '      {sp.saved === "1" ? (';
    const access = `      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-sky-400/20 bg-sky-500/[0.07] px-4 py-3 sm:px-5">\n        <div>\n          <div className="text-sm font-semibold text-white">Kit fund</div>\n          <div className="mt-0.5 text-xs text-white/45">\n            Set team credit aside for future SIXFL kits.\n          </div>\n        </div>\n        <Link\n          href={\`/captain/team/\${teamid}/payments#kit-fund\`}\n          className="inline-flex min-h-10 items-center justify-center rounded-xl border border-sky-300/20 bg-sky-400/10 px-4 text-sm font-semibold text-sky-100 transition hover:bg-sky-400/15"\n        >\n          Manage kit fund\n        </Link>\n      </div>\n\n${marker}`;
    source = replaceRequired(source, marker, access, "kit page kit fund access");
  }

  write(file, source);
}

for (const [file, markers] of [
  ["src/components/captain/TeamKitFundTransferPanel.tsx", ['id="kit-fund"']],
  ["src/app/captain/team/[teamid]/payments/credit-ledger/page.tsx", ["TeamKitFundTransferPanel", "getKitFundLedger(teamid)"]],
  ["src/app/captain/team/[teamid]/kit/page.tsx", ["Manage kit fund", "payments#kit-fund"]],
]) {
  const source = read(file);
  for (const marker of markers) {
    if (!source.includes(marker)) throw new Error(`Kit fund access marker ${marker} missing from ${file}.`);
  }
}

console.log("Kit fund is now accessible from Team payments, Team credit ledger and Team kit.");
