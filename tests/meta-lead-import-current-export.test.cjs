const assert = require("node:assert/strict");
const fs = require("node:fs");
const test = require("node:test");

test("Meta lead importer supports current blank contact headings", () => {
  const source = fs.readFileSync(
    "src/app/(admin)/admin/leads/import/actions.ts",
    "utf8",
  );

  assert.match(source, /inferContactNameFromUnlabelledMetaColumns/);
  assert.match(source, /\^column\\d\+\$/);
  assert.match(source, /normalizeUkMobileNumber\(candidate\)/);
  assert.match(source, /currentLeagueIdByArea/);
  assert.match(source, /leagueCompetition\.findMany/);
  assert.match(source, /shouldRepairName/);
  assert.match(source, /matchedLead\.phoneNormalized/);
  assert.match(source, /!matchedLead\.area/);
  assert.match(source, /!matchedLead\.leagueId/);
});
