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

function ensureImport(source, anchor, importLine, label) {
  if (source.includes(importLine)) return source;
  if (!source.includes(anchor)) {
    throw new Error(`Expected ${label} import anchor was not found.`);
  }
  return source.replace(anchor, `${anchor}\n${importLine}`);
}

// ---------------------------------------------------------------------------
// Stored prediction rows carry the exact home/away team IDs they were created
// for. Any mismatch is repaired before display; a stale row is never rendered.
// ---------------------------------------------------------------------------
const storedPath = "src/lib/fixtures/storedAiPredictions.ts";
let stored = read(storedPath);

if (!stored.includes('ADD COLUMN IF NOT EXISTS "homeTeamIdSnapshot" TEXT')) {
  stored = replaceRequired(
    stored,
    [
      '      await prisma.$executeRawUnsafe(',
      '        \'ALTER TABLE "FixtureAiPrediction" ADD COLUMN IF NOT EXISTS "predictedAwayScore" INTEGER\',',
      '      );',
    ].join("\n"),
    [
      '      await prisma.$executeRawUnsafe(',
      '        \'ALTER TABLE "FixtureAiPrediction" ADD COLUMN IF NOT EXISTS "predictedAwayScore" INTEGER\',',
      '      );',
      '      await prisma.$executeRawUnsafe(',
      '        \'ALTER TABLE "FixtureAiPrediction" ADD COLUMN IF NOT EXISTS "homeTeamIdSnapshot" TEXT\',',
      '      );',
      '      await prisma.$executeRawUnsafe(',
      '        \'ALTER TABLE "FixtureAiPrediction" ADD COLUMN IF NOT EXISTS "awayTeamIdSnapshot" TEXT\',',
      '      );',
    ].join("\n"),
    "AI prediction matchup snapshot columns",
  );
}

stored = replaceRequired(
  stored,
  [
    'async function savePrediction(input: {',
    '  fixtureId: string;',
    '  preview: FixtureAiPreview;',
    '  inputHash: string;',
    '  winChance: FixtureWinChance;',
    '}) {',
  ].join("\n"),
  [
    'async function savePrediction(input: {',
    '  fixtureId: string;',
    '  homeTeamIdSnapshot: string;',
    '  awayTeamIdSnapshot: string;',
    '  preview: FixtureAiPreview;',
    '  inputHash: string;',
    '  winChance: FixtureWinChance;',
    '}) {',
  ].join("\n"),
  "stored prediction matchup snapshot input",
);

if (!stored.includes('        "homeTeamIdSnapshot",\n        "awayTeamIdSnapshot",')) {
  stored = replaceRequired(
    stored,
    [
      '        "fixtureId",',
      '        "headline",',
    ].join("\n"),
    [
      '        "fixtureId",',
      '        "homeTeamIdSnapshot",',
      '        "awayTeamIdSnapshot",',
      '        "headline",',
    ].join("\n"),
    "stored prediction snapshot insert columns",
  );
}

if (!stored.includes('        ${input.homeTeamIdSnapshot},\n        ${input.awayTeamIdSnapshot},')) {
  stored = replaceRequired(
    stored,
    [
      '        ${input.fixtureId},',
      '        ${preview.headline},',
    ].join("\n"),
    [
      '        ${input.fixtureId},',
      '        ${input.homeTeamIdSnapshot},',
      '        ${input.awayTeamIdSnapshot},',
      '        ${preview.headline},',
    ].join("\n"),
    "stored prediction snapshot insert values",
  );
}

if (!stored.includes('      "homeTeamIdSnapshot" = EXCLUDED."homeTeamIdSnapshot"')) {
  stored = replaceRequired(
    stored,
    [
      '    ON CONFLICT ("fixtureId") DO UPDATE SET',
      '      "headline" = EXCLUDED."headline",',
    ].join("\n"),
    [
      '    ON CONFLICT ("fixtureId") DO UPDATE SET',
      '      "homeTeamIdSnapshot" = EXCLUDED."homeTeamIdSnapshot",',
      '      "awayTeamIdSnapshot" = EXCLUDED."awayTeamIdSnapshot",',
      '      "headline" = EXCLUDED."headline",',
    ].join("\n"),
    "stored prediction snapshot conflict update",
  );
}

