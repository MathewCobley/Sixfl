const fs = require("node:fs");
const path = require("node:path");

const root = process.cwd();

function filePath(relative) {
  return path.join(root, ...relative.split("/"));
}

function read(relative) {
  return fs.readFileSync(filePath(relative), "utf8");
}

function write(relative, source) {
  fs.writeFileSync(filePath(relative), source, "utf8");
}

function replaceRequired(source, before, after, label) {
  if (source.includes(after)) return source;
  if (!source.includes(before)) {
    throw new Error(`Expected ${label} source was not found.`);
  }
  return source.replace(before, after);
}

function replaceAllRequired(source, before, after, label, min = 1) {
  if (source.includes(after) && !source.includes(before)) return source;
  const count = source.split(before).length - 1;
  if (count < min) {
    throw new Error(`Expected ${label} source was not found (${count}/${min}).`);
  }
  return source.replaceAll(before, after);
}

// The database column has existed since 2026-06-16, but the raw Prisma model
// omitted it. Expose it so every server path can enforce the same rule.
{
  const relative = "prisma/schema.prisma";
  let source = read(relative);
  if (!source.includes("earliestKickoffTime")) {
    source = replaceRequired(
      source,
      "  latestKickoffTime     String?\n",
      "  earliestKickoffTime   String?\n  latestKickoffTime     String?\n",
      "Prisma earliest kick-off field",
    );
  }
  write(relative, source);
}

const helperImport =
  'import { assertFixtureKickoffWindow, getFixtureKickoffWindowViolations } from "@/lib/fixtures/kickoff-window";';

// Manual fixture creation: validate before either the normal or TBC creation path.
{
  const relative = "src/app/(admin)/admin/fixtures/create-fixture-action.ts";
  let source = read(relative);
  if (!source.includes(helperImport)) {
    source = replaceRequired(
      source,
      'import { parseLondonDateTime } from "@/lib/datetime/london";',
      'import { parseLondonDateTime } from "@/lib/datetime/london";\n' + helperImport,
      "manual fixture kickoff-window import",
    );
  }

  if (!source.includes("async function validateManualFixtureKickoffWindow")) {
    const anchor = "async function teamCanPlayInLeague(teamId: string, leagueId: string) {";
    const addition = `async function validateManualFixtureKickoffWindow(formData: FormData, teamIds: string[]) {\n  const status = String(formData.get(\"status\") ?? \"SCHEDULED\").trim();\n  if (status !== \"SCHEDULED\" && status !== \"COMPLETED\") return;\n\n  const kickoffDate = required(formData, \"kickoffDate\", \"Kick-off date\");\n  const kickoffTime = required(formData, \"kickoffTime\", \"Kick-off time\");\n  const kickoffAt = parseLondonDateTime(kickoffDate, kickoffTime);\n  const overrideKickoffRules =\n    String(formData.get(\"overrideLatestKickoff\") ?? \"\").trim() === \"on\";\n  const teams = await prisma.team.findMany({\n    where: { id: { in: teamIds.filter(Boolean) } },\n    select: {\n      id: true,\n      name: true,\n      earliestKickoffTime: true,\n      latestKickoffTime: true,\n    },\n  });\n\n  assertFixtureKickoffWindow(kickoffAt, teams, {\n    allowOverride: overrideKickoffRules,\n    overrideLabel:\n      \"Change the fixture time, update the team kick-off rules, or use the explicit kick-off rules override.\",\n  });\n}\n\n`;
    if (!source.includes(anchor)) {
      throw new Error("Manual fixture team eligibility anchor was not found.");
    }
    source = source.replace(anchor, addition + anchor);
  }

  source = replaceRequired(
    source,
    `  try {\n    const placeholderIds = await getFixturePlaceholderTeamIds(\n      [homeTeamId, awayTeamId].filter(Boolean),\n    );`,
    `  try {\n    await validateManualFixtureKickoffWindow(formData, [homeTeamId, awayTeamId]);\n\n    const placeholderIds = await getFixturePlaceholderTeamIds(\n      [homeTeamId, awayTeamId].filter(Boolean),\n    );`,
    "manual fixture kickoff-window validation call",
  );

  write(relative, source);
}

