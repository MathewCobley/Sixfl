const fs = require("node:fs");
const path = require("node:path");

const filePath = path.join(
  process.cwd(),
  "scripts/apply-late-player-payment-waiver-recovery.cjs",
);

let source = fs.readFileSync(filePath, "utf8");
const overEscaped = "\\\\${";
const correctlyEscaped = "\\${";
const count = source.split(overEscaped).length - 1;

if (count > 0) {
  source = source.replaceAll(overEscaped, correctlyEscaped);
  fs.writeFileSync(filePath, source, "utf8");
}

if (source.includes(overEscaped)) {
  throw new Error("Late-player waiver recovery interpolation repair did not complete.");
}

console.log(
  count > 0
    ? `Repaired ${count} late-player waiver recovery interpolation escape(s).`
    : "Late-player waiver recovery interpolation is already build-safe.",
);
