const fs = require("node:fs");
const path = require("node:path");

const root = process.cwd();
const pagePath = path.join(root, "src", "app", "captain", "team", "[teamid]", "kit", "page.tsx");
const formPath = path.join(root, "src", "components", "captain", "TeamKitOrderForm.tsx");

if (!fs.existsSync(pagePath) || !fs.existsSync(formPath)) {
  console.warn("Captain kit page/form missing; pending-payment submit UI skipped.");
  process.exit(0);
}

let page = fs.readFileSync(pagePath, "utf8");
if (!page.includes("pendingExtraKitQuantity={extraKitPaymentSummary.pendingExtraKitQuantity}")) {
  const anchors = [
    '          includedKitQuantity={includedKitQuantity}\n',
    '          includedKitQuantity={TEAM_KIT_QUANTITY}\n',
  ];
  const anchor = anchors.find((candidate) => page.includes(candidate));
  if (anchor) {
    page = page.replace(
      anchor,
      `${anchor}          pendingExtraKitQuantity={extraKitPaymentSummary.pendingExtraKitQuantity}\n`,
    );
  }
}
fs.writeFileSync(pagePath, page, "utf8");

let form = fs.readFileSync(formPath, "utf8");
if (!form.includes("pendingExtraKitQuantity?: number;")) {
  form = form.replace(
    "  locked: boolean;\n",
    "  pendingExtraKitQuantity?: number;\n  locked: boolean;\n",
  );
}
if (!form.includes("pendingExtraKitQuantity = 0,")) {
  form = form.replace(
    "  locked,\n  action,",
    "  pendingExtraKitQuantity = 0,\n  locked,\n  action,",
  );
}

if (!form.includes("Waiting for additional-kit payment")) {
  const buttonsAnchor = '      {!locked ? (\n        <div className="flex flex-col gap-3 sm:flex-row sm:justify-end">';
  if (form.includes(buttonsAnchor)) {
    form = form.replace(
      buttonsAnchor,
      [
        '      {!locked && pendingExtraKitQuantity > 0 ? (',
        '        <div className="rounded-2xl border border-amber-400/25 bg-amber-500/10 px-4 py-3 text-sm leading-6 text-amber-100">',
        '          <span className="font-semibold">Waiting for additional-kit payment.</span>{" "}',
        '          You can save the order now. Submit will become available when all requested additional kits have been paid for.',
        '        </div>',
        '      ) : null}',
        '',
        buttonsAnchor,
      ].join("\n"),
    );
  }
}

if (!form.includes('disabled={pendingExtraKitQuantity > 0}')) {
  form = form.replace(
    '            value="submit"\n',
    '            value="submit"\n            disabled={pendingExtraKitQuantity > 0}\n',
  );
  form = form.replace(
    'className="inline-flex min-h-12 items-center justify-center rounded-2xl bg-emerald-400 px-6 text-sm font-semibold text-black transition hover:bg-emerald-300"',
    'className="inline-flex min-h-12 items-center justify-center rounded-2xl bg-emerald-400 px-6 text-sm font-semibold text-black transition hover:bg-emerald-300 disabled:cursor-not-allowed disabled:bg-white/10 disabled:text-white/40"',
  );
}

fs.writeFileSync(formPath, form, "utf8");
console.log("Pending extra-kit payments leave Save draft available and visibly disable Submit kit order.");