// Single draft fixture creator: existing latest-only override now covers the full window.
{
  const relative = "src/app/(admin)/admin/fixtures/generate/single-fixture-action.ts";
  let source = read(relative);
  if (!source.includes('from "@/lib/fixtures/kickoff-window"')) {
    source = replaceRequired(
      source,
      'import { ensureSeasonTeamRowsForLeague } from "@/lib/league-season-teams";',
      'import { assertFixtureKickoffWindow } from "@/lib/fixtures/kickoff-window";\nimport { ensureSeasonTeamRowsForLeague } from "@/lib/league-season-teams";',
      "single fixture kickoff-window import",
    );
  }
  source = replaceRequired(
    source,
    "  divisionId: string | null;\n  latestKickoffTime: string | null;",
    "  divisionId: string | null;\n  earliestKickoffTime: string | null;\n  latestKickoffTime: string | null;",
    "single fixture team earliest field",
  );
  source = replaceRequired(
    source,
    `function assertKickoffAllowed(kickoffAt: Date, team: TeamRow) {\n  const latest = timeToMinutes(team.latestKickoffTime);\n  if (latest === null) return;\n  if (getLondonMinutesSinceMidnight(kickoffAt) <= latest) return;\n  throw new Error(\n    \`${"${team.name}"} cannot kick off later than ${"${team.latestKickoffTime}"}. Choose an earlier time, tick the override box for this fixture, or update the team's latest kick-off preference.\`,\n  );\n}`,
    `function assertKickoffAllowed(kickoffAt: Date, team: TeamRow) {\n  assertFixtureKickoffWindow(kickoffAt, [team], {\n    overrideLabel:\n      \"Choose a permitted time, tick the kick-off rules override for this fixture, or update the team's kick-off rules.\",\n  });\n}`,
    "single fixture full kickoff-window assertion",
  );
  source = replaceRequired(
    source,
    '          t."latestKickoffTime",\n          t."standardMatchFeePence"::int AS "standardMatchFeePence"',
    '          t."earliestKickoffTime",\n          t."latestKickoffTime",\n          t."standardMatchFeePence"::int AS "standardMatchFeePence"',
    "single fixture earliest SQL select",
  );
  write(relative, source);
}

// Whole-league generator: reject too-early slots as well as too-late slots.
{
  const relative = "src/app/(admin)/admin/fixtures/generate/actions.ts";
  let source = read(relative);
  source = replaceRequired(
    source,
    "  logoUrl: string | null;\n  latestKickoffTime: string | null;",
    "  logoUrl: string | null;\n  earliestKickoffTime: string | null;\n  latestKickoffTime: string | null;",
    "league generator earliest team field",
  );
  source = replaceRequired(
    source,
    `  const kickoffMinutes = getLondonMinutesSinceMidnight(kickoffAt);\n  const homeLatest = parseTimeToMinutes(homeTeam.latestKickoffTime);\n  const awayLatest = parseTimeToMinutes(awayTeam.latestKickoffTime);`,
    `  const kickoffMinutes = getLondonMinutesSinceMidnight(kickoffAt);\n  const homeEarliest = parseTimeToMinutes(homeTeam.earliestKickoffTime);\n  const awayEarliest = parseTimeToMinutes(awayTeam.earliestKickoffTime);\n  const homeLatest = parseTimeToMinutes(homeTeam.latestKickoffTime);\n  const awayLatest = parseTimeToMinutes(awayTeam.latestKickoffTime);\n\n  if (homeEarliest !== null && kickoffMinutes < homeEarliest) {\n    return {\n      allowed: false,\n      reason: \`${"${homeTeam.name}"} cannot kick off before ${"${homeTeam.earliestKickoffTime}"}.\`,\n    };\n  }\n\n  if (awayEarliest !== null && kickoffMinutes < awayEarliest) {\n    return {\n      allowed: false,\n      reason: \`${"${awayTeam.name}"} cannot kick off before ${"${awayTeam.earliestKickoffTime}"}.\`,\n    };\n  }`,
    "league generator earliest validation",
  );
  source = replaceAllRequired(
    source,
    "        logoUrl: true,\n        latestKickoffTime: true,",
    "        logoUrl: true,\n        earliestKickoffTime: true,\n        latestKickoffTime: true,",
    "league generator earliest selects",
    2,
  );
  write(relative, source);
}