stored = replaceRequired(
  stored,
  '  await savePrediction({ fixtureId: input.fixture.id, preview, inputHash, winChance });',
  [
    '  await savePrediction({',
    '    fixtureId: input.fixture.id,',
    '    homeTeamIdSnapshot: input.fixture.homeTeam.id,',
    '    awayTeamIdSnapshot: input.fixture.awayTeam.id,',
    '    preview,',
    '    inputHash,',
    '    winChance,',
    '  });',
  ].join("\n"),
  "stored prediction snapshot save call",
);

const repairAnchor = [
  '  await recoverMissingHistoricalAiPredictions(ids);',
  '',
  '  const rows = await prisma.$queryRaw<StoredPredictionRow[]>`',
].join("\n");
const repairBlock = [
  '  await recoverMissingHistoricalAiPredictions(ids);',
  '',
  '  const upcomingToRepair = await prisma.$queryRaw<Array<{ fixtureId: string }>>(Prisma.sql`',
  '    SELECT fixture."id" AS "fixtureId"',
  '    FROM "Fixture" fixture',
  '    JOIN "Team" home_team ON home_team."id" = fixture."homeTeamId"',
  '    JOIN "Team" away_team ON away_team."id" = fixture."awayTeamId"',
  '    LEFT JOIN "FixtureAiPrediction" prediction ON prediction."fixtureId" = fixture."id"',
  '    WHERE fixture."id" IN (${Prisma.join(ids)})',
  '      AND fixture."status" = \'SCHEDULED\'',
  '      AND fixture."publishedAt" IS NOT NULL',
  '      AND fixture."kickoffAt" > CURRENT_TIMESTAMP',
  '      AND COALESCE(home_team."isFixturePlaceholder", FALSE) = FALSE',
  '      AND COALESCE(away_team."isFixturePlaceholder", FALSE) = FALSE',
  '      AND (',
  '        prediction."fixtureId" IS NULL',
  '        OR prediction."predictedHomeScore" IS NULL',
  '        OR prediction."predictedAwayScore" IS NULL',
  '        OR prediction."homeTeamIdSnapshot" IS DISTINCT FROM fixture."homeTeamId"',
  '        OR prediction."awayTeamIdSnapshot" IS DISTINCT FROM fixture."awayTeamId"',
  '      )',
  '  `);',
  '',
  '  for (const item of upcomingToRepair) {',
  '    try {',
  '      await refreshStoredAiPreviewForFixture(item.fixtureId, { force: true });',
  '    } catch (error) {',
  '      console.error("Could not repair stale stored AI prediction before display", {',
  '        fixtureId: item.fixtureId,',
  '        error,',
  '      });',
  '    }',
  '  }',
  '',
  '  const rows = await prisma.$queryRaw<StoredPredictionRow[]>`',
].join("\n");
if (!stored.includes("const upcomingToRepair = await prisma.$queryRaw")) {
  stored = replaceRequired(
    stored,
    repairAnchor,
    repairBlock,
    "stored prediction on-read integrity repair",
  );
}

