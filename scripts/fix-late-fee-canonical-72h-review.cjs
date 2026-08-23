const fs = require("node:fs");
const path = require("node:path");

const actionsPath = path.join(
  process.cwd(),
  "src/app/(admin)/admin/fixtures/late-fees/actions.ts",
);
let source = fs.readFileSync(actionsPath, "utf8");

function replaceRequired(before, after, label) {
  if (source.includes(after)) return;
  if (!source.includes(before)) {
    throw new Error(`Expected ${label} source was not found.`);
  }
  source = source.replace(before, after);
}

// Canonical payment reconciliation is applied late in the production patch chain.
// It must not undo the existing rule that unpaid fixture charges enter admin review
// 72 hours after kick-off. The separate £10 admin-fee eligibility remains seven days.
replaceRequired(
  [
    '        CASE',
    '          WHEN charge."dueDate" IS NULL THEN NULL',
    '          ELSE FLOOR(EXTRACT(EPOCH FROM (NOW() - charge."dueDate")) / 86400)::int',
    '        END AS "daysLate",',
  ].join("\n"),
  [
    '        CASE',
    '          WHEN COALESCE(fixture."kickoffAt", charge."dueDate") IS NULL THEN NULL',
    '          ELSE FLOOR(',
    '            EXTRACT(EPOCH FROM (NOW() - COALESCE(fixture."kickoffAt", charge."dueDate"))) / 86400',
    '          )::int',
    '        END AS "daysLate",',
  ].join("\n"),
  "canonical late-fee 72-hour age calculation",
);

replaceRequired(
  '    WHERE "daysLate" >= 7',
  [
    '    WHERE COALESCE("kickoffAt", "dueDate") IS NOT NULL',
    '      AND COALESCE("kickoffAt", "dueDate") + INTERVAL \'72 hours\' <= NOW()',
  ].join("\n"),
  "canonical late-fee 72-hour review filter",
);

if (
  source.includes('WHERE "daysLate" >= 7') ||
  !source.includes("INTERVAL '72 hours' <= NOW()") ||
  !source.includes('COALESCE(fixture."kickoffAt", charge."dueDate")')
) {
  throw new Error("Canonical late-fee review no longer preserves the 72-hour review window.");
}

fs.writeFileSync(actionsPath, source, "utf8");
console.log(
  "Canonical late-fee reconciliation now preserves the 72-hour post-fixture review window and the separate seven-day £10 fee grace period.",
);