// Division generator: same rule set, including its raw season-team queries.
{
  const relative = "src/app/(admin)/admin/fixtures/generate/division-actions.ts";
  let source = read(relative);
  source = replaceRequired(
    source,
    "  logoUrl: string | null;\n  latestKickoffTime: string | null;",
    "  logoUrl: string | null;\n  earliestKickoffTime: string | null;\n  latestKickoffTime: string | null;",
    "division generator earliest team field",
  );
  source = replaceRequired(
    source,
    `  const kickoffMinutes = getLondonMinutesSinceMidnight(kickoffAt);\n  const homeLatest = parseTimeToMinutes(homeTeam.latestKickoffTime);\n  const awayLatest = parseTimeToMinutes(awayTeam.latestKickoffTime);`,
    `  const kickoffMinutes = getLondonMinutesSinceMidnight(kickoffAt);\n  const homeEarliest = parseTimeToMinutes(homeTeam.earliestKickoffTime);\n  const awayEarliest = parseTimeToMinutes(awayTeam.earliestKickoffTime);\n  const homeLatest = parseTimeToMinutes(homeTeam.latestKickoffTime);\n  const awayLatest = parseTimeToMinutes(awayTeam.latestKickoffTime);\n\n  if (homeEarliest !== null && kickoffMinutes < homeEarliest) {\n    return { allowed: false, reason: \`${"${homeTeam.name}"} cannot kick off before ${"${homeTeam.earliestKickoffTime}"}.\` };\n  }\n  if (awayEarliest !== null && kickoffMinutes < awayEarliest) {\n    return { allowed: false, reason: \`${"${awayTeam.name}"} cannot kick off before ${"${awayTeam.earliestKickoffTime}"}.\` };\n  }`,
    "division generator earliest validation",
  );
  source = replaceAllRequired(
    source,
    'SELECT t."id", t."name", t."logoUrl", t."latestKickoffTime", t."standardMatchFeePence"',
    'SELECT t."id", t."name", t."logoUrl", t."earliestKickoffTime", t."latestKickoffTime", t."standardMatchFeePence"',
    "division generator earliest SQL selects",
    2,
  );
  write(relative, source);
}

// Full fixture editor: explicit override remains available, but now means all team KO rules.
{
  const relative = "src/app/(admin)/admin/fixtures/[id]/edit/actions.ts";
  let source = read(relative);
  if (!source.includes('from "@/lib/fixtures/kickoff-window"')) {
    source = replaceRequired(
      source,
      'import { queueInitialFixtureConfirmationEmailForTeam } from "@/lib/fixtures/confirmation-emails";',
      'import { queueInitialFixtureConfirmationEmailForTeam } from "@/lib/fixtures/confirmation-emails";\nimport { assertFixtureKickoffWindow } from "@/lib/fixtures/kickoff-window";',
      "fixture editor kickoff-window import",
    );
  }
  source = replaceRequired(
    source,
    `function assertLatestKickoffAllowed(input: {\n  kickoffAt: Date;\n  team: { name: string; latestKickoffTime: string | null };\n}) {\n  const latestMinutes = parseTimeToMinutes(input.team.latestKickoffTime);\n  if (latestMinutes === null) return;\n  if (getLondonMinutesSinceMidnight(input.kickoffAt) <= latestMinutes) return;\n  throw new Error(\n    \`${"${input.team.name}"} has latest KO ${"${input.team.latestKickoffTime}"}, so ${"${formatTimeInLondon(input.kickoffAt)}"} is too late. Change the fixture time or tick the latest kick-off override.\`,\n  );\n}`,
    `function assertLatestKickoffAllowed(input: {\n  kickoffAt: Date;\n  team: {\n    name: string;\n    earliestKickoffTime: string | null;\n    latestKickoffTime: string | null;\n  };\n}) {\n  assertFixtureKickoffWindow(input.kickoffAt, [input.team], {\n    overrideLabel:\n      \"Change the fixture time or tick the kick-off rules override.\",\n  });\n}`,
    "fixture editor full kickoff-window assertion",
  );
  source = replaceAllRequired(
    source,
    "            logoUrl: true,\n            latestKickoffTime: true,",
    "            logoUrl: true,\n            earliestKickoffTime: true,\n            latestKickoffTime: true,",
    "fixture editor earliest selects",
    2,
  );
  write(relative, source);
}

