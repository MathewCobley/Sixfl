const fs = require("node:fs");
const path = require("node:path");

const target = path.join(__dirname, "apply-team-charge-waiver-accounting.cjs");
let source = fs.readFileSync(target, "utf8");

// This preparation script writes TypeScript/TSX using JavaScript template
// literals. Interpolations intended for the generated source must be escaped
// with exactly one backslash (\${...}). The original script accidentally used
// two backslashes, so Node consumed the first one and then tried to evaluate
// names such as `amount` while running the build preparation itself.
const brokenInterpolationPrefix = "\\\\" + "${";
const escapedInterpolationPrefix = "\\" + "${";
const occurrences = source.split(brokenInterpolationPrefix).length - 1;

if (occurrences > 0) {
  source = source.replaceAll(brokenInterpolationPrefix, escapedInterpolationPrefix);
  fs.writeFileSync(target, source, "utf8");
}

if (source.includes(brokenInterpolationPrefix)) {
  throw new Error("Team-charge waiver build interpolation repair did not complete.");
}

console.log(
  occurrences > 0
    ? `Repaired ${occurrences} generated-source interpolation escape(s) in team-charge waiver accounting.`
    : "Team-charge waiver build interpolations are already safe.",
);
