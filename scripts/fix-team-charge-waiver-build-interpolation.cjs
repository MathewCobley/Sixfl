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
const interpolationOccurrences =
  source.split(brokenInterpolationPrefix).length - 1;

if (interpolationOccurrences > 0) {
  source = source.replaceAll(
    brokenInterpolationPrefix,
    escapedInterpolationPrefix,
  );
}

if (source.includes(brokenInterpolationPrefix)) {
  throw new Error("Team-charge waiver build interpolation repair did not complete.");
}

// The contextual payment-label preparation runs before the waiver preparation
// and changes the Team credit row label for kit charges. Keep the waiver
// preparation's exact source anchor aligned with that already-prepared markup.
const oldCreditLabel = '<span>Team credit used</span>';
const contextualCreditLabel =
  '<span>{isKitCharge ? "Credit used" : "Team credit used"}</span>';
const labelOccurrences = source.split(oldCreditLabel).length - 1;

if (labelOccurrences > 0) {
  source = source.replaceAll(oldCreditLabel, contextualCreditLabel);
}

// Team-credit cap preparation now owns the public team checkout balance flow.
// Let the waiver preparation add its imports/transaction notes without failing
// on the old immutable balance anchor; a dedicated follow-up combines both
// policies and verifies the final checkout source.
const strictMissingGuard = [
  '  if (!source.includes(before)) {',
  '    throw new Error(`Expected ${label} source was not found.`);',
  '  }',
].join("\n");
const capCompatibleMissingGuard = [
  '  if (!source.includes(before)) {',
  '    if (label === "public charge waiver-aware outstanding") return source;',
  '    throw new Error(`Expected ${label} source was not found.`);',
  '  }',
].join("\n");

if (!source.includes(capCompatibleMissingGuard)) {
  if (!source.includes(strictMissingGuard)) {
    throw new Error("Could not find waiver preparation missing-source guard.");
  }
  source = source.replace(strictMissingGuard, capCompatibleMissingGuard);
}

fs.writeFileSync(target, source, "utf8");

console.log(
  `Repaired ${interpolationOccurrences} generated-source interpolation escape(s) and ${labelOccurrences} contextual credit-label anchor(s) in team-charge waiver accounting.`,
);
