const fs = require("node:fs");
const path = require("node:path");

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
const action = read("src/app/(admin)/admin/fixtures/[id]/edit/actions.ts");
const page = read("src/app/(admin)/admin/fixtures/[id]/edit/page.tsx");

// Fixture-card return handling is now owned natively by FixtureMatchupGrid.
// This compatibility entry remains in the historic prebuild chain only as a
// guard. It must never rewrite source again.
expect(
  grid,
  'const FIXTURE_CARD_SCROLL_KEY = "sixfl:admin-fixtures:card-scroll";',
  "FixtureMatchupGrid must retain its native session-scroll key.",
);
expect(
  grid,
  'if (focusFixtureId) params.set("focusFixture", focusFixtureId);',
  "Fixture list return links must retain the focused fixture id.",
);
expect(
  grid,
  'const focusFixtureId = searchParams.get("focusFixture") ?? "";',
  "FixtureMatchupGrid must read the focused fixture from the URL.",
);
expect(
  grid,
  "onClick={rememberFixtureCardScrollPosition}",
  "Edit fixture must remember the current card-list scroll position.",
);
expect(
  grid,
  "focusedFixtureRef.current?.scrollIntoView({",
  "Fixture return must retain its React-ref fallback.",
);
expect(
  grid,
  "if (!sameMatchDay) return bKickoff - aKickoff;",
  "Fixture cards must keep newer match dates first within a week.",
);
expect(
  grid,
  "if (aKickoff !== bKickoff) return aKickoff - bKickoff;",
  "Fixtures on one match night must stay in chronological kick-off order.",
);
expect(
  grid,
  "if (Number.isFinite(aNumber) && Number.isFinite(bNumber)) return bNumber - aNumber;",
  "Fixture week groups must remain newest first.",
);
expect(
  action,
  'parsed.startsWith("/admin/fixtures?")',
  "The fixture edit action must accept the native filtered fixture-list return URL.",
);
expect(
  page,
  'value.startsWith("/admin/fixtures?")',
  "The fixture edit page must accept the native filtered fixture-list return URL.",
);

reject(
  grid,
  "round: fixture.round })}",
  "The retired week-hash patch must not add an unsupported round property to the edit-link helper.",
);
reject(
  action,
  'startsWith("/admin/fixtures#")',
  "The edit action must not restore the retired hash-based return path.",
);
reject(
  page,
  'startsWith("/admin/fixtures#")',
  "The edit page must not restore the retired hash-based return path.",
);

if (failures.length > 0) {
  throw new Error(
    `[fixture-week-scroll] Native fixture-card return contract failed:\n - ${failures.join("\n - ")}`,
  );
}

console.log(
  "[fixture-week-scroll] Native fixture-card focus return verified; no source patch required.",
);