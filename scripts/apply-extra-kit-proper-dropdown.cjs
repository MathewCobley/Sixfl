const fs = require("node:fs");
const path = require("node:path");

const componentPath = path.join(
  process.cwd(),
  "src",
  "components",
  "captain",
  "IncludedKitPaymentPanel.tsx",
);

if (!fs.existsSync(componentPath)) {
  console.log("Included kit payment panel not present; skipping proper dropdown patch.");
  process.exit(0);
}

let source = fs.readFileSync(componentPath, "utf8");

// The incremental additional-kit selector is now committed directly in React.
// It deliberately distinguishes the current paid order from the new kits being
// added in this payment batch. Do not replace it with the old cumulative copy.
if (
  source.includes("New kits to add now") &&
  source.includes("Current order:") &&
  source.includes("Adding {quantity}") &&
  source.includes("New payment required:")
) {
  console.log(
    "Native incremental extra-kit quantity selector already present; legacy dropdown rewrite skipped.",
  );
  process.exit(0);
}

const importLine = 'import FormListboxField from "@/components/ui/FormListboxField";';
if (!source.includes(importLine)) {
  const importAnchor = 'import { useRouter } from "next/navigation";';
  if (!source.includes(importAnchor)) {
    throw new Error("Could not find the IncludedKitPaymentPanel import anchor.");
  }
  source = source.replace(importAnchor, `${importAnchor}\n\n${importLine}`);
}

const nativeSelectPattern = /                <label className="block max-w-sm space-y-2">[\s\S]*?                <\/label>\n\n                <div>/;

if (!source.includes('<FormListboxField\n                    name="extraKitQuantity"')) {
  if (!nativeSelectPattern.test(source)) {
    throw new Error("Could not find the native extra-kit quantity selector.");
  }

  const replacement = `                <div className="max-w-sm space-y-2">
                  <FormListboxField
                    name="extraKitQuantity"
                    label="Number of extra kits"
                    value={String(quantity)}
                    options={Array.from({ length: 10 }, (_, index) => index + 1).map(
                      (option) => ({
                        value: String(option),
                        label: \`${"${option}"} extra kit${"${option === 1 ? \"\" : \"s\"}"} — ${"${formatMoney(option * extraKitPricePence)}"}\`,
                      }),
                    )}
                    onValueChange={(value) => setQuantity(Number(value))}
                  />
                  <span className="block rounded-xl border border-sky-400/15 bg-sky-500/[0.06] px-3 py-2 text-sm text-sky-50/80">
                    {displayedIncludedQuantity} included + {quantity} extra = {requestedTotalKitQuantity} kits in total · Payment required: {formatMoney(totalPence)}
                    {selectedMembers.length > 1
                      ? \` · approximately ${"${formatMoney(estimatedSharePence)}"} each\`
                      : ""}
                  </span>
                </div>

                <div>`;

  source = source.replace(nativeSelectPattern, replacement);
}

if (
  source.includes("<select") ||
  !source.includes(importLine) ||
  !source.includes('name="extraKitQuantity"') ||
  !source.includes("onValueChange={(value) => setQuantity(Number(value))}")
) {
  throw new Error("The SIXFL extra-kit dropdown was not applied correctly.");
}

fs.writeFileSync(componentPath, source, "utf8");
console.log("Extra kit quantity now uses the standard SIXFL Headless UI dropdown.");
