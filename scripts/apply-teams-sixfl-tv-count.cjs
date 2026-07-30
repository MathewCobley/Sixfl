const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");

function replaceOnce(filePath, before, after) {
  const absolutePath = path.join(root, filePath);
  const source = fs.readFileSync(absolutePath, "utf8");

  if (source.includes(after)) return;
  if (!source.includes(before)) {
    throw new Error(`Expected SIXFL TV team-count source was not found in ${filePath}`);
  }

  fs.writeFileSync(absolutePath, source.replace(before, after), "utf8");
}

const pagePath = "src/app/(admin)/admin/teams/page.tsx";

replaceOnce(
  pagePath,
  'import { UserRole } from "@prisma/client";',
  'import { Prisma, UserRole } from "@prisma/client";',
);

const tvCountBlock = [
  'type SixflTvLinkCountRow = {',
  '  leagueId: string;',
  '  teamNameKey: string;',
  '  linkCount: number | bigint;',
  '};',
  '',
  'async function getSixflTvLinkCounts() {',
  '  return prisma.$queryRaw<SixflTvLinkCountRow[]>(Prisma.sql`',
  '    WITH fixture_links AS (',
  '      SELECT',
  '        fixture."id",',
  '        fixture."leagueId",',
  '        fixture."homeTeamId",',
  '        fixture."awayTeamId",',
  '        BTRIM(link.value) AS "url"',
  '      FROM "Fixture" fixture',
  '      CROSS JOIN LATERAL',
  '        regexp_split_to_table(fixture."sixflTvUrl", E\'[\\\\n,]+\') AS link(value)',
  '      WHERE fixture."publishedAt" IS NOT NULL',
  '        AND fixture."sixflTvRecorded" = true',
  '        AND fixture."sixflTvUrl" IS NOT NULL',
  '        AND BTRIM(link.value) <> \'\'',
  '    ),',
  '    team_links AS (',
  '      SELECT "leagueId", "homeTeamId" AS "teamId", "url"',
  '      FROM fixture_links',
  '      UNION ALL',
  '      SELECT "leagueId", "awayTeamId" AS "teamId", "url"',
  '      FROM fixture_links',
  '    )',
  '    SELECT',
  '      team_links."leagueId",',
  '      LOWER(BTRIM(team."name")) AS "teamNameKey",',
  '      COUNT(*)::int AS "linkCount"',
  '    FROM team_links',
  '    JOIN "Team" team ON team."id" = team_links."teamId"',
  '    GROUP BY team_links."leagueId", LOWER(BTRIM(team."name"))',
  '  `);',
  '}',
  '',
  'type TeamListItem = Awaited<ReturnType<typeof getAdminTeams>>[number];',
].join("\n");

replaceOnce(
  pagePath,
  'type TeamListItem = Awaited<ReturnType<typeof getAdminTeams>>[number];',
  tvCountBlock,
);

replaceOnce(
  pagePath,
  'function normaliseText(value: string | null | undefined) {\n  return (value ?? "").trim().toLowerCase();\n}',
  'function normaliseText(value: string | null | undefined) {\n  return (value ?? "").trim().toLowerCase();\n}\n\nfunction getSixflTvLinkCountKey(leagueId: string, teamName: string) {\n  return `${leagueId}:${normaliseText(teamName)}`;\n}',
);

replaceOnce(
  pagePath,
  '  const allTeams = await getAdminTeams();\n  const displayTeams = dedupeTeamsForDisplay(allTeams);\n  const groups = groupTeams(allTeams);',
  '  const [allTeams, sixflTvLinkCountRows] = await Promise.all([\n    getAdminTeams(),\n    getSixflTvLinkCounts(),\n  ]);\n  const sixflTvLinkCounts = new Map(\n    sixflTvLinkCountRows.map((row) => [\n      getSixflTvLinkCountKey(row.leagueId, row.teamNameKey),\n      Number(row.linkCount),\n    ]),\n  );\n  const displayTeams = dedupeTeamsForDisplay(allTeams);\n  const groups = groupTeams(allTeams);',
);

replaceOnce(
  pagePath,
  '                const isManagedTeam = team.teamMode === "MANAGED";\n                const currentSeason = team.league?.competition?.currentLeague?.season;',
  '                const isManagedTeam = team.teamMode === "MANAGED";\n                const currentSeason = team.league?.competition?.currentLeague?.season;\n                const currentLeagueId =\n                  team.league?.competition?.currentLeagueId ?? team.leagueId;\n                const sixflTvLinkCount = currentLeagueId\n                  ? sixflTvLinkCounts.get(\n                      getSixflTvLinkCountKey(currentLeagueId, team.name),\n                    ) ?? 0\n                  : 0;',
);

replaceOnce(
  pagePath,
  '                          {team.latestKickoffTime ? (\n                            <span className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-[11px] text-white/65">\n                              Latest KO {team.latestKickoffTime}\n                            </span>\n                          ) : null}',
  '                          {team.latestKickoffTime ? (\n                            <span className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-[11px] text-white/65">\n                              Latest KO {team.latestKickoffTime}\n                            </span>\n                          ) : null}\n                          <span\n                            title={`Published SIXFL TV links in ${currentSeason || "the current season"}`}\n                            className="rounded-lg border border-fuchsia-400/25 bg-fuchsia-500/10 px-2.5 py-1 text-[11px] font-semibold text-fuchsia-100"\n                          >\n                            SIXFL TV · {sixflTvLinkCount} link\n                            {sixflTvLinkCount === 1 ? "" : "s"}\n                          </span>',
);

console.log("Applied current-season SIXFL TV link counts to the admin teams page.");
