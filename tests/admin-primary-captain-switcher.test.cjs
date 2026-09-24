const assert = require("node:assert/strict");
const fs = require("node:fs");
const test = require("node:test");

test("team admin has a dedicated primary captain switcher", () => {
  const page = fs.readFileSync(
    "src/app/(admin)/admin/teams/[id]/page.tsx",
    "utf8",
  );
  const action = fs.readFileSync(
    "src/app/(admin)/admin/teams/[id]/actions.ts",
    "utf8",
  );

  assert.match(page, /Change primary captain/);
  assert.match(page, /name="membershipId"/);
  assert.match(page, /name="keepPreviousCaptain"/);
  assert.match(page, /Other existing additional captains are not changed/);
  assert.match(action, /export async function changePrimaryCaptainAction/);
  assert.match(action, /captainUserId: selectedMember\.userId/);
  assert.match(action, /role: TeamRole\.CAPTAIN/);
  assert.match(action, /previousPrimary\?\.role === TeamRole\.CAPTAIN/);
  assert.match(action, /data: \{ role: TeamRole\.PLAYER \}/);
  assert.match(action, /contactEmail: captainEmail/);
  assert.match(action, /contactPhone: captainPhone/);
  assert.match(action, /ADMIN_PRIMARY_CAPTAIN_CHANGE/);
  assert.match(action, /upsertTeamNotificationRecipient\(teamId\)/);
  assert.match(action, /sendDashboardLoginEmail/);
  assert.match(action, /callbackPath:/);
  assert.match(action, /captain\\/team/);
  assert.match(action, /captainSignin = "failed"/);
});

test("captain role editing no longer silently replaces an existing primary captain", () => {
  const squadAction = fs.readFileSync(
    "src/app/(admin)/admin/teams/[id]/squad/actions.ts",
    "utf8",
  );
  const squadPage = fs.readFileSync(
    "src/app/(admin)/admin/teams/[id]/squad/page.tsx",
    "utf8",
  );

  assert.match(
    squadAction,
    /role === "CAPTAIN" && !membership\.team\.captainUserId/,
  );
  assert.match(
    squadAction,
    /dedicated "Change primary captain" control owns that job/,
  );
  assert.match(squadAction, /admin-squad-page-fallback-captain/);
  assert.match(squadPage, /member\.user\.id === team\.captainUserId/);
  assert.match(squadPage, /Primary captain/);
});
