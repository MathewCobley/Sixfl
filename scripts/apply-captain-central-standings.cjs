const fs = require("node:fs");
const path = require("node:path");

const filePath = path.join(
  process.cwd(),
  "src",
  "app",
  "captain",
  "team",
  "[teamid]",
  "page.tsx",
);

if (!fs.existsSync(filePath)) {
  console.warn("Captain central standings patch skipped: page not found.");
  process.exit(0);
}

let source = fs.readFileSync(filePath, "utf8");
let changed = false;

if (source.includes('import { getLeagueTable } from "@/lib/leagueTable";')) {
  source = source.replace(
    'import { getLeagueTable } from "@/lib/leagueTable";',
    'import { getLeagueStandings } from "@/lib/standings";',
  );
  changed = true;
}

const before = `  const leagueTable = currentLeagueId ? await getLeagueTable(currentLeagueId) : [];
  const currentTeamPosition = leagueTable.findIndex((row) => relatedTeamIds.includes(row.teamId));`;

const after = `  const centralStandings = currentLeagueId
    ? await getLeagueStandings(currentLeagueId)
    : null;
  const leagueTable = centralStandings
    ? centralStandings.hasDivisions
      ? centralStandings.divisions.find((division) =>
          division.rows.some((row) => relatedTeamIds.includes(row.teamId)),
        )?.rows ?? []
      : centralStandings.rows
    : [];
  const currentTeamPosition = leagueTable.findIndex((row) => relatedTeamIds.includes(row.teamId));`;

if (source.includes(before)) {
  source = source.replace(before, after);
  changed = true;
}

if (changed) {
  fs.writeFileSync(filePath, source);
  console.log("Applied captain central standings patch.");
} else {
  console.log("Captain central standings patch already applied or source changed.");
}
