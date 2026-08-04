const fs = require("node:fs");
const path = require("node:path");

const tablePath = path.join(
  process.cwd(),
  "src",
  "components",
  "leagues",
  "LeagueTableCard.tsx",
);

if (!fs.existsSync(tablePath)) {
  console.log("League table card not present; skipping form-row layout fix.");
  process.exit(0);
}

let source = fs.readFileSync(tablePath, "utf8");

source = source.replace(
  '                      <div className="flex flex-wrap items-center gap-2">',
  '                      <div className="flex flex-nowrap items-center gap-1.5">',
);

if (!source.includes('className="flex flex-nowrap items-center gap-1.5"')) {
  throw new Error("League table form-row layout fix was not applied correctly.");
}

fs.writeFileSync(tablePath, source, "utf8");
console.log("League table form badges now remain on one row.");
