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
  if (!source.includes(before)) throw new Error(`Cup setup could not find ${label}.`);
  return source.replace(before, after);
}

// Keep Cups visible as a separate admin concept rather than mixing them into
// the normal Leagues list.
const sidebarPath = "src/components/admin/AdminSidebar.tsx";
let sidebar = read(sidebarPath);
if (!sidebar.includes('name: "Cups"')) {
  const leagueItem = `      {\n        name: "Leagues",\n        href: "/admin/leagues",\n        icon: TrophyIcon,\n        description: "Setup",\n      },`;
  if (!sidebar.includes(leagueItem)) throw new Error("Cup navigation could not find the Leagues item.");
  const cupItem = `${leagueItem}\n      {\n        name: "Cups",\n        href: "/admin/cups",\n        icon: TrophyIcon,\n        description: "Setup",\n      },`;
  sidebar = sidebar.replace(leagueItem, cupItem);
}
if (!sidebar.includes('href: "/admin/cups"')) throw new Error("Cups navigation link was not applied.");
write(sidebarPath, sidebar);

// Normal league selectors should never start treating a cup season as the
// current weekly league. Explicit includeLeagueId remains allowed for existing
// records, but ordinary current lists are LEAGUE competitions only.
const currentLeaguesPath = "src/lib/current-leagues.ts";
let currentLeagues = read(currentLeaguesPath);
const currentCompetitionCondition = `          OR c."currentLeagueId" = l."id"`;
const currentLeagueOnlyCondition = `          OR (\n            COALESCE(c."competitionType", 'LEAGUE') = 'LEAGUE'\n            AND c."currentLeagueId" = l."id"\n          )`;
if (currentLeagues.includes(currentCompetitionCondition)) {
  currentLeagues = currentLeagues.replaceAll(currentCompetitionCondition, currentLeagueOnlyCondition);
}
if (!currentLeagues.includes("COALESCE(c.\"competitionType\", 'LEAGUE') = 'LEAGUE'")) {
  throw new Error("Current league selectors were not isolated from cups.");
}
write(currentLeaguesPath, currentLeagues);

// The generic admin Leagues screen also remains weekly-league only. Cup setup
// and entrants live under /admin/cups.
const adminLeaguesPath = "src/app/(admin)/admin/leagues/page.tsx";
let adminLeagues = read(adminLeaguesPath);
adminLeagues = replaceRequired(
  adminLeagues,
  `      WHERE c."isActive" = true\n      GROUP BY c."id", c."name", c."slug", c."currentLeagueId", current_l."season"`,
  `      WHERE c."isActive" = true\n        AND COALESCE(c."competitionType", 'LEAGUE') = 'LEAGUE'\n      GROUP BY c."id", c."name", c."slug", c."currentLeagueId", current_l."season"`,
  "admin league competition filter",
);
adminLeagues = replaceRequired(
  adminLeagues,
  `      WHERE l."competitionId" IS NOT NULL\n      GROUP BY l."id", l."competitionId", l."name", l."slug", l."season", l."isActive", c."currentLeagueId"`,
  `      WHERE l."competitionId" IS NOT NULL\n        AND COALESCE(c."competitionType", 'LEAGUE') = 'LEAGUE'\n      GROUP BY l."id", l."competitionId", l."name", l."slug", l."season", l."isActive", c."currentLeagueId"`,
  "admin league season filter",
);
write(adminLeaguesPath, adminLeagues);

console.log("Cup admin navigation applied and cup seasons kept separate from normal league selectors.");
