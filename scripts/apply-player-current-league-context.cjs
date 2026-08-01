const fs = require("node:fs");
const path = require("node:path");

const root = process.cwd();

function read(filePath) {
  return fs.readFileSync(path.join(root, filePath), "utf8");
}

function write(filePath, source) {
  fs.writeFileSync(path.join(root, filePath), source, "utf8");
}

function replaceOnce(source, before, after, label) {
  if (source.includes(after)) return source;
  if (!source.includes(before)) {
    throw new Error(`Expected ${label} source was not found.`);
  }
  return source.replace(before, after);
}

function replaceAll(source, before, after) {
  return source.split(before).join(after);
}

function replaceRange(source, startMarker, endMarker, replacement, label) {
  if (source.includes(replacement)) return source;
  const start = source.indexOf(startMarker);
  const end = source.indexOf(endMarker, start);
  if (start < 0 || end < 0) {
    throw new Error(`Expected ${label} range was not found.`);
  }
  return source.slice(0, start) + replacement + source.slice(end);
}

const playerPagePath = "src/app/player/team/[teamid]/page.tsx";
let playerPage = read(playerPagePath);

playerPage = replaceOnce(
  playerPage,
  'import { formatDateTimeInLondon } from "@/lib/datetime/london";\n',
  'import { getCaptainRelatedTeamContext } from "@/lib/captain/related-teams";\nimport { formatDateTimeInLondon } from "@/lib/datetime/london";\n',
  "player page current-league import",
);

playerPage = replaceOnce(
  playerPage,
  [
    "function getOpponentName(input: {",
    "  teamId: string;",
    "  homeTeamId: string;",
    "  homeTeamName: string;",
    "  awayTeamName: string;",
    "}) {",
    "  return input.homeTeamId === input.teamId",
    "    ? input.awayTeamName",
    "    : input.homeTeamName;",
    "}",
  ].join("\n"),
  [
    "function getOpponentName(input: {",
    "  teamIds: string[];",
    "  homeTeamId: string;",
    "  homeTeamName: string;",
    "  awayTeamName: string;",
    "}) {",
    "  return input.teamIds.includes(input.homeTeamId)",
    "    ? input.awayTeamName",
    "    : input.homeTeamName;",
    "}",
  ].join("\n"),
  "player page related-team opponent helper",
);

playerPage = replaceOnce(
  playerPage,
  "  if (!team) notFound();\n\n  const now = new Date();",
  [
    "  if (!team) notFound();",
    "",
    "  const relatedContext = await getCaptainRelatedTeamContext(teamid);",
    "  const displayLeague = relatedContext?.currentLeague ?? team.league;",
    "  const displayLeagueName =",
    "    relatedContext?.competitionName ?? displayLeague?.name ?? null;",
    "  const relatedTeamIds = relatedContext?.relatedTeamIds ?? [teamid];",
    "",
    "  const now = new Date();",
  ].join("\n"),
  "player page current-league context",
);

playerPage = replaceAll(
  playerPage,
  "        OR: [{ homeTeamId: teamid }, { awayTeamId: teamid }],",
  [
    "        OR: [",
    "          { homeTeamId: { in: relatedTeamIds } },",
    "          { awayTeamId: { in: relatedTeamIds } },",
    "        ],",
    "        ...(displayLeague?.id ? { leagueId: displayLeague.id } : {}),",
  ].join("\n"),
);

playerPage = replaceOnce(
  playerPage,
  [
    "                  {team.league?.name ? (",
    '                    <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-medium text-white/75">',
    "                      {team.league.name}{team.league.season ? ` · ${team.league.season}` : \"\"}",
    "                    </span>",
    "                  ) : null}",
    "                  {team.league?.dayOfWeek ? (",
    '                    <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-medium text-white/75">',
    "                      {team.league.dayOfWeek}",
    "                    </span>",
    "                  ) : null}",
    "                  {team.league?.venueName ? (",
    '                    <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-medium text-white/75">',
    "                      {team.league.venueName}",
    "                    </span>",
    "                  ) : null}",
  ].join("\n"),
  [
    "                  {displayLeagueName ? (",
    '                    <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-medium text-white/75">',
    "                      {displayLeagueName}{displayLeague?.season ? ` · ${displayLeague.season}` : \"\"}",
    "                    </span>",
    "                  ) : null}",
    "                  {displayLeague?.dayOfWeek ? (",
    '                    <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-medium text-white/75">',
    "                      {displayLeague.dayOfWeek}",
    "                    </span>",
    "                  ) : null}",
    "                  {displayLeague?.venueName ? (",
    '                    <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-medium text-white/75">',
    "                      {displayLeague.venueName}",
    "                    </span>",
    "                  ) : null}",
  ].join("\n"),
  "player page current league badges",
);

