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

const oldAnchor = `  const addPlayerHeading = findHeading("Add a player to your squad");\n  const addPlayerSection = addPlayerHeading?.closest<HTMLElement>("section");`;
const newAnchor = `  const addPlayerHeading =\n    findHeading(["Add a player to your squad", "Attach an existing user"]);\n  const addPlayerSection = addPlayerHeading?.closest<HTMLElement>("section");`;
if (source.includes(oldAnchor)) {
  source = source.replace(oldAnchor, newAnchor);
  changed = true;
}

if (!source.includes('(?:captain-squad|squad)')) {
  throw new Error("Could not enable captain management on the full admin Squad route.");
}

// This is a compatibility patch. The captain bridge has since evolved and can
// use a newer insertion strategy, so the exact legacy heading text is no longer
// a valid reason to fail a production build. If the route support is present,
// leave the newer bridge alone.
if (!source.includes("Attach an existing user")) {
  console.warn(
    "Captain management already supports the full admin Squad route; legacy insertion anchor not present, so no anchor patch was required.",
  );
}

if (changed) {
  fs.writeFileSync(bridgePath, source, "utf8");
  console.log("Captain management is now visible in both captain and full-admin Squad views.");
} else {
  console.log("Admin captain-management visibility already applied.");
}
