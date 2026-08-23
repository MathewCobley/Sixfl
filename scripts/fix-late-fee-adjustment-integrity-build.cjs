const fs = require("node:fs");
const path = require("node:path");

const filePath = path.join(
  process.cwd(),
  "scripts/apply-late-fee-adjustment-integrity.cjs",
);

let source = fs.readFileSync(filePath, "utf8");

// This preparation file contains a generated TSX component inside a template
// literal. Some inner template-literal backticks/interpolations were written with
// two backslashes, which means Node closes/evaluates the outer template instead
// of preserving the generated TSX. Normalise only those generated-template
// escape prefixes before the preparation file is required.
const overEscapedBacktick = "\\\\`";
const correctBacktick = "\\`";
const overEscapedInterpolation = "\\\\${";
const correctInterpolation = "\\${";

const backtickCount = source.split(overEscapedBacktick).length - 1;
const interpolationCount = source.split(overEscapedInterpolation).length - 1;

if (backtickCount > 0) {
  source = source.replaceAll(overEscapedBacktick, correctBacktick);
}
if (interpolationCount > 0) {
  source = source.replaceAll(overEscapedInterpolation, correctInterpolation);
}

fs.writeFileSync(filePath, source, "utf8");

if (
  source.includes(overEscapedBacktick) ||
  source.includes(overEscapedInterpolation)
) {
  throw new Error("Late-fee adjustment generated-template escaping was not fully repaired.");
}

console.log(
  `Repaired ${backtickCount} generated backtick escape(s) and ${interpolationCount} interpolation escape(s) in late-fee adjustment integrity.`,
);
