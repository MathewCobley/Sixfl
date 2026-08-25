const fs = require("node:fs");
const path = require("node:path");

const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const write = (file, source) => fs.writeFileSync(path.join(root, file), source, "utf8");

function ensureImport(source, anchor, line, label) {
  if (source.includes(line)) return source;
  if (!source.includes(anchor)) throw new Error(`Missing ${label} import anchor.`);
  return source.replace(anchor, `${anchor}\n${line}`);
}

function replaceRequired(source, before, after, label) {
  if (source.includes(after)) return source;
  if (!source.includes(before)) throw new Error(`Missing ${label} anchor.`);
  return source.replace(before, after);
}

// Team payments: expose the separate kit fund and transfer controls.
{
  const file = "src/app/captain/team/[teamid]/payments/page.tsx";
  let source = read(file);
  source = ensureImport(
    source,
    'import Link from "next/link";',
    'import TeamKitFundTransferPanel from "@/components/captain/TeamKitFundTransferPanel";',
    "TeamKitFundTransferPanel",
  );
  source = ensureImport(
    source,
    'import { formatDateTimeInLondon } from "@/lib/datetime/london";',
    'import { getKitFundLedger } from "@/lib/kits/kit-fund";',
    "getKitFundLedger",
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
    const marker = `        <div className="rounded-3xl border border-emerald-400/20 bg-emerald-500/10 p-5">\n          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-emerald-100/70">\n            Payment history`;
    const block = `        <div className="rounded-3xl border border-sky-400/20 bg-sky-500/10 p-5">\n          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-sky-100/70">Kit fund</p>\n          <p className="mt-3 text-3xl font-semibold text-white">{formatMoney(Math.max(kitFundLedger.balancePence, 0))}</p>\n          <p className="mt-2 text-sm text-sky-100/75">Reserved for SIXFL kits only.</p>\n        </div>\n\n${marker}`;
    source = replaceRequired(source, marker, block, "kit fund summary card");
  }

  if (!source.includes("<TeamKitFundTransferPanel")) {
    const marker = "      {creditLedger.entries.length > 0 ? (";
    const block = `      <TeamKitFundTransferPanel\n        teamId={team.id}\n        teamCreditPence={Math.max(creditLedger.balancePence, 0)}\n        kitFundBalancePence={Math.max(kitFundLedger.balancePence, 0)}\n        entries={kitFundLedger.entries.slice(0, 8).map((entry) => ({\n          id: entry.id,\n          entryType: entry.entryType,\n          amountPence: entry.amountPence,\n          description: entry.description,\n          createdAtIso: entry.createdAt.toISOString(),\n        }))}\n      />\n\n${marker}`;
    source = replaceRequired(source, marker, block, "kit fund transfer panel");
  }
  write(file, source);
}

