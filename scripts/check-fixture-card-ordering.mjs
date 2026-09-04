import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const failures = [];

function read(relativePath) {
  const filePath = path.join(root, relativePath);
  if (!fs.existsSync(filePath)) {
    failures.push(`Missing required file: ${relativePath}`);
    return "";
  }
  return fs.readFileSync(filePath, "utf8");
}

function expect(source, marker, message) {
  if (!source.includes(marker)) failures.push(message);
}

function reject(source, marker, message) {
  if (source.includes(marker)) failures.push(message);
}

const grid = read("src/components/admin/fixtures/FixtureMatchupGrid.tsx");
const compatibilityGuard = read("scripts/apply-fixture-week-scroll-return.cjs");
const preparationChain = read("scripts/check-central-standings-usage.cjs");

expect(
  grid,
  'const fixtureDayFormatter = new Intl.DateTimeFormat("en-GB", {',
  "Fixture cards must compare match days in the displayed timezone.",
);
expect(
  grid,
  'timeZone: "Europe/London"',
  "Fixture-card match-day grouping must retain the Europe/London timezone.",
);
expect(
  grid,
  "if (!sameMatchDay) return bKickoff - aKickoff;",
  "Within a week, newer fixture dates must be displayed first.",
);
expect(
  grid,
  "if (aKickoff !== bKickoff) return aKickoff - bKickoff;",
  "Fixtures on the same match night must remain earliest-to-latest by kick-off.",
);
expect(
  grid,
  "if (Number.isFinite(aNumber) && Number.isFinite(bNumber)) return bNumber - aNumber;",
  "Numbered week groups must be displayed newest first.",
);
expect(
  grid,
  "if (Number.isFinite(aNumber)) return -1;",
  "Numbered weeks must remain above unassigned fixtures.",
);
expect(
  grid,
  "if (Number.isFinite(bNumber)) return 1;",
  "Unassigned fixtures must remain below numbered weeks.",
);
expect(
  grid,
  'if (focusFixtureId) params.set("focusFixture", focusFixtureId);',
  "The edit return URL must retain the selected fixture id.",
);
expect(
  grid,
  "onClick={rememberFixtureCardScrollPosition}",
  "Editing a fixture must remember the current list position.",
);
expect(
  grid,
  "focusedFixtureRef.current?.scrollIntoView({",
  "Fixture return must retain its native React-ref fallback.",
);
reject(
  grid,
  "if (Number.isFinite(aNumber) && Number.isFinite(bNumber)) return aNumber - bNumber;",
  "The retired oldest-week-first comparator must not return.",
);
reject(
  grid,
  "round: fixture.round })}",
  "The retired week-hash patch must not add an unsupported round property.",
);

expect(
  compatibilityGuard,
  "Native fixture-card focus return verified; no source patch required.",
  "The legacy fixture-week script must remain an inert native-source guard.",
);
reject(
  compatibilityGuard,
  "writeFileSync(",
  "The retired fixture-week compatibility script must not rewrite application source.",
);
reject(
  compatibilityGuard,
  "source.replace(",
  "The retired fixture-week compatibility script must not patch source anchors.",
);
expect(
  preparationChain,
  'require("./apply-fixture-week-scroll-return.cjs")',
  "The production preparation chain must continue to verify the native fixture return contract.",
);

if (failures.length > 0) {
  console.error("\nFIXTURE CARD ORDERING CONTRACT FAILED\n");
  for (const failure of failures) console.error(` - ${failure}`);
  process.exit(1);
}

console.log(
  "Fixture card ordering contract passed: newest weeks and dates appear first, same-night kick-offs remain chronological and edit-return handling stays native.",
);