const assert = require("node:assert/strict");
const fs = require("node:fs");
const test = require("node:test");

test("captain fixtures app keeps TV panels out of the primary fixtures screen", () => {
  const layout = fs.readFileSync(
    "src/app/captain/team/[teamid]/fixtures/layout.tsx",
    "utf8",
  );

  assert.match(layout, /CaptainPwaModeOnly mode="web"/);
  assert.match(layout, /<CaptainVeoBookings teamId=\{teamid\} \/>/);
  assert.match(layout, /\{children\}/);
  assert.ok(
    layout.indexOf('CaptainPwaModeOnly mode="web"') <
      layout.indexOf("<CaptainVeoBookings"),
  );
  assert.ok(layout.indexOf("</CaptainPwaModeOnly>") < layout.indexOf("{children}"));
});

test("captain fixtures page uses compact mobile hierarchy", () => {
  const page = fs.readFileSync(
    "src/app/captain/team/[teamid]/fixtures/page.tsx",
    "utf8",
  );
  const shell = fs.readFileSync(
    "src/app/captain/team/[teamid]/layout.tsx",
    "utf8",
  );

  assert.match(page, /captain-fixtures-page/);
  assert.match(page, /captain-fixtures-primary/);
  assert.match(page, /captain-fixtures-guidance-detail/);
  assert.match(page, /<details className="captain-fixtures-issue/);
  assert.match(page, /Can your team play\?/);
  assert.match(shell, /captain-fixtures-guidance-detail[\s\S]*display: none !important/);
  assert.match(shell, /captain-fixtures-response-help[\s\S]*display: none !important/);
});

test("installed fixtures screen keeps AI prediction compact", () => {
  const bridge = fs.readFileSync(
    "src/components/captain/CaptainFixtureBadgesBridge.tsx",
    "utf8",
  );

  assert.match(bridge, /function isCaptainFixturesAppScreen/);
  assert.match(bridge, /!isCaptainFixturesAppScreen\(\)/);
  assert.match(bridge, /createCompactWinChanceBadge/);
});
