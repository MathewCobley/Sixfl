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

const oldTeamSelect = [
  "          select: {",
  "            id: true,",
  "            name: true,",
  "            leagueId: true,",
  "            logoUrl: true,",
  "            latestKickoffTime: true,",
  "          },",
].join("\n");
const teamSelectWithFee = [
  "          select: {",
  "            id: true,",
  "            name: true,",
  "            leagueId: true,",
  "            logoUrl: true,",
  "            latestKickoffTime: true,",
  "            standardMatchFeePence: true,",
  "          },",
].join("\n");

if (count(teamSelectWithFee) < 2) {
  const occurrences = count(oldTeamSelect);
  if (occurrences < 2) {
    throw new Error(
      `Could not find both fixture edit team selects; found ${occurrences}.`,
    );
  }
  source = source.replaceAll(oldTeamSelect, teamSelectWithFee);
  changed = true;
}

const oldFeeResolution = [
  "    const homeMatchFeePence = hasFixturePlaceholder",
  "      ? null",
  "      : requestedHomeMatchFeePence;",
  "    const awayMatchFeePence = hasFixturePlaceholder",
  "      ? null",
  "      : requestedAwayMatchFeePence;",
  "    const hasExplicitMatchFee =",
  "      homeMatchFeePence !== null || awayMatchFeePence !== null;",
  "    const fixtureMatchFeePence = hasFixturePlaceholder",
  "      ? null",
  "      : hasExplicitMatchFee",
  "        ? Math.max(homeMatchFeePence ?? 0, awayMatchFeePence ?? 0)",
  "        : null;",
].join("\n");

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
  if (!source.includes(oldFeeResolution)) {
    throw new Error("Could not find fixture edit team-fee resolution block.");
  }
  source = source.replace(oldFeeResolution, inheritedFeeResolution);
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

if (changed) {
  fs.writeFileSync(target, source, "utf8");
  console.log(
    "Fixture edits now keep each side independent: blank inherits team standard and explicit £0 affects only that team.",
  );
} else {
  console.log("Fixture edit team-fee inheritance already applied.");
}
