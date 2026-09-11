const fs = require("node:fs");
const path = require("node:path");

const root = process.cwd();

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

function write(relativePath, source) {
  fs.writeFileSync(path.join(root, relativePath), source, "utf8");
}

function replaceRequired(source, before, after, label) {
  if (source.includes(after)) return source;
  if (!source.includes(before)) {
    throw new Error(`Venue-neutral fixtures could not find ${label}.`);
  }
  return source.replace(before, after);
}

function patchMatchupRoute() {
  const relativePath = "src/app/api/admin/fixtures/matchup-grid/route.ts";
  let source = read(relativePath);

  if (!source.includes("meetingCount: number;")) {
    source = replaceRequired(
      source,
      `  homeCount: number;\n  awayCount: number;\n  totalCount: number;`,
      `  meetingCount: number;`,
      "matchup cell counters",
    );
  }

  const oldLabel = `function getCellLabel(cell: MatchupCell) {\n  if (cell.totalCount === 0) return "—";\n\n  const parts: string[] = [];\n  if (cell.homeCount > 0) parts.push(\`H\${cell.homeCount}\`);\n  if (cell.awayCount > 0) parts.push(\`A\${cell.awayCount}\`);\n\n  return parts.join(" · ");\n}`;
  const newLabel = `function getCellLabel(cell: MatchupCell) {\n  if (cell.meetingCount === 0) return "—";\n  return \`\${cell.meetingCount} fixture\${cell.meetingCount === 1 ? "" : "s"}\`;\n}`;
  source = replaceRequired(source, oldLabel, newLabel, "venue-neutral matchup label");

  source = source.replaceAll("oneWayPairs", "singleMeetingPairs");
  source = source.replaceAll("completedPairs", "twoMeetingPairs");

  if (!source.includes("meetingCount: 0,")) {
    source = replaceRequired(
      source,
      `      homeCount: 0,\n      awayCount: 0,\n      totalCount: 0,`,
      `      meetingCount: 0,`,
      "matchup cell initialization",
    );
  }

  const oldFixtureCount = `    const homeCell = getCell(fixture.homeTeamId, fixture.awayTeamId);\n    homeCell.homeCount += 1;\n    homeCell.totalCount += 1;\n    homeCell.latestKickoffAt = fixture.kickoffAt.toISOString();\n\n    const awayCell = getCell(fixture.awayTeamId, fixture.homeTeamId);\n    awayCell.awayCount += 1;\n    awayCell.totalCount += 1;\n    awayCell.latestKickoffAt = fixture.kickoffAt.toISOString();`;
  const newFixtureCount = `    // homeTeamId/awayTeamId are legacy storage slots only. SIXFL fixtures are venue-neutral.\n    const firstCell = getCell(fixture.homeTeamId, fixture.awayTeamId);\n    firstCell.meetingCount += 1;\n    firstCell.latestKickoffAt = fixture.kickoffAt.toISOString();\n\n    const secondCell = getCell(fixture.awayTeamId, fixture.homeTeamId);\n    secondCell.meetingCount += 1;\n    secondCell.latestKickoffAt = fixture.kickoffAt.toISOString();`;
  source = replaceRequired(source, oldFixtureCount, newFixtureCount, "matchup fixture counting");

  source = source.replace(
    `          homeCount: 0,\n          awayCount: 0,\n          totalCount: 0,`,
    `          meetingCount: 0,`,
  );

  const oldSummaryLoop = `  let missingPairs = 0;\n  let singleMeetingPairs = 0;\n  let twoMeetingPairs = 0;\n  let scheduledPairs = 0;\n\n  for (let row = 0; row < teams.length; row += 1) {\n    for (let col = row + 1; col < teams.length; col += 1) {\n      const a = teams[row];\n      const b = teams[col];\n      const aCell = getCell(a.id, b.id);\n      const bCell = getCell(b.id, a.id);\n      const total = aCell.totalCount + bCell.totalCount;\n      const hasBothDirections =\n        aCell.homeCount > 0 && aCell.awayCount > 0 && bCell.homeCount > 0 && bCell.awayCount > 0;\n\n      if (total === 0) missingPairs += 1;\n      else if (hasBothDirections) twoMeetingPairs += 1;\n      else singleMeetingPairs += 1;\n      if (total > 0) scheduledPairs += 1;\n    }\n  }`;
  const newSummaryLoop = `  let missingPairs = 0;\n  let singleMeetingPairs = 0;\n  let twoMeetingPairs = 0;\n  let scheduledPairs = 0;\n\n  for (let row = 0; row < teams.length; row += 1) {\n    for (let col = row + 1; col < teams.length; col += 1) {\n      const a = teams[row];\n      const b = teams[col];\n      const meetingCount = getCell(a.id, b.id).meetingCount;\n\n      if (meetingCount === 0) missingPairs += 1;\n      else if (meetingCount === 1) singleMeetingPairs += 1;\n      else twoMeetingPairs += 1;\n      if (meetingCount > 0) scheduledPairs += 1;\n    }\n  }`;
  source = replaceRequired(source, oldSummaryLoop, newSummaryLoop, "matchup pair summary");

  source = source.replaceAll(
    `        AND t."leagueId" = \${input.leagueId}\n`,
    `        AND COALESCE(t."isFixturePlaceholder", false) = false\n`,
  );
  source = source.replaceAll(
    `      AND t."leagueId" = \${input.leagueId}\n`,
    `      AND COALESCE(t."isFixturePlaceholder", false) = false\n`,
  );

  if (/homeCount|awayCount|totalCount/.test(source)) {
    throw new Error("Matchup grid still contains directional coverage counters.");
  }

  write(relativePath, source);
}

