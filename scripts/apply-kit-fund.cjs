const fs = require("node:fs");
const path = require("node:path");

const root = process.cwd();

function read(file) {
  return fs.readFileSync(path.join(root, file), "utf8");
}

function write(file, source) {
  fs.writeFileSync(path.join(root, file), source, "utf8");
}

function ensureImport(source, anchor, importLine, label) {
  if (source.includes(importLine)) return source;
  if (!source.includes(anchor)) throw new Error(`Expected ${label} import anchor was not found.`);
  return source.replace(anchor, `${anchor}\n${importLine}`);
}

function replaceRequired(source, before, after, label) {
  if (source.includes(after)) return source;
  if (!source.includes(before)) throw new Error(`Expected ${label} source was not found.`);
  return source.replace(before, after);
}

// ---------------------------------------------------------------------------
// Captain Team payments: show kit fund, transfer controls and recent fund audit.
// ---------------------------------------------------------------------------
{
  const file = "src/app/captain/team/[teamid]/payments/page.tsx";
  let source = read(file);

  source = ensureImport(
    source,
    'import Link from "next/link";',
    'import TeamKitFundTransferPanel from "@/components/captain/TeamKitFundTransferPanel";',
    "kit fund transfer component",
  );
  source = ensureImport(
    source,
    'import { formatDateTimeInLondon } from "@/lib/datetime/london";',
    'import { getKitFundLedger } from "@/lib/kits/kit-fund";',
    "kit fund ledger",
  );

  if (!source.includes("const kitFundLedger = await getKitFundLedger(teamid);")) {
    source = replaceRequired(
      source,
      "  const creditLedger = await getTeamCreditLedger(ledger.relatedTeamIds);",
      "  const creditLedger = await getTeamCreditLedger(ledger.relatedTeamIds);\n  const kitFundLedger = await getKitFundLedger(teamid);",
      "kit fund ledger load",
    );
  }

  source = source.replace(
    '<section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">',
    '<section className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">',
  );

  if (!source.includes("Reserved for SIXFL kits only.")) {
    const paymentHistoryCard = `        <div className="rounded-3xl border border-emerald-400/20 bg-emerald-500/10 p-5">\n          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-emerald-100/70">\n            Payment history`;
    const kitFundCard = `        <div className="rounded-3xl border border-sky-400/20 bg-sky-500/10 p-5">\n          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-sky-100/70">\n            Kit fund\n          </p>\n          <p className="mt-3 text-3xl font-semibold text-white">\n            {formatMoney(Math.max(kitFundLedger.balancePence, 0))}\n          </p>\n          <p className="mt-2 text-sm text-sky-100/75">\n            Reserved for SIXFL kits only.\n          </p>\n        </div>\n\n${paymentHistoryCard}`;
    source = replaceRequired(source, paymentHistoryCard, kitFundCard, "kit fund summary card");
  }

  if (!source.includes("<TeamKitFundTransferPanel")) {
    const creditLedgerMarker = "      {creditLedger.entries.length > 0 ? (";
    const panel = `      <TeamKitFundTransferPanel\n        teamId={team.id}\n        teamCreditPence={Math.max(creditLedger.balancePence, 0)}\n        kitFundBalancePence={Math.max(kitFundLedger.balancePence, 0)}\n        entries={kitFundLedger.entries.slice(0, 8).map((entry) => ({\n          id: entry.id,\n          entryType: entry.entryType,\n          amountPence: entry.amountPence,\n          description: entry.description,\n          createdAtIso: entry.createdAt.toISOString(),\n        }))}\n      />\n\n${creditLedgerMarker}`;
    source = replaceRequired(source, creditLedgerMarker, panel, "kit fund transfer panel");
  }

  write(file, source);
}

