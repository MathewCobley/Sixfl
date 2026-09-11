const fs = require("node:fs");
const path = require("node:path");

const filePath = path.join(
  process.cwd(),
  "src",
  "app",
  "api",
  "admin",
  "fixtures",
  "generate-next-week",
  "route.ts",
);

let source = fs.readFileSync(filePath, "utf8");

const placeholderImport = 'import { getFixturePlaceholderTeamIds } from "@/lib/teams/fixture-placeholders";';
if (!source.includes(placeholderImport)) {
  const anchors = [
    'import { prisma } from "@/lib/prisma";',
    'import { snapshotFixtureMatchFees } from "@/lib/payments/fixture-fee-policy";',
    'import { FixtureStatus, Prisma } from "@prisma/client";',
  ];
  const anchor = anchors.find((candidate) => source.includes(candidate));
  if (!anchor) throw new Error("Venue-neutral next-week placeholder import anchor not found.");
  source = source.replace(anchor, `${placeholderImport}\n${anchor}`);
}

source = source.replace("\n\ntype CountRow = { count: number | bigint };", "");

source = source.replace(
  "    const [league, teams, existingFixtures, activeDivisionRows] = await Promise.all([",
  "    const [league, linkedTeams, existingFixtures] = await Promise.all([",
);

const rawTeams = `      prisma.$queryRaw<TeamSeed[]>(Prisma.sql\`\n        SELECT t."id", t."name", t."standardMatchFeePence"\n        FROM "LeagueSeasonTeam" lst\n        JOIN "Team" t ON t."id" = lst."teamId"\n        WHERE lst."leagueId" = \${leagueId}\n          AND lst."isActive" = true\n          AND COALESCE(t."isFixturePlaceholder", false) = false\n        ORDER BY t."name" ASC\n      \`),`;
const normalTeams = `      prisma.team.findMany({\n        where: { leagueId },\n        orderBy: { name: "asc" },\n        select: { id: true, name: true, standardMatchFeePence: true },\n      }),`;
if (!source.includes(normalTeams)) {
  if (!source.includes(rawTeams)) throw new Error("Venue-neutral next-week team query anchor not found.");
  source = source.replace(rawTeams, normalTeams);
}

const divisionQuery = `      prisma.$queryRaw<CountRow[]>(Prisma.sql\`\n        SELECT COUNT(*)::int AS "count"\n        FROM "LeagueDivision"\n        WHERE "leagueId" = \${leagueId}\n          AND "isActive" = true\n      \`),\n`;
source = source.replace(divisionQuery, "");

const divisionGuard = `    if (Number(activeDivisionRows[0]?.count ?? 0) > 0) {\n      return NextResponse.json(\n        {\n          error:\n            "This league currently has active divisions. The one-week generator is blocked here so it cannot mix divisions; use the division schedule tool.",\n          requestId,\n        },\n        { status: 409 },\n      );\n    }\n\n`;
source = source.replace(divisionGuard, "");

const leagueGuardEnd = `    if (!league) {\n      return NextResponse.json(\n        { error: "League not found. Refresh the page and choose it again.", requestId },\n        { status: 404 },\n      );\n    }\n\n`;
const filteredTeams = `${leagueGuardEnd}    const placeholderTeamIds = await getFixturePlaceholderTeamIds(\n      linkedTeams.map((team) => team.id),\n    );\n    const teams = linkedTeams.filter((team) => !placeholderTeamIds.has(team.id));\n\n`;
if (!source.includes("const placeholderTeamIds = await getFixturePlaceholderTeamIds")) {
  if (!source.includes(leagueGuardEnd)) throw new Error("Venue-neutral next-week league guard anchor not found.");
  source = source.replace(leagueGuardEnd, filteredTeams);
}

source = source.replace(
  "This league needs at least two active season teams before fixtures can be generated.",
  "This league needs at least two playable linked teams before fixtures can be generated.",
);

if (/Prisma\.sql|LeagueSeasonTeam|activeDivisionRows|CountRow/.test(source)) {
  throw new Error("Next-week venue-neutral compatibility still depends on new raw-query test boundaries.");
}
if (/homeCounts|awayCounts|firstBalance|opponentBalance/.test(source)) {
  throw new Error("Next-week generator still balances home/away direction.");
}
if (!source.includes("pair.team1Id") || !source.includes("pair.team2Id")) {
  throw new Error("Next-week generator lost venue-neutral technical slot mapping.");
}
if (!source.includes("getFixturePlaceholderTeamIds") || !source.includes("snapshotFixtureMatchFees") || !source.includes("refreshStoredAiPreviewsForLeague")) {
  throw new Error("Next-week generator lost placeholder, fee or AI safeguards.");
}

fs.writeFileSync(filePath, source, "utf8");
console.log("Next-week venue-neutral scheduling preserves the existing Prisma/test boundary and excludes placeholders.");
