const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");

const migrationPath =
  "prisma/migrations/20260926121500_reusable_team_interest_followup/migration.sql";
const migration = fs.readFileSync(migrationPath, "utf8");
const form = fs.readFileSync(
  "src/components/admin/email-templates/EmailTemplateForm.tsx",
  "utf8",
);
const sender = fs.readFileSync(
  "src/app/(admin)/admin/leads/team-confirmation-bulk-action.ts",
  "utf8",
);
const guard = fs.readFileSync(
  "src/app/(admin)/admin/leads/guarded-bulk-actions.ts",
  "utf8",
);

test("one reusable team follow-up template works across league areas", () => {
  assert.match(migration, /'team-interest-still-joining'/);
  assert.match(migration, /'LEAD',\s*'TEAM'/);
  assert.match(migration, /\{\{leagueShortName\}\} — are you still looking to join SIXFL\?/);
  assert.match(migration, /\{\{leagueName\}\}/);
  assert.match(migration, /\{\{leagueStartLine\}\}/);
  assert.match(migration, /individual-player option/);
  assert.match(migration, /'teamConfirmationUrl'/);
  assert.equal((migration.match(/\{\{cta\}\}/g) || []).length, 1);
  assert.doesNotMatch(
    migration,
    /Rawdon starts|Thirsk starts|Catterick starts|Monday 5 October/,
  );
  assert.match(migration, /ON CONFLICT \("key"\) DO NOTHING/);
});

test("team confirmation sender supplies league-specific values per recipient", () => {
  for (const token of [
    "leagueName",
    "leagueShortName",
    "leagueStartLine",
    "leagueDetailsBlock",
    "proposedStartDate",
  ]) {
    assert.ok(sender.includes(token), token);
  }
  assert.match(sender, /lead\.leagueId/);
  assert.match(sender, /ensureTeamPlaceConfirmationRecord\(lead\.id\)/);
  assert.match(guard, /TEAM_PLACE_CONFIRMATION_CTA_KEY/);
  assert.match(guard, /sendBulkTeamPlaceConfirmationEmailAction/);
});

test("campaign editor exposes the secure decision CTA and dynamic league tokens", () => {
  assert.match(form, /teamConfirmationUrl/);
  assert.match(form, /Team decision form/);
  assert.match(form, /\{\{leagueShortName\}\}/);
  assert.match(form, /\{\{leagueStartLine\}\}/);
  assert.match(form, /\{\{leagueDetailsBlock\}\}/);
  assert.match(form, /\{\{proposedStartDate\}\}/);
});
