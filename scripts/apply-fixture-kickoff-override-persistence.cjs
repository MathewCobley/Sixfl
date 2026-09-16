const fs = require("node:fs");
const path = require("node:path");

const root = process.cwd();
const fp = (relative) => path.join(root, ...relative.split("/"));
const read = (relative) => fs.readFileSync(fp(relative), "utf8");
const write = (relative, source) => fs.writeFileSync(fp(relative), source, "utf8");

function replaceRequired(source, anchor, replacement, description) {
  if (source.includes(replacement)) return source;
  if (!source.includes(anchor)) throw new Error(`Kick-off override persistence could not find ${description}.`);
  return source.replace(anchor, replacement);
}

// Persist the admin's explicit per-fixture override. The database migration adds
// the physical column; this makes Prisma aware of it before prisma generate.
{
  const relative = "prisma/schema.prisma";
  let source = read(relative);
  if (!source.includes("kickoffRulesOverride Boolean @default(false)")) {
    const fixtureStart = source.indexOf("model Fixture {");
    const fixtureEnd = fixtureStart >= 0 ? source.indexOf("\n}", fixtureStart) : -1;
    if (fixtureStart < 0 || fixtureEnd < 0) {
      throw new Error("Kick-off override persistence could not find Fixture model.");
    }
    const fixtureBlock = source.slice(fixtureStart, fixtureEnd);
    const publishedMatch = fixtureBlock.match(/^(\s*)publishedAt\s+DateTime\?\s*$/m);
    if (!publishedMatch) {
      throw new Error("Kick-off override persistence could not find Fixture publishedAt field.");
    }
    const indent = publishedMatch[1];
    const updatedFixtureBlock = fixtureBlock.replace(
      publishedMatch[0],
      `${publishedMatch[0]}\n${indent}kickoffRulesOverride Boolean @default(false)`,
    );
    source = source.slice(0, fixtureStart) + updatedFixtureBlock + source.slice(fixtureEnd);
  }
  write(relative, source);
}

// Full fixture edit: save the checkbox instead of treating it as a one-request
// validation bypass that is forgotten before publication.
{
  const relative = "src/app/(admin)/admin/fixtures/[id]/edit/actions.ts";
  let source = read(relative);
  if (!source.includes("kickoffRulesOverride: overrideLatestKickoff,")) {
    source = replaceRequired(
      source,
      "          status,\n          matchFeePence: fixtureMatchFeePence,",
      "          status,\n          kickoffRulesOverride: overrideLatestKickoff,\n          matchFeePence: fixtureMatchFeePence,",
      "fixture edit update data",
    );
  }
  write(relative, source);
}

// Edit page + form: show the saved state when the fixture is reopened.
{
  const relative = "src/app/(admin)/admin/fixtures/[id]/edit/page.tsx";
  let source = read(relative);
  if (!source.includes("kickoffRulesOverride: true,")) {
    source = replaceRequired(
      source,
      "      publishedAt: true,\n      league:",
      "      publishedAt: true,\n      kickoffRulesOverride: true,\n      league:",
      "fixture edit select",
    );
  }
  if (!source.includes("kickoffRulesOverride: fixture.kickoffRulesOverride,")) {
    source = replaceRequired(
      source,
      "            status: fixture.status,\n            homeMatchFeePounds:",
      "            status: fixture.status,\n            kickoffRulesOverride: fixture.kickoffRulesOverride,\n            homeMatchFeePounds:",
      "fixture edit form values",
    );
  }
  write(relative, source);
}

{
  const relative = "src/components/admin/fixtures/FixtureEditForm.tsx";
  let source = read(relative);
  if (!source.includes("kickoffRulesOverride: boolean;")) {
    source = replaceRequired(
      source,
      "  status: string;\n  homeMatchFeePounds: string;",
      "  status: string;\n  kickoffRulesOverride: boolean;\n  homeMatchFeePounds: string;",
      "FixtureEditForm values type",
    );
  }
  if (!source.includes("defaultChecked={fixture.kickoffRulesOverride}")) {
    source = replaceRequired(
      source,
      '              name="overrideLatestKickoff"\n              className=',
      '              name="overrideLatestKickoff"\n              defaultChecked={fixture.kickoffRulesOverride}\n              className=',
      "fixture override checkbox",
    );
  }
  write(relative, source);
}

// Single-fixture creation already has the same explicit override checkbox. Save
// it so publishing the draft later respects the decision as well.
{
  const relative = "src/app/(admin)/admin/fixtures/generate/single-fixture-action.ts";
  let source = read(relative);
  if (!source.includes("kickoffRulesOverride: overrideLatestKickoff,")) {
    source = replaceRequired(
      source,
      "        status,\n        matchFeePence:",
      "        status,\n        kickoffRulesOverride: overrideLatestKickoff,\n        matchFeePence:",
      "single fixture create data",
    );
  }
  write(relative, source);
}

