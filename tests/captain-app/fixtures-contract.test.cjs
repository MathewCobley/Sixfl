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

test("installed fixtures screen hides expanded AI panels while retaining compact badges", () => {
  const shell = fs.readFileSync(
    "src/app/captain/team/[teamid]/layout.tsx",
    "utf8",
  );
  const bridge = fs.readFileSync(
    "src/components/captain/CaptainFixtureBadgesBridge.tsx",
    "utf8",
  );

  assert.match(
    shell,
    /captain-fixtures-page \[data-fixture-full-ai-for\][\s\S]*display: none !important/,
  );
  assert.match(bridge, /createCompactWinChanceBadge/);
});


test("captain fixtures has a dedicated native app screen instead of shrinking the website layout", () => {
  const page = fs.readFileSync(
    "src/app/captain/team/[teamid]/fixtures/page.tsx",
    "utf8",
  );

  assert.match(page, /<CaptainPwaModeOnly mode="app">[\s\S]*captain-app-fixtures-native/);
  assert.match(page, /<CaptainPwaModeOnly mode="web">[\s\S]*captain-fixtures-page/);

  const appStart = page.indexOf('<CaptainPwaModeOnly mode="app">');
  const webStart = page.indexOf('<CaptainPwaModeOnly mode="web">');
  assert.ok(appStart >= 0 && webStart > appStart);
  const native = page.slice(appStart, webStart);

  for (const copy of [
    "Next fixture",
    "Confirm 72h before",
    "Team cannot play",
    "Report a fixture issue",
    "Upcoming",
    "Results →",
  ]) assert.ok(native.includes(copy), copy);

  assert.match(native, /<AppFixtureTeams/);
  assert.match(native, /name="unavailableReason"/);
  assert.match(native, /href=\{\`\/captain\/team\/\$\{teamid\}\/fixtures\?fixtureId=/);
  assert.doesNotMatch(native, /captain-fixtures-guidance|captain-fixtures-response-card|Whole team cannot play\?/);
});

test("native captain fixture data includes real team badges", () => {
  const page = fs.readFileSync(
    "src/app/captain/team/[teamid]/fixtures/page.tsx",
    "utf8",
  );

  assert.match(page, /type FixtureTeam = \{[\s\S]*logoUrl\?: string \| null/);
  assert.match(page, /homeTeam: \{ select: \{ id: true, name: true, logoUrl: true \} \}/);
  assert.match(page, /awayTeam: \{ select: \{ id: true, name: true, logoUrl: true \} \}/);
  assert.match(page, /function AppTeamBadge/);
});
