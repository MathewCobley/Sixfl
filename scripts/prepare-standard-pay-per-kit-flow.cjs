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
console.log("Prepared standard pay-per-kit build patch.");
