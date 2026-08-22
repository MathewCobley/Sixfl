const fs = require("node:fs");
const path = require("node:path");

const file = path.join(process.cwd(), "scripts/apply-publish-tbc-fee-safety.cjs");
let source = fs.readFileSync(file, "utf8");

const before = `function replaceRequired(source, before, after, label) {
  if (source.includes(after)) return source;
  if (!source.includes(before)) {
    throw new Error(\`Expected \${label} source was not found.\`);
  }
  return source.replace(before, after);
}`;

const after = `function escapeRegExp(value) {
  return value.replace(/[.*+?^\${}()|[\\]\\\\]/g, "\\\\$&");
}

function whitespaceFlexiblePattern(value) {
  const parts = value.trim().split(/\\s+/).map(escapeRegExp);
  return new RegExp(parts.join("\\\\s+"));
}

function replaceFeeDeclarationBlock(source, after, input) {
  const scopeIndex = source.indexOf(input.scopeMarker);
  if (scopeIndex < 0) return null;

  const start = source.indexOf(input.startMarker, scopeIndex);
  if (start < 0) return null;

  const end = source.indexOf(input.endMarker, start);
  if (end < 0) return null;

  const afterLines = after.split("\\n");
  const replacement = afterLines.slice(1).join("\\n") + "\\n";
  return source.slice(0, start) + replacement + source.slice(end);
}

function replaceRequired(source, before, after, label) {
  if (source.includes(after)) return source;
  if (source.includes(before)) return source.replace(before, () => after);

  const flexibleAfter = whitespaceFlexiblePattern(after);
  if (flexibleAfter.test(source)) return source;

  const flexibleBefore = whitespaceFlexiblePattern(before);
  const match = source.match(flexibleBefore);
  if (match) return source.replace(match[0], () => after);

  if (label === "week publish TBC fee resolution") {
    const patched = replaceFeeDeclarationBlock(source, after, {
      scopeMarker: "  for (const fixture of unpublishedFixtures) {",
      startMarker: "    const homeMatchFeePence =",
      endMarker: "    const chargeResult =",
    });
    if (patched) return patched;
  }

  if (label === "single publish TBC fee resolution") {
    const patched = replaceFeeDeclarationBlock(source, after, {
      scopeMarker: "  const { fixture, league } = input;",
      startMarker: "  const homeMatchFeePence =",
      endMarker: "  const chargeResult =",
    });
    if (patched) return patched;
  }

  throw new Error(\`Expected \${label} source was not found.\`);
}`;

if (!source.includes("function replaceFeeDeclarationBlock")) {
  if (!source.includes(before)) {
    throw new Error("TBC publish compatibility function anchor not found.");
  }
  source = source.replace(before, () => after);
  fs.writeFileSync(file, source, "utf8");
  console.log("Made TBC publish safety patch compatible with evolved fixture-fee source.");
}
