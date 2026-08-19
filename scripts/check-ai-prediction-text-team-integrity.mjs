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

const predictor = read("src/lib/fixtures/aiPredictor.ts");
const stored = read("src/lib/fixtures/storedAiPredictions.ts");
const adminLayout = read("src/app/(admin)/admin/ai-predictor/layout.tsx");
const repairService = read("src/lib/fixtures/aiPredictionIntegrity.ts");
const preparation = read("scripts/apply-ai-prediction-text-team-integrity.cjs");
const chain = read("scripts/check-central-standings-usage.cjs");

const semanticRepairMarker =
  'POSITION(LOWER(home_team."name") IN LOWER(COALESCE(prediction."headline", \'\') || \' \' || COALESCE(prediction."summary", \'\'))) = 0';
const semanticDisplayMarker =
  'POSITION(LOWER(home_team."name") IN LOWER(COALESCE(prediction."headline", \'\') || \' \' || COALESCE(prediction."summary", \'\'))) > 0';
const awayDisplayMarker =
  'POSITION(LOWER(away_team."name") IN LOWER(COALESCE(prediction."headline", \'\') || \' \' || COALESCE(prediction."summary", \'\'))) > 0';

expect(
  predictor.includes('${input.homeTeamName} face ${input.awayTeamName}. The numbers'),
  "fallback prediction wording must explicitly name both teams in the current fixture",
);
expect(
  stored.includes(semanticRepairMarker) &&
    stored.includes(semanticDisplayMarker) &&
    stored.includes(awayDisplayMarker),
  "captain/public stored prediction reads must rebuild and block preview text that does not name both current teams",
);
expect(
  adminLayout.includes(semanticRepairMarker) &&
    adminLayout.includes(semanticDisplayMarker) &&
    adminLayout.includes(awayDisplayMarker),
  "admin predictor must rebuild and refuse to display text for different teams",
);
expect(
  repairService.includes(semanticRepairMarker),
  "background prediction repair must detect semantically stale team names even when ID snapshots look current",
);
expect(
  preparation.includes("upcoming previews must name both current fixture teams") &&
    preparation.includes("semantic display gate"),
  "production source preparation must preserve the semantic team-name safeguard",
);
expect(
  chain.includes('require("./apply-ai-prediction-text-team-integrity.cjs")'),
  "semantic prediction integrity preparation must run after matchup integrity preparation",
);

if (failures.length) {
  console.error("\nAI PREDICTION TEXT/TEAM INTEGRITY CONTRACT FAILED\n");
  for (const failure of failures) console.error(` - ${failure}`);
  console.error("\nDo not merge while prediction prose can describe teams other than the fixture being displayed.\n");
  process.exit(1);
}

console.log("AI prediction text/team integrity contract passed.");
