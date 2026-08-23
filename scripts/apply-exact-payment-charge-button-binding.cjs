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

const paymentsPagePath = "src/app/(admin)/admin/payments/page.tsx";
let paymentsPage = read(paymentsPagePath);

paymentsPage = replaceRequired(
  paymentsPage,
  '<div key={row.charge.id} className={`rounded-2xl border bg-[#0d1428] p-4 ${row.needsAdminChase ? "border-red-500/30" : "border-white/10"}`}>',
  '<div key={row.charge.id} data-payment-charge-id={row.charge.id} className={`rounded-2xl border bg-[#0d1428] p-4 ${row.needsAdminChase ? "border-red-500/30" : "border-white/10"}`}>',
  "payment charge card id",
);

write(paymentsPagePath, paymentsPage);

const bridgePath = "src/components/admin/payments/AdminVoidPaymentChargesBridge.tsx";
let bridge = read(bridgePath);

const oldMatcher = `function findMatchingTeamCharge(card: Element, items: VoidableCharge[]) {\n  const text = normaliseText(card.textContent ?? \"\");\n\n  return items.find((item) => {\n    const teamName = normaliseText(item.teamName);\n    const title = normaliseText(item.title);\n    const fixtureLabel = item.fixtureLabel ? normaliseText(item.fixtureLabel) : null;\n\n    return (\n      text.includes(teamName) &&\n      text.includes(title) &&\n      (!fixtureLabel || text.includes(fixtureLabel))\n    );\n  });\n}`;

const exactMatcher = `function findMatchingTeamCharge(card: Element, items: VoidableCharge[]) {\n  // Always bind admin payment actions to the exact PaymentCharge row rendered\n  // by the server. Text matching is only a legacy fallback for old markup.\n  // This prevents duplicate/historical charges with the same team + fixture\n  // title from supplying the wrong outstanding balance to Reduce/Waive/Void.\n  const exactChargeId = card.getAttribute(\"data-payment-charge-id\")?.trim();\n  if (exactChargeId) {\n    return items.find((item) => item.id === exactChargeId);\n  }\n\n  const text = normaliseText(card.textContent ?? \"\");\n\n  return items.find((item) => {\n    const teamName = normaliseText(item.teamName);\n    const title = normaliseText(item.title);\n    const fixtureLabel = item.fixtureLabel ? normaliseText(item.fixtureLabel) : null;\n\n    return (\n      text.includes(teamName) &&\n      text.includes(title) &&\n      (!fixtureLabel || text.includes(fixtureLabel))\n    );\n  });\n}`;

bridge = replaceRequired(bridge, oldMatcher, exactMatcher, "exact payment charge action binding");
write(bridgePath, bridge);

if (
  !paymentsPage.includes("data-payment-charge-id={row.charge.id}") ||
  !bridge.includes('card.getAttribute("data-payment-charge-id")') ||
  !bridge.includes("item.id === exactChargeId")
) {
  throw new Error("Exact payment charge button binding contract failed.");
}

console.log(
  "Admin payment actions now bind to the exact PaymentCharge id instead of matching duplicate-looking cards by text.",
);
