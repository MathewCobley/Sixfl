const fs = require("node:fs");
const path = require("node:path");

const root = process.cwd();
const standingsPath = path.join(root, "src", "lib", "leagueTable.ts");
const fixtureActionsPath = path.join(
  root,
  "src",
  "app",
  "(admin)",
  "admin",
  "fixtures",
  "actions-legacy.ts",
);

if (!fs.existsSync(standingsPath) || !fs.existsSync(fixtureActionsPath)) {
  console.log("League table or fixture actions not present; skipping fixture division repair.");
  process.exit(0);
}

let standings = fs.readFileSync(standingsPath, "utf8");

// The active division membership is authoritative. Query all fixtures for the
// league and let allowedTeamIds decide whether both participants belong in this
// division. This also repairs older/manual fixtures with a blank or incorrect
// Fixture.divisionId without allowing another division's teams into the table.
standings = standings.replace(
  '        ...(options.divisionId ? { divisionId: options.divisionId } : {}),\n',
  "",
);

// A saved MatchResult is the authoritative indication that a game has been
// played. Older records can contain a result while the Fixture status was left
// as SCHEDULED, so requiring COMPLETED can silently hide genuine results.
standings = standings.replace('        status: "COMPLETED",\n', "");

// Remove the earlier fallback guard. It still rejected fixtures carrying an
// incorrect non-null divisionId even when both teams are active in this table.
standings = standings.replace(
  `    if (
      options.divisionId &&
      fixture.divisionId !== options.divisionId &&
      fixture.divisionId !== null
    ) {
      continue;
    }
`,
  "",
);

if (
  standings.includes('...(options.divisionId ? { divisionId: options.divisionId } : {})') ||
  standings.includes('status: "COMPLETED"') ||
  standings.includes("fixture.divisionId !== options.divisionId")
) {
  throw new Error("Membership-based standings result repair was not applied correctly.");
}

fs.writeFileSync(standingsPath, standings, "utf8");

let actions = fs.readFileSync(fixtureActionsPath, "utf8");

actions = actions.replace(
  'import { FixtureStatus, NotificationDispatchStatus } from "@prisma/client";',
  'import { FixtureStatus, NotificationDispatchStatus, Prisma } from "@prisma/client";',
);

const returnToFunction = `function getSafeAdminFixturesReturnTo(value: FormDataEntryValue | null) {
  const returnTo = String(value ?? "").trim();
  return returnTo.startsWith("/admin/fixtures") ? returnTo : "/admin/fixtures";
}
`;

const divisionHelper = `${returnToFunction}
async function getSharedActiveFixtureDivisionId(input: {
  leagueId: string;
  homeTeamId: string;
  awayTeamId: string;
}) {
  const rows = await prisma.$queryRaw<Array<{ divisionId: string }>>(Prisma.sql\`
    SELECT home."divisionId" AS "divisionId"
    FROM "LeagueSeasonTeam" home
    JOIN "LeagueSeasonTeam" away
      ON away."leagueId" = home."leagueId"
     AND away."divisionId" = home."divisionId"
    WHERE home."leagueId" = \${input.leagueId}
      AND home."teamId" = \${input.homeTeamId}
      AND away."teamId" = \${input.awayTeamId}
      AND home."isActive" = true
      AND away."isActive" = true
      AND home."divisionId" IS NOT NULL
    LIMIT 1
  \`);

  return rows[0]?.divisionId ?? null;
}
`;

if (!actions.includes("getSharedActiveFixtureDivisionId")) {
  if (!actions.includes(returnToFunction)) {
    throw new Error("Could not find the fixture return-path helper.");
  }
  actions = actions.replace(returnToFunction, divisionHelper);
}

const createTransactionMarker = `  const created = await prisma.$transaction(async (tx) => {
    const fixture = await tx.fixture.create({
      data: {
        leagueId,
`;
const createTransactionReplacement = `  const fixtureDivisionId = await getSharedActiveFixtureDivisionId({
    leagueId,
    homeTeamId,
    awayTeamId,
  });

  const created = await prisma.$transaction(async (tx) => {
    const fixture = await tx.fixture.create({
      data: {
        leagueId,
        divisionId: fixtureDivisionId,
`;

if (!actions.includes("divisionId: fixtureDivisionId")) {
  if (!actions.includes(createTransactionMarker)) {
    throw new Error("Could not find the manual fixture creation block.");
  }
  actions = actions.replace(createTransactionMarker, createTransactionReplacement);
}

const updateTransactionMarker = `  const updated = await prisma.$transaction(async (tx) => {
    const updatedFixture = await tx.fixture.update({
      where: { id: fixtureId },
      data: {
        leagueId,
`;
const updateTransactionReplacement = `  const fixtureDivisionId = await getSharedActiveFixtureDivisionId({
    leagueId,
    homeTeamId,
    awayTeamId,
  });

  const updated = await prisma.$transaction(async (tx) => {
    const updatedFixture = await tx.fixture.update({
      where: { id: fixtureId },
      data: {
        leagueId,
        divisionId: fixtureDivisionId,
`;

const divisionAssignmentCount = (actions.match(/divisionId: fixtureDivisionId/g) || []).length;
if (divisionAssignmentCount < 2) {
  if (!actions.includes(updateTransactionMarker)) {
    throw new Error("Could not find the manual fixture update block.");
  }
  actions = actions.replace(updateTransactionMarker, updateTransactionReplacement);
}

if (
  !actions.includes("NotificationDispatchStatus, Prisma") ||
  !actions.includes("getSharedActiveFixtureDivisionId") ||
  (actions.match(/divisionId: fixtureDivisionId/g) || []).length < 2
) {
  throw new Error("Manual fixture division assignment was not applied correctly.");
}

fs.writeFileSync(fixtureActionsPath, actions, "utf8");
console.log(
  "League tables now count saved results by active team membership, and manual fixtures inherit their teams' shared active division.",
);
