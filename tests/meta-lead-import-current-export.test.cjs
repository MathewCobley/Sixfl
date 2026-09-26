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
  assert.match(source, /META_MARKETING_AREAS/);
  assert.match(source, /currentLeagueCandidates/);
  assert.match(source, /inferLeagueIdFromArea/);
  assert.match(source, /shouldRepairName/);
  assert.match(source, /matchedLead\.phoneNormalized/);
  assert.match(source, /!matchedLead\.area/);
  assert.match(source, /!matchedLead\.leagueId/);
});
