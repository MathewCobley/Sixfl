const fs = require("node:fs");
const path = require("node:path");

const root = process.cwd();

function read(relativePath) {
  return fs.readFileSync(path.join(root, ...relativePath.split("/")), "utf8");
}

function write(relativePath, source) {
  fs.writeFileSync(path.join(root, ...relativePath.split("/")), source, "utf8");
}

function replaceRequired(source, before, after, label) {
  if (source.includes(after)) return source;
  if (!source.includes(before)) {
    throw new Error(`Expected ${label} source was not found.`);
  }
  return source.replace(before, after);
}

// ---------------------------------------------------------------------------
// System-managed TBC slots: one hidden placeholder per league season.
// ---------------------------------------------------------------------------
{
  const file = "src/lib/teams/fixture-placeholders.ts";
  let source = read(file);

  source = replaceRequired(
    source,
    'import { randomUUID } from "node:crypto";',
    'import { createHash, randomUUID } from "node:crypto";',
    "fixture placeholder crypto import",
  );

  if (!source.includes("export async function ensureLeagueFixturePlaceholderTeam")) {
    const anchor = `async function suppressFixturePlaceholderNotifications(\n  teamId: string,\n  client: RawDbClient,\n) {`;
    if (!source.includes(anchor)) {
      throw new Error("Fixture placeholder suppression anchor was not found.");
    }

    const addition = `function getAutomaticPlaceholderKey(leagueId: string) {\n  return createHash("sha256").update(leagueId).digest("hex");\n}\n\n/**\n * Ensure a league season always has one system-managed TBC slot for fixture\n * creation/editing. The underlying Team row deliberately has no direct league\n * assignment: LeagueSeasonTeam is the fixture-only membership. This keeps TBC\n * out of normal team administration, tables, payments and communications.\n */\nexport async function ensureLeagueFixturePlaceholderTeam(\n  leagueId: string,\n  client: RawDbClient = prisma,\n) {\n  const existing = await getLeagueFixturePlaceholderTeam(leagueId, client);\n  if (existing) return existing;\n\n  const key = getAutomaticPlaceholderKey(leagueId);\n  const teamId = \`tbc_\${key.slice(0, 24)}\`;\n  const membershipId = \`lst_tbc_\${key.slice(0, 20)}\`;\n  const claimCode = \`TBC-\${key.slice(0, 12).toUpperCase()}\`;\n\n  await client.$executeRaw(Prisma.sql\`\n    INSERT INTO "Team" (\n      "id",\n      "name",\n      "claimCode",\n      "teamMode",\n      "isRecruiting",\n      "isFixturePlaceholder",\n      "leagueId",\n      "divisionId",\n      "competitionId",\n      "createdAt",\n      "updatedAt"\n    )\n    VALUES (\n      \${teamId},\n      'TBC',\n      \${claimCode},\n      'STANDARD'::"TeamMode",\n      false,\n      true,\n      NULL,\n      NULL,\n      NULL,\n      NOW(),\n      NOW()\n    )\n    ON CONFLICT ("id") DO UPDATE\n    SET\n      "name" = 'TBC',\n      "isFixturePlaceholder" = true,\n      "leagueId" = NULL,\n      "divisionId" = NULL,\n      "competitionId" = NULL,\n      "teamMode" = 'STANDARD'::"TeamMode",\n      "isRecruiting" = false,\n      "updatedAt" = NOW()\n  \`);\n\n  await client.$executeRaw(Prisma.sql\`\n    INSERT INTO "LeagueSeasonTeam" (\n      "id",\n      "leagueId",\n      "teamId",\n      "divisionId",\n      "isActive",\n      "createdAt",\n      "updatedAt"\n    )\n    VALUES (\n      \${membershipId},\n      \${leagueId},\n      \${teamId},\n      NULL,\n      true,\n      NOW(),\n      NOW()\n    )\n    ON CONFLICT ("leagueId", "teamId") DO UPDATE\n    SET\n      "divisionId" = NULL,\n      "isActive" = true,\n      "updatedAt" = NOW()\n  \`);\n\n  return getLeagueFixturePlaceholderTeam(leagueId, client);\n}\n\n`;

    source = source.replace(anchor, addition + anchor);
  }

  write(file, source);
}

// ---------------------------------------------------------------------------
// Fixture dashboard: materialise TBC slots before building fixture selectors.
// ---------------------------------------------------------------------------
{
  const file = "src/app/(admin)/admin/fixtures/page.tsx";
  let source = read(file);

  source = replaceRequired(
    source,
    'import { getFixturePlaceholderTeamIds } from "@/lib/teams/fixture-placeholders";',
    'import {\n  ensureLeagueFixturePlaceholderTeam,\n  getFixturePlaceholderTeamIds,\n} from "@/lib/teams/fixture-placeholders";',
    "fixtures placeholder import",
  );

  source = replaceRequired(
    source,
    `  const currentLeagueIds = await getCurrentLeagueIds(activeLeagueParam);\n  const currentLeagueWhere = { id: { in: currentLeagueIds } };`,
    `  const currentLeagueIds = await getCurrentLeagueIds(activeLeagueParam);\n\n  // Every current league gets a hidden fixture-only TBC automatically.\n  // It is created on demand here before the team/season selectors are loaded.\n  await Promise.all(\n    currentLeagueIds.map((leagueId) => ensureLeagueFixturePlaceholderTeam(leagueId)),\n  );\n\n  const currentLeagueWhere = { id: { in: currentLeagueIds } };`,
    "fixture dashboard automatic TBC creation",
  );

  write(file, source);
}

