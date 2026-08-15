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
      .replaceAll("Send kit payment links", "Order team kits")
      .replaceAll("Request player kit payments", "Order team kits");

    if (source !== before) {
      fs.writeFileSync(fullPath, source, "utf8");
      replacements += 1;
    }
  }
}

for (const root of roots) walk(root);

console.log(
  replacements > 0
    ? `Renamed kit ordering CTA in ${replacements} captain source file${replacements === 1 ? "" : "s"}.`
    : "Kit ordering CTA already uses the preferred wording.",
);