function patchMatchupComponent() {
  const relativePath = "src/components/admin/fixtures/FixtureMatchupGrid.tsx";
  let source = read(relativePath);

  if (!source.includes("meetingCount: number;")) {
    source = replaceRequired(
      source,
      `  homeCount: number;\n  awayCount: number;\n  totalCount: number;`,
      `  meetingCount: number;`,
      "grid component cell type",
    );
  }

  source = source.replaceAll("oneWayPairs", "singleMeetingPairs");
  source = source.replaceAll("completedPairs", "twoMeetingPairs");

  const oldTone = `function getCellTone(cell: GridCell) {\n  if (cell.isSelf) return "border-white/5 bg-white/[0.02] text-white/15";\n  if (cell.totalCount === 0) return "border-red-400/15 bg-red-500/[0.06] text-red-100/70";\n  if (cell.homeCount > 0 && cell.awayCount > 0) return "border-emerald-400/20 bg-emerald-500/10 text-emerald-100";\n  return "border-amber-400/20 bg-amber-500/10 text-amber-100";\n}`;
  const newTone = `function getCellTone(cell: GridCell) {\n  if (cell.isSelf) return "border-white/5 bg-white/[0.02] text-white/15";\n  if (cell.meetingCount === 0) return "border-red-400/15 bg-red-500/[0.06] text-red-100/70";\n  if (cell.meetingCount >= 2) return "border-emerald-400/20 bg-emerald-500/10 text-emerald-100";\n  return "border-amber-400/20 bg-amber-500/10 text-amber-100";\n}`;
  source = replaceRequired(source, oldTone, newTone, "grid cell tone");

  const oldHelper = `function getCellHelper(cell: GridCell) {\n  if (cell.isSelf) return "";\n  if (cell.totalCount === 0) return "Not scheduled";\n  if (cell.homeCount > 0 && cell.awayCount > 0) return "Both ways";\n  if (cell.homeCount > 0) return "Only as team 1";\n  return "Only as team 2";\n}`;
  const newHelper = `function getCellHelper(cell: GridCell) {\n  if (cell.isSelf) return "";\n  if (cell.meetingCount === 0) return "Not scheduled";\n  if (cell.meetingCount === 1) return "1 of 2 meetings";\n  if (cell.meetingCount === 2) return "Pair has met twice";\n  return \`\${cell.meetingCount} meetings scheduled\`;\n}`;
  source = replaceRequired(source, oldHelper, newHelper, "grid cell helper");

  source = source
    .replace("Both ways</div><div className=\"mt-2 text-2xl font-semibold text-white\">{data?.summary.twoMeetingPairs ?? 0}", "Met twice or more</div><div className=\"mt-2 text-2xl font-semibold text-white\">{data?.summary.twoMeetingPairs ?? 0}")
    .replace("One way only</div><div className=\"mt-2 text-2xl font-semibold text-white\">{data?.summary.singleMeetingPairs ?? 0}", "Met once</div><div className=\"mt-2 text-2xl font-semibold text-white\">{data?.summary.singleMeetingPairs ?? 0}")
    .replace("Missing</div><div className=\"mt-2 text-2xl font-semibold text-white\">{data?.summary.missingPairs ?? 0}", "Not yet met</div><div className=\"mt-2 text-2xl font-semibold text-white\">{data?.summary.missingPairs ?? 0}")
    .replace("do not count as completed matchup coverage in the grid.", "do not count as matchup coverage in the grid.")
    .replace("H + A = both directions covered", "2+ fixtures = pair has met at least twice")
    .replace("Only H or only A = reverse fixture missing", "1 fixture = pair has met once")
    .replaceAll('label="Team 1 fee"', 'label="Team fee"')
    .replaceAll('label="Team 2 fee"', 'label="Team fee"');

  const compactDirectionalCells = `                            {!cell.isSelf ? (\n                              <>\n                                <div className="mt-1 line-clamp-2 text-[8px] leading-tight opacity-75 xl:text-[9px]">{getCellHelper(cell)}</div>\n                                {cell.totalCount > 1 ? <div className="mt-1 truncate text-[8px] leading-tight opacity-70 xl:text-[9px]">{cell.totalCount} fixtures</div> : null}\n                              </>\n                            ) : null}`;
  const compactNeutralCells = `                            {!cell.isSelf ? (\n                              <div className="mt-1 line-clamp-2 text-[8px] leading-tight opacity-75 xl:text-[9px]">{getCellHelper(cell)}</div>\n                            ) : null}`;
  if (source.includes(compactDirectionalCells)) {
    source = source.replace(compactDirectionalCells, compactNeutralCells);
  }

  const largeDirectionalCells = `                            {!cell.isSelf ? <><div className="mt-1 text-[11px] opacity-75">{getCellHelper(cell)}</div>{cell.totalCount > 1 ? <div className="mt-1 text-[11px] opacity-70">{cell.totalCount} fixtures</div> : null}</> : null}`;
  const largeNeutralCells = `                            {!cell.isSelf ? <div className="mt-1 text-[11px] opacity-75">{getCellHelper(cell)}</div> : null}`;
  if (source.includes(largeDirectionalCells)) {
    source = source.replace(largeDirectionalCells, largeNeutralCells);
  }

  if (/homeCount|awayCount|totalCount|Both ways|One way only|reverse fixture/.test(source)) {
    throw new Error("Fixture matchup component still contains home/away coverage wording.");
  }

  write(relativePath, source);
}

