const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");

function read(filePath) {
  return fs.readFileSync(path.join(root, filePath), "utf8");
}

function write(filePath, source) {
  fs.writeFileSync(path.join(root, filePath), source, "utf8");
}

function replaceOnce(source, before, after, label) {
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
// Stored predictions are publication snapshots. Unpublished fixtures never get
// a prediction, and a valid published prediction is frozen unless force=true.
// ---------------------------------------------------------------------------
const storedPath = "src/lib/fixtures/storedAiPredictions.ts";
let stored = read(storedPath);

stored = replaceOnce(
  stored,
  '  status: string;\n  homeTeam: { id: string; name: string };',
  '  status: string;\n  publishedAt: Date | null;\n  homeTeam: { id: string; name: string };',
  "prediction fixture publication field",
);

stored = replaceOnce(
  stored,
  [
    '  if (input.force || !input.existing) return false;',
    '  if (input.existing.inputHash !== input.inputHash) return false;',
    '  if (looksCorruptedPrediction(input.existing)) return false;',
    '  if (input.existing.predictedHomeScore === null || input.existing.predictedAwayScore === null) return false;',
    '',
    '  const existingSource = input.existing.source === "openai" ? "openai" : "fallback";',
    '',
    '  if (existingSource === "openai") return true;',
    '',
    '  return !hasOpenAiPredictorConfig();',
  ].join("\n"),
  [
    '  if (input.force || !input.existing) return false;',
    '  if (looksCorruptedPrediction(input.existing)) return false;',
    '  if (input.existing.predictedHomeScore === null || input.existing.predictedAwayScore === null) return false;',
    '',
    '  // A published prediction is a permanent pre-match snapshot. Later results',
    '  // must not rewrite it. force=true is reserved for a changed matchup.',
    '  return true;',
  ].join("\n"),
  "freeze valid stored prediction",
);

stored = replaceOnce(
  stored,
  '  if (input.fixture.status !== "SCHEDULED") return null;\n\n  const placeholderTeamIds = await getFixturePlaceholderTeamIds([',
  [
    '  if (input.fixture.status !== "SCHEDULED") return null;',
    '',
    '  if (!input.fixture.publishedAt) {',
    '    await prisma.$executeRaw`',
    '      DELETE FROM "FixtureAiPrediction"',
    '      WHERE "fixtureId" = ${input.fixture.id}',
    '    `;',
    '    return null;',
    '  }',
    '',
    '  const placeholderTeamIds = await getFixturePlaceholderTeamIds([',
  ].join("\n"),
  "unpublished prediction guard",
);

stored = replaceOnce(
  stored,
  '      leagueId: true,\n      status: true,\n      homeTeam: { select: { id: true, name: true } },',
  '      leagueId: true,\n      status: true,\n      publishedAt: true,\n      homeTeam: { select: { id: true, name: true } },',
  "single prediction publication select",
);

stored = replaceOnce(
  stored,
  '      kickoffAt: true,\n      status: true,\n      homeTeam: { select: { id: true, name: true } },',
  '      kickoffAt: true,\n      status: true,\n      publishedAt: true,\n      homeTeam: { select: { id: true, name: true } },',
  "league prediction publication select",
);

stored = replaceOnce(
  stored,
  '    if (fixture.status !== "SCHEDULED") continue;\n    if (targetIds && !targetIds.has(fixture.id)) continue;',
  '    if (fixture.status !== "SCHEDULED" || !fixture.publishedAt) continue;\n    if (targetIds && !targetIds.has(fixture.id)) continue;',
  "league unpublished prediction skip",
);

stored = replaceOnce(
  stored,
  '    WHERE prediction."fixtureId" IN (${Prisma.join(ids)})\n      AND COALESCE(home_team."isFixturePlaceholder", false) = false',
  '    WHERE prediction."fixtureId" IN (${Prisma.join(ids)})\n      AND (fixture."publishedAt" IS NOT NULL OR fixture."status" = \'COMPLETED\')\n      AND COALESCE(home_team."isFixturePlaceholder", false) = false',
  "stored prediction visibility gate",
);

write(storedPath, stored);

// ---------------------------------------------------------------------------
// Admin predictor must not self-heal or display unpublished future fixtures.
// ---------------------------------------------------------------------------
const predictorLayoutPath = "src/app/(admin)/admin/ai-predictor/layout.tsx";
let predictorLayout = read(predictorLayoutPath);
predictorLayout = predictorLayout.replaceAll(
  '    WHERE fixture."status" = \'SCHEDULED\'\n      AND fixture."kickoffAt" >= CURRENT_TIMESTAMP',
  '    WHERE fixture."status" = \'SCHEDULED\'\n      AND fixture."publishedAt" IS NOT NULL\n      AND fixture."kickoffAt" >= CURRENT_TIMESTAMP',
);
write(predictorLayoutPath, predictorLayout);

// ---------------------------------------------------------------------------
// Creating/editing fixtures no longer refreshes whole leagues. A published
// single-fixture edit regenerates only when home or away team actually changes.
// ---------------------------------------------------------------------------
const fixtureActionsPath =
  "src/app/(admin)/admin/fixtures/actions-with-kickoff-rules.ts";
let fixtureActions = read(fixtureActionsPath);
fixtureActions = fixtureActions.replace(
  [
    'import {',
    '  refreshStoredAiPreviewForFixture,',
    '  refreshStoredAiPreviewsForLeague,',
    '} from "@/lib/fixtures/storedAiPredictions";',
  ].join("\n"),
  'import { refreshStoredAiPreviewForFixture } from "@/lib/fixtures/storedAiPredictions";',
);

const oldRefreshBlock = [
  'async function refreshFixtureAiPreviewSafely(fixtureId: string | null) {',
  '  if (!fixtureId) return;',
  '',
  '  try {',
  '    await refreshStoredAiPreviewForFixture(fixtureId, { force: true });',
  '  } catch (error) {',
  '    console.error("Failed to generate stored fixture AI preview", error);',
  '  }',
  '}',
  '',
  'async function refreshLeagueAiPreviewsSafely(leagueId: string | null) {',
  '  if (!leagueId) return;',
  '',
  '  try {',
  '    await refreshStoredAiPreviewsForLeague(leagueId, { force: true });',
  '  } catch (error) {',
  '    console.error("Failed to generate stored league AI previews", error);',
  '  }',
  '}',
  '',
  'export async function createFixtureAction(formData: FormData) {',
  '  await requireAdmin();',
  '',
  '  const leagueId = getString(formData.get("leagueId"));',
  '',
  '  try {',
  '    return await createFixtureActionWithoutKickoffRules(formData);',
  '  } finally {',
  '    await refreshLeagueAiPreviewsSafely(leagueId);',
  '  }',
  '}',
  '',
  'export async function updateFixtureAction(formData: FormData) {',
  '  await requireAdmin();',
  '',
  '  const fixtureId = getString(formData.get("fixtureId"));',
  '',
  '  try {',
  '    return await updateFixtureActionWithoutKickoffRules(formData);',
  '  } finally {',
  '    await refreshFixtureAiPreviewSafely(fixtureId);',
  '  }',
  '}',
].join("\n");

const newRefreshBlock = [
  'async function refreshFixtureAiPreviewSafely(fixtureId: string | null) {',
  '  if (!fixtureId) return;',
  '',
  '  try {',
  '    await refreshStoredAiPreviewForFixture(fixtureId, { force: true });',
  '  } catch (error) {',
  '    console.error("Failed to regenerate stored fixture AI preview after a team change", error);',
  '  }',
  '}',
  '',
  'export async function createFixtureAction(formData: FormData) {',
  '  await requireAdmin();',
  '  return createFixtureActionWithoutKickoffRules(formData);',
  '}',
  '',
  'export async function updateFixtureAction(formData: FormData) {',
  '  await requireAdmin();',
  '',
  '  const fixtureId = getString(formData.get("fixtureId"));',
  '  const before = fixtureId',
  '    ? await prisma.fixture.findUnique({',
  '        where: { id: fixtureId },',
  '        select: { homeTeamId: true, awayTeamId: true, publishedAt: true },',
  '      })',
  '    : null;',
  '',
  '  try {',
  '    return await updateFixtureActionWithoutKickoffRules(formData);',
  '  } finally {',
  '    const after = fixtureId',
  '      ? await prisma.fixture.findUnique({',
  '          where: { id: fixtureId },',
  '          select: { homeTeamId: true, awayTeamId: true, publishedAt: true },',
  '        })',
  '      : null;',
  '    const teamsChanged = Boolean(',
  '      before &&',
  '        after &&',
  '        (before.homeTeamId !== after.homeTeamId ||',
  '          before.awayTeamId !== after.awayTeamId),',
  '    );',
  '',
  '    if (after?.publishedAt && teamsChanged) {',
  '      await refreshFixtureAiPreviewSafely(fixtureId);',
  '    }',
  '  }',
  '}',
].join("\n");
fixtureActions = replaceOnce(
  fixtureActions,
  oldRefreshBlock,
  newRefreshBlock,
  "fixture prediction creation/edit behaviour",
);
write(fixtureActionsPath, fixtureActions);

// ---------------------------------------------------------------------------
// Next-week generation creates unpublished fixtures only. No predictions yet.
// ---------------------------------------------------------------------------
const nextWeekPath = "src/app/api/admin/fixtures/generate-next-week/route.ts";
let nextWeek = read(nextWeekPath);
nextWeek = nextWeek.replace(
  'import { refreshStoredAiPreviewsForLeague } from "@/lib/fixtures/storedAiPredictions";\n',
  "",
);
const nextWeekPredictionBlock = [
  '    const createdFixtures = await prisma.fixture.findMany({',
  '      where: {',
  '        leagueId,',
  '        round,',
  '        status: FixtureStatus.SCHEDULED,',
  '      },',
  '      select: { id: true },',
  '    });',
  '    const createdFixtureIds = createdFixtures.map((fixture) => fixture.id);',
  '',
  '    let predictorStored = true;',
  '    try {',
  '      await refreshStoredAiPreviewsForLeague(leagueId, {',
  '        fixtureIds: createdFixtureIds,',
  '      });',
  '    } catch (error) {',
  '      predictorStored = false;',
  '      console.error("Generated fixtures but failed to store their AI predictions", {',
  '        requestId,',
  '        leagueId,',
  '        round,',
  '        fixtureIds: createdFixtureIds,',
  '        error,',
  '      });',
  '    }',
  '',
].join("\n");
nextWeek = replaceOnce(
  nextWeek,
  nextWeekPredictionBlock,
  '    // Predictions are generated only when fixtures are published.\n\n',
  "next-week early prediction removal",
);
nextWeek = nextWeek.replace(
  '      predictorStored,\n      predictorFixtureCount: createdFixtureIds.length,',
  '      predictorStored: false,\n      predictorFixtureCount: 0,',
);
write(nextWeekPath, nextWeek);

// ---------------------------------------------------------------------------
// Batch publication is the normal prediction creation point.
// ---------------------------------------------------------------------------
const publishActionsPath = "src/app/(admin)/admin/fixtures/publish-actions.ts";
let publishActions = read(publishActionsPath);
publishActions = ensureImport(
  publishActions,
  'import { formatDateTimeInLondon } from "@/lib/datetime/london";',
  'import { refreshStoredAiPreviewForFixture } from "@/lib/fixtures/storedAiPredictions";',
  "batch publish predictor",
);

const batchPredictionAnchor =
  '  const teamIds = unique(unpublishedFixtures.flatMap((fixture) => [fixture.homeTeam.id, fixture.awayTeam.id]));';
if (!publishActions.includes("Failed to generate AI prediction for newly published fixture")) {
  if (!publishActions.includes(batchPredictionAnchor)) {
    throw new Error("Expected batch publish prediction anchor was not found.");
  }
  publishActions = publishActions.replace(
    batchPredictionAnchor,
    [
      '  for (const fixture of unpublishedFixtures) {',
      '    try {',
      '      await refreshStoredAiPreviewForFixture(fixture.id, { force: true });',
      '    } catch (error) {',
      '      console.error("Failed to generate AI prediction for newly published fixture", {',
      '        fixtureId: fixture.id,',
      '        error,',
      '      });',
      '    }',
      '  }',
      '',
      batchPredictionAnchor,
    ].join("\n"),
  );
}
write(publishActionsPath, publishActions);

// ---------------------------------------------------------------------------
// Individual publication also creates the permanent snapshot. Re-clicking an
// already-published fixture only self-heals a missing prediction; it does not
// rewrite a valid one.
// ---------------------------------------------------------------------------
const publishOnePath = "src/app/api/admin/fixtures/publish-one/route.ts";
let publishOne = read(publishOnePath);
publishOne = ensureImport(
  publishOne,
  'import { formatDateTimeInLondon } from "@/lib/datetime/london";',
  'import { refreshStoredAiPreviewForFixture } from "@/lib/fixtures/storedAiPredictions";',
  "single publish predictor",
);
publishOne = replaceOnce(
  publishOne,
  [
    '  if (fixtureInfo.publishedAt) {',
    '    return NextResponse.json({ ok: true, published: false, alreadyPublished: true });',
    '  }',
  ].join("\n"),
  [
    '  if (fixtureInfo.publishedAt) {',
    '    try {',
    '      await refreshStoredAiPreviewForFixture(fixtureId);',
    '    } catch (error) {',
    '      console.error("Could not self-heal published fixture AI prediction", { fixtureId, error });',
    '    }',
    '    return NextResponse.json({ ok: true, published: false, alreadyPublished: true });',
    '  }',
  ].join("\n"),
  "already-published prediction self-heal",
);
publishOne = replaceOnce(
  publishOne,
  '  const stats = await queueEverythingForPublishedFixture({',
  [
    '  try {',
    '    await refreshStoredAiPreviewForFixture(fixtureId, { force: true });',
    '  } catch (error) {',
    '    console.error("Failed to generate AI prediction for newly published fixture", { fixtureId, error });',
    '  }',
    '',
    '  const stats = await queueEverythingForPublishedFixture({',
  ].join("\n"),
  "single publish prediction generation",
);
write(publishOnePath, publishOne);

// ---------------------------------------------------------------------------
// Bulk team replacement: regenerate only published fixtures whose matchup was
// changed. Unpublished fixtures remain prediction-free until publication.
// ---------------------------------------------------------------------------
const replaceTeamPath = "src/app/(admin)/admin/fixtures/replace-team/actions.ts";
let replaceTeam = read(replaceTeamPath);
replaceTeam = ensureImport(
  replaceTeam,
  'import { prisma } from "@/lib/prisma";',
  'import { refreshStoredAiPreviewForFixture } from "@/lib/fixtures/storedAiPredictions";',
  "replace-team predictor",
);
replaceTeam = replaceOnce(
  replaceTeam,
  '      kickoffAt: true,\n    },',
  '      kickoffAt: true,\n      publishedAt: true,\n    },',
  "replace-team published select",
);
const replaceTeamRevalidateAnchor = '  revalidatePath("/admin/fixtures");';
if (!replaceTeam.includes("Could not regenerate AI prediction after replacing fixture team")) {
  if (!replaceTeam.includes(replaceTeamRevalidateAnchor)) {
    throw new Error("Expected replace-team revalidation anchor was not found.");
  }
  replaceTeam = replaceTeam.replace(
    replaceTeamRevalidateAnchor,
    [
      '  for (const fixture of targetFixtures.filter((candidate) => candidate.publishedAt)) {',
      '    try {',
      '      await refreshStoredAiPreviewForFixture(fixture.id, { force: true });',
      '    } catch (error) {',
      '      console.error("Could not regenerate AI prediction after replacing fixture team", {',
      '        fixtureId: fixture.id,',
      '        error,',
      '      });',
      '    }',
      '  }',
      '',
      replaceTeamRevalidateAnchor,
    ].join("\n"),
  );
}
write(replaceTeamPath, replaceTeam);

// ---------------------------------------------------------------------------
// Full fixture edit page: it already knows the previous team IDs. Regenerate
// after a published matchup changes.
// ---------------------------------------------------------------------------
const editActionPath = "src/app/(admin)/admin/fixtures/[id]/edit/actions.ts";
let editAction = read(editActionPath);
editAction = ensureImport(
  editAction,
  'import { queueInitialFixtureConfirmationEmailForTeam } from "@/lib/fixtures/confirmation-emails";',
  'import { refreshStoredAiPreviewForFixture } from "@/lib/fixtures/storedAiPredictions";',
  "fixture edit predictor",
);
const addedTeamBlock = [
  '    const addedTeamIds = [homeTeamId, awayTeamId].filter(',
  '      (teamId) => !previousTeamIds.has(teamId),',
  '    );',
].join("\n");
if (!editAction.includes("Could not regenerate AI prediction after fixture team change")) {
  if (!editAction.includes(addedTeamBlock)) {
    throw new Error("Expected fixture edit added-team block was not found.");
  }
  editAction = editAction.replace(
    addedTeamBlock,
    [
      addedTeamBlock,
      '',
      '    if (fixture.publishedAt && addedTeamIds.length > 0 && !hasFixturePlaceholder) {',
      '      try {',
      '        await refreshStoredAiPreviewForFixture(fixtureId, { force: true });',
      '      } catch (predictionError) {',
      '        console.error("Could not regenerate AI prediction after fixture team change", {',
      '          fixtureId,',
      '          error: predictionError,',
      '        });',
      '      }',
      '    }',
    ].join("\n"),
  );
}
write(editActionPath, editAction);

// ---------------------------------------------------------------------------
// Older league fixture editor: same team-change rule.
// ---------------------------------------------------------------------------
const leagueFixtureActionPath = "src/app/(admin)/admin/leagues/[id]/fixtures/actions.ts";
let leagueFixtureAction = read(leagueFixtureActionPath);
leagueFixtureAction = ensureImport(
  leagueFixtureAction,
  'import { prisma } from "@/lib/prisma";',
  'import { refreshStoredAiPreviewForFixture } from "@/lib/fixtures/storedAiPredictions";',
  "league fixture editor predictor",
);
leagueFixtureAction = replaceOnce(
  leagueFixtureAction,
  '  await prisma.fixture.update({\n    where: { id: fixtureId },',
  [
    '  const previousFixture = await prisma.fixture.findUnique({',
    '    where: { id: fixtureId },',
    '    select: { homeTeamId: true, awayTeamId: true, publishedAt: true },',
    '  });',
    '',
    '  await prisma.fixture.update({',
    '    where: { id: fixtureId },',
  ].join("\n"),
  "legacy league fixture previous matchup",
);
const legacyRevalidate = '  revalidatePath(`/admin/leagues`);';
if (!leagueFixtureAction.includes("Could not regenerate AI prediction after league fixture team change")) {
  if (!leagueFixtureAction.includes(legacyRevalidate)) {
    throw new Error("Expected legacy league fixture revalidation anchor was not found.");
  }
  leagueFixtureAction = leagueFixtureAction.replace(
    legacyRevalidate,
    [
      '  const teamsChanged = Boolean(',
      '    previousFixture &&',
      '      (previousFixture.homeTeamId !== homeTeamId ||',
      '        previousFixture.awayTeamId !== awayTeamId),',
      '  );',
      '  if (previousFixture?.publishedAt && teamsChanged) {',
      '    try {',
      '      await refreshStoredAiPreviewForFixture(fixtureId, { force: true });',
      '    } catch (error) {',
      '      console.error("Could not regenerate AI prediction after league fixture team change", { fixtureId, error });',
      '    }',
      '  }',
      '',
      legacyRevalidate,
    ].join("\n"),
  );
}
write(leagueFixtureActionPath, leagueFixtureAction);

const checks = [
  stored.includes('publishedAt: Date | null;'),
  stored.includes('if (!input.fixture.publishedAt)'),
  stored.includes('return true;'),
  predictorLayout.includes('fixture."publishedAt" IS NOT NULL'),
  !fixtureActions.includes('refreshStoredAiPreviewsForLeague'),
  nextWeek.includes('Predictions are generated only when fixtures are published.'),
  publishActions.includes('Failed to generate AI prediction for newly published fixture'),
  publishOne.includes('Could not self-heal published fixture AI prediction'),
  replaceTeam.includes('Could not regenerate AI prediction after replacing fixture team'),
  editAction.includes('Could not regenerate AI prediction after fixture team change'),
  leagueFixtureAction.includes('Could not regenerate AI prediction after league fixture team change'),
];

if (checks.some((check) => !check)) {
  throw new Error("AI prediction publication snapshot safeguard did not complete.");
}

console.log(
  "AI predictions now start at publication, remain frozen, and regenerate only when a published matchup changes.",
);