playerPage = replaceOnce(
  playerPage,
  [
    "              {team.league?.slug ? (",
    "                <Link",
    "                  href={`/leagues/${team.league.slug}`}",
  ].join("\n"),
  [
    "              {displayLeague?.slug ? (",
    "                <Link",
    "                  href={`/leagues/${displayLeague.slug}`}",
  ].join("\n"),
  "player page current league link",
);

playerPage = replaceAll(
  playerPage,
  "getOpponentName({ teamId: teamid,",
  "getOpponentName({ teamIds: relatedTeamIds,",
);

playerPage = replaceOnce(
  playerPage,
  [
    "        {team.league?.id ? (",
    "          <DivisionAwareDashboardTables",
    "            leagueId={team.league.id}",
    "            leagueName={team.league.name}",
    "            season={team.league.season}",
  ].join("\n"),
  [
    "        {displayLeague?.id && displayLeagueName ? (",
    "          <DivisionAwareDashboardTables",
    "            leagueId={displayLeague.id}",
    "            leagueName={displayLeagueName}",
    "            season={displayLeague.season}",
  ].join("\n"),
  "player dashboard current standings",
);

write(playerPagePath, playerPage);

const mediaPanelPath = "src/components/player/PlayerLeagueMediaPanel.tsx";
let mediaPanel = read(mediaPanelPath);

mediaPanel = replaceOnce(
  mediaPanel,
  'import { authOptions } from "@/auth";\n',
  'import { authOptions } from "@/auth";\nimport { getCaptainRelatedTeamContext } from "@/lib/captain/related-teams";\n',
  "player media current-league import",
);

mediaPanel = replaceRange(
  mediaPanel,
  "  const team = await prisma.team.findUnique({",
  "  const [nextFixture, recentResults, tvSummaryRows] = await Promise.all([",
  [
    "  const relatedContext = await getCaptainRelatedTeamContext(teamId);",
    "  if (!relatedContext) return null;",
    "",
    "  const team = relatedContext.team;",
    "  const relatedTeamIds = relatedContext.relatedTeamIds;",
    "  const relatedTeamIdSet = new Set(relatedTeamIds);",
    "  const displayLeague = relatedContext.currentLeague;",
    "  const displayLeagueName =",
    '    relatedContext.competitionName ?? displayLeague?.name ?? "Your SIXFL league";',
    "",
  ].join("\n"),
  "player media team context",
);

mediaPanel = replaceAll(
  mediaPanel,
  [
    "        publishedAt: { not: null },",
    "        OR: [{ homeTeamId: teamId }, { awayTeamId: teamId }],",
  ].join("\n"),
  [
    "        publishedAt: { not: null },",
    "        OR: [",
    "          { homeTeamId: { in: relatedTeamIds } },",
    "          { awayTeamId: { in: relatedTeamIds } },",
    "        ],",
    "        ...(displayLeague?.id ? { leagueId: displayLeague.id } : {}),",
  ].join("\n"),
);

mediaPanel = replaceOnce(
  mediaPanel,
  '        AND (f."homeTeamId" = ${teamId} OR f."awayTeamId" = ${teamId})',
  '        AND (f."homeTeamId" IN (${Prisma.join(relatedTeamIds)}) OR f."awayTeamId" IN (${Prisma.join(relatedTeamIds)}))',
  "player media related-team TV query",
);

mediaPanel = replaceAll(
  mediaPanel,
  "const isHome = fixture.homeTeamId === teamId;",
  "const isHome = relatedTeamIdSet.has(fixture.homeTeamId);",
);

mediaPanel = replaceOnce(
  mediaPanel,
  [
    "            <h2 className=\"mt-2 text-xl font-semibold\">",
    "              {team.league?.name ?? \"Your SIXFL league\"}",
    "            </h2>",
    "            <p className=\"mt-1 text-sm text-white/55\">",
    "              {[team.league?.season, team.league?.venueName]",
  ].join("\n"),
  [
    "            <h2 className=\"mt-2 text-xl font-semibold\">",
    "              {displayLeagueName}",
    "            </h2>",
    "            <p className=\"mt-1 text-sm text-white/55\">",
    "              {[displayLeague?.season, displayLeague?.venueName]",
  ].join("\n"),
  "player media current league heading",
);

mediaPanel = replaceOnce(
  mediaPanel,
  [
    "          {team.league?.slug ? (",
    "            <Link",
    "              href={`/leagues/${team.league.slug}`}",
  ].join("\n"),
  [
    "          {displayLeague?.slug ? (",
    "            <Link",
    "              href={`/leagues/${displayLeague.slug}`}",
  ].join("\n"),
  "player media current league link",
);

write(mediaPanelPath, mediaPanel);

console.log(
  "Player pages now resolve the competition's current league and related seasonal team records.",
);