function patchGeneratorPage() {
  const relativePath = "src/app/(admin)/admin/fixtures/generate/page.tsx";
  let source = read(relativePath);
  source = replaceRequired(
    source,
    "Creates a second set of rounds with the home/away order reversed. Leave unticked if each pairing should happen once.",
    "Creates a second set of meetings so every pairing happens twice. SIXFL has no home/away significance. Leave unticked if each pairing should happen once.",
    "fixture generator repeat wording",
  );
  write(relativePath, source);
}

function patchDivisionGenerator() {
  const relativePath = "src/app/(admin)/admin/fixtures/generate/division-actions.ts";
  let source = read(relativePath);

  const alternating = `      const isEvenRound = round % 2 === 0;\n      pairs.push({ homeId: isEvenRound ? a : b, awayId: isEvenRound ? b : a });`;
  source = replaceRequired(
    source,
    alternating,
    `      // Legacy column names are storage slots only; pairing has no home/away meaning.\n      pairs.push({ homeId: a, awayId: b });`,
    "round-robin direction balancing",
  );

  const mirror = `function mirrorRounds(rounds: Pair[][]): Pair[][] {\n  return rounds.map((pairs) => pairs.map((pair) => ({ homeId: pair.awayId, awayId: pair.homeId })));\n}`;
  const repeat = `function repeatRounds(rounds: Pair[][]): Pair[][] {\n  return rounds.map((pairs) => pairs.map((pair) => ({ homeId: pair.homeId, awayId: pair.awayId })));\n}`;
  source = replaceRequired(source, mirror, repeat, "double round-robin mirroring");
  source = source.replace(
    "if (doubleRoundRobin) rounds = [...rounds, ...mirrorRounds(rounds)];",
    "if (doubleRoundRobin) rounds = [...rounds, ...repeatRounds(rounds)];",
  );

  source = source.replaceAll(
    `        AND t."leagueId" = \${input.leagueId}\n`,
    `        AND COALESCE(t."isFixturePlaceholder", false) = false\n`,
  );
  source = source.replaceAll(
    `      AND t."leagueId" = \${input.leagueId}\n`,
    `      AND COALESCE(t."isFixturePlaceholder", false) = false\n`,
  );

  if (source.includes("mirrorRounds(") || source.includes("isEvenRound")) {
    throw new Error("Division fixture generator still reverses pair direction.");
  }
  if (!source.includes('COALESCE(t."isFixturePlaceholder", false) = false')) {
    throw new Error("Division fixture generator does not exclude fixture placeholders.");
  }

  write(relativePath, source);
}

