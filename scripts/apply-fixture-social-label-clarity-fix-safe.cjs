// ========================================
// File: scripts/apply-fixture-social-label-clarity-fix-safe.cjs
// ========================================

const fs = require("node:fs/promises");
const path = require("node:path");

const rootDir = process.cwd();
const backupSuffix = ".bak-2026-04-18-label-clarity-safe";

const fixturesScreenPath = path.join(
  rootDir,
  "src",
  "components",
  "admin",
  "fixtures",
  "FixturesAdminScreen.tsx",
);

async function backupIfNeeded(filePath) {
  const backupPath = `${filePath}${backupSuffix}`;

  try {
    await fs.access(backupPath);
  } catch {
    const current = await fs.readFile(filePath, "utf8");
    await fs.writeFile(backupPath, current, "utf8");
  }
}

function replaceOrThrow(source, before, after, label) {
  if (!source.includes(before)) {
    throw new Error(`Could not find expected snippet for: ${label}`);
  }

  return source.replace(before, after);
}

async function main() {
  await backupIfNeeded(fixturesScreenPath);

  let content = await fs.readFile(fixturesScreenPath, "utf8");

  content = replaceOrThrow(
    content,
    "function getPublishTone(publishedAtIso: string | null) {",
    "function getFixtureVisibilityTone(publishedAtIso: string | null) {",
    "rename helper getPublishTone",
  );

  content = replaceOrThrow(
    content,
    "function formatPublishState(publishedAtIso: string | null) {",
    "function formatFixtureVisibilityState(publishedAtIso: string | null) {",
    "rename helper formatPublishState",
  );

  content = replaceOrThrow(
    content,
    '  return publishedAtIso ? "Published" : "Draft";\n}',
    '  return publishedAtIso ? "Live on site" : "Draft only";\n}',
    "change fixture visibility badge text",
  );

  content = replaceOrThrow(
    content,
    '      return "Published";',
    '      return "Published to Meta";',
    "change social published badge text",
  );

  content = replaceOrThrow(
    content,
    '          <span>Published {formatTimestamp(fixture.socialPublishedAtIso)}</span>',
    '          <span>Published to Meta {formatTimestamp(fixture.socialPublishedAtIso)}</span>',
    "change social published timestamp text",
  );

  content = replaceOrThrow(
    content,
    "                            getPublishTone(fixture.publishedAtIso),",
    "                            getFixtureVisibilityTone(fixture.publishedAtIso),",
    "use renamed fixture visibility tone helper",
  );

  content = replaceOrThrow(
    content,
    "                          {formatPublishState(fixture.publishedAtIso)}",
    "                          {formatFixtureVisibilityState(fixture.publishedAtIso)}",
    "use renamed fixture visibility label helper",
  );

  await fs.writeFile(fixturesScreenPath, content, "utf8");

  console.log("Applied fixture/social label clarity fix safely.");
  console.log(`Backup created with suffix ${backupSuffix}.`);
}

main().catch((error) => {
  console.error("Failed to apply fixture/social label clarity fix safely.");
  console.error(error);
  process.exit(1);
});
