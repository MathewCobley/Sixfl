const fs = require("node:fs");
const path = require("node:path");

const root = process.cwd();

function read(file) {
  return fs.readFileSync(path.join(root, ...file.split("/")), "utf8");
}

function write(file, source) {
  fs.writeFileSync(path.join(root, ...file.split("/")), source, "utf8");
}

// Hidden TBC records are fixture infrastructure, not real team identities.
{
  const file = "src/app/(admin)/admin/teams/page.tsx";
  let source = read(file);

  if (!source.includes('getFixturePlaceholderTeamIds')) {
    source = source.replace(
      'import { requireAdmin } from "@/lib/requireAdmin";',
      'import { requireAdmin } from "@/lib/requireAdmin";\nimport { getFixturePlaceholderTeamIds } from "@/lib/teams/fixture-placeholders";',
    );
  }

  const before = `  const allTeams = await getAdminTeams();\n  const displayTeams = dedupeTeamsForDisplay(allTeams);\n  const groups = groupTeams(allTeams);`;
  const after = `  const allTeams = await getAdminTeams();\n  const placeholderTeamIds = await getFixturePlaceholderTeamIds(\n    allTeams.map((team) => team.id),\n  );\n  const visibleTeams = allTeams.filter((team) => !placeholderTeamIds.has(team.id));\n  const displayTeams = dedupeTeamsForDisplay(visibleTeams);\n  const groups = groupTeams(visibleTeams);`;

  if (!source.includes(after) && source.includes(before)) {
    source = source.replace(before, after);
  }

  if (source.includes("const visibleTeams =")) {
    source = source.replace(
      `{Math.max(allTeams.length - displayTeams.length, 0)}`,
      `{Math.max(visibleTeams.length - displayTeams.length, 0)}`,
    );
  }

  write(file, source);
}

// Old bookmarked placeholder team pages should open the fixture screen instead
// of showing captain/payment/kit settings that do not apply to TBC.
{
  const file = "src/app/(admin)/admin/teams/[id]/layout.tsx";
  let source = read(file);
  const before = `  if (!team) {\n    notFound();\n  }\n\n  const occupiedLeagueIds = new Set(`;
  const after = `  if (!team) {\n    notFound();\n  }\n\n  if (team.isFixturePlaceholder) {\n    const query = team.placeholderLeagueId\n      ? \`?leagueId=\${encodeURIComponent(team.placeholderLeagueId)}\`\n      : \"\";\n    redirect(\`/admin/fixtures\${query}\`);\n  }\n\n  const occupiedLeagueIds = new Set(`;

  if (!source.includes(after) && source.includes(before)) {
    source = source.replace(before, after);
  }
  write(file, source);
}

// Also block stale/open team-settings forms from writing Team.leagueId on a TBC.
{
  const file = "src/app/(admin)/admin/teams/[id]/actions.ts";
  let source = read(file);

  if (!source.includes('isFixturePlaceholderTeam')) {
    source = source.replace(
      'import { requireAdmin } from "@/lib/requireAdmin";',
      'import { requireAdmin } from "@/lib/requireAdmin";\nimport { isFixturePlaceholderTeam } from "@/lib/teams/fixture-placeholders";',
    );
  }

  const before = `  if (!existingTeam) {\n    redirect("/admin/teams");\n  }\n\n  const isManagedToStandardConversion =`;
  const after = `  if (!existingTeam) {\n    redirect("/admin/teams");\n  }\n\n  if (await isFixturePlaceholderTeam(id)) {\n    const query = leagueId ? \`?leagueId=\${encodeURIComponent(leagueId)}\` : \"\";\n    redirect(\`/admin/fixtures\${query}\`);\n  }\n\n  const isManagedToStandardConversion =`;

  if (!source.includes(after) && source.includes(before)) {
    source = source.replace(before, after);
  }
  write(file, source);
}

console.log("Automatic TBC records are hidden from normal team administration.");