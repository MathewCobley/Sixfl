#!/usr/bin/env node

const fs = require("fs");
const path = require("path");

function read(filePath) {
  return fs.readFileSync(filePath, "utf8");
}

function write(filePath, content) {
  fs.writeFileSync(filePath, content, "utf8");
}

function patchWithRegex(source, regex, replacement, label, filePath, results) {
  const next = source.replace(regex, replacement);
  if (next !== source) {
    results.push(`patched: ${label}`);
    return next;
  }
  results.push(`skipped: ${label}`);
  return source;
}

function patchFile(relativePath, patcher) {
  const filePath = path.resolve(process.cwd(), relativePath);

  if (!fs.existsSync(filePath)) {
    throw new Error(`Missing file: ${relativePath}`);
  }

  const original = read(filePath);
  const results = [];
  const updated = patcher(original, relativePath, results);

  if (updated !== original) {
    write(filePath, updated);
    console.log(`[patched] ${relativePath}`);
  } else {
    console.log(`[no changes] ${relativePath}`);
  }

  for (const result of results) {
    console.log(`  - ${result}`);
  }
}

function patchFixturesAdminScreen(source, relativePath, results) {
  let out = source;

  out = patchWithRegex(
    out,
    /label="Home team"/g,
    'label="Team 1"',
    "replace Home team label",
    relativePath,
    results,
  );

  out = patchWithRegex(
    out,
    /placeholder="Search home team"/g,
    'placeholder="Search team 1"',
    "replace Search home team placeholder",
    relativePath,
    results,
  );

  out = patchWithRegex(
    out,
    /label="Away team"/g,
    'label="Team 2"',
    "replace Away team label",
    relativePath,
    results,
  );

  out = patchWithRegex(
    out,
    /placeholder="Search away team"/g,
    'placeholder="Search team 2"',
    "replace Search away team placeholder",
    relativePath,
    results,
  );

  out = patchWithRegex(
    out,
    /(\n\s*)Match(\n\s*)/g,
    '$1Fixture$2',
    "replace Match heading with Fixture",
    relativePath,
    results,
  );

  return out;
}

function patchMatchModal(source, relativePath, results) {
  let out = source;

  out = patchWithRegex(
    out,
    /(\n\s*)Home team(\n\s*)/g,
    '$1Team 1$2',
    "replace Home team text",
    relativePath,
    results,
  );

  out = patchWithRegex(
    out,
    /(\n\s*)Away team(\n\s*)/g,
    '$1Team 2$2',
    "replace Away team text",
    relativePath,
    results,
  );

  return out;
}

function patchPublishActions(source, relativePath, results) {
  let out = source;

  out = patchWithRegex(
    out,
    /const isHome = fixture\.homeTeam\.id === teamId;\s*const opponent = isHome \? fixture\.awayTeam\.name : fixture\.homeTeam\.name;\s*return `\$\{formatKickoff\(fixture\.kickoffAt\)\} — \$\{\s*isHome \? `Home vs \$\{opponent\}` : `Away at \$\{opponent\}`\s*\} — \$\{fixture\.pitch \?\? "Pitch TBC"\} — \$\{fixture\.venue\?\.name \?\? "Venue TBC"\}`;/s,
    'void teamId;\n\n  return `${formatKickoff(fixture.kickoffAt)} — ${fixture.homeTeam.name} v ${fixture.awayTeam.name} — ${fixture.pitch ?? "Pitch TBC"} — ${fixture.venue?.name ?? "Venue TBC"}`;',
    "replace Home vs / Away at email wording",
    relativePath,
    results,
  );

  return out;
}

try {
  patchFile("src/components/admin/fixtures/FixturesAdminScreen.tsx", patchFixturesAdminScreen);
  patchFile("src/components/admin/fixtures/MatchModal.tsx", patchMatchModal);
  patchFile("src/app/(admin)/admin/fixtures/publish-actions.ts", patchPublishActions);

  console.log("");
  console.log("Done.");
  console.log("Now run:");
  console.log('  git diff');
  console.log('  git add "src/components/admin/fixtures/FixturesAdminScreen.tsx" "src/components/admin/fixtures/MatchModal.tsx" "src/app/(admin)/admin/fixtures/publish-actions.ts"');
  console.log('  git commit -m "Use neutral fixture labels instead of home and away"');
  console.log('  git push origin main');
} catch (error) {
  console.error("");
  console.error("Patch failed.");
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
}
