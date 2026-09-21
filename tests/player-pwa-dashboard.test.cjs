const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");

const read = (file) => fs.readFileSync(file, "utf8");

test("player PWA home follows the approved compact dashboard hierarchy", () => {
  const home = read("src/components/player/PlayerAppHome.tsx");

  assert.match(home, /teamLogoUrl/);
  assert.match(home, /playerImageUrl/);
  assert.match(home, /squadNumber/);
  assert.match(home, /preferredPosition/);
  assert.match(home, /Matches/);
  assert.match(home, /Goals/);
  assert.match(home, /Assists/);
  assert.match(home, /Next match/);
  assert.match(home, /My Fixtures/);
  assert.match(home, /Availability/);
  assert.match(home, /Match Fees/);
  assert.match(home, /Recent form/);
  assert.match(home, /Refer a new team and earn £75/);
});

test("live players keep chat dark-launched while admin preview can see the Messages tile", () => {
  const home = read("src/components/player/PlayerAppHome.tsx");
  const page = read("src/app/player/team/[teamid]/page.tsx");
  const nav = read("src/components/player/PlayerTeamNav.tsx");

  assert.match(home, /showTeamChat/);
  assert.match(home, /title: "Messages"/);
  assert.match(home, /title: "My Stats"/);
  assert.match(page, /showTeamChat=\{user\.role === UserRole\.ADMIN\}/);
  assert.match(nav, /showTeamChat/);
});

test("player app bottom navigation stays to five primary destinations", () => {
  const nav = read("src/components/player/PlayerTeamNav.tsx");

  assert.match(nav, /label: "Home"/);
  assert.match(nav, /label: "Fixtures"/);
  assert.match(nav, /label: "Payments"/);
  assert.match(nav, /label: "More"/);
  assert.doesNotMatch(nav, /label: "TV",/);
});

test("player PWA home uses real profile and performance data", () => {
  const page = read("src/app/player/team/[teamid]/page.tsx");

  assert.match(page, /getTeamMemberProfilesByTeamMemberIds/);
  assert.match(page, /PlayerMatchPerformance/);
  assert.match(page, /squadNumber=\{playerProfile\?\.squadNumber/);
  assert.match(page, /preferredPosition=\{playerProfile\?\.preferredPositions/);
  assert.match(page, /stats=\{playerAppStats\}/);
  assert.match(page, /recentResults=\{recentResults\}/);
});
