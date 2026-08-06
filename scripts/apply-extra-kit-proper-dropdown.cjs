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

const importLine = 'import FormListboxField from "@/components/ui/FormListboxField";';
if (!source.includes(importLine)) {
  const importAnchor = 'import { useRouter } from "next/navigation";';
  if (!source.includes(importAnchor)) {
    throw new Error("Could not find the IncludedKitPaymentPanel import anchor.");
  }
  source = source.replace(importAnchor, `${importAnchor}\n\n${importLine}`);
}

const oldTotals = [
  "  const totalPence = quantity * extraKitPricePence;",
  "  const requestedTotalKitQuantity = displayedIncludedQuantity + quantity;",
].join("\n");
const incrementalTotals = [
  "  const paidExtraKitQuantity = data?.paidExtraKitQuantity ?? 0;",
  "  const currentTotalKitQuantity =",
  "    data?.totalKitQuantity ??",
  "    displayedIncludedQuantity + paidExtraKitQuantity;",
  "  const totalPence = quantity * extraKitPricePence;",
  "  const requestedTotalKitQuantity = currentTotalKitQuantity + quantity;",
].join("\n");
if (!source.includes(incrementalTotals)) {
  if (!source.includes(oldTotals)) {
    throw new Error("Could not find the extra-kit total calculation.");
  }
  source = source.replace(oldTotals, incrementalTotals);
}

source = source.replace(
  "              Choose only the number of extra kits needed beyond the {displayedIncludedQuantity} already included. Select one team member to pay the full amount, or select several members to split the total equally.",
  "              Choose only the new kits you are adding now. Kits already paid for are shown separately and will not be charged again. Select one team member to pay the new amount, or several members to split it.",
);

if (!source.includes("      setQuantity(1);\n      setSelectedMemberIds([]);")) {
  source = source.replace(
    "      setSelectedMemberIds([]);",
    "      setQuantity(1);\n      setSelectedMemberIds([]);",
  );
}

const nativeSelectPattern = /                <label className="block max-w-sm space-y-2">[\s\S]*?                <\/label>\n\n                <div>/;

if (!source.includes('<FormListboxField\n                    name="extraKitQuantity"')) {
  if (!nativeSelectPattern.test(source)) {
    throw new Error("Could not find the native extra-kit quantity selector.");
  }

  const replacement = `                <div className="max-w-lg space-y-2">
                  <FormListboxField
                    name="extraKitQuantity"
                    label="New kits to add now"
                    value={String(quantity)}
                    options={Array.from({ length: 10 }, (_, index) => index + 1).map(
                      (option) => ({
                        value: String(option),
                        label: \`Add ${"${option}"} more kit${"${option === 1 ? \"\" : \"s\"}"} now — ${"${formatMoney(option * extraKitPricePence)}"}\`,
                      }),
                    )}
                    onValueChange={(value) => setQuantity(Number(value))}
                  />
                  <span className="block rounded-xl border border-sky-400/15 bg-sky-500/[0.06] px-3 py-2 text-sm leading-6 text-sky-50/80">
                    Current order: {currentTotalKitQuantity} kits. Adding {quantity} new kit{quantity === 1 ? "" : "s"} will make {requestedTotalKitQuantity} kits in total. New payment required: {formatMoney(totalPence)}
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
  !source.includes('label="New kits to add now"') ||
  !source.includes("currentTotalKitQuantity + quantity") ||
  !source.includes("New payment required:") ||
  !source.includes("setQuantity(1);") ||
  !source.includes("onValueChange={(value) => setQuantity(Number(value))}")
) {
  throw new Error("The incremental SIXFL extra-kit dropdown was not applied correctly.");
}

fs.writeFileSync(componentPath, source, "utf8");
console.log(
  "Extra kit quantity now charges only the new kits being added to the existing paid order.",
);