// Publish-all/week: a stale invalid draft must not become published.
{
  const relative = "src/app/(admin)/admin/fixtures/publish-actions.ts";
  let source = read(relative);
  if (!source.includes('from "@/lib/fixtures/kickoff-window"')) {
    source = replaceRequired(
      source,
      'import { formatDateTimeInLondon } from "@/lib/datetime/london";',
      'import { formatDateTimeInLondon } from "@/lib/datetime/london";\nimport { assertFixtureKickoffWindow } from "@/lib/fixtures/kickoff-window";',
      "batch publish kickoff-window import",
    );
  }
  source = replaceAllRequired(
    source,
    "homeTeam: { select: { id: true, name: true, logoUrl: true } },",
    "homeTeam: { select: { id: true, name: true, logoUrl: true, earliestKickoffTime: true, latestKickoffTime: true } },",
    "batch publish home team rule selects",
    1,
  );
  source = replaceAllRequired(
    source,
    "awayTeam: { select: { id: true, name: true, logoUrl: true } },",
    "awayTeam: { select: { id: true, name: true, logoUrl: true, earliestKickoffTime: true, latestKickoffTime: true } },",
    "batch publish away team rule selects",
    1,
  );
  source = replaceRequired(
    source,
    `        if (unpublishedFixtures.length === 0) return [];\n\n        const fixtureIds = unpublishedFixtures.map((fixture) => fixture.id);`,
    `        if (unpublishedFixtures.length === 0) return [];\n\n        for (const fixture of unpublishedFixtures) {\n          if (fixture.status === \"SCHEDULED\" || fixture.status === \"COMPLETED\") {\n            assertFixtureKickoffWindow(fixture.kickoffAt, [\n              fixture.homeTeam,\n              fixture.awayTeam,\n            ], {\n              overrideLabel:\n                \"Change the fixture time or update the team kick-off rules before publishing.\",\n            });\n          }\n        }\n\n        const fixtureIds = unpublishedFixtures.map((fixture) => fixture.id);`,
    "batch publish kickoff-window gate",
  );
  write(relative, source);
}

// Single-fixture publish endpoint: same safety gate, inside the serializable transaction.
{
  const relative = "src/app/api/admin/fixtures/publish-one/route.ts";
  let source = read(relative);
  if (!source.includes('from "@/lib/fixtures/kickoff-window"')) {
    source = replaceRequired(
      source,
      'import { formatDateTimeInLondon } from "@/lib/datetime/london";',
      'import { formatDateTimeInLondon } from "@/lib/datetime/london";\nimport { assertFixtureKickoffWindow, getFixtureKickoffWindowViolations } from "@/lib/fixtures/kickoff-window";',
      "single publish kickoff-window import",
    );
  }
  source = replaceAllRequired(
    source,
    "homeTeam: { select: { id: true, name: true, logoUrl: true } },",
    "homeTeam: { select: { id: true, name: true, logoUrl: true, earliestKickoffTime: true, latestKickoffTime: true } },",
    "single publish home team rule selects",
    2,
  );
  source = replaceAllRequired(
    source,
    "awayTeam: { select: { id: true, name: true, logoUrl: true } },",
    "awayTeam: { select: { id: true, name: true, logoUrl: true, earliestKickoffTime: true, latestKickoffTime: true } },",
    "single publish away team rule selects",
    2,
  );
  source = replaceRequired(
    source,
    `      if (!fixture || fixture.publishedAt) return null;\n\n      const update = await tx.fixture.updateMany({`,
    `      if (!fixture || fixture.publishedAt) return null;\n\n      assertFixtureKickoffWindow(fixture.kickoffAt, [\n        fixture.homeTeam,\n        fixture.awayTeam,\n      ], {\n        overrideLabel:\n          \"Change the fixture time or update the team kick-off rules before publishing.\",\n      });\n\n      const update = await tx.fixture.updateMany({`,
    "single publish transactional kickoff-window gate",
  );
  source = replaceRequired(
    source,
    `  if (fixtureInfo.publishedAt) {\n    return NextResponse.json({ ok: true, published: false, alreadyPublished: true });\n  }\n\n  const fixture = await publishFixtureOrNull(fixtureId);`,
    `  if (fixtureInfo.publishedAt) {\n    return NextResponse.json({ ok: true, published: false, alreadyPublished: true });\n  }\n\n  const kickoffViolations = getFixtureKickoffWindowViolations(\n    fixtureInfo.kickoffAt,\n    [fixtureInfo.homeTeam, fixtureInfo.awayTeam],\n  );\n  if (kickoffViolations.length > 0) {\n    return NextResponse.json(\n      {\n        ok: false,\n        error: \`${"${kickoffViolations.map((item) => item.message).join(\" \")}"} Change the fixture time or update the team kick-off rules before publishing.\`,\n      },\n      { status: 409 },\n    );\n  }\n\n  const fixture = await publishFixtureOrNull(fixtureId);`,
    "single publish friendly kickoff-window response",
  );
  write(relative, source);
}

