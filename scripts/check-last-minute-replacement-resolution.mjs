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

const servicePath = "src/lib/fixtures/last-minute-replacement-resolution.ts";
const controlPath = "src/components/admin/night-board/LastMinuteReplacementControl.tsx";
const reconcileRoutePath = "src/app/api/admin/night-board/last-minute-replacement/reconcile/route.ts";
const cronPath = "src/app/api/cron/notifications/route.ts";
const migrationPath = "prisma/migrations/20260818170000_last_minute_replacement_resolution/migration.sql";

const service = read(servicePath);
const control = read(controlPath);
const reconcileRoute = read(reconcileRoutePath);
const cron = read(cronPath);
const migration = read(migrationPath);

for (const marker of [
  "LastMinuteReplacementResolution",
  "reconcileLastMinuteReplacement",
  "replacementTeamId",
  "opponentTeamId",
  '"not_selected"',
  "There is no charge for this extra game.",
  "last-minute-extra-fixture-covered-email",
  "last-minute-extra-fixture-covered-sms",
  "queueNotificationFromTemplate",
  "Your normal fixture arrangements remain in place.",
  "ON CONFLICT",
]) {
  expect(service, marker, `Last-minute replacement resolution service is missing: ${marker}`);
}

expect(
  control,
  "/last-minute-replacement/reconcile",
  "Night Board replacement controls must reconcile an allocated replacement when the board loads.",
);
expect(
  control,
  "Last-minute replacement confirmed",
  "Night Board must visibly show the selected replacement as confirmed.",
);
expect(
  control,
  "Replacement confirmed ·",
  "Night Board must visibly show the original opponent which replacement team is playing.",
);
expect(
  reconcileRoute,
  "reconcileLastMinuteReplacement",
  "Admin reconcile endpoint must use the shared replacement-resolution service.",
);
expect(
  cron,
  "reconcilePendingLastMinuteReplacements",
  "Notification cron must reconcile replacements even if the Night Board is not reopened immediately.",
);
expect(
  migration,
  'CREATE TABLE IF NOT EXISTS "LastMinuteReplacementResolution"',
  "Replacement resolutions must be persisted for audit and duplicate-send protection.",
);
expect(
  migration,
  'UNIQUE INDEX IF NOT EXISTS "LastMinuteReplacementResolution_fixture_drop_replacement_key"',
  "Replacement resolution persistence must prevent duplicate resolved-message cycles.",
);

const coveredTemplates = read("prisma/migrations/20260906222500_neutral_extra_fixture_covered_templates/migration.sql");
expect(coveredTemplates, "are not required for this extra game", "Covered fixture templates must explain that the extra game is not required.");
expect(coveredTemplates, "no reply is needed", "Closure copy must be informational, without implying the recipient volunteered.");
if (/Thanks for being available/i.test(service + coveredTemplates)) failures.push("Closure copy must not assume availability.");

if (failures.length) {
  console.error("\nLAST-MINUTE REPLACEMENT RESOLUTION CONTRACT FAILED\n");
  for (const failure of failures) console.error(` - ${failure}`);
  process.exit(1);
}

console.log("Last-minute replacement resolution contract passed.");
