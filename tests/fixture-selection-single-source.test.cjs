const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");

const playerHome = fs.readFileSync("src/app/player/team/[teamid]/page.tsx", "utf8");
const availabilityPage = fs.readFileSync("src/app/player/team/[teamid]/availability/page.tsx", "utf8");
const availabilityActions = fs.readFileSync("src/app/player/team/[teamid]/availability/actions.ts", "utf8");
const captainSelection = fs.readFileSync("src/app/captain/team/[teamid]/fixtures/[fixtureId]/selection/actions.ts", "utf8");
const migration = fs.readFileSync("prisma/migrations/20260926174500_fixture_selection_single_source/migration.sql", "utf8");

test("player Home and Fixtures both use explicit FixtureSelection for selected state", () => {
  assert.match(playerHome, /prisma\.fixtureSelection\.findFirst/);
  assert.match(playerHome, /nextSelection\?\.selectionStatus === "SELECTED"/);

  assert.match(availabilityPage, /fixture\.selections\[0\]\?\.selectionStatus === "SELECTED"/);
  assert.match(availabilityPage, /selected: explicitlySelected/);
  assert.doesNotMatch(availabilityPage, /legacySelected/);
  assert.doesNotMatch(availabilityPage, /selected: explicitlySelected \|\|/);
});

test("player availability locking and waitlist fullness do not infer selection from fees", () => {
  const contextStart = availabilityActions.indexOf("async function getFixtureSelectionContext");
  const contextEnd = availabilityActions.indexOf("async function notifyCaptainOfPlayerRequest");
  const stateStart = availabilityActions.indexOf("function getSelectionState");
  const stateEnd = availabilityActions.indexOf("export async function updatePlayerFixtureAvailabilityAction");
  const context = availabilityActions.slice(contextStart, contextEnd);
  const state = availabilityActions.slice(stateStart, stateEnd);

  assert.match(context, /selectionStatus: "SELECTED"/);
  assert.doesNotMatch(context, /playerMatchFees/);
  assert.match(state, /input\.fixture\.selections/);
  assert.doesNotMatch(state, /playerMatchFees/);
});

test("captain selection is one action: save selection first, then sync payment as a consequence", () => {
  const upsertAt = captainSelection.indexOf("tx.fixtureSelection.upsert");
  const feeSyncAt = captainSelection.indexOf("await syncPlayerMatchFeeForSelection");
  assert.ok(upsertAt >= 0, "captain save must write FixtureSelection");
  assert.ok(feeSyncAt > upsertAt, "payment sync must follow the selection decision");
  assert.match(captainSelection, /if \(input\.selectionStatus !== "SELECTED"\)/);
  assert.match(captainSelection, /status: "CANCELLED"/);
});

test("legacy future fee-only selections are backfilled once without overriding explicit decisions", () => {
  assert.match(migration, /INSERT INTO "FixtureSelection"/);
  assert.match(migration, /'SELECTED'/);
  assert.match(migration, /fee\."status" <> 'CANCELLED'/);
  assert.match(migration, /fixture\."kickoffAt" >= CURRENT_TIMESTAMP/);
  assert.match(migration, /fixture\."status" IN \('SCHEDULED', 'POSTPONED'\)/);
  assert.match(migration, /NOT EXISTS \([\s\S]*FROM "FixtureSelection"/);
  assert.match(migration, /ON CONFLICT \("fixtureId", "teamMemberId"\) DO NOTHING/);
});