// Batch/week publication: carry the persisted flag into the transaction and
// skip only the kick-off-window check for fixtures explicitly overridden.
{
  const relative = "src/app/(admin)/admin/fixtures/publish-actions.ts";
  let source = read(relative);
  if (!source.includes("  kickoffRulesOverride: boolean;")) {
    source = replaceRequired(
      source,
      "  kickoffAt: Date;\n  pitch: string | null;",
      "  kickoffAt: Date;\n  kickoffRulesOverride: boolean;\n  pitch: string | null;",
      "batch publish record type",
    );
  }
  if (!source.includes("            kickoffRulesOverride: true,")) {
    source = replaceRequired(
      source,
      "            kickoffAt: true,\n            pitch: true,",
      "            kickoffAt: true,\n            kickoffRulesOverride: true,\n            pitch: true,",
      "batch publish fixture select",
    );
  }
  source = source.replace(
    "fixtures: Array<{ kickoffAt: Date; homeTeam: { id: string }; awayTeam: { id: string } }>,",
    "fixtures: Array<{ kickoffAt: Date; kickoffRulesOverride: boolean; homeTeam: { id: string }; awayTeam: { id: string } }>,",
  );
  if (!source.includes("allowOverride: fixture.kickoffRulesOverride,")) {
    source = replaceRequired(
      source,
      "    assertFixtureKickoffWindow(fixture.kickoffAt, fixtureTeams, {\n      overrideLabel:",
      "    assertFixtureKickoffWindow(fixture.kickoffAt, fixtureTeams, {\n      allowOverride: fixture.kickoffRulesOverride,\n      overrideLabel:",
      "batch publish kick-off validation",
    );
  }
  write(relative, source);
}

// Individual publish endpoint: honour the same saved override where the current
// source has a preflight guard, and always inside the publish transaction.
{
  const relative = "src/app/api/admin/fixtures/publish-one/route.ts";
  let source = read(relative);
  if (!source.includes("  kickoffRulesOverride: boolean;")) {
    source = replaceRequired(
      source,
      "  kickoffAt: Date;\n  pitch: string | null;",
      "  kickoffAt: Date;\n  kickoffRulesOverride: boolean;\n  pitch: string | null;",
      "single publish record type",
    );
  }
  source = source.replace(
    "      kickoffAt: true,\n      pitch: true,",
    "      kickoffAt: true,\n      kickoffRulesOverride: true,\n      pitch: true,",
  );
  source = source.replace(
    "          kickoffAt: true,\n          pitch: true,",
    "          kickoffAt: true,\n          kickoffRulesOverride: true,\n          pitch: true,",
  );
  source = source.replace(
    "  const kickoffViolations = await getFixtureKickoffRuleViolations({",
    "  const kickoffViolations = fixtureInfo.kickoffRulesOverride ? [] : await getFixtureKickoffRuleViolations({",
  );
  source = source.replace(
    "      const transactionKickoffViolations = await getFixtureKickoffRuleViolations({",
    "      const transactionKickoffViolations = fixture.kickoffRulesOverride ? [] : await getFixtureKickoffRuleViolations({",
  );
  write(relative, source);
}

const contracts = [
  ["prisma/schema.prisma", "kickoffRulesOverride Boolean @default(false)"],
  ["src/app/(admin)/admin/fixtures/[id]/edit/actions.ts", "kickoffRulesOverride: overrideLatestKickoff"],
  ["src/app/(admin)/admin/fixtures/[id]/edit/page.tsx", "kickoffRulesOverride: fixture.kickoffRulesOverride"],
  ["src/components/admin/fixtures/FixtureEditForm.tsx", "defaultChecked={fixture.kickoffRulesOverride}"],
  ["src/app/(admin)/admin/fixtures/generate/single-fixture-action.ts", "kickoffRulesOverride: overrideLatestKickoff"],
  ["src/app/(admin)/admin/fixtures/publish-actions.ts", "allowOverride: fixture.kickoffRulesOverride"],
  ["src/app/api/admin/fixtures/publish-one/route.ts", "fixture.kickoffRulesOverride ? []"],
];
for (const [relative, marker] of contracts) {
  if (!read(relative).includes(marker)) {
    throw new Error(`Kick-off override persistence contract missing from ${relative}: ${marker}`);
  }
}

console.log("Per-fixture kick-off rule overrides now persist and are honoured during publication.");
