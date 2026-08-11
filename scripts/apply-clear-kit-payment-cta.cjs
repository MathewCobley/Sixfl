const fs = require("node:fs");
const path = require("node:path");

const roots = [
  path.join(process.cwd(), "src/app/captain/team/[teamid]/kit"),
  path.join(process.cwd(), "src/components/captain"),
];

let replacements = 0;

function walk(directory) {
  if (!fs.existsSync(directory)) return;

  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      walk(fullPath);
      continue;
    }
    if (!/\.(ts|tsx)$/.test(entry.name)) continue;

    let source = fs.readFileSync(fullPath, "utf8");
    const before = source;

    source = source
      .replaceAll("Send kit payment links", "Request player kit payments")
      .replaceAll("Send £20 payment links", "Request £20 kit payments");

    if (source !== before) {
      fs.writeFileSync(fullPath, source, "utf8");
      replacements += 1;
    }
  }
}

for (const root of roots) walk(root);

console.log(
  replacements > 0
    ? `Renamed kit payment CTA in ${replacements} captain source file${replacements === 1 ? "" : "s"}.`
    : "Kit payment CTA already uses the clearer wording.",
);