// Night Board server read: include earliest limits so legacy/bad fixtures are visible immediately.
{
  const relative = "src/app/(admin)/admin/night-board/page.tsx";
  let source = read(relative);
  source = replaceAllRequired(
    source,
    "select: { id: true, name: true, latestKickoffTime: true },",
    "select: { id: true, name: true, earliestKickoffTime: true, latestKickoffTime: true },",
    "night board team rule selects",
    2,
  );
  source = replaceAllRequired(
    source,
    "        name: fixture.homeTeam.name,\n        latestKickoffTime: fixture.homeTeam.latestKickoffTime,",
    "        name: fixture.homeTeam.name,\n        earliestKickoffTime: fixture.homeTeam.earliestKickoffTime,\n        latestKickoffTime: fixture.homeTeam.latestKickoffTime,",
    "night board home operation earliest rule",
    1,
  );
  source = replaceAllRequired(
    source,
    "        name: fixture.awayTeam.name,\n        latestKickoffTime: fixture.awayTeam.latestKickoffTime,",
    "        name: fixture.awayTeam.name,\n        earliestKickoffTime: fixture.awayTeam.earliestKickoffTime,\n        latestKickoffTime: fixture.awayTeam.latestKickoffTime,",
    "night board away operation earliest rule",
    1,
  );
  write(relative, source);
}

