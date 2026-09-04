const fs = require("node:fs");
const path = require("node:path");

const target = path.join(
  process.cwd(),
  "src",
  "app",
  "(admin)",
  "admin",
  "fixtures",
  "[id]",
  "edit",
  "actions.ts",
);

let source = fs.readFileSync(target, "utf8");
let changed = false;

function count(needle) {
  return source.split(needle).length - 1;
}

// A blank fee on one side means "use that team's standard fee". It must not
// become £0 just because the other team has an explicit £0 fixture override.
if (!source.includes("const DEFAULT_MATCH_FEE_PENCE = 4000;")) {
  const anchor = "const FIXTURE_CONFIRMATION_CHASE_SOURCE_TYPES = [";
  if (!source.includes(anchor)) {
    throw new Error("Could not find fixture edit fee default anchor.");
  }
  source = source.replace(
    anchor,
    `const DEFAULT_MATCH_FEE_PENCE = 4000;\n\n${anchor}`,
  );
  changed = true;
}

// Load each selected team's own configured fee. Use line-based insertion so
// this survives unrelated additions to the select block (for example KO fields).
if (count("standardMatchFeePence: true,") < 2) {
  const lines = source.split("\n");
  for (let index = lines.length - 1; index >= 0; index -= 1) {
    if (lines[index].trim() !== "latestKickoffTime: true,") continue;
    if (lines[index + 1]?.trim() === "standardMatchFeePence: true,") continue;
    const indent = lines[index].match(/^\s*/)?.[0] ?? "";
    lines.splice(index + 1, 0, `${indent}standardMatchFeePence: true,`);
    changed = true;
  }
  source = lines.join("\n");
}

// Replace the whole fee-resolution section rather than depending on the exact
// legacy formatting. Earlier compatibility scripts may have changed whitespace
// or nearby lines, but these semantic anchors are stable.
const inheritedFeeResolution = [
  "    const homeMatchFeePence = hasFixturePlaceholder",
  "      ? null",
  "      : (requestedHomeMatchFeePence ??",
  "        homeTeam.standardMatchFeePence ??",
  "        DEFAULT_MATCH_FEE_PENCE);",
  "    const awayMatchFeePence = hasFixturePlaceholder",
  "      ? null",
  "      : (requestedAwayMatchFeePence ??",
  "        awayTeam.standardMatchFeePence ??",
  "        DEFAULT_MATCH_FEE_PENCE);",
  "    const fixtureMatchFeePence = hasFixturePlaceholder",
  "      ? null",
  "      : Math.max(homeMatchFeePence ?? 0, awayMatchFeePence ?? 0);",
].join("\n");

if (!source.includes(inheritedFeeResolution)) {
  const start = source.indexOf("    const homeMatchFeePence = hasFixturePlaceholder");
  const end = source.indexOf("\n\n    await prisma.$transaction", start);
  if (start === -1 || end === -1) {
    throw new Error("Could not find fixture edit team-fee resolution anchors.");
  }
  source = `${source.slice(0, start)}${inheritedFeeResolution}${source.slice(end)}`;
  changed = true;
}

// Persist both side-specific values on the fixture itself. The existing fee
// compatibility script may already have done this; if so this is a no-op.
const sharedFeeSave = "          matchFeePence: fixtureMatchFeePence,\n";
const sideSpecificFeeSave =
  "          matchFeePence: fixtureMatchFeePence,\n" +
  "          homeMatchFeePence,\n" +
  "          awayMatchFeePence,\n";
if (!source.includes(sideSpecificFeeSave)) {
  if (!source.includes(sharedFeeSave)) {
    throw new Error("Could not find fixture edit fee save anchor.");
  }
  source = source.replace(sharedFeeSave, sideSpecificFeeSave);
  changed = true;
}

if (count("standardMatchFeePence: true,") < 2) {
  throw new Error("Fixture edit must load both teams' standard fees.");
}
if (
  !source.includes("requestedHomeMatchFeePence ??") ||
  !source.includes("homeTeam.standardMatchFeePence ??") ||
  !source.includes("requestedAwayMatchFeePence ??") ||
  !source.includes("awayTeam.standardMatchFeePence ??")
) {
  throw new Error("Fixture edit blank fees are not inheriting team standards.");
}
if (source.includes("const hasExplicitMatchFee =")) {
  throw new Error("Fixture edit still derives a shared fee from only the populated side.");
}
if (!source.includes(sideSpecificFeeSave)) {
  throw new Error("Fixture edit is not persisting both side-specific fees.");
}

if (changed) {
  fs.writeFileSync(target, source, "utf8");
  console.log(
    "Fixture edits now keep each side independent: blank inherits team standard and explicit £0 affects only that team.",
  );
} else {
  console.log("Fixture edit team-fee inheritance already applied.");
}
