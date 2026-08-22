const fs = require("node:fs");
const path = require("node:path");

const root = process.cwd();
const fp = (relative) => path.join(root, ...relative.split("/"));
const read = (relative) => fs.readFileSync(fp(relative), "utf8");
const write = (relative, source) => fs.writeFileSync(fp(relative), source, "utf8");

function requireAnchor(source, anchor, label) {
  if (!source.includes(anchor)) throw new Error(`Missing ${label} anchor.`);
}

function insertImport(source, anchor, importLine, label) {
  if (source.includes(importLine)) return source;
  requireAnchor(source, anchor, label);
  return source.replace(anchor, `${anchor}\n${importLine}`);
}

function insertLineBeforeEvery(source, targetTrimmed, lineTrimmed) {
  const lines = source.split("\n");
  const out = [];
  for (const line of lines) {
    if (line.trim() === targetTrimmed) {
      const previous = out[out.length - 1]?.trim();
      if (previous !== lineTrimmed) {
        const indent = line.match(/^\s*/)?.[0] ?? "";
        out.push(`${indent}${lineTrimmed}`);
      }
    }
    out.push(line);
  }
  return out.join("\n");
}

function replaceFunction(source, startName, nextName, replacement, label) {
  if (source.includes(replacement.trim())) return source;
  const start = source.indexOf(`function ${startName}`);
  const end = source.indexOf(`function ${nextName}`, start + 1);
  if (start < 0 || end < 0) throw new Error(`Could not replace ${label}.`);
  return source.slice(0, start) + replacement + "\n\n" + source.slice(end);
}

// Database migration 20260616120000 already created this column. The raw Prisma
// model omitted it, which is the underlying reason most code could not enforce it.
{
  const relative = "prisma/schema.prisma";
  let source = read(relative);
  if (!/\bearliestKickoffTime\s+String\?/.test(source)) {
    source = source.replace(
      /^(\s*)latestKickoffTime\s+String\?$/m,
      `$1earliestKickoffTime   String?\n$1latestKickoffTime     String?`,
    );
  }
  if (!/\bearliestKickoffTime\s+String\?/.test(source)) {
    throw new Error("Could not expose Team.earliestKickoffTime in Prisma schema.");
  }
  write(relative, source);
}

// Manual create panel (normal teams and TBC) must validate before any insert.
{
  const relative = "src/app/(admin)/admin/fixtures/create-fixture-action.ts";
  let source = read(relative);
  source = insertImport(
    source,
    'import { parseLondonDateTime } from "@/lib/datetime/london";',
    'import { assertFixtureKickoffWindow } from "@/lib/fixtures/kickoff-window";',
    "manual fixture datetime import",
  );

  if (!source.includes("async function validateManualFixtureKickoffWindow")) {
    const anchor = "async function teamCanPlayInLeague(teamId: string, leagueId: string) {";
    requireAnchor(source, anchor, "manual fixture team eligibility");
    const helper = `async function validateManualFixtureKickoffWindow(formData: FormData, teamIds: string[]) {\n  const status = String(formData.get(\"status\") ?? \"SCHEDULED\").trim();\n  if (status !== \"SCHEDULED\" && status !== \"COMPLETED\") return;\n\n  const kickoffDate = required(formData, \"kickoffDate\", \"Kick-off date\");\n  const kickoffTime = required(formData, \"kickoffTime\", \"Kick-off time\");\n  const kickoffAt = parseLondonDateTime(kickoffDate, kickoffTime);\n  const overrideKickoffRules =\n    String(formData.get(\"overrideLatestKickoff\") ?? \"\").trim() === \"on\";\n  const teams = await prisma.team.findMany({\n    where: { id: { in: teamIds.filter(Boolean) } },\n    select: {\n      id: true,\n      name: true,\n      earliestKickoffTime: true,\n      latestKickoffTime: true,\n    },\n  });\n\n  assertFixtureKickoffWindow(kickoffAt, teams, {\n    allowOverride: overrideKickoffRules,\n    overrideLabel:\n      \"Change the fixture time, update the team kick-off rules, or use the explicit kick-off rules override.\",\n  });\n}\n\n`;
    source = source.replace(anchor, helper + anchor);
  }

  if (!source.includes("await validateManualFixtureKickoffWindow(formData")) {
    const anchor = `  try {\n    const placeholderIds = await getFixturePlaceholderTeamIds(`;
    requireAnchor(source, anchor, "manual fixture create try block");
    source = source.replace(
      anchor,
      `  try {\n    await validateManualFixtureKickoffWindow(formData, [homeTeamId, awayTeamId]);\n\n    const placeholderIds = await getFixturePlaceholderTeamIds(`,
    );
  }
  write(relative, source);
}

