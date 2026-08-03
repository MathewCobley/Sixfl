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

console.log(
  "Prepared the standard pay-per-kit flow without any post-render copy bridge.",
);
