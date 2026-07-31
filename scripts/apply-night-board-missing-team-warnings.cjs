const fs = require("node:fs");
const path = require("node:path");

const filePath = path.join(
  process.cwd(),
  "src/app/(admin)/admin/night-board/page.tsx",
);

let source = fs.readFileSync(filePath, "utf8");

function replaceOnce(before, after, label) {
  if (source.includes(after)) return;
  if (!source.includes(before)) {
    throw new Error(`Could not apply ${label}: expected source was not found.`);
  }
  source = source.replace(before, after);
}

replaceOnce(
  'import { requireAdmin } from "@/lib/requireAdmin";\n',
  'import { requireAdmin } from "@/lib/requireAdmin";\nimport { getLeagueStandings } from "@/lib/standings";\n',
  "central standings import",
);

replaceOnce(
  'function buildWarnings(fixtures: FixtureForBoard[]) {',
  `async function getMissingActiveTeamWarnings(\n  fixtures: FixtureForBoard[],\n  selectedLeagueId: string,\n): Promise<BoardWarning[]> {\n  const fixtureLeagueIds = Array.from(\n    new Set(fixtures.map((fixture) => fixture.leagueId)),\n  );\n  const leagueIds = selectedLeagueId ? [selectedLeagueId] : fixtureLeagueIds;\n  if (leagueIds.length === 0) return [];\n\n  const scheduledTeamIdsByLeague = new Map<string, Set<string>>();\n  for (const fixture of fixtures) {\n    const ids = scheduledTeamIdsByLeague.get(fixture.leagueId) ?? new Set<string>();\n    ids.add(fixture.homeTeam.id);\n    ids.add(fixture.awayTeam.id);\n    scheduledTeamIdsByLeague.set(fixture.leagueId, ids);\n  }\n\n  const warnings: BoardWarning[] = [];\n  const standingsByLeague = await Promise.all(\n    leagueIds.map(async (leagueId) => ({\n      leagueId,\n      standings: await getLeagueStandings(leagueId),\n    })),\n  );\n\n  for (const { leagueId, standings } of standingsByLeague) {\n    const scheduledTeamIds = scheduledTeamIdsByLeague.get(leagueId) ?? new Set<string>();\n    const tableGroups = standings.hasDivisions\n      ? standings.divisions.map((division) => ({\n          divisionName: division.name,\n          rows: division.rows,\n        }))\n      : [{ divisionName: null, rows: standings.rows }];\n\n    for (const group of tableGroups) {\n      for (const team of group.rows) {\n        if (scheduledTeamIds.has(team.teamId)) continue;\n        warnings.push({\n          level: "amber",\n          message: group.divisionName\n            ? \`\${team.teamName} is active in \${group.divisionName} but has no fixture on this night.\`\n            : \`\${team.teamName} is active in \${standings.league.name} but has no fixture on this night.\`,\n        });\n      }\n    }\n  }\n\n  return warnings.sort((left, right) => left.message.localeCompare(right.message));\n}\n\nfunction buildWarnings(fixtures: FixtureForBoard[]) {`,
  "missing active team warning helper",
);

replaceOnce(
  '  const warnings = buildWarnings(fixtures);',
  '  const warnings = [\n    ...buildWarnings(fixtures),\n    ...(await getMissingActiveTeamWarnings(fixtures, activeLeagueId)),\n  ];',
  "night board warning assembly",
);

fs.writeFileSync(filePath, source, "utf8");
console.log("Applied Night Board missing active team warnings.");
