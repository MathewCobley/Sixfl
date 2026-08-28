import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const failures = [];

function read(relativePath) {
  const absolutePath = path.join(root, relativePath);
  if (!fs.existsSync(absolutePath)) {
    failures.push(`Missing required file: ${relativePath}`);
    return "";
  }
  return fs.readFileSync(absolutePath, "utf8");
}

function expect(source, marker, message) {
  if (!source.includes(marker)) failures.push(message);
}

function expectOrder(source, markers, message) {
  let previousIndex = -1;
  for (const marker of markers) {
    const index = source.indexOf(marker, previousIndex + 1);
    if (index === -1 || index <= previousIndex) {
      failures.push(message);
      return;
    }
    previousIndex = index;
  }
}

const updateRoutePath =
  "src/app/api/admin/night-board/update-match/route.ts";
const warningRoutePath =
  "src/app/api/admin/night-board/referee-confirmation-warnings/route.ts";
const assignmentSyncPath = "src/lib/referee-night-assignment-sync.ts";

const updateRoute = read(updateRoutePath);
const warningRoute = read(warningRoutePath);
const assignmentSync = read(assignmentSyncPath);

expect(
  updateRoute,
  "syncPublishedFixtureRefereeNightAssignmentAndRecalculate",
  "Saving a Night Board fixture must use the central referee-night assignment synchroniser.",
);
expectOrder(
  updateRoute,
  [
    "await prisma.fixture.update({",
    "await syncPublishedFixtureRefereeNightAssignmentAndRecalculate({",
    "const sync = await resyncMatchFeeMessages({",
  ],
  "The updated fixture must be synchronised into its referee night immediately after the fixture save and before the response is returned.",
);
expect(
  updateRoute,
  "new Set([...changedRefereeNightIds, ...syncedRefereeNightIds])",
  "Night Board saves must revalidate both the old and newly synchronised referee nights.",
);
expect(
  updateRoute,
  "refereeNightsSynced: syncedRefereeNightIds.length",
  "Night Board save responses must retain a referee-night synchronisation diagnostic.",
);

expect(
  warningRoute,
  "syncPublishedFixtureRefereeNightAssignmentsAndRecalculate",
  "The Night Board referee warning check must repair legacy missing referee-night links through the central synchroniser.",
);
expectOrder(
  warningRoute,
  [
    "const fixtureIds = assignedFixtures.map((fixture) => fixture.id);",
    "await syncPublishedFixtureRefereeNightAssignmentsAndRecalculate({",
    "const rows = await prisma.$queryRaw<ConfirmationRow[]>",
  ],
  "Legacy/direct referee assignments must be repaired before the Night Board decides that a referee-night link is missing.",
);
expect(
  warningRoute,
  "console.error(\"Night Board referee-night synchronisation failed\", error);",
  "A failed automatic repair must remain observable while allowing the operational warning to be shown.",
);

expect(
  assignmentSync,
  'ON CONFLICT ("fixtureId") DO UPDATE',
  "The central referee-night synchroniser must continue to keep one authoritative night link per fixture.",
);

if (failures.length) {
  console.error("\nNIGHT BOARD REFEREE-NIGHT SYNC CONTRACT FAILED\n");
  for (const failure of failures) console.error(` - ${failure}`);
  process.exit(1);
}

console.log("Night Board referee-night sync contract passed.");