// Single fixture creator: existing explicit override now applies to earliest + latest.
{
  const relative = "src/app/(admin)/admin/fixtures/generate/single-fixture-action.ts";
  let source = read(relative);
  source = insertImport(
    source,
    'import { ensureSeasonTeamRowsForLeague } from "@/lib/league-season-teams";',
    'import { assertFixtureKickoffWindow } from "@/lib/fixtures/kickoff-window";',
    "single fixture season import",
  );
  if (!source.includes("earliestKickoffTime: string | null;")) {
    source = source.replace(
      "  latestKickoffTime: string | null;",
      "  earliestKickoffTime: string | null;\n  latestKickoffTime: string | null;",
    );
  }
  if (!source.includes('t."earliestKickoffTime",')) {
    source = source.replace(
      '          t."latestKickoffTime",',
      '          t."earliestKickoffTime",\n          t."latestKickoffTime",',
    );
  }
  source = replaceFunction(
    source,
    "assertKickoffAllowed",
    "buildReturnUrl",
    `function assertKickoffAllowed(kickoffAt: Date, team: TeamRow) {\n  assertFixtureKickoffWindow(kickoffAt, [team], {\n    overrideLabel:\n      \"Choose a permitted time, tick the kick-off rules override for this fixture, or update the team's kick-off rules.\",\n  });\n}`,
    "single fixture kickoff validator",
  );
  write(relative, source);
}

function patchGenerator(relative, sqlMode = false) {
  let source = read(relative);
  if (!source.includes("earliestKickoffTime: string | null;")) {
    source = source.replace(
      "  latestKickoffTime: string | null;",
      "  earliestKickoffTime: string | null;\n  latestKickoffTime: string | null;",
    );
  }

  if (!source.includes("const homeEarliest = parseTimeToMinutes(homeTeam.earliestKickoffTime);")) {
    const anchor = `  const kickoffMinutes = getLondonMinutesSinceMidnight(kickoffAt);\n  const homeLatest = parseTimeToMinutes(homeTeam.latestKickoffTime);\n  const awayLatest = parseTimeToMinutes(awayTeam.latestKickoffTime);`;
    requireAnchor(source, anchor, `${relative} kickoff calculation`);
    source = source.replace(
      anchor,
      `  const kickoffMinutes = getLondonMinutesSinceMidnight(kickoffAt);\n  const homeEarliest = parseTimeToMinutes(homeTeam.earliestKickoffTime);\n  const awayEarliest = parseTimeToMinutes(awayTeam.earliestKickoffTime);\n  const homeLatest = parseTimeToMinutes(homeTeam.latestKickoffTime);\n  const awayLatest = parseTimeToMinutes(awayTeam.latestKickoffTime);\n\n  if (homeEarliest !== null && kickoffMinutes < homeEarliest) {\n    return { allowed: false, reason: \`${"${homeTeam.name}"} cannot kick off before ${"${homeTeam.earliestKickoffTime}"}.\` };\n  }\n  if (awayEarliest !== null && kickoffMinutes < awayEarliest) {\n    return { allowed: false, reason: \`${"${awayTeam.name}"} cannot kick off before ${"${awayTeam.earliestKickoffTime}"}.\` };\n  }`,
    );
  }

  if (sqlMode) {
    source = source.replaceAll(
      't."logoUrl", t."latestKickoffTime"',
      't."logoUrl", t."earliestKickoffTime", t."latestKickoffTime"',
    );
  } else {
    source = insertLineBeforeEvery(
      source,
      "latestKickoffTime: true,",
      "earliestKickoffTime: true,",
    );
  }

  if (!source.includes("earliestKickoffTime")) {
    throw new Error(`${relative} did not receive earliest kick-off support.`);
  }
  write(relative, source);
}

patchGenerator("src/app/(admin)/admin/fixtures/generate/actions.ts");
patchGenerator("src/app/(admin)/admin/fixtures/generate/division-actions.ts", true);

