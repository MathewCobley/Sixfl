import fs from "node:fs";
import path from "node:path";

const componentPath = path.join(
  process.cwd(),
  "src/components/admin/fixtures/FixtureMatchupGrid.tsx",
);
const source = fs.readFileSync(componentPath, "utf8");
const failures = [];

function expect(marker, message) {
  if (!source.includes(marker)) failures.push(message);
}

function reject(marker, message) {
  if (source.includes(marker)) failures.push(message);
}

expect(
  'const fixtureDayFormatter = new Intl.DateTimeFormat("en-GB", {',
  "Fixture cards must compare match days in the Europe/London display timezone.",
);
expect(
  'timeZone: "Europe/London"',
  "Fixture-card date grouping must retain the Europe/London timezone.",
);
expect(
  "if (!sameMatchDay) return bKickoff - aKickoff;",
  "Within a week, newer fixture dates must be shown before older dates.",
);
expect(
  "if (aKickoff !== bKickoff) return aKickoff - bKickoff;",
  "Fixtures on the same match night must remain in earliest-to-latest kick-off order.",
);
expect(
  "if (Number.isFinite(aNumber) && Number.isFinite(bNumber)) return bNumber - aNumber;",
  "Numbered week groups must be displayed newest first.",
);
expect(
  "if (Number.isFinite(aNumber)) return -1;",
  "Numbered week groups must remain above the unassigned-week group.",
);
expect(
  "if (Number.isFinite(bNumber)) return 1;",
  "The unassigned-week group must remain below numbered weeks.",
);
reject(
  "if (Number.isFinite(aNumber) && Number.isFinite(bNumber)) return aNumber - bNumber;",
  "The retired oldest-week-first comparator must not return.",
);

if (failures.length > 0) {
  console.error("\nFIXTURE CARD ORDERING CONTRACT FAILED\n");
  for (const failure of failures) console.error(` - ${failure}`);
  process.exit(1);
}

console.log(
  "Fixture card ordering contract passed: newest weeks and dates appear first while same-night kick-offs remain chronological.",
);