// ---------------------------------------------------------------------------
// Extra-kit API: use kit fund immediately, then email only the remainder.
// ---------------------------------------------------------------------------
{
  const file = "src/app/api/captain/team/[teamid]/extra-kit-payments/route.ts";
  let source = read(file);

  source = ensureImport(
    source,
    'import { buildExtraKitPaymentEmailCopy } from "@/lib/kits/extra-kit-payment-email-copy";',
    'import { applyKitFundToCharges, getKitFundBalancePence } from "@/lib/kits/kit-fund";',
    "extra-kit kit fund",
  );

  source = source.replace(
    "transactions: {\n        select: { amountPence: true },\n      },",
    "transactions: {\n        select: { amountPence: true, reference: true },\n      },",
  );

  if (!source.includes("const kitFundPaidPence = charge.transactions")) {
    source = replaceRequired(
      source,
      `    const outstandingPence = Math.max(charge.amountPence - paidPence, 0);`,
      `    const outstandingPence = Math.max(charge.amountPence - paidPence, 0);\n    const kitFundPaidPence = charge.transactions\n      .filter((transaction) => transaction.reference === "KIT_FUND")\n      .reduce((sum, transaction) => sum + transaction.amountPence, 0);`,
      "kit fund payment breakdown",
    );
    source = replaceRequired(
      source,
      `      outstandingPence,\n      status:`,
      `      outstandingPence,\n      kitFundPaidPence,\n      status:`,
      "kit fund request response",
    );
  }

  if (!source.includes("kitFundBalancePence: await getKitFundBalancePence(teamid)")) {
    source = replaceRequired(
      source,
      "    extraKitPricePence: EXTRA_KIT_PRICE_PENCE,",
      "    kitFundBalancePence: await getKitFundBalancePence(teamid),\n    extraKitPricePence: EXTRA_KIT_PRICE_PENCE,",
      "kit fund GET balance",
    );
  }

  if (!source.includes("const kitFundApplication = await applyKitFundToCharges")) {
    const emailsMarker = "\n\n  let emailsQueued = 0;";
    const application = `\n\n  const kitFundApplication = await applyKitFundToCharges({\n    teamId: team.id,\n    batchReference,\n    charges: charges.map((charge) => ({ id: charge.id, amountPence: charge.amountPence })),\n    createdByUserId: access.user?.id ?? null,\n  });\n  const kitFundChargeState = new Map(\n    kitFundApplication.charges.map((charge) => [charge.id, charge]),\n  );${emailsMarker}`;
    source = replaceRequired(source, emailsMarker, application, "kit fund application before emails");
  }

  if (!source.includes("const outstandingPence = kitFundChargeState.get(charge.id)")) {
    const oldGuard = `    if (!member || !charge?.paymentToken || !email) {\n      emailsFailed += 1;\n      continue;\n    }`;
    const newGuard = `    if (!member || !charge) {\n      emailsFailed += 1;\n      continue;\n    }\n\n    const outstandingPence =\n      kitFundChargeState.get(charge.id)?.outstandingPence ?? charge.amountPence;\n    if (outstandingPence <= 0) {\n      continue;\n    }\n\n    if (!charge.paymentToken || !email) {\n      emailsFailed += 1;\n      continue;\n    }`;
    source = replaceRequired(source, oldGuard, newGuard, "skip fully kit-funded emails");
  }

  source = source.replace(
    "        amountPence: charge.amountPence,\n        payerCount: selectedMembers.length,",
    "        amountPence: outstandingPence,\n        payerCount: selectedMembers.length,",
  );

  if (!source.includes("kitFundUsedPence: kitFundApplication.amountUsedPence")) {
    source = replaceRequired(
      source,
      `      success: true,\n      totalPence,`,
      `      success: true,\n      totalPence,\n      kitFundUsedPence: kitFundApplication.amountUsedPence,\n      remainingKitFundPence: kitFundApplication.remainingKitFundPence,\n      amountStillToCollectPence: Math.max(\n        totalPence - kitFundApplication.amountUsedPence,\n        0,\n      ),`,
      "kit fund POST response",
    );
  }

  write(file, source);
}