// Full fixture edit action.
{
  const relative = "src/app/(admin)/admin/fixtures/[id]/edit/actions.ts";
  let source = read(relative);
  source = insertImport(
    source,
    'import { queueInitialFixtureConfirmationEmailForTeam } from "@/lib/fixtures/confirmation-emails";',
    'import { assertFixtureKickoffWindow } from "@/lib/fixtures/kickoff-window";',
    "fixture edit confirmation import",
  );
  source = insertLineBeforeEvery(
    source,
    "latestKickoffTime: true,",
    "earliestKickoffTime: true,",
  );
  source = replaceFunction(
    source,
    "assertLatestKickoffAllowed",
    "teamCanPlayInLeague",
    `function assertLatestKickoffAllowed(input: {\n  kickoffAt: Date;\n  team: {\n    name: string;\n    earliestKickoffTime: string | null;\n    latestKickoffTime: string | null;\n  };\n}) {\n  assertFixtureKickoffWindow(input.kickoffAt, [input.team], {\n    overrideLabel:\n      \"Change the fixture time or tick the kick-off rules override.\",\n  });\n}\n\nasync `,
    "fixture edit kickoff validator",
  );
  source = source.replace("async \n\nfunction teamCanPlayInLeague", "async function teamCanPlayInLeague");
  write(relative, source);
}

// Publish batch/week. Validate inside the same transaction before publishedAt is set.
{
  const relative = "src/app/(admin)/admin/fixtures/publish-actions.ts";
  let source = read(relative);
  source = insertImport(
    source,
    'import { formatDateTimeInLondon } from "@/lib/datetime/london";',
    'import { assertFixtureKickoffWindow } from "@/lib/fixtures/kickoff-window";',
    "batch publish datetime import",
  );

  if (!source.includes("async function assertBatchFixtureKickoffWindows")) {
    const anchor = "async function assertDivisionBelongsToLeague";
    requireAnchor(source, anchor, "batch publish division helper");
    const helper = `async function assertBatchFixtureKickoffWindows(\n  db: typeof prisma,\n  fixtures: Array<{ kickoffAt: Date; homeTeam: { id: string }; awayTeam: { id: string } }>,\n) {\n  const teamIds = unique(\n    fixtures.flatMap((fixture) => [fixture.homeTeam.id, fixture.awayTeam.id]),\n  );\n  if (teamIds.length === 0) return;\n\n  const teams = await db.team.findMany({\n    where: { id: { in: teamIds } },\n    select: {\n      id: true,\n      name: true,\n      earliestKickoffTime: true,\n      latestKickoffTime: true,\n    },\n  });\n  const byId = new Map(teams.map((team) => [team.id, team]));\n\n  for (const fixture of fixtures) {\n    const fixtureTeams = [\n      byId.get(fixture.homeTeam.id),\n      byId.get(fixture.awayTeam.id),\n    ].filter((team): team is NonNullable<typeof team> => Boolean(team));\n    assertFixtureKickoffWindow(fixture.kickoffAt, fixtureTeams, {\n      overrideLabel:\n        \"Change the fixture time or update the team kick-off rules before publishing.\",\n    });\n  }\n}\n\n`;
    source = source.replace(anchor, helper + anchor);
  }

  if (!source.includes("await assertBatchFixtureKickoffWindows(tx")) {
    const anchor = "        if (unpublishedFixtures.length === 0) return [];";
    requireAnchor(source, anchor, "batch publish zero fixtures");
    source = source.replace(
      anchor,
      `${anchor}\n\n        await assertBatchFixtureKickoffWindows(tx as typeof prisma, unpublishedFixtures);`,
    );
  }
  write(relative, source);
}

