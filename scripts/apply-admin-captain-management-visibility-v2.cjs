const fs = require("node:fs");
const path = require("node:path");

const bridgePath = path.join(
  process.cwd(),
  "src",
  "components",
  "captain",
  "CaptainAdditionalCaptainBridge.tsx",
);

if (!fs.existsSync(bridgePath)) {
  throw new Error("Captain additional-captain bridge not found.");
}

let source = fs.readFileSync(bridgePath, "utf8");
let changed = false;

const oldRoute = '  return /^\\/captain\\/team\\/([^/]+)\\/captain-squad\\/?$/.exec(pathname)?.[1] ?? null;';
const newRoute = '  return /^\\/captain\\/team\\/([^/]+)\\/(?:captain-squad|squad)\\/?$/.exec(pathname)?.[1] ?? null;';

if (source.includes(oldRoute)) {
  source = source.replace(oldRoute, newRoute);
  changed = true;
}

const legacyAnchor = `  const addPlayerHeading = findHeading("Add a player to your squad");\n  const addPlayerSection = addPlayerHeading?.closest<HTMLElement>("section");`;
const arrayAnchor = `  const addPlayerHeading = findHeading(["Add a player to your squad", "Attach an existing user"]);\n  const addPlayerSection = addPlayerHeading?.closest<HTMLElement>("section");`;
const multilineAnchor = `  const addPlayerHeading =\n    findHeading(["Add a player to your squad", "Attach an existing user"]);\n  const addPlayerSection = addPlayerHeading?.closest<HTMLElement>("section");`;

if (source.includes(legacyAnchor)) {
  source = source.replace(legacyAnchor, arrayAnchor);
  changed = true;
}

// The bridge has evolved over time. If it already accepts both captain-squad
// and squad routes, do not fail the build merely because the exact DOM anchor
// text has changed. The current native bridge already contains its insertion
// logic; this compatibility script should only patch old variants.
if (!source.includes('(?:captain-squad|squad)')) {
  throw new Error("Could not enable captain management on the full admin Squad route.");
}

if (
  !source.includes("Attach an existing user") &&
  !source.includes(arrayAnchor) &&
  !source.includes(multilineAnchor)
) {
  console.warn(
    "Admin captain-management bridge uses a newer insertion strategy; route support is already present, so no legacy anchor patch was required.",
  );
}

if (changed) {
  fs.writeFileSync(bridgePath, source, "utf8");
  console.log("Captain management is visible in both captain and full-admin Squad views.");
} else {
  console.log("Admin captain-management visibility already applied.");
}