// ---------------------------------------------------------------------------
// Included-kit payment panel: explain the fund before creating payment links.
// ---------------------------------------------------------------------------
{
  const file = "src/components/captain/IncludedKitPaymentPanel.tsx";
  let source = read(file);

  if (!source.includes("kitFundBalancePence?: number;")) {
    source = replaceRequired(
      source,
      "  extraKitPricePence?: number;",
      "  extraKitPricePence?: number;\n  kitFundBalancePence?: number;\n  kitFundUsedPence?: number;\n  remainingKitFundPence?: number;\n  amountStillToCollectPence?: number;",
      "kit fund response fields",
    );
  }
  if (!source.includes("kitFundPaidPence: number;")) {
    source = replaceRequired(
      source,
      "  outstandingPence: number;",
      "  outstandingPence: number;\n  kitFundPaidPence: number;",
      "kit fund request field",
    );
  }

  if (!source.includes("const kitFundBalancePence = data?.kitFundBalancePence")) {
    source = replaceRequired(
      source,
      "  const totalPence = quantity * extraKitPricePence;",
      `  const totalPence = quantity * extraKitPricePence;\n  const kitFundBalancePence = data?.kitFundBalancePence ?? 0;\n  const kitFundForOrderPence = Math.min(kitFundBalancePence, totalPence);\n  const amountStillToCollectPence = Math.max(\n    totalPence - kitFundForOrderPence,\n    0,\n  );`,
      "kit fund order estimate",
    );
  }

  if (!source.includes("Your team has {formatMoney(kitFundBalancePence)} in its kit fund")) {
    const description = `            <p className="mt-2 max-w-3xl text-sm leading-6 text-white/60">\n              Choose only the number of extra kits needed beyond the {displayedIncludedQuantity} already included. Select one team member to pay the full amount, or select several members to split the total equally.\n            </p>`;
    const notice = `${description}\n\n            {kitFundBalancePence > 0 ? (\n              <div className="mt-4 rounded-2xl border border-sky-300/25 bg-sky-400/10 p-4 text-sm text-sky-50/85">\n                <div className="font-semibold text-white">\n                  Your team has {formatMoney(kitFundBalancePence)} in its kit fund.\n                </div>\n                <p className="mt-1 leading-6">\n                  SIXFL will use {formatMoney(kitFundForOrderPence)} from the kit fund first. {amountStillToCollectPence > 0 ? `${formatMoney(amountStillToCollectPence)} will remain to collect from the selected team member${selectedMembers.length === 1 ? "" : "s"}.` : "This order is fully covered, so no card payment will be requested."}\n                </p>\n              </div>\n            ) : null}`;
    source = replaceRequired(source, description, notice, "kit fund order notice");
  }

  source = source.replace(
    `                    {displayedIncludedQuantity} included + {quantity} extra = {requestedTotalKitQuantity} kits in total · Payment required: {formatMoney(totalPence)}`,
    `                    {displayedIncludedQuantity} included + {quantity} extra = {requestedTotalKitQuantity} kits in total · Kit fund used: {formatMoney(kitFundForOrderPence)} · Remaining payment: {formatMoney(amountStillToCollectPence)}`,
  );

  if (!source.includes("payload.kitFundUsedPence")) {
    const oldMessage = `      setMessage(\n        payload.emailsFailed\n          ? \`Payment links created. \${payload.emailsQueued ?? 0} email\${payload.emailsQueued === 1 ? "" : "s"} queued; \${payload.emailsFailed} could not be emailed, so use the payment links shown below.\`\n          : \`Payment link\${(payload.emailsQueued ?? 0) === 1 ? "" : "s"} created and emailed successfully.\`,\n      );`;
    const newMessage = `      if ((payload.kitFundUsedPence ?? 0) > 0) {\n        const remaining = payload.amountStillToCollectPence ?? 0;\n        setMessage(\n          remaining <= 0\n            ? \`\${formatMoney(payload.kitFundUsedPence ?? 0)} from the kit fund covered this kit order in full. No player payment is required.\`\n            : \`\${formatMoney(payload.kitFundUsedPence ?? 0)} from the kit fund was applied first. \${formatMoney(remaining)} remains to collect.\`,\n        );\n      } else {\n        setMessage(\n          payload.emailsFailed\n            ? \`Payment links created. \${payload.emailsQueued ?? 0} email\${payload.emailsQueued === 1 ? "" : "s"} queued; \${payload.emailsFailed} could not be emailed, so use the payment links shown below.\`\n            : \`Payment link\${(payload.emailsQueued ?? 0) === 1 ? "" : "s"} created and emailed successfully.\`,\n        );\n      }`;
    source = replaceRequired(source, oldMessage, newMessage, "kit fund success message");
  }

  if (!source.includes("Kit fund {formatMoney(request.kitFundPaidPence)}")) {
    source = replaceRequired(
      source,
      `                        <div className="mt-1 text-xs text-white/45">\n                          {formatMoney(request.amountPence)} requested\n                        </div>`,
      `                        <div className="mt-1 text-xs text-white/45">\n                          {formatMoney(request.amountPence)} requested\n                        </div>\n                        {request.kitFundPaidPence > 0 ? (\n                          <div className="mt-1 text-xs font-semibold text-sky-100/75">\n                            Kit fund {formatMoney(request.kitFundPaidPence)}\n                          </div>\n                        ) : null}`,
      "kit fund payment request row",
    );
  }

  write(file, source);
}

for (const [file, markers] of [
  ["src/app/captain/team/[teamid]/payments/page.tsx", ["TeamKitFundTransferPanel", "kitFundLedger.balancePence"]],
  ["src/app/api/captain/team/[teamid]/extra-kit-payments/route.ts", ["applyKitFundToCharges", "kitFundUsedPence"]],
  ["src/components/captain/IncludedKitPaymentPanel.tsx", ["kitFundBalancePence", "Remaining payment"]],
]) {
  const source = read(file);
  for (const marker of markers) {
    if (!source.includes(marker)) throw new Error(`Kit fund marker ${marker} missing from ${file}`);
  }
}

console.log("Kit fund transfer, audit and automatic kit-payment use are wired into captain payments and kit orders.");