// Single publish endpoint. Validate before update and return a useful 409 to admin.
{
  const relative = "src/app/api/admin/fixtures/publish-one/route.ts";
  let source = read(relative);
  source = insertImport(
    source,
    'import { formatDateTimeInLondon } from "@/lib/datetime/london";',
    'import { getFixtureKickoffWindowViolations } from "@/lib/fixtures/kickoff-window";',
    "single publish datetime import",
  );

  if (!source.includes("async function getFixtureKickoffRuleViolations")) {
    const anchor = "async function queueTemplateNotificationOnce";
    requireAnchor(source, anchor, "single publish notification helper");
    const helper = `async function getFixtureKickoffRuleViolations(input: {\n  kickoffAt: Date;\n  homeTeamId: string;\n  awayTeamId: string;\n}) {\n  const teams = await prisma.team.findMany({\n    where: { id: { in: [input.homeTeamId, input.awayTeamId] } },\n    select: {\n      id: true,\n      name: true,\n      earliestKickoffTime: true,\n      latestKickoffTime: true,\n    },\n  });\n  return getFixtureKickoffWindowViolations(input.kickoffAt, teams);\n}\n\n`;
    source = source.replace(anchor, helper + anchor);
  }

  if (!source.includes("const kickoffViolations = await getFixtureKickoffRuleViolations")) {
    const anchor = `  if (fixtureInfo.publishedAt) {\n    return NextResponse.json({ ok: true, published: false, alreadyPublished: true });\n  }`;
    requireAnchor(source, anchor, "single publish already-published gate");
    source = source.replace(
      anchor,
      `${anchor}\n\n  const kickoffViolations = await getFixtureKickoffRuleViolations({\n    kickoffAt: fixtureInfo.kickoffAt,\n    homeTeamId: fixtureInfo.homeTeam.id,\n    awayTeamId: fixtureInfo.awayTeam.id,\n  });\n  if (kickoffViolations.length > 0) {\n    return NextResponse.json(\n      {\n        ok: false,\n        error: \`${"${kickoffViolations.map((item) => item.message).join(\" \")}"} Change the fixture time or update the team kick-off rules before publishing.\`,\n      },\n      { status: 409 },\n    );\n  }`,
    );
  }

  if (!source.includes("const transactionKickoffViolations")) {
    const anchor = "      if (!fixture || fixture.publishedAt) return null;";
    requireAnchor(source, anchor, "single publish transaction gate");
    source = source.replace(
      anchor,
      `${anchor}\n\n      const transactionKickoffViolations = await getFixtureKickoffRuleViolations({\n        kickoffAt: fixture.kickoffAt,\n        homeTeamId: fixture.homeTeam.id,\n        awayTeamId: fixture.awayTeam.id,\n      });\n      if (transactionKickoffViolations.length > 0) {\n        throw new Error(transactionKickoffViolations.map((item) => item.message).join(\" \"));\n      }`,
    );
  }
  write(relative, source);
}

// Night Board read model: include earliest limits and pass them to the client warning engine.
{
  const relative = "src/app/(admin)/admin/night-board/page.tsx";
  let source = read(relative);
  source = source.replaceAll(
    "select: { id: true, name: true, latestKickoffTime: true },",
    "select: { id: true, name: true, earliestKickoffTime: true, latestKickoffTime: true },",
  );
  source = source.replaceAll(
    "        name: fixture.homeTeam.name,\n        latestKickoffTime: fixture.homeTeam.latestKickoffTime,",
    "        name: fixture.homeTeam.name,\n        earliestKickoffTime: fixture.homeTeam.earliestKickoffTime,\n        latestKickoffTime: fixture.homeTeam.latestKickoffTime,",
  );
  source = source.replaceAll(
    "        name: fixture.awayTeam.name,\n        latestKickoffTime: fixture.awayTeam.latestKickoffTime,",
    "        name: fixture.awayTeam.name,\n        earliestKickoffTime: fixture.awayTeam.earliestKickoffTime,\n        latestKickoffTime: fixture.awayTeam.latestKickoffTime,",
  );
  if (!source.includes("earliestKickoffTime: fixture.homeTeam.earliestKickoffTime")) {
    throw new Error("Night Board did not receive earliest kick-off rules.");
  }
  write(relative, source);
}

// Night Board client: turn the old latest-only warning into a full window conflict.
{
  const relative = "src/components/admin/night-board/NightBoardOperations.tsx";
  let source = read(relative);
  if (!source.includes("earliestKickoffTime: string | null;")) {
    source = source.replace(
      "  latestKickoffTime: string | null;",
      "  earliestKickoffTime: string | null;\n  latestKickoffTime: string | null;",
    );
  }
  source = replaceFunction(
    source,
    "buildLatestKickoffWarning",
    "buildRepeatedTeamWarnings",
    `function buildLatestKickoffWarning(\n  fixture: NightBoardFixtureDraft,\n): LatestKickoffWarning | null {\n  if (!isOperationalStatus(fixture.status)) return null;\n  const kickoffMinutes = timeToMinutes(fixture.kickoffTime);\n  if (kickoffMinutes === null) return null;\n\n  const breachedTeams = [fixture.homeTeam, fixture.awayTeam]\n    .map((team) => {\n      const earliestMinutes = timeToMinutes(team.earliestKickoffTime);\n      const latestMinutes = timeToMinutes(team.latestKickoffTime);\n      if (earliestMinutes !== null && kickoffMinutes < earliestMinutes) {\n        return \`${"${team.name}"} cannot play before ${"${displayTime(team.earliestKickoffTime ?? \"\")}"}\`;\n      }\n      if (latestMinutes !== null && kickoffMinutes > latestMinutes) {\n        return \`${"${team.name}"} cannot play later than ${"${displayTime(team.latestKickoffTime ?? \"\")}"}\`;\n      }\n      return null;\n    })\n    .filter((item): item is string => Boolean(item));\n\n  if (breachedTeams.length === 0) return null;\n  const scheduledTime = displayTime(fixture.kickoffTime);\n  const limits = breachedTeams.join(\" · \");\n  return {\n    fixtureId: fixture.id,\n    inlineMessage: \`Kick-off rule conflict: ${"${limits}"}. This fixture is scheduled for ${"${scheduledTime}"}.\`,\n    summaryMessage: \`Potential issue – team kick-off rule: ${"${fixture.homeTeam.name}"} v ${"${fixture.awayTeam.name}"} is scheduled for ${"${scheduledTime}"}. ${"${limits}"}.\`,\n  };\n}`,
    "Night Board kick-off warning",
  );
  write(relative, source);
}

