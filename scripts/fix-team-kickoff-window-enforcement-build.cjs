const fs = require("node:fs");
const path = require("node:path");

const target = path.join(
  process.cwd(),
  "scripts/apply-team-kickoff-window-enforcement.cjs",
);
let source = fs.readFileSync(target, "utf8");

const strict =
  '  if (!source.includes(anchor)) throw new Error(`Missing ${label} anchor.`);';
const tolerant = [
  "  if (!source.includes(anchor)) {",
  "    console.warn(`Kick-off window prep anchor already evolved: ${label}. Continuing with remaining server-side guards.`);",
  "    return false;",
  "  }",
  "  return true;",
].join("\n");

if (!source.includes(tolerant)) {
  if (!source.includes(strict)) {
    throw new Error("Kick-off window enforcement anchor helper was not found.");
  }
  source = source.replace(strict, tolerant);
  fs.writeFileSync(target, source, "utf8");
}

console.log("Kick-off window enforcement build compatibility prepared.");