// Night Board client warning: show either side of the allowed team window, not just late KOs.
{
  const relative = "src/components/admin/night-board/NightBoardOperations.tsx";
  let source = read(relative);
  source = replaceRequired(
    source,
    "  name: string;\n  latestKickoffTime: string | null;",
    "  name: string;\n  earliestKickoffTime: string | null;\n  latestKickoffTime: string | null;",
    "night board client earliest team rule",
  );
  source = replaceRequired(
    source,
    `  const breachedTeams = [fixture.homeTeam, fixture.awayTeam].filter((team) => {\n    const latestMinutes = timeToMinutes(team.latestKickoffTime);\n    return latestMinutes !== null && kickoffMinutes > latestMinutes;\n  });\n  if (breachedTeams.length === 0) return null;\n\n  const scheduledTime = displayTime(fixture.kickoffTime);\n  const limits = breachedTeams\n    .map((team) => \`${"${team.name}"} ${"${displayTime(team.latestKickoffTime ?? \"\")}"}\`)\n    .join(\" · \");\n  const statedLimitSentence =\n    breachedTeams.length === 1\n      ? \`${"${breachedTeams[0].name}"}’s stated latest kick-off is ${"${displayTime(\n          breachedTeams[0].latestKickoffTime ?? \"\",\n        )}"}.\`\n      : \`The stated latest kick-off times are ${"${breachedTeams\n          .map(\n            (team) =>\n              `${team.name} ${displayTime(team.latestKickoffTime ?? \"\")}`,\n          )\n          .join(\" and \")}"}.\`;\n\n  return {\n    fixtureId: fixture.id,\n    inlineMessage: \`Latest preferred kick-off exceeded: ${"${limits}"}. This fixture is scheduled for ${"${scheduledTime}"}.\`,\n    summaryMessage: \`Potential issue – late kick-off: ${"${fixture.homeTeam.name}"} v ${"${fixture.awayTeam.name}"} is scheduled for ${"${scheduledTime}"}. ${"${statedLimitSentence}"}\`,\n  };`,
    `  const breachedTeams = [fixture.homeTeam, fixture.awayTeam]\n    .map((team) => {\n      const earliestMinutes = timeToMinutes(team.earliestKickoffTime);\n      const latestMinutes = timeToMinutes(team.latestKickoffTime);\n      if (earliestMinutes !== null && kickoffMinutes < earliestMinutes) {\n        return {\n          team,\n          detail: \`${"${team.name}"} cannot play before ${"${displayTime(team.earliestKickoffTime ?? \"\")}"}\`,\n        };\n      }\n      if (latestMinutes !== null && kickoffMinutes > latestMinutes) {\n        return {\n          team,\n          detail: \`${"${team.name}"} cannot play later than ${"${displayTime(team.latestKickoffTime ?? \"\")}"}\`,\n        };\n      }\n      return null;\n    })\n    .filter((item): item is { team: NightBoardTeamRule; detail: string } => Boolean(item));\n  if (breachedTeams.length === 0) return null;\n\n  const scheduledTime = displayTime(fixture.kickoffTime);\n  const limits = breachedTeams.map((item) => item.detail).join(\" · \");\n\n  return {\n    fixtureId: fixture.id,\n    inlineMessage: \`Kick-off rule conflict: ${"${limits}"}. This fixture is scheduled for ${"${scheduledTime}"}.\`,\n    summaryMessage: \`Potential issue – team kick-off rule: ${"${fixture.homeTeam.name}"} v ${"${fixture.awayTeam.name}"} is scheduled for ${"${scheduledTime}"}. ${"${limits}"}.\`,\n  };`,
    "night board full kickoff-window warning",
  );
  write(relative, source);
}

// Night Board save endpoint: a time change may not create a new violation. Existing
// legacy violations remain editable for referee/venue/etc until their KO time is corrected.
{
  const relative = "src/app/api/admin/night-board/update-match/route.ts";
  let source = read(relative);
  if (!source.includes('from "@/lib/fixtures/kickoff-window"')) {
    source = replaceRequired(
      source,
      'import { parseLondonDateTime, toLondonDateInputValue } from "@/lib/datetime/london";',
      'import { parseLondonDateTime, toLondonDateInputValue } from "@/lib/datetime/london";\nimport { getFixtureKickoffWindowViolations } from "@/lib/fixtures/kickoff-window";',
      "night board save kickoff-window import",
    );
  }
  source = replaceRequired(
    source,
    "homeTeam: { select: { id: true, name: true, logoUrl: true } },",
    "homeTeam: { select: { id: true, name: true, logoUrl: true, earliestKickoffTime: true, latestKickoffTime: true } },",
    "night board save home team rules",
  );
  source = replaceRequired(
    source,
    "awayTeam: { select: { id: true, name: true, logoUrl: true } },",
    "awayTeam: { select: { id: true, name: true, logoUrl: true, earliestKickoffTime: true, latestKickoffTime: true } },",
    "night board save away team rules",
  );
  source = replaceRequired(
    source,
    `  const kickoffAt = parseOperationalKickoff({ currentKickoffAt: fixture.kickoffAt, timeInput: kickoffTime });\n\n  const referee = refereeId`,
    `  const kickoffAt = parseOperationalKickoff({ currentKickoffAt: fixture.kickoffAt, timeInput: kickoffTime });\n\n  if (\n    kickoffAt.getTime() !== fixture.kickoffAt.getTime() &&\n    (status === FixtureStatus.SCHEDULED || status === FixtureStatus.COMPLETED)\n  ) {\n    const kickoffViolations = getFixtureKickoffWindowViolations(kickoffAt, [\n      fixture.homeTeam,\n      fixture.awayTeam,\n    ]);\n    if (kickoffViolations.length > 0) {\n      return NextResponse.json(\n        {\n          ok: false,\n          error: \`${"${kickoffViolations.map((item) => item.message).join(\" \")}"} Choose a permitted kick-off time.\`,\n          returnTo,\n        },\n        { status: 409 },\n      );\n    }\n  }\n\n  const referee = refereeId`,
    "night board save kickoff-window gate",
  );
  write(relative, source);
}

// Make the existing override checkbox wording honest: it now covers earliest + latest.
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

console.log(
  "Team earliest/latest kick-off windows are enforced during fixture creation, generation and publishing, and conflicts are shown on the Night Board.",
);