if (!stored.includes('prediction."homeTeamIdSnapshot" = fixture."homeTeamId"')) {
  const preparedVisibilityAnchor = [
    '    WHERE prediction."fixtureId" IN (${Prisma.join(ids)})',
    '      AND (fixture."publishedAt" IS NOT NULL OR fixture."status" = \'COMPLETED\')',
    '      AND COALESCE(home_team."isFixturePlaceholder", false) = false',
  ].join("\n");
  const rawVisibilityAnchor = [
    '    WHERE prediction."fixtureId" IN (${Prisma.join(ids)})',
    '      AND COALESCE(home_team."isFixturePlaceholder", false) = false',
  ].join("\n");
  const snapshotLines = [
    '      AND prediction."homeTeamIdSnapshot" = fixture."homeTeamId"',
    '      AND prediction."awayTeamIdSnapshot" = fixture."awayTeamId"',
  ];

  if (stored.includes(preparedVisibilityAnchor)) {
    stored = stored.replace(
      preparedVisibilityAnchor,
      [
        '    WHERE prediction."fixtureId" IN (${Prisma.join(ids)})',
        '      AND (fixture."publishedAt" IS NOT NULL OR fixture."status" = \'COMPLETED\')',
        ...snapshotLines,
        '      AND COALESCE(home_team."isFixturePlaceholder", false) = false',
      ].join("\n"),
    );
  } else if (stored.includes(rawVisibilityAnchor)) {
    stored = stored.replace(
      rawVisibilityAnchor,
      [
        '    WHERE prediction."fixtureId" IN (${Prisma.join(ids)})',
        ...snapshotLines,
        '      AND COALESCE(home_team."isFixturePlaceholder", false) = false',
      ].join("\n"),
    );
  } else {
    throw new Error("Expected stored prediction display query was not found.");
  }
}

write(storedPath, stored);

// ---------------------------------------------------------------------------
// The admin predictor must actively repair a mismatch, and it must never display
// a prediction whose stored matchup does not equal the fixture currently shown.
// ---------------------------------------------------------------------------
const layoutPath = "src/app/(admin)/admin/ai-predictor/layout.tsx";
let layout = read(layoutPath);

if (!layout.includes('prediction."homeTeamIdSnapshot" IS DISTINCT FROM fixture."homeTeamId"')) {
  layout = replaceRequired(
    layout,
    [
      '      AND (',
      '        prediction."fixtureId" IS NULL',
      '        OR prediction."predictedHomeScore" IS NULL',
      '        OR prediction."predictedAwayScore" IS NULL',
      '      )',
    ].join("\n"),
    [
      '      AND (',
      '        prediction."fixtureId" IS NULL',
      '        OR prediction."predictedHomeScore" IS NULL',
      '        OR prediction."predictedAwayScore" IS NULL',
      '        OR prediction."homeTeamIdSnapshot" IS DISTINCT FROM fixture."homeTeamId"',
      '        OR prediction."awayTeamIdSnapshot" IS DISTINCT FROM fixture."awayTeamId"',
      '      )',
    ].join("\n"),
    "admin predictor stale matchup detection",
  );
}

layout = replaceRequired(
  layout,
  '      batch.map((row) => refreshStoredAiPreviewForFixture(row.fixtureId)),',
  '      batch.map((row) => refreshStoredAiPreviewForFixture(row.fixtureId, { force: true })),',
  "admin predictor forced stale repair",
);

if (!layout.includes('prediction."homeTeamIdSnapshot" = fixture."homeTeamId"')) {
  layout = replaceRequired(
    layout,
    [
      '      AND prediction."predictedHomeScore" IS NOT NULL',
      '      AND prediction."predictedAwayScore" IS NOT NULL',
      '      AND COALESCE(home_team."isFixturePlaceholder", false) = false',
    ].join("\n"),
    [
      '      AND prediction."predictedHomeScore" IS NOT NULL',
      '      AND prediction."predictedAwayScore" IS NOT NULL',
      '      AND prediction."homeTeamIdSnapshot" = fixture."homeTeamId"',
      '      AND prediction."awayTeamIdSnapshot" = fixture."awayTeamId"',
      '      AND COALESCE(home_team."isFixturePlaceholder", false) = false',
    ].join("\n"),
    "admin predictor current-matchup display gate",
  );
}

write(layoutPath, layout);

// ---------------------------------------------------------------------------
// Full fixture editing is a separate mutation path from the legacy fixture
// wrapper. Refresh the prediction whenever a published matchup changes there.
// ---------------------------------------------------------------------------
const fullEditPath = "src/app/(admin)/admin/fixtures/[id]/edit/actions.ts";
let fullEdit = read(fullEditPath);
fullEdit = ensureImport(
  fullEdit,
  'import { queueInitialFixtureConfirmationEmailForTeam } from "@/lib/fixtures/confirmation-emails";',
  'import { refreshStoredAiPreviewForFixture } from "@/lib/fixtures/storedAiPredictions";',
  "full fixture edit AI predictor",
);

