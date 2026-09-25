const assert = require("node:assert/strict");
const fs = require("node:fs");
const test = require("node:test");

test("league admin exposes a confirmed remove control for every division", () => {
  const page = fs.readFileSync("src/app/(admin)/admin/leagues/[id]/page.tsx", "utf8");
  const button = fs.readFileSync("src/components/admin/leagues/RemoveLeagueDivisionButton.tsx", "utf8");

  assert.match(page, /RemoveLeagueDivisionButton/);
  assert.match(page, /divisionName=\{division\.name\}/);
  assert.match(page, /teamCount=\{division\.teamCount\}/);
  assert.match(button, /window\.confirm/);
  assert.match(button, /Remove division/);
  assert.match(button, /stay in the season and move to No division/);
});

test("removing a division keeps teams in the season and preserves completed fixture history", () => {
  const lib = fs.readFileSync("src/lib/league-divisions.ts", "utf8");
  const actions = fs.readFileSync("src/app/(admin)/admin/leagues/[id]/division-actions.ts", "utf8");

  assert.match(lib, /export async function removeLeagueDivision/);
  assert.match(lib, /UPDATE "LeagueSeasonTeam"[\s\S]*SET "divisionId" = NULL/);
  assert.doesNotMatch(lib, /UPDATE "LeagueSeasonTeam"[\s\S]{0,160}SET "isActive" = false/);
  assert.match(lib, /f\."status" = 'COMPLETED'/);
  assert.match(lib, /EXISTS \([\s\S]*FROM "MatchResult"/);
  assert.match(lib, /UPDATE "LeagueDivision"[\s\S]*SET "isActive" = false/);
  assert.match(lib, /DELETE FROM "LeagueDivision"/);
  assert.match(actions, /removeLeagueDivisionAction/);
  assert.match(actions, /divisions=removed/);
});

test("an archived division slug can be added again later", () => {
  const lib = fs.readFileSync("src/lib/league-divisions.ts", "utf8");
  assert.match(lib, /ON CONFLICT \("leagueId", "slug"\) DO UPDATE/);
  assert.match(lib, /"isActive" = EXCLUDED\."isActive"/);
});
