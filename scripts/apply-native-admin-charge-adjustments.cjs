const fs = require("node:fs");
const path = require("node:path");

const root = process.cwd();

function read(relativePath) {
  return fs.readFileSync(path.join(root, ...relativePath.split("/")), "utf8");
}

function write(relativePath, source) {
  fs.writeFileSync(path.join(root, ...relativePath.split("/")), source, "utf8");
}

const pagePath = "src/app/(admin)/admin/payments/page.tsx";
let page = read(pagePath);

if (!page.includes('AdminChargeAdjustmentButtons from "@/components/admin/payments/AdminChargeAdjustmentButtons"')) {
  page = page.replace(
    'import FormListboxField from "@/components/ui/FormListboxField";',
    'import AdminChargeAdjustmentButtons from "@/components/admin/payments/AdminChargeAdjustmentButtons";\nimport FormListboxField from "@/components/ui/FormListboxField";',
  );
}

page = page.replace(
  '<div key={row.charge.id} data-payment-charge-id={row.charge.id} className={`rounded-2xl border bg-[#0d1428] p-4 ${row.needsAdminChase ? "border-red-500/30" : "border-white/10"}`}>',
  '<div key={row.charge.id} data-payment-charge-id={row.charge.id} data-native-charge-adjustments="true" className={`rounded-2xl border bg-[#0d1428] p-4 ${row.needsAdminChase ? "border-red-500/30" : "border-white/10"}`}>',
);
page = page.replace(
  '<div key={row.charge.id} className={`rounded-2xl border bg-[#0d1428] p-4 ${row.needsAdminChase ? "border-red-500/30" : "border-white/10"}`}>',
  '<div key={row.charge.id} data-payment-charge-id={row.charge.id} data-native-charge-adjustments="true" className={`rounded-2xl border bg-[#0d1428] p-4 ${row.needsAdminChase ? "border-red-500/30" : "border-white/10"}`}>',
);

if (!page.includes("<AdminChargeAdjustmentButtons")) {
  const marker = `                          {canVoidCharge ? (\n                            <Link href={\`/admin/payments/void/\${row.charge.id}\`}`;
  if (!page.includes(marker)) {
    throw new Error("Admin payments native charge action insertion point was not found.");
  }

  const nativeActions = `                          {row.summary.outstandingPence > 0 && row.summary.displayStatus !== "VOID" ? (\n                            <AdminChargeAdjustmentButtons\n                              chargeId={row.charge.id}\n                              teamName={row.charge.team.name}\n                              title={row.charge.title}\n                              amountPence={row.charge.amountPence}\n                              outstandingPence={row.summary.outstandingPence}\n                            />\n                          ) : null}\n`;
  page = page.replace(marker, nativeActions + marker);
}

write(pagePath, page);

// The old client bridge is retained for legacy/player void helpers, but it must
// never add duplicate reduce/waive controls to cards that now render exact-id
// native actions directly from the server row.
const bridgePath = "src/components/admin/payments/AdminVoidPaymentChargesBridge.tsx";
let bridge = read(bridgePath);

bridge = bridge.replace(
  `  for (const card of findTeamChargeCards()) {\n    if (card.querySelector(TEAM_ADJUST_BUTTON_SELECTOR)) continue;`,
  `  for (const card of findTeamChargeCards()) {\n    if (card.getAttribute("data-native-charge-adjustments") === "true") continue;\n    if (card.querySelector(TEAM_ADJUST_BUTTON_SELECTOR)) continue;`,
);

if (bridge.includes("function injectTeamWaiverButtons")) {
  bridge = bridge.replace(
    `  for (const card of findTeamChargeCards()) {\n    if (card.querySelector(TEAM_WAIVE_BUTTON_SELECTOR)) continue;`,
    `  for (const card of findTeamChargeCards()) {\n    if (card.getAttribute("data-native-charge-adjustments") === "true") continue;\n    if (card.querySelector(TEAM_WAIVE_BUTTON_SELECTOR)) continue;`,
  );
}

write(bridgePath, bridge);

if (
  !page.includes("data-native-charge-adjustments=\"true\"") ||
  !page.includes("<AdminChargeAdjustmentButtons") ||
  !page.includes("outstandingPence={row.summary.outstandingPence}") ||
  !bridge.includes('card.getAttribute("data-native-charge-adjustments") === "true"')
) {
  throw new Error("Native admin charge adjustment contract failed.");
}

console.log(
  "Admin Reduce match fee and Waive outstanding controls now render natively on every eligible charge card using the exact PaymentCharge id.",
);