if (!fullEdit.includes("Failed to regenerate AI prediction after full fixture team change")) {
  const fullEditAnchor =
    '    const previousTeamIds = new Set([fixture.homeTeamId, fixture.awayTeamId]);';
  if (!fullEdit.includes(fullEditAnchor)) {
    throw new Error("Expected full fixture edit team-change anchor was not found.");
  }

  fullEdit = fullEdit.replace(
    fullEditAnchor,
    [
      '    const teamsChanged =',
      '      fixture.homeTeamId !== homeTeamId || fixture.awayTeamId !== awayTeamId;',
      '',
      '    if (',
      '      fixture.publishedAt &&',
      '      status === FixtureStatus.SCHEDULED &&',
      '      !hasFixturePlaceholder &&',
      '      kickoffAt > new Date() &&',
      '      teamsChanged',
      '    ) {',
      '      try {',
      '        await refreshStoredAiPreviewForFixture(fixtureId, { force: true });',
      '      } catch (predictionError) {',
      '        console.error("Failed to regenerate AI prediction after full fixture team change", {',
      '          fixtureId,',
      '          error: predictionError,',
      '        });',
      '      }',
      '    }',
      '',
      fullEditAnchor,
    ].join("\n"),
  );
}
write(fullEditPath, fullEdit);

// ---------------------------------------------------------------------------
// Bulk future-team replacement is another direct fixture mutation path.
// Refresh every published fixture changed by that operation.
// ---------------------------------------------------------------------------
const replaceTeamPath = "src/app/(admin)/admin/fixtures/replace-team/actions.ts";
let replaceTeam = read(replaceTeamPath);
replaceTeam = ensureImport(
  replaceTeam,
  'import { prisma } from "@/lib/prisma";',
  'import { refreshStoredAiPreviewForFixture } from "@/lib/fixtures/storedAiPredictions";',
  "bulk replacement AI predictor",
);

if (!replaceTeam.includes("publishedAt: true")) {
  replaceTeam = replaceRequired(
    replaceTeam,
    [
      '      homeTeamId: true,',
      '      awayTeamId: true,',
      '      kickoffAt: true,',
    ].join("\n"),
    [
      '      homeTeamId: true,',
      '      awayTeamId: true,',
      '      kickoffAt: true,',
      '      publishedAt: true,',
    ].join("\n"),
    "bulk replacement published fixture selection",
  );
}

if (!replaceTeam.includes("Failed to regenerate AI prediction after future team replacement")) {
  const replaceRefreshAnchor = [
    '  });',
    '',
    '  revalidatePath("/admin/fixtures");',
  ].join("\n");
  const replaceRefreshBlock = [
    '  });',
    '',
    '  for (const fixture of targetFixtures) {',
    '    if (!fixture.publishedAt) continue;',
    '    try {',
    '      await refreshStoredAiPreviewForFixture(fixture.id, { force: true });',
    '    } catch (predictionError) {',
    '      console.error("Failed to regenerate AI prediction after future team replacement", {',
    '        fixtureId: fixture.id,',
    '        error: predictionError,',
    '      });',
    '    }',
    '  }',
    '',
    '  revalidatePath("/admin/fixtures");',
  ].join("\n");

  const anchorIndex = replaceTeam.lastIndexOf(replaceRefreshAnchor);
  if (anchorIndex < 0) {
    throw new Error("Expected bulk replacement refresh anchor was not found.");
  }
  replaceTeam =
    replaceTeam.slice(0, anchorIndex) +
    replaceRefreshBlock +
    replaceTeam.slice(anchorIndex + replaceRefreshAnchor.length);
}
write(replaceTeamPath, replaceTeam);

console.log(
  "AI prediction matchup integrity applied: stale scores/text are blocked, repaired on read, and regenerated after team changes.",
);
