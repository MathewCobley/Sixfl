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

function expect(condition, message) {
  if (!condition) failures.push(message);
}

const stored = read("src/lib/fixtures/storedAiPredictions.ts");
const predictorLayout = read("src/app/(admin)/admin/ai-predictor/layout.tsx");
const fullEdit = read("src/app/(admin)/admin/fixtures/[id]/edit/actions.ts");
const replaceTeam = read("src/app/(admin)/admin/fixtures/replace-team/actions.ts");
const cron = read("src/app/api/cron/notifications/route.ts");
const repairService = read("src/lib/fixtures/aiPredictionIntegrity.ts");
const migration = read(
  "prisma/migrations/20260819000000_ai_prediction_matchup_integrity/migration.sql",
);
const preparation = read("scripts/apply-ai-prediction-matchup-integrity.cjs");
const preparationChain = read("scripts/check-central-standings-usage.cjs");

expect(
  migration.includes('"homeTeamIdSnapshot" TEXT') &&
    migration.includes('"awayTeamIdSnapshot" TEXT'),
  "prediction rows must persist the exact home and away team IDs used for the stored call",
);
expect(
  migration.includes('"Fixture_invalidate_ai_prediction_on_team_change"') &&
    migration.includes('DELETE FROM "FixtureAiPrediction"'),
  "changing a future fixture matchup must invalidate its old prediction at database level",
);
expect(
  migration.includes("fixture.\"kickoffAt\" > CURRENT_TIMESTAMP") &&
    migration.includes("Existing future prediction rows pre-date matchup snapshots"),
  "deployment must discard unverifiable future prediction rows so stale scores/text cannot survive",
);
expect(
  stored.includes('homeTeamIdSnapshot: input.fixture.homeTeam.id') &&
    stored.includes('awayTeamIdSnapshot: input.fixture.awayTeam.id'),
  "new stored predictions must save their actual matchup IDs",
);
expect(
  stored.includes('prediction."homeTeamIdSnapshot" = fixture."homeTeamId"') &&
    stored.includes('prediction."awayTeamIdSnapshot" = fixture."awayTeamId"'),
  "stored prediction display must reject rows for a different current matchup",
);
expect(
  stored.includes("const upcomingToRepair = await prisma.$queryRaw") &&
    stored.includes('refreshStoredAiPreviewForFixture(item.fixtureId, { force: true })'),
  "captain/public reads must repair missing or stale upcoming predictions before display",
);
expect(
  predictorLayout.includes(
    'prediction."homeTeamIdSnapshot" IS DISTINCT FROM fixture."homeTeamId"',
  ) &&
    predictorLayout.includes(
      'prediction."awayTeamIdSnapshot" IS DISTINCT FROM fixture."awayTeamId"',
    ) &&
    predictorLayout.includes(
      'refreshStoredAiPreviewForFixture(row.fixtureId, { force: true })',
    ),
  "admin predictor must detect and force-repair a changed matchup",
);
expect(
  predictorLayout.includes('prediction."homeTeamIdSnapshot" = fixture."homeTeamId"') &&
    predictorLayout.includes('prediction."awayTeamIdSnapshot" = fixture."awayTeamId"'),
  "admin predictor must never render stale score/text beside current fixture teams",
);
expect(
  fullEdit.includes("Failed to regenerate AI prediction after full fixture team change") &&
    fullEdit.includes('refreshStoredAiPreviewForFixture(fixtureId, { force: true })'),
  "full fixture editing must regenerate a published prediction when teams change",
);
expect(
  replaceTeam.includes("Failed to regenerate AI prediction after future team replacement") &&
    replaceTeam.includes('refreshStoredAiPreviewForFixture(fixture.id, { force: true })'),
  "bulk future-team replacement must regenerate affected published predictions",
);
expect(
  repairService.includes("repairUpcomingAiPredictionIntegrity") &&
    repairService.includes('IS DISTINCT FROM fixture."homeTeamId"') &&
    repairService.includes("force: true"),
  "shared repair service must find and rebuild missing/stale upcoming predictions",
);
expect(
  cron.includes("repairUpcomingAiPredictionIntegrity") &&
    cron.includes("aiPredictionIntegrity"),
  "normal Railway notification cron must repair prediction integrity without requiring an admin page visit",
);
expect(
  preparationChain.includes('require("./apply-ai-prediction-matchup-integrity.cjs")'),
  "AI matchup integrity preparation must run after the existing prediction publication preparation",
);
expect(
  preparation.includes("stale scores/text are blocked") &&
    preparation.includes("stored prediction on-read integrity repair"),
  "the production source-preparation safeguard must remain present and explicit",
);

if (failures.length) {
  console.error("\nAI PREDICTION MATCHUP INTEGRITY CONTRACT FAILED\n");
  for (const failure of failures) console.error(` - ${failure}`);
  console.error(
    "\nDo not merge while a prediction can show score/text from a different fixture matchup.\n",
  );
  process.exit(1);
}

console.log("AI prediction matchup integrity contract passed.");
