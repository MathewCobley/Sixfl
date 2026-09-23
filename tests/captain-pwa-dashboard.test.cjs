const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");

const read = (file) => fs.readFileSync(file, "utf8");

test("captain PWA home is a dedicated app dashboard while web overview remains intact", () => {
  const page = read("src/app/captain/team/[teamid]/page.tsx");
  const home = read("src/components/captain/CaptainAppHome.tsx");

  assert.match(page, /<CaptainPwaModeOnly mode="app">/);
  assert.match(page, /<CaptainAppHome/);
  assert.match(page, /<CaptainPwaModeOnly mode="web">/);
  assert.match(page, /CaptainVeoPriorityCard/);

  assert.match(home, /Your team/);
  assert.match(home, /Next match/);
  assert.match(home, /Needs attention/);
  assert.match(home, /Quick actions/);
  assert.match(home, /Confirm your fixture/);
  assert.match(home, /Finish match reports/);
  assert.match(home, /Team payment due/);
  assert.match(home, /PlayerPool/);
  assert.match(home, /SIXFL TV/);
});

test("captain PWA has a native header and five primary tabs", () => {
  const layout = read("src/app/captain/team/[teamid]/layout.tsx");
  const nav = read("src/components/captain/CaptainPwaBottomNav.tsx");

  assert.match(layout, /<CaptainPwaModeOnly mode="app">[\s\S]*SIXFL captain home/);
  assert.match(layout, /<CaptainPwaModeOnly mode="web">[\s\S]*captain-team-header/);
  assert.match(layout, /unreadMessageCount=\{unreadMessageCount\}/);

  for (const label of ["Home", "Fixtures", "Squad", "Payments", "Inbox"]) {
    assert.match(nav, new RegExp(`label: "${label}"`));
  }
  assert.match(nav, /grid-cols-5/);
  assert.match(nav, /ChatBubbleLeftRightIcon/);
});

test("captain app mode works in installed PWA and admin phone preview", () => {
  const mode = read("src/components/captain/CaptainPwaModeOnly.tsx");

  assert.match(mode, /display-mode: standalone/);
  assert.match(mode, /navigator/);
  assert.match(mode, /window\.parent\.location\.pathname === "\/admin\/pwa"/);
  assert.match(mode, /pwaPreview/);
});

test("every captain route gets app-native page chrome and route priorities", () => {
  const layout = read("src/app/captain/team/[teamid]/layout.tsx");
  const header = read("src/components/captain/CaptainAppHeader.tsx");
  const focus = read("src/components/captain/CaptainAppPageFocus.tsx");

  assert.match(layout, /CaptainAppHeader/);
  assert.match(layout, /CaptainAppPageFocus/);
  assert.match(layout, /body:has\(\.captain-app-header\)/);
  assert.match(layout, /captain-app-web-only/);
  assert.match(layout, /captain-app-secondary/);

  for (const title of [
    "Fixtures", "Squad", "Squad payments", "Team payments", "Inbox",
    "Availability", "Match reports", "Matchday squad", "PlayerPool",
    "Player stats", "SIXFL TV", "Priority score", "Team kit",
    "Fixture planning", "WhatsApp", "Cup invitations", "Match rules",
    "Captain guide", "Help", "More",
  ]) {
    assert.ok(header.includes(title), title);
  }

  assert.match(focus, /Confirm the team/);
  assert.match(focus, /Keep the current squad accurate/);
  assert.match(focus, /Pick the fixture, choose who should pay/);
  assert.match(focus, /What the team owes now comes first/);
  assert.match(focus, /The important number is who has not replied yet/);
  assert.match(focus, /Complete players, goals, assists and Player of the Match/);
});

test("captain app hides duplicate website-only sections and keeps important work first", () => {
  const fixtures = read("src/app/captain/team/[teamid]/fixtures/page.tsx");
  const messages = read("src/app/captain/team/[teamid]/messages/page.tsx");
  const results = read("src/app/captain/team/[teamid]/results/page.tsx");
  const matchday = read("src/app/captain/team/[teamid]/match-fees/page.tsx");
  const availability = read("src/app/captain/team/[teamid]/availability/page.tsx");
  const stats = read("src/app/captain/team/[teamid]/player-stats/page.tsx");

  assert.match(fixtures, /captain-app-secondary[\s\S]*Recent results/);
  assert.match(messages, /captain-app-secondary[\s\S]*What is included/);
  assert.match(results, /captain-app-secondary[\s\S]*Find a result/);
  assert.match(matchday, /captain-app-secondary[\s\S]*How availability and fees work together/);
  assert.match(availability, /captain-app-web-only[\s\S]*View availability history/);
  assert.match(stats, /<CaptainPwaModeOnly mode="app">[\s\S]*Squad leaderboard/);
  assert.match(stats, /captain-app-web-only[\s\S]*Season leaderboard/);
});

test("captain app More menu keeps secondary destinations inside the app", () => {
  const more = read("src/app/captain/team/[teamid]/more/page.tsx");
  const header = read("src/components/captain/CaptainAppHeader.tsx");
  const home = read("src/components/captain/CaptainAppHome.tsx");

  for (const label of [
    "Availability", "Match reports", "Matchday squad", "SIXFL inbox",
    "PlayerPool", "Player stats", "SIXFL TV", "Priority score",
    "Team payments", "Team kit", "Fixture planning", "WhatsApp tools",
    "Cup invitations", "Match rules", "Captain guide", "Help / Contact SIXFL",
  ]) {
    assert.ok(more.includes(label), label);
  }

  assert.ok(header.includes("/more"));
  assert.match(home, />More</);
});
