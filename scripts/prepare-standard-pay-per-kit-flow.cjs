const fs = require("node:fs");
const path = require("node:path");

const filePath = path.join(
  process.cwd(),
  "scripts/apply-standard-pay-per-kit-flow.cjs",
);
let source = fs.readFileSync(filePath, "utf8");

source = source.replace(
  "  if (source.includes(after)) return;",
  "  if (after && source.includes(after)) return;",
);

fs.writeFileSync(filePath, source, "utf8");

const panelPath = path.join(
  process.cwd(),
  "src/components/captain/StandardKitPaymentPanel.tsx",
);
let panelSource = fs.readFileSync(panelPath, "utf8");
panelSource = panelSource.replace(
  "        ...current,",
  "        ...(current ?? {}),",
);
fs.writeFileSync(panelPath, panelSource, "utf8");

const copyBridgePath = path.join(
  process.cwd(),
  "src/components/captain/StandardTeamKitCopyBridge.tsx",
);
let copyBridgeSource = fs.readFileSync(copyBridgePath, "utf8");

const duplicatedInstructionBlock = [
  "    if (",
  "      text ===",
  '      "The compulsory team contribution is £70 in total — £10 for each of the seven personalised shirts. Payment is required before SIXFL places the supplier order."',
  "    ) {",
  "      element.textContent =",
  '        "Complete kits cost £20 each. Send a payment link to each squad member who wants one. A personalisation box appears after that kit has been paid for.";',
  "      return;",
  "    }",
].join("\n");

const deduplicatedInstructionBlock = [
  "    if (",
  "      element.tagName === \"P\" &&",
  "      (text ===",
  '        "The compulsory team contribution is £70 in total — £10 for each of the seven personalised shirts. Payment is required before SIXFL places the supplier order." ||',
  "        text ===",
  '          "Complete kits cost £20 each. Send a payment link to each squad member who wants one. A personalisation box appears after that kit has been paid for.")',
  "    ) {",
  "      // The server-rendered standard-team introduction already explains the",
  "      // £20 payment flow. Remove this legacy package paragraph instead of",
  "      // rewriting it into a second copy of the same instructions.",
  "      element.remove();",
  "      return;",
  "    }",
].join("\n");

if (!copyBridgeSource.includes(deduplicatedInstructionBlock)) {
  if (!copyBridgeSource.includes(duplicatedInstructionBlock)) {
    throw new Error(
      "Expected duplicated standard-kit instruction block was not found.",
    );
  }

  copyBridgeSource = copyBridgeSource.replace(
    duplicatedInstructionBlock,
    deduplicatedInstructionBlock,
  );
  fs.writeFileSync(copyBridgePath, copyBridgeSource, "utf8");
}

console.log(
  "Prepared standard pay-per-kit flow and removed the duplicated kit instructions.",
);