function patchNextWeekGenerator() {
  const relativePath = "src/app/api/admin/fixtures/generate-next-week/route.ts";
  let source = read(relativePath);

  source = replaceRequired(
    source,
    `type Pair = {\n  homeTeamId: string;\n  awayTeamId: string;\n};`,
    `type Pair = {\n  team1Id: string;\n  team2Id: string;\n};`,
    "next-week pair type",
  );

  if (!source.includes("type CountRow = { count: number | bigint };")) {
    source = source.replace(
      `type FixtureSeed = {\n  homeTeamId: string;\n  awayTeamId: string;\n  kickoffAt: Date;\n  round: number | null;\n};`,
      `type FixtureSeed = {\n  homeTeamId: string;\n  awayTeamId: string;\n  kickoffAt: Date;\n  round: number | null;\n};\n\ntype CountRow = { count: number | bigint };`,
    );
  }

  source = source
    .replace("  const homeCounts = new Map<string, number>();\n", "")
    .replace("  const awayCounts = new Map<string, number>();\n", "")
    .replace(
      `    homeCounts.set(\n      fixture.homeTeamId,\n      (homeCounts.get(fixture.homeTeamId) ?? 0) + 1,\n    );\n    awayCounts.set(\n      fixture.awayTeamId,\n      (awayCounts.get(fixture.awayTeamId) ?? 0) + 1,\n    );\n`,
      "",
    );

  const directionalChoice = `    const firstBalance =\n      (homeCounts.get(first.id) ?? 0) - (awayCounts.get(first.id) ?? 0);\n    const opponentBalance =\n      (homeCounts.get(opponent.id) ?? 0) -\n      (awayCounts.get(opponent.id) ?? 0);\n\n    if (firstBalance <= opponentBalance) {\n      pairs.push({ homeTeamId: first.id, awayTeamId: opponent.id });\n    } else {\n      pairs.push({ homeTeamId: opponent.id, awayTeamId: first.id });\n    }`;
  source = replaceRequired(
    source,
    directionalChoice,
    `    // SIXFL is venue-neutral; these are only technical storage slots.\n    pairs.push({ team1Id: first.id, team2Id: opponent.id });`,
    "next-week home/away balancing",
  );

  source = replaceRequired(
    source,
    "    const [league, teams, existingFixtures] = await Promise.all([",
    "    const [league, teams, existingFixtures, activeDivisionRows] = await Promise.all([",
    "next-week query tuple",
  );

  const oldTeamQuery = `      prisma.team.findMany({\n        where: { leagueId },\n        orderBy: { name: "asc" },\n        select: { id: true, name: true, standardMatchFeePence: true },\n      }),`;
  const newTeamQuery = `      prisma.$queryRaw<TeamSeed[]>(Prisma.sql\`\n        SELECT t."id", t."name", t."standardMatchFeePence"\n        FROM "LeagueSeasonTeam" lst\n        JOIN "Team" t ON t."id" = lst."teamId"\n        WHERE lst."leagueId" = \${leagueId}\n          AND lst."isActive" = true\n          AND COALESCE(t."isFixturePlaceholder", false) = false\n        ORDER BY t."name" ASC\n      \`),`;
  source = replaceRequired(source, oldTeamQuery, newTeamQuery, "next-week active season team query");

  if (!source.includes("activeDivisionRows")) {
    throw new Error("Next-week active-division query tuple was not created.");
  }

  const promiseEnd = `      prisma.fixture.findMany({\n        where: { leagueId },\n        orderBy: [{ kickoffAt: "asc" }, { position: "asc" }],\n        select: {\n          homeTeamId: true,\n          awayTeamId: true,\n          kickoffAt: true,\n          round: true,\n          venueId: true,\n          pitch: true,\n        },\n      }),\n    ]);`;
  const promiseWithDivisions = `      prisma.fixture.findMany({\n        where: { leagueId },\n        orderBy: [{ kickoffAt: "asc" }, { position: "asc" }],\n        select: {\n          homeTeamId: true,\n          awayTeamId: true,\n          kickoffAt: true,\n          round: true,\n          venueId: true,\n          pitch: true,\n        },\n      }),\n      prisma.$queryRaw<CountRow[]>(Prisma.sql\`\n        SELECT COUNT(*)::int AS "count"\n        FROM "LeagueDivision"\n        WHERE "leagueId" = \${leagueId}\n          AND "isActive" = true\n      \`),\n    ]);`;
  source = replaceRequired(source, promiseEnd, promiseWithDivisions, "next-week active division query");

  const teamsCheck = `    if (teams.length < 2) {`;
  const divisionGuard = `    if (Number(activeDivisionRows[0]?.count ?? 0) > 0) {\n      return NextResponse.json(\n        {\n          error:\n            "This league currently has active divisions. The one-week generator is blocked here so it cannot mix divisions; use the division schedule tool.",\n          requestId,\n        },\n        { status: 409 },\n      );\n    }\n\n    if (teams.length < 2) {`;
  if (!source.includes("This league currently has active divisions.")) {
    source = replaceRequired(source, teamsCheck, divisionGuard, "next-week division guard");
  }
  source = source.replace(
    "This league needs at least two linked teams before fixtures can be generated.",
    "This league needs at least two active season teams before fixtures can be generated.",
  );

  source = source
    .replaceAll("pair.homeTeamId", "pair.team1Id")
    .replaceAll("pair.awayTeamId", "pair.team2Id");

  if (/homeCounts|awayCounts|firstBalance|opponentBalance/.test(source)) {
    throw new Error("Next-week generator still balances home/away direction.");
  }
  if (!source.includes("LeagueSeasonTeam") || !source.includes("activeDivisionRows")) {
    throw new Error("Next-week generator is not using active season membership/division safety.");
  }

  write(relativePath, source);
}

patchMatchupRoute();
patchMatchupComponent();
patchGeneratorPage();
patchDivisionGenerator();
patchNextWeekGenerator();

console.log("Venue-neutral fixture scheduling and matchup coverage applied to final prepared source.");
