const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const actionsPath = "src/app/(admin)/admin/fixtures/actions-legacy.ts";
const screenPath = "src/components/admin/fixtures/FixturesAdminScreen.tsx";

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

function write(relativePath, source) {
  fs.writeFileSync(path.join(root, relativePath), source, "utf8");
}

function count(source, needle) {
  return source.split(needle).length - 1;
}

let actions = read(actionsPath);

// The existing fixture-fee preparation runs before this script and adds the
// per-team fixture columns. A blank admin fee is not an override: it should use
// the selected team's configured standard fee. Explicit 0 remains a genuine
// free-team override because the earlier preparation preserves zero values.
if (!actions.includes("const DEFAULT_MATCH_FEE_PENCE = 4000;")) {
  const importAnchor = 'import { requireAdmin } from "@/lib/requireAdmin";\n';
  if (!actions.includes(importAnchor)) {
    throw new Error("Could not find fixture action import anchor for standard-fee inheritance.");
  }
  actions = actions.replace(
    importAnchor,
    `${importAnchor}\nconst DEFAULT_MATCH_FEE_PENCE = 4000;\n`,
  );
}

const compactTeamSelect =
  "select: { id: true, name: true, leagueId: true, logoUrl: true },";
const teamSelectWithFee =
  "select: { id: true, name: true, leagueId: true, logoUrl: true, standardMatchFeePence: true },";

if (!actions.includes(teamSelectWithFee)) {
  const teamSelectCount = count(actions, compactTeamSelect);
  if (teamSelectCount < 4) {
    throw new Error(
      `Expected at least 4 fixture team select blocks; found ${teamSelectCount}.`,
    );
  }
  actions = actions.replaceAll(compactTeamSelect, teamSelectWithFee);
}

const immutableFeeBinding = [
  "  const {",
  "    homeMatchFeePence,",
  "    awayMatchFeePence,",
  "    fixtureMatchFeePence,",
  "  } = parseFixtureTeamFees(formData);",
].join("\n");
const mutableFeeBinding = [
  "  let {",
  "    homeMatchFeePence,",
  "    awayMatchFeePence,",
  "    fixtureMatchFeePence,",
  "  } = parseFixtureTeamFees(formData);",
].join("\n");

if (!actions.includes(mutableFeeBinding)) {
  const bindingCount = count(actions, immutableFeeBinding);
  if (bindingCount < 2) {
    throw new Error(
      `Expected create/update fixture fee bindings; found ${bindingCount}.`,
    );
  }
  actions = actions.replaceAll(immutableFeeBinding, mutableFeeBinding);
}

const awayTeamValidation = [
  "  if (!awayTeam) {",
  '    throw new Error("Selected Team 2 was not found.");',
  "  }",
].join("\n");
const standardFeeResolution = [
  "",
  "  // Blank means use the team's standard match fee. A typed value is a",
  "  // fixture-level override; explicit 0 remains free for that team.",
  "  homeMatchFeePence ??=",
  "    homeTeam.standardMatchFeePence ?? DEFAULT_MATCH_FEE_PENCE;",
  "  awayMatchFeePence ??=",
  "    awayTeam.standardMatchFeePence ?? DEFAULT_MATCH_FEE_PENCE;",
  "  fixtureMatchFeePence = Math.max(homeMatchFeePence, awayMatchFeePence);",
].join("\n");

if (!actions.includes("homeTeam.standardMatchFeePence ?? DEFAULT_MATCH_FEE_PENCE")) {
  const validationCount = count(actions, awayTeamValidation);
  if (validationCount < 2) {
    throw new Error(
      `Expected create/update Team 2 validation blocks; found ${validationCount}.`,
    );
  }
  actions = actions.replaceAll(
    awayTeamValidation,
    `${awayTeamValidation}${standardFeeResolution}`,
  );
}

if (
  count(actions, "homeTeam.standardMatchFeePence ?? DEFAULT_MATCH_FEE_PENCE") < 2 ||
  count(actions, "awayTeam.standardMatchFeePence ?? DEFAULT_MATCH_FEE_PENCE") < 2
) {
  throw new Error("Blank fixture fees are not inheriting both team standards in create and update actions.");
}

if (
  !actions.includes("homeMatchFeePence,") ||
  !actions.includes("awayMatchFeePence,")
) {
  throw new Error("Per-team fixture fee fields must be prepared before blank-fee inheritance.");
}

write(actionsPath, actions);

let screen = read(screenPath);
const oldPlaceholder = 'placeholder="e.g. 30.00"';
const inheritedPlaceholder = 'placeholder="Blank = team standard"';
if (!screen.includes(inheritedPlaceholder)) {
  const placeholderCount = count(screen, oldPlaceholder);
  if (placeholderCount < 2) {
    throw new Error(
      `Expected both create-fixture fee placeholders; found ${placeholderCount}.`,
    );
  }
  screen = screen.replaceAll(oldPlaceholder, inheritedPlaceholder);
}
write(screenPath, screen);

console.log(
  "Blank fixture fees now inherit each selected team's standard fee; explicit values remain fixture overrides.",
);
