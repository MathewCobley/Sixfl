const fs = require("node:fs");
const path = require("node:path");

const file = path.join(process.cwd(), "src", "app", "(admin)", "admin", "leads", "page.tsx");
let source = fs.readFileSync(file, "utf8");

source = source
  .replaceAll(", excludeType, excludeStatus })", ", excludeType: excludedType, excludeStatus: excludedStatus })")
  .replaceAll(", excludeType, excludeStatus:", ", excludeType: excludedType, excludeStatus:")
  .replaceAll(", excludeStatus })", ", excludeStatus: excludedStatus })");

if (source.includes(" excludeType,")) {
  throw new Error("Admin lead exclude filter typo fix: unresolved excludeType variable reference remains.");
}

fs.writeFileSync(file, source, "utf8");
console.log("Admin lead exclude filter variable names fixed.");
