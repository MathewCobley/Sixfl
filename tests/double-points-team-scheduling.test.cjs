const assert = require("node:assert/strict");
const fs = require("node:fs");
const test = require("node:test");

test("team admin exposes the once-only double-points rule and saves it", () => {
  const page = fs.readFileSync("src/app/(admin)/admin/teams/[id]/page.tsx", "utf8");
  const actions = fs.readFileSync("src/app/(admin)/admin/teams/[id]/actions.ts", "utf8");
  const schema = fs.readFileSync("prisma/schema.prisma", "utf8");
  const migration = fs.readFileSync(
    "prisma/migrations/20260924143000_team_single_round_double_points/migration.sql",
    "utf8",
  );

  assert.match(schema, /playsOnceDoublePoints Boolean @default\(false\)/);
  assert.match(schema, /doublePoints Boolean @default\(false\)/);
  assert.match(page, /name="playsOnceDoublePoints"/);
  assert.match(page, /Plays each team once — double-points fixtures/);
  assert.match(page, /6 points for a win, 2 for a draw and 0 for a defeat/);
  assert.match(actions, /formData\.get\("playsOnceDoublePoints"\)/);
  assert.match(actions, /playsOnceDoublePoints,/);
  assert.match(actions, /f\."status" IN \('SCHEDULED','POSTPONED'\)/);
  assert.match(actions, /NOT EXISTS \(\s*SELECT 1 FROM "MatchResult"/);
  assert.match(migration, /CREATE TRIGGER "Fixture_set_double_points"/);
  assert.match(migration, /NEW\."doublePoints"/);
});

test("double round-robin generation omits return fixtures for opted-in teams", () => {
  const generator = fs.readFileSync(
    "src/app/(admin)/admin/fixtures/generate/division-actions.ts",
    "utf8",
  );
  const legacy = fs.readFileSync(
    "src/app/(admin)/admin/fixtures/generate/actions.ts",
    "utf8",
  );
  const page = fs.readFileSync(
    "src/app/(admin)/admin/fixtures/generate/page.tsx",
    "utf8",
  );

  for (const source of [generator, legacy]) {
    assert.match(source, /playsOnceDoublePoints/);
    assert.match(source, /singleRoundTeamIds/);
    assert.match(source, /!singleRoundTeamIds\.has\(pair\.homeId\)/);
    assert.match(source, /!singleRoundTeamIds\.has\(pair\.awayId\)/);
  }
  assert.match(generator, /doublePoints:\s*\n?\s*homeTeam\.playsOnceDoublePoints \|\| awayTeam\.playsOnceDoublePoints/);
  assert.match(page, /automatically excluded from the return meetings/);
});

test("standings award 6-2-0 on double-points fixtures without doubling goals or appearances", () => {
  const table = fs.readFileSync("src/lib/leagueTable.ts", "utf8");
  const card = fs.readFileSync("src/components/leagues/LeagueTableCard.tsx", "utf8");
  const fixtures = fs.readFileSync(
    "src/app/(public)/leagues/[slug]/fixtures/page.tsx",
    "utf8",
  );

  assert.match(table, /const pointsMultiplier = fixture\.doublePoints \? 2 : 1/);
  assert.match(table, /home\.points \+= 3 \* pointsMultiplier/);
  assert.match(table, /away\.points \+= 3 \* pointsMultiplier/);
  assert.match(table, /home\.points \+= 1 \* pointsMultiplier/);
  assert.match(table, /away\.points \+= 1 \* pointsMultiplier/);
  assert.match(table, /home\.played \+= 1/);
  assert.match(table, /away\.played \+= 1/);
  assert.doesNotMatch(table, /home\.goalsFor \+= homeScore \* pointsMultiplier/);
  assert.doesNotMatch(table, /away\.goalsFor \+= awayScore \* pointsMultiplier/);
  assert.match(card, /2× points fixture/);
  assert.match(fixtures, /Double points · 6 win \/ 2 draw/);
});

test("next-week generator never repeats a once-only pairing", () => {
  const route = fs.readFileSync(
    "src/app/api/admin/fixtures/generate-next-week/route.ts",
    "utf8",
  );
  assert.match(route, /function pairMeetingLimit/);
  assert.match(route, /a\.playsOnceDoublePoints \|\| b\.playsOnceDoublePoints \? 1 : 2/);
  assert.match(route, /count >= pairMeetingLimit\(first, opponent\)/);
  assert.match(route, /No permitted pairings remain/);
  assert.match(route, /doublePoints:\s*\n?\s*homeTeam\.playsOnceDoublePoints \|\| awayTeam\.playsOnceDoublePoints/);
});


test("toggling double points does not remove season membership", () => {
  const actions = fs.readFileSync("src/app/(admin)/admin/teams/[id]/actions.ts", "utf8");

  assert.match(actions, /existingTeam\.leagueId !== leagueId/);
  assert.match(actions, /A normal details save \(including toggling double points\) must never/);
  assert.match(actions, /season\."competitionId" IS DISTINCT FROM target\."competitionId"/);

  const membershipBlock = actions.slice(
    actions.indexOf("A normal details save (including toggling double points)"),
    actions.indexOf("return updated;"),
  );

  assert.doesNotMatch(
    membershipBlock,
    /WHERE "teamId" = \$\{id\}\s+AND "leagueId" <> \$\{leagueId\}/,
  );
});