// Kit payment API: fund first, external payment only for the remainder.
{
  const file = "src/app/api/captain/team/[teamid]/extra-kit-payments/route.ts";
  let source = read(file);
  source = ensureImport(
    source,
    'import { buildExtraKitPaymentEmailCopy } from "@/lib/kits/extra-kit-payment-email-copy";',
    'import { applyKitFundToCharges, getKitFundBalancePence } from "@/lib/kits/kit-fund";',
    "kit fund API",
  );

  source = source.replace(
    "transactions: {\n        select: { amountPence: true },\n      },",
    "transactions: {\n        select: { amountPence: true, reference: true },\n      },",
  );

  if (!source.includes("const kitFundPaidPence = charge.transactions")) {
    source = replaceRequired(
      source,
      "    const outstandingPence = Math.max(charge.amountPence - paidPence, 0);",
      `    const outstandingPence = Math.max(charge.amountPence - paidPence, 0);\n    const kitFundPaidPence = charge.transactions\n      .filter((transaction) => transaction.reference === "KIT_FUND")\n      .reduce((sum, transaction) => sum + transaction.amountPence, 0);\n    const externalPaidPence = Math.max(paidPence - kitFundPaidPence, 0);`,
      "kit fund paid split",
    );
    source = replaceRequired(
      source,
      "      outstandingPence,\n      status:",
      "      outstandingPence,\n      kitFundPaidPence,\n      externalPaidPence,\n      status:",
      "kit fund response split",
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
    const marker = "\n\n  let emailsQueued = 0;";
    const block = `\n\n  const kitFundApplication = await applyKitFundToCharges({\n    teamId: team.id,\n    batchReference,\n    charges: charges.map((charge) => ({ id: charge.id, amountPence: charge.amountPence })),\n    createdByUserId: access.user?.id ?? null,\n  });\n  const kitFundChargeState = new Map(\n    kitFundApplication.charges.map((charge) => [charge.id, charge]),\n  );${marker}`;
    source = replaceRequired(source, marker, block, "kit fund charge application");
  }

  if (!source.includes("kitFundChargeState.get(charge.id)?.outstandingPence")) {
    const before = `    if (!member || !charge?.paymentToken || !email) {\n      emailsFailed += 1;\n      continue;\n    }`;
    const after = `    if (!member || !charge) {\n      emailsFailed += 1;\n      continue;\n    }\n\n    const outstandingPence =\n      kitFundChargeState.get(charge.id)?.outstandingPence ?? charge.amountPence;\n    if (outstandingPence <= 0) continue;\n\n    if (!charge.paymentToken || !email) {\n      emailsFailed += 1;\n      continue;\n    }`;
    source = replaceRequired(source, before, after, "kit fund email remainder");
  }

  source = source.replace(
    "        amountPence: charge.amountPence,\n        payerCount: selectedMembers.length,",
    "        amountPence: outstandingPence,\n        payerCount: selectedMembers.length,",
  );

  if (!source.includes("kitFundUsedPence: kitFundApplication.amountUsedPence")) {
    source = replaceRequired(
      source,
      "      success: true,\n      totalPence,",
      `      success: true,\n      totalPence,\n      kitFundUsedPence: kitFundApplication.amountUsedPence,\n      remainingKitFundPence: kitFundApplication.remainingKitFundPence,\n      kitFundBalancePence: kitFundApplication.remainingKitFundPence,\n      amountStillToCollectPence: Math.max(totalPence - kitFundApplication.amountUsedPence, 0),`,
      "kit fund POST response",
    );
  }
  write(file, source);
}

// Included/free-kit flow: final prebuild copy uses the incremental-kit wording.
{
  const file = "src/components/captain/IncludedKitPaymentPanel.tsx";
  let source = read(file);
  if (!source.includes("kitFundBalancePence?: number;")) {
    source = replaceRequired(
      source,
      "  extraKitPricePence?: number;",
      "  extraKitPricePence?: number;\n  kitFundBalancePence?: number;\n  kitFundUsedPence?: number;\n  remainingKitFundPence?: number;\n  amountStillToCollectPence?: number;",
      "included kit response types",
    );
  }
  if (!source.includes("externalPaidPence: number;")) {
    source = replaceRequired(
      source,
      "  outstandingPence: number;",
      "  outstandingPence: number;\n  kitFundPaidPence: number;\n  externalPaidPence: number;",
      "included kit request types",
    );
  }
  if (!source.includes("const kitFundBalancePence = data?.kitFundBalancePence")) {
    source = replaceRequired(
      source,
      "  const totalPence = quantity * extraKitPricePence;",
      `  const totalPence = quantity * extraKitPricePence;\n  const kitFundBalancePence = data?.kitFundBalancePence ?? 0;\n  const kitFundForOrderPence = Math.min(kitFundBalancePence, totalPence);\n  const amountStillToCollectPence = Math.max(totalPence - kitFundForOrderPence, 0);`,
      "included kit totals",
    );
  }

  if (!source.includes("Your team has {formatMoney(kitFundBalancePence)} in its kit fund")) {
    const finalCopy = "              Choose only the new kits you are adding now. Kits already paid for are shown separately and will not be charged again. Select one team member to pay the new amount, or several members to split it.";
    const replacement = `${finalCopy}\n            </p>\n\n            {kitFundBalancePence > 0 ? (\n              <div className="mt-4 rounded-2xl border border-sky-300/25 bg-sky-400/10 p-4 text-sm text-sky-50/85">\n                <div className="font-semibold text-white">Your team has {formatMoney(kitFundBalancePence)} in its kit fund.</div>\n                <p className="mt-1 leading-6">\n                  SIXFL will use {formatMoney(kitFundForOrderPence)} from the kit fund first.\n                  {amountStillToCollectPence > 0 ? (\n                    <> {formatMoney(amountStillToCollectPence)} will remain to collect after the fund is applied.</>\n                  ) : (\n                    <> This new kit order is fully covered, so no card payment will be requested.</>\n                  )}\n                </p>\n              </div>\n            ) : null}`;
    const paragraph = `${finalCopy}\n            </p>`;
    source = replaceRequired(source, paragraph, replacement, "included kit fund notice");
  }

  if (!source.includes("payload.kitFundUsedPence")) {
    const before = `      setMessage(\n        payload.emailsFailed\n          ? \`Payment links created. \${payload.emailsQueued ?? 0} email\${payload.emailsQueued === 1 ? "" : "s"} queued; \${payload.emailsFailed} could not be emailed, so use the payment links shown below.\`\n          : \`Payment link\${(payload.emailsQueued ?? 0) === 1 ? "" : "s"} created and emailed successfully.\`,\n      );`;
    const after = `      if ((payload.kitFundUsedPence ?? 0) > 0) {\n        const remaining = payload.amountStillToCollectPence ?? 0;\n        setMessage(remaining <= 0\n          ? \`\${formatMoney(payload.kitFundUsedPence ?? 0)} from the kit fund covered this kit order in full. No player payment is required.\`\n          : \`\${formatMoney(payload.kitFundUsedPence ?? 0)} from the kit fund was applied first. \${formatMoney(remaining)} remains to collect.\`);\n      } else {\n        setMessage(payload.emailsFailed\n          ? \`Payment links created. \${payload.emailsQueued ?? 0} email\${payload.emailsQueued === 1 ? "" : "s"} queued; \${payload.emailsFailed} could not be emailed, so use the payment links shown below.\`\n          : \`Payment link\${(payload.emailsQueued ?? 0) === 1 ? "" : "s"} created and emailed successfully.\`);\n      }`;
    source = replaceRequired(source, before, after, "included kit success copy");
  }

  if (!source.includes("Kit fund {formatMoney(request.kitFundPaidPence)}")) {
    const marker = `                        <div className="mt-1 text-xs text-white/45">\n                          {formatMoney(request.amountPence)} requested\n                        </div>`;
    const block = `${marker}\n                        {request.kitFundPaidPence > 0 ? (\n                          <div className="mt-1 text-xs font-semibold text-sky-100/75">Kit fund {formatMoney(request.kitFundPaidPence)} · {formatMoney(request.outstandingPence)} remaining</div>\n                        ) : null}`;
    source = replaceRequired(source, marker, block, "included request kit fund row");
  }
  source = source.replace(
    'request.status === "OPEN" && request.paidPence <= 0',
    'request.status === "OPEN" && request.externalPaidPence <= 0',
  );
  write(file, source);
}

// Standard £20-per-player flow.
{
  const file = "src/components/captain/StandardKitPaymentPanel.tsx";
  let source = read(file);
  if (!source.includes("externalPaidPence: number;")) {
    source = replaceRequired(
      source,
      "  outstandingPence: number;",
      "  outstandingPence: number;\n  kitFundPaidPence: number;\n  externalPaidPence: number;",
      "standard request types",
    );
  }
  if (!source.includes("kitFundBalancePence?: number;")) {
    source = replaceRequired(
      source,
      "  emailsFailed?: number;",
      "  emailsFailed?: number;\n  kitFundBalancePence?: number;\n  kitFundUsedPence?: number;\n  remainingKitFundPence?: number;\n  amountStillToCollectPence?: number;",
      "standard response types",
    );
  }
  if (!source.includes("const selectedKitTotalPence = selectedMemberIds.length * 2000")) {
    const marker = `  const selectedMembers = useMemo(\n    () =>\n      (data?.members ?? []).filter((member) =>\n        selectedMemberIds.includes(member.id),\n      ),\n    [data?.members, selectedMemberIds],\n  );`;
    const block = `${marker}\n  const selectedKitTotalPence = selectedMemberIds.length * 2000;\n  const kitFundBalancePence = data?.kitFundBalancePence ?? 0;\n  const kitFundForSelectionPence = Math.min(kitFundBalancePence, selectedKitTotalPence);\n  const remainingSelectionPence = Math.max(selectedKitTotalPence - kitFundForSelectionPence, 0);`;
    source = replaceRequired(source, marker, block, "standard kit totals");
  }
  if (!source.includes("Your team has {formatMoney(kitFundBalancePence)} in its kit fund")) {
    const marker = `          <p className="mt-2 max-w-3xl text-sm leading-6 text-white/65">\n            Choose every squad member who wants a kit. Each selected player receives their own £20 payment link. When their payment is complete, a kit personalisation box becomes available below.\n          </p>`;
    const block = `${marker}\n\n          {kitFundBalancePence > 0 ? (\n            <div className="mt-4 rounded-2xl border border-sky-300/25 bg-sky-400/10 p-4 text-sm text-sky-50/85">\n              <div className="font-semibold text-white">Your team has {formatMoney(kitFundBalancePence)} in its kit fund.</div>\n              <p className="mt-1 leading-6">Select the players who need kits. SIXFL uses the kit fund first and only asks for any remainder. Fully covered kits do not get card-payment emails.</p>\n            </div>\n          ) : null}`;
    source = replaceRequired(source, marker, block, "standard kit fund notice");
  }
  if (!source.includes("payload.kitFundUsedPence")) {
    const before = `      setMessage(\n        payload.emailsFailed\n          ? \`\${payload.emailsQueued ?? 0} payment email\${payload.emailsQueued === 1 ? "" : "s"} queued. \${payload.emailsFailed} could not be emailed, so use the payment links shown below.\`\n          : \`\${payload.emailsQueued ?? selectedMembers.length} £20 kit payment link\${(payload.emailsQueued ?? selectedMembers.length) === 1 ? "" : "s"} created and emailed.\`,\n      );`;
    const after = `      if ((payload.kitFundUsedPence ?? 0) > 0) {\n        const remaining = payload.amountStillToCollectPence ?? 0;\n        setMessage(remaining <= 0\n          ? \`\${formatMoney(payload.kitFundUsedPence ?? 0)} from the kit fund covered the selected kits in full. No payment emails were needed.\`\n          : \`\${formatMoney(payload.kitFundUsedPence ?? 0)} from the kit fund was used first. Only \${formatMoney(remaining)} remains to collect.\`);\n      } else {\n        setMessage(payload.emailsFailed\n          ? \`\${payload.emailsQueued ?? 0} payment email\${payload.emailsQueued === 1 ? "" : "s"} queued. \${payload.emailsFailed} could not be emailed, so use the payment links shown below.\`\n          : \`\${payload.emailsQueued ?? selectedMembers.length} £20 kit payment link\${(payload.emailsQueued ?? selectedMembers.length) === 1 ? "" : "s"} created and emailed.\`);\n      }`;
    source = replaceRequired(source, before, after, "standard kit success copy");
  }

  source = source.replace(
    `                  {submitting\n                    ? "Creating payment links…"\n                    : \`Create \${selectedMemberIds.length || ""} £20 payment link\${selectedMemberIds.length === 1 ? "" : "s"}\`.replace("Create  £", "Create £")}`,
    `                  {submitting\n                    ? "Creating kit order…"\n                    : selectedMemberIds.length > 0 && remainingSelectionPence <= 0\n                      ? \`Use kit fund for \${selectedMemberIds.length} kit\${selectedMemberIds.length === 1 ? "" : "s"}\`\n                      : \`Create payment for \${formatMoney(remainingSelectionPence)} remaining\`}`,
  );
  source = source.replace(
    `                  {selectedMemberIds.length > 0\n                    ? \`\${selectedMemberIds.length} kit\${selectedMemberIds.length === 1 ? "" : "s"} · \${formatMoney(selectedMemberIds.length * 2000)} total\`\n                    : "Select the players who want one kit each."}`,
    `                  {selectedMemberIds.length > 0\n                    ? \`\${selectedMemberIds.length} kit\${selectedMemberIds.length === 1 ? "" : "s"} · \${formatMoney(selectedKitTotalPence)} total · \${formatMoney(kitFundForSelectionPence)} kit fund · \${formatMoney(remainingSelectionPence)} remaining\`\n                    : "Select the players who want one kit each."}`,
  );
  if (!source.includes("Kit fund {formatMoney(request.kitFundPaidPence)}")) {
    const marker = `                      <div className="mt-1 text-xs text-white/45">\n                        {formatMoney(request.amountPence)} for one complete kit\n                      </div>`;
    const block = `${marker}\n                      {request.kitFundPaidPence > 0 ? (\n                        <div className="mt-1 text-xs font-semibold text-sky-100/75">Kit fund {formatMoney(request.kitFundPaidPence)} · {formatMoney(request.outstandingPence)} remaining</div>\n                      ) : null}`;
    source = replaceRequired(source, marker, block, "standard request kit fund row");
  }
  write(file, source);
}

for (const [file, markers] of [
  ["src/app/captain/team/[teamid]/payments/page.tsx", ["TeamKitFundTransferPanel", "kitFundLedger"]],
  ["src/app/api/captain/team/[teamid]/extra-kit-payments/route.ts", ["applyKitFundToCharges", "externalPaidPence"]],
  ["src/components/captain/IncludedKitPaymentPanel.tsx", ["kitFundBalancePence", "externalPaidPence"]],
  ["src/components/captain/StandardKitPaymentPanel.tsx", ["kitFundBalancePence", "remainingSelectionPence"]],
]) {
  const source = read(file);
  for (const marker of markers) {
    if (!source.includes(marker)) throw new Error(`Kit fund marker ${marker} missing from ${file}`);
  }
}

console.log("Kit fund v2 composition applied after the full SIXFL prebuild chain.");