// ---------------------------------------------------------------------------
// Fixture edit page: TBC is also available when editing an existing fixture.
// ---------------------------------------------------------------------------
{
  const file = "src/app/(admin)/admin/fixtures/[id]/edit/page.tsx";
  let source = read(file);

  if (!source.includes('ensureLeagueFixturePlaceholderTeam')) {
    source = source.replace(
      'import { requireAdmin } from "@/lib/requireAdmin";',
      'import { requireAdmin } from "@/lib/requireAdmin";\nimport { ensureLeagueFixturePlaceholderTeam } from "@/lib/teams/fixture-placeholders";',
    );
  }

  source = replaceRequired(
    source,
    `  if (!fixture) notFound();\n\n  const leagues = await prisma.league.findMany({`,
    `  if (!fixture) notFound();\n\n  await ensureLeagueFixturePlaceholderTeam(fixture.leagueId);\n\n  const leagues = await prisma.league.findMany({`,
    "fixture edit automatic TBC creation",
  );

  write(file, source);
}

// ---------------------------------------------------------------------------
// Admin Teams: system TBC rows are implementation details, not teams to manage.
// ---------------------------------------------------------------------------
{
  const file = "src/app/(admin)/admin/teams/page.tsx";
  let source = read(file);

  if (!source.includes('getFixturePlaceholderTeamIds')) {
    source = source.replace(
      'import { requireAdmin } from "@/lib/requireAdmin";',
      'import { requireAdmin } from "@/lib/requireAdmin";\nimport { getFixturePlaceholderTeamIds } from "@/lib/teams/fixture-placeholders";',
    );
  }

  source = replaceRequired(
    source,
    `  const allTeams = await getAdminTeams();\n  const displayTeams = dedupeTeamsForDisplay(allTeams);\n  const groups = groupTeams(allTeams);`,
    `  const allTeams = await getAdminTeams();\n  const placeholderTeamIds = await getFixturePlaceholderTeamIds(\n    allTeams.map((team) => team.id),\n  );\n  const visibleTeams = allTeams.filter((team) => !placeholderTeamIds.has(team.id));\n  const displayTeams = dedupeTeamsForDisplay(visibleTeams);\n  const groups = groupTeams(visibleTeams);`,
    "hide automatic placeholders from admin teams",
  );

  source = source.replace(
    `{Math.max(allTeams.length - displayTeams.length, 0)}`,
    `{Math.max(visibleTeams.length - displayTeams.length, 0)}`,
  );

  write(file, source);
}

// ---------------------------------------------------------------------------
// Direct old TBC team links no longer expose normal team settings. Send admins
// to the fixture screen for the league that owns the placeholder instead.
// ---------------------------------------------------------------------------
{
  const file = "src/app/(admin)/admin/teams/[id]/layout.tsx";
  let source = read(file);

  source = replaceRequired(
    source,
    `  if (!team) {\n    notFound();\n  }\n\n  const occupiedLeagueIds = new Set(`,
    `  if (!team) {\n    notFound();\n  }\n\n  if (team.isFixturePlaceholder) {\n    const query = team.placeholderLeagueId\n      ? \`?leagueId=\${encodeURIComponent(team.placeholderLeagueId)}\`\n      : \"\";\n    redirect(\`/admin/fixtures\${query}\`);\n  }\n\n  const occupiedLeagueIds = new Set(`,
    "placeholder team detail redirect",
  );

  write(file, source);
}

// ---------------------------------------------------------------------------
// Old/open team-settings forms must never try to assign leagueId directly to a
// placeholder, which is intentionally forbidden by the DB guard rail.
// ---------------------------------------------------------------------------
{
  const file = "src/app/(admin)/admin/teams/[id]/actions.ts";
  let source = read(file);

  if (!source.includes('isFixturePlaceholderTeam')) {
    source = source.replace(
      'import { requireAdmin } from "@/lib/requireAdmin";',
      'import { requireAdmin } from "@/lib/requireAdmin";\nimport { isFixturePlaceholderTeam } from "@/lib/teams/fixture-placeholders";',
    );
  }

  source = replaceRequired(
    source,
    `  if (!existingTeam) {\n    redirect("/admin/teams");\n  }\n\n  const isManagedToStandardConversion =`,
    `  if (!existingTeam) {\n    redirect("/admin/teams");\n  }\n\n  if (await isFixturePlaceholderTeam(id)) {\n    const query = leagueId ? \`?leagueId=\${encodeURIComponent(leagueId)}\` : \"\";\n    redirect(\`/admin/fixtures\${query}\`);\n  }\n\n  const isManagedToStandardConversion =`,
    "placeholder team settings guard",
  );

  write(file, source);
}

console.log("Automatic hidden TBC slots are enabled for league fixture workflows.");