const assert = require("node:assert/strict");
const fs = require("node:fs");
const test = require("node:test");

test("re-entering a private or historical season preserves the team's saved division", () => {
  const panel = fs.readFileSync(
    "src/components/admin/leagues/AdminLeagueSeasonTeamsPanel.tsx",
    "utf8",
  );

  assert.match(panel, /divisionId: team\.divisionId \?\? null/);
  assert.match(panel, /Enter this season/);
  assert.doesNotMatch(panel, /Enter current season/);
});
