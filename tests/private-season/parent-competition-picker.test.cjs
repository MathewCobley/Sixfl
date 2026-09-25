const assert = require("node:assert/strict");
const fs = require("node:fs");
const test = require("node:test");

test("team settings expose parent competitions rather than season records", () => {
  const page = fs.readFileSync(
    "src/app/(admin)/admin/teams/[id]/page.tsx",
    "utf8",
  );
  const picker = fs.readFileSync(
    "src/components/admin/teams/TeamParentCompetitionPicker.tsx",
    "utf8",
  );
  const service = fs.readFileSync(
    "src/lib/league-season-teams.ts",
    "utf8",
  );

  assert.match(page, /TeamParentCompetitionPicker teamId=\{team\.id\}/);
  assert.doesNotMatch(page, /<select[\s\S]*name="leagueId"/);
  assert.match(page, /type="hidden" name="leagueId"/);

  assert.match(picker, /label: competition\.name/);
  assert.doesNotMatch(picker, /label:.*currentSeason/);
  assert.match(
    picker,
    /does not add the team to a season table or division/i,
  );

  assert.match(
    service,
    /COALESCE\(c\."competitionType", 'LEAGUE'\) = 'LEAGUE'/,
  );
  assert.match(
    service,
    /Change long-term parent competition affiliation only/,
  );
});
