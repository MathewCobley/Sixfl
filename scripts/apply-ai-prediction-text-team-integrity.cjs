const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

function write(relativePath, source) {
  fs.writeFileSync(path.join(root, relativePath), source, "utf8");
}

function replaceRequired(source, before, after, label) {
  if (source.includes(after)) return source;
  if (!source.includes(before)) {
    throw new Error(`Expected ${label} source was not found.`);
  }
  return source.replace(before, after);
}

// Make the local fallback wording explicitly identify both current teams.
const predictorPath = "src/lib/fixtures/aiPredictor.ts";
let predictor = read(predictorPath);
const oldFallbackSummary = [
  '    summary:',
  '      favourite === "a draw"',
  '        ? `The numbers point towards ${input.winChance.predictedResult.label}, with both teams still in the mix.`',
  '        : `The numbers favour ${favouriteLabel}, but there is still plenty to play for on match night.`,',
].join("\n");
const newFallbackSummary = [
  '    summary:',
  '      favourite === "a draw"',
  '        ? `${input.homeTeamName} face ${input.awayTeamName}. The numbers point towards ${input.winChance.predictedResult.label}, with both teams still in the mix.`',
  '        : `${input.homeTeamName} face ${input.awayTeamName}. The numbers favour ${favouriteLabel}, but there is still plenty to play for on match night.`,',
].join("\n");
predictor = replaceRequired(
  predictor,
  oldFallbackSummary,
  newFallbackSummary,
  "fixture-aware fallback preview wording",
);
write(predictorPath, predictor);

// Stored prediction reads must not trust a row merely because its ID snapshots
// look current. The written preview itself must name both teams now attached to
// the upcoming fixture. If it does not, force a new prediction before display.
const storedPath = "src/lib/fixtures/storedAiPredictions.ts";
let stored = read(storedPath);

const repairSnapshotAnchor = [
  '        OR prediction."homeTeamIdSnapshot" IS DISTINCT FROM fixture."homeTeamId"',
  '        OR prediction."awayTeamIdSnapshot" IS DISTINCT FROM fixture."awayTeamId"',
  '      )',
].join("\n");
const repairSemanticBlock = [
  '        OR prediction."homeTeamIdSnapshot" IS DISTINCT FROM fixture."homeTeamId"',
  '        OR prediction."awayTeamIdSnapshot" IS DISTINCT FROM fixture."awayTeamId"',
  '        OR POSITION(LOWER(home_team."name") IN LOWER(COALESCE(prediction."headline", \'\') || \' \' || COALESCE(prediction."summary", \'\'))) = 0',
  '        OR POSITION(LOWER(away_team."name") IN LOWER(COALESCE(prediction."headline", \'\') || \' \' || COALESCE(prediction."summary", \'\'))) = 0',
  '      )',
].join("\n");
if (!stored.includes('POSITION(LOWER(home_team."name") IN LOWER(COALESCE(prediction."headline"')) {
  stored = replaceRequired(
    stored,
    repairSnapshotAnchor,
    repairSemanticBlock,
    "stored prediction semantic team repair",
  );
}

const displaySnapshotAnchor = [
  '      AND prediction."homeTeamIdSnapshot" = fixture."homeTeamId"',
  '      AND prediction."awayTeamIdSnapshot" = fixture."awayTeamId"',
  '      AND COALESCE(home_team."isFixturePlaceholder", false) = false',
].join("\n");
const displaySemanticBlock = [
  '      AND prediction."homeTeamIdSnapshot" = fixture."homeTeamId"',
  '      AND prediction."awayTeamIdSnapshot" = fixture."awayTeamId"',
  '      AND (',
  '        fixture."status"::text <> \'SCHEDULED\'',
  '        OR fixture."kickoffAt" <= CURRENT_TIMESTAMP',
  '        OR (',
  '          POSITION(LOWER(home_team."name") IN LOWER(COALESCE(prediction."headline", \'\') || \' \' || COALESCE(prediction."summary", \'\'))) > 0',
  '          AND POSITION(LOWER(away_team."name") IN LOWER(COALESCE(prediction."headline", \'\') || \' \' || COALESCE(prediction."summary", \'\'))) > 0',
  '        )',
  '      )',
  '      AND COALESCE(home_team."isFixturePlaceholder", false) = false',
].join("\n");
if (!stored.includes('fixture."status"::text <> \'SCHEDULED\'')) {
  stored = replaceRequired(
    stored,
    displaySnapshotAnchor,
    displaySemanticBlock,
    "stored prediction semantic display gate",
  );
}

write(storedPath, stored);

// The admin prediction list has its own SQL path, so apply the same semantic
// repair and display gates there as well.
const layoutPath = "src/app/(admin)/admin/ai-predictor/layout.tsx";
let layout = read(layoutPath);
if (!layout.includes('POSITION(LOWER(home_team."name") IN LOWER(COALESCE(prediction."headline"')) {
  layout = replaceRequired(
    layout,
    repairSnapshotAnchor,
    repairSemanticBlock,
    "admin predictor semantic team repair",
  );
}

const adminDisplaySnapshotAnchor = [
  '      AND prediction."homeTeamIdSnapshot" = fixture."homeTeamId"',
  '      AND prediction."awayTeamIdSnapshot" = fixture."awayTeamId"',
  '      AND COALESCE(home_team."isFixturePlaceholder", false) = false',
].join("\n");
const adminDisplaySemanticBlock = [
  '      AND prediction."homeTeamIdSnapshot" = fixture."homeTeamId"',
  '      AND prediction."awayTeamIdSnapshot" = fixture."awayTeamId"',
  '      AND POSITION(LOWER(home_team."name") IN LOWER(COALESCE(prediction."headline", \'\') || \' \' || COALESCE(prediction."summary", \'\'))) > 0',
  '      AND POSITION(LOWER(away_team."name") IN LOWER(COALESCE(prediction."headline", \'\') || \' \' || COALESCE(prediction."summary", \'\'))) > 0',
  '      AND COALESCE(home_team."isFixturePlaceholder", false) = false',
].join("\n");
if (!layout.includes('AND POSITION(LOWER(home_team."name") IN LOWER(COALESCE(prediction."headline"')) {
  layout = replaceRequired(
    layout,
    adminDisplaySnapshotAnchor,
    adminDisplaySemanticBlock,
    "admin predictor semantic display gate",
  );
}
write(layoutPath, layout);

// Background integrity repair must also recognise semantically stale text even
// when a previous deployment incorrectly stamped current team IDs onto it.
const repairServicePath = "src/lib/fixtures/aiPredictionIntegrity.ts";
let repairService = read(repairServicePath);
if (!repairService.includes('POSITION(LOWER(home_team."name") IN LOWER(COALESCE(prediction."headline"')) {
  repairService = replaceRequired(
    repairService,
    repairSnapshotAnchor,
    repairSemanticBlock,
    "background AI semantic team repair",
  );
}
write(repairServicePath, repairService);

console.log(
  "AI prediction text integrity applied: upcoming previews must name both current fixture teams or they are rebuilt/hidden.",
);