// Night Board save: block a NEW invalid KO time, but allow other fields on an old bad fixture to be repaired independently.
{
  const relative = "src/app/api/admin/night-board/update-match/route.ts";
  let source = read(relative);
  source = insertImport(
    source,
    'import { parseLondonDateTime, toLondonDateInputValue } from "@/lib/datetime/london";',
    'import { getFixtureKickoffWindowViolations } from "@/lib/fixtures/kickoff-window";',
    "Night Board save datetime import",
  );
  if (!source.includes("const changedKickoffViolations")) {
    const anchor = `  const kickoffAt = parseOperationalKickoff({ currentKickoffAt: fixture.kickoffAt, timeInput: kickoffTime });`;
    requireAnchor(source, anchor, "Night Board parsed kickoff");
    source = source.replace(
      anchor,
      `${anchor}\n\n  if (\n    kickoffAt.getTime() !== fixture.kickoffAt.getTime() &&\n    (status === FixtureStatus.SCHEDULED || status === FixtureStatus.COMPLETED)\n  ) {\n    const ruleTeams = await prisma.team.findMany({\n      where: { id: { in: [fixture.homeTeam.id, fixture.awayTeam.id] } },\n      select: {\n        id: true,\n        name: true,\n        earliestKickoffTime: true,\n        latestKickoffTime: true,\n      },\n    });\n    const changedKickoffViolations = getFixtureKickoffWindowViolations(\n      kickoffAt,\n      ruleTeams,\n    );\n    if (changedKickoffViolations.length > 0) {\n      return NextResponse.json(\n        {\n          ok: false,\n          error: \`${"${changedKickoffViolations.map((item) => item.message).join(\" \")}"} Choose a permitted kick-off time.\`,\n          returnTo,\n        },\n        { status: 409 },\n      );\n    }\n  }`,
    );
  }
  write(relative, source);
}

// Wording: one explicit override covers the whole team window.
for (const relative of [
  "src/components/admin/fixtures/CreateSingleFixturePanel.tsx",
  "src/components/admin/fixtures/FixtureEditForm.tsx",
]) {
  let source = read(relative);
  source = source
    .replaceAll("Override latest kick-off restriction", "Override team kick-off rules")
    .replaceAll("latest kick-off override", "kick-off rules override")
    .replaceAll("latest kick-off preference", "kick-off rules");
  write(relative, source);
}

// Contract markers: fail the build if future source evolution silently drops this protection.
const contracts = [
  ["src/app/(admin)/admin/fixtures/create-fixture-action.ts", "validateManualFixtureKickoffWindow"],
  ["src/app/(admin)/admin/fixtures/generate/single-fixture-action.ts", "assertFixtureKickoffWindow"],
  ["src/app/(admin)/admin/fixtures/generate/actions.ts", "homeEarliest"],
  ["src/app/(admin)/admin/fixtures/generate/division-actions.ts", "homeEarliest"],
  ["src/app/(admin)/admin/fixtures/[id]/edit/actions.ts", "earliestKickoffTime: true"],
  ["src/app/(admin)/admin/fixtures/publish-actions.ts", "assertBatchFixtureKickoffWindows"],
  ["src/app/api/admin/fixtures/publish-one/route.ts", "getFixtureKickoffRuleViolations"],
  ["src/app/(admin)/admin/night-board/page.tsx", "earliestKickoffTime: fixture.homeTeam.earliestKickoffTime"],
  ["src/components/admin/night-board/NightBoardOperations.tsx", "Kick-off rule conflict"],
  ["src/app/api/admin/night-board/update-match/route.ts", "changedKickoffViolations"],
];
for (const [relative, marker] of contracts) {
  if (!read(relative).includes(marker)) {
    throw new Error(`Team kick-off window contract missing from ${relative}: ${marker}`);
  }
}

console.log(
  "Team earliest/latest kick-off windows are enforced for create/generate/publish and surfaced on the Night Board.",
);
