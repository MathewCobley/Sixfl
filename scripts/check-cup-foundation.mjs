import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const failures = [];

function read(relativePath) {
  const absolutePath = path.join(root, relativePath);
  if (!fs.existsSync(absolutePath)) {
    failures.push(`Missing required file: ${relativePath}`);
    return "";
  }
  return fs.readFileSync(absolutePath, "utf8");
}

function expect(condition, message) {
  if (!condition) failures.push(message);
}

const migrationPath = "prisma/migrations/20260911233000_inter_league_cup_foundation/migration.sql";
const migration = read(migrationPath);
const schema = read("prisma/schema.prisma");
const createActions = read("src/app/(admin)/admin/cups/actions.ts");
const entrantActions = read("src/app/(admin)/admin/cups/[id]/actions.ts");
const cupsPage = read("src/app/(admin)/admin/cups/page.tsx");
const cupPage = read("src/app/(admin)/admin/cups/[id]/page.tsx");
const sidebar = read("src/components/admin/AdminSidebar.tsx");
const currentLeagues = read("src/lib/current-leagues.ts");
const adminLeagues = read("src/app/(admin)/admin/leagues/page.tsx");

expect(
  migration.includes('ADD COLUMN IF NOT EXISTS "competitionType"') &&
    migration.includes('ADD COLUMN IF NOT EXISTS "cupFormat"') &&
    migration.includes('ADD COLUMN IF NOT EXISTS "isInterLeague"') &&
    migration.includes("'LEAGUE', 'CUP'") &&
    migration.includes("'KNOCKOUT', 'GROUPS_THEN_KNOCKOUT'") &&
    !migration.includes('UPDATE "Team"'),
  "cup migration must add isolated competition metadata without moving teams",
);

expect(
  schema.includes('competitionType String  @default("LEAGUE")') &&
    schema.includes("cupFormat       String?") &&
    schema.includes("isInterLeague   Boolean @default(false)") &&
    schema.includes("@@index([competitionType])") &&
    schema.includes("@@index([competitionType, isActive])"),
  "prepared Prisma schema must model the cup metadata and indexes created by the migration",
);

expect(
  createActions.includes("await requireAdmin()") &&
    createActions.includes('INSERT INTO "LeagueCompetition"') &&
    createActions.includes("'CUP'") &&
    createActions.includes('INSERT INTO "League"') &&
    createActions.includes('UPDATE "LeagueCompetition"') &&
    !createActions.includes("team.update"),
  "cup creation must be admin-only and create a separate competition/season without changing team league membership",
);

expect(
  entrantActions.includes("await requireAdmin()") &&
    entrantActions.includes('INSERT INTO "LeagueSeasonTeam"') &&
    entrantActions.includes('ON CONFLICT ("leagueId", "teamId") DO UPDATE') &&
    entrantActions.includes('FROM "Fixture"') &&
    entrantActions.includes('SET "isActive" = false') &&
    !entrantActions.includes("prisma.team.update"),
  "cup entrants must use separate season membership and cannot be withdrawn after cup fixtures exist",
);

expect(
  cupsPage.includes("await requireAdmin()") &&
    cupsPage.includes('WHERE c."competitionType" = \'CUP\'') &&
    cupPage.includes("await requireAdmin()") &&
    cupPage.includes('AND c."competitionType" = \'CUP\'') &&
    cupPage.includes("Next: draw and bracket"),
  "cup admin pages must be admin-only, scoped to CUP competitions and explicit that draw/bracket is a later stage",
);

expect(
  cupsPage.includes('import AdminSelect from "@/components/admin/AdminSelect"') &&
    cupPage.includes('import AdminSelect from "@/components/admin/AdminSelect"') &&
    !cupsPage.includes("<select") &&
    !cupPage.includes("<select"),
  "cup forms must use the SIXFL AdminSelect combobox instead of native selects",
);

expect(
  sidebar.includes('name: "Cups"') && sidebar.includes('href: "/admin/cups"'),
  "admin League setup navigation must expose the separate Cups area",
);

expect(
  currentLeagues.includes("COALESCE(c.\"competitionType\", 'LEAGUE') = 'LEAGUE'") &&
    adminLeagues.includes("COALESCE(c.\"competitionType\", 'LEAGUE') = 'LEAGUE'"),
  "ordinary current-league selectors and Admin Leagues must exclude CUP competitions",
);

if (failures.length) {
  console.error("\nCUP FOUNDATION CONTRACT FAILED\n");
  for (const failure of failures) console.error(` - ${failure}`);
  console.error("\nDo not merge until cups remain isolated from weekly league membership and selectors.\n");
  process.exit(1);
}

console.log("Inter-league cup foundation contract passed.");
