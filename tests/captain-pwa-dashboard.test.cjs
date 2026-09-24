const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const read = (file) => fs.readFileSync(file, "utf8");

test("captain PWA keeps the real overview calculations and a separate website view", () => {
  const page = read("src/app/captain/team/[teamid]/page.tsx");
  const server = read("src/components/captain/CaptainAppHome.tsx");
  const view = read("src/components/captain/CaptainAppHomeView.tsx");
  assert.match(page, /<CaptainPwaModeOnly mode="app">[\s\S]*<CaptainAppHome/);
  assert.match(page, /<CaptainPwaModeOnly mode="web">/);
  assert.match(page, /CaptainVeoPriorityCard/);
  assert.match(server, /requireCaptain\(props.teamId\)/);
  assert.match(server, /teamName=\{team.name\}/);
  assert.match(view, /<h1>\{teamName\}<\/h1>/);
  assert.doesNotMatch(view, />Your team<|The things that need your attention/);
  for (const text of ["Next match", "Team balance", "Reports to finish", "PlayerPool", "SIXFL TV"]) assert.ok(view.includes(text), text);
});

test("captain PWA has a native header and six permanent tabs including More", () => {
  const layout = read("src/app/captain/team/[teamid]/layout.tsx");
  const header = read("src/components/captain/CaptainAppHeader.tsx");
  const nav = read("src/components/captain/CaptainPwaBottomNav.tsx");
  const css = read("src/components/captain/CaptainAppScreens.module.css");
  assert.match(layout, /<CaptainPwaModeOnly mode="app">[\s\S]*CaptainAppHeader/);
  assert.match(header, /SIXFL captain home/);
  assert.match(layout, /<CaptainPwaModeOnly mode="web">[\s\S]*captain-team-header/);
  assert.match(layout, /unreadMessageCount=\{unreadMessageCount\}/);
  for (const label of ["Home", "Fixtures", "Squad", "Payments", "Inbox", "More"]) assert.ok(nav.includes(`label: "${label}"`));
  assert.match(css, /grid-template-columns: repeat\(6,minmax\(0,1fr\)\)/);
  assert.doesNotMatch(nav, /sm:hidden/);
  assert.match(nav, /getCaptainAppSection/);
});

test("captain app mode works in installed PWA and admin phone preview", () => {
  const mode = read("src/components/captain/CaptainPwaModeOnly.tsx");
  assert.match(mode, /display-mode: standalone/);
  assert.match(mode, /navigator/);
  assert.match(mode, /window\.parent\.location\.pathname === "\/admin\/pwa"/);
  assert.match(mode, /pwaPreview/);
});

test("route titles stay available without repeated explanatory page chrome", () => {
  const layout = read("src/app/captain/team/[teamid]/layout.tsx");
  const routes = read("src/lib/captain/app-navigation.ts");
  assert.doesNotMatch(layout, /CaptainAppPageFocus/);
  assert.match(layout, /captain-app-web-only/);
  assert.match(layout, /captain-app-secondary/);
  for (const title of ["Fixtures", "Squad", "Squad payments", "Team payments", "Inbox", "Availability", "Match reports", "Matchday squad", "PlayerPool", "Player stats", "SIXFL TV", "Priority score", "Team kit", "Fixture planning", "WhatsApp", "Cup invitations", "Captain agreement", "Match rules", "Captain guide", "Help", "More"]) assert.ok(routes.includes(title), title);
});

test("operational home content remains above compact news", () => {
  const template = read("src/app/captain/team/[teamid]/template.tsx");
  const latest = read("src/components/news/LatestNews.tsx");
  const card = read("src/components/news/NewsCard.tsx");
  assert.match(template, /mode="web"[\s\S]*LatestNews scope="captain"[\s\S]*\{children\}[\s\S]*mode="app"[\s\S]*LatestNews scope="captain"/);
  assert.match(latest, /<NewsCard news=\{items\[0\]\} teamId=\{id\} compact \/>/);
  for (const text of ["Latest from SIXFL", "Read report →", "Your match"]) assert.ok(card.includes(text));
  assert.doesNotMatch(card.match(/if \(compact\)[\s\S]*?return \([\s\S]*?\n  \}/)?.[0] ?? "", /matches[\s\S]*goals/);
});

test("Inbox and Priority retain app-specific presentation", () => {
  const messages = read("src/app/captain/team/[teamid]/messages/page.tsx");
  const priority = read("src/app/captain/team/[teamid]/veo-priority/page.tsx");
  assert.match(messages, /<CaptainPwaModeOnly mode="web">[\s\S]*Team communications/);
  assert.match(messages, /<CaptainPwaModeOnly mode="app">[\s\S]*unread[\s\S]*Mark all read/);
  assert.match(priority, /captain-app-secondary[\s\S]*SIXFL TV[\s\S]*Priority Score/);
});

test("existing screen safeguards survive the home/navigation change", () => {
  const fixtures = read("src/app/captain/team/[teamid]/fixtures/page.tsx");
  const messages = read("src/app/captain/team/[teamid]/messages/page.tsx");
  const results = read("src/app/captain/team/[teamid]/results/page.tsx");
  const matchday = read("src/app/captain/team/[teamid]/match-fees/page.tsx");
  const availability = read("src/app/captain/team/[teamid]/availability/page.tsx");
  const stats = read("src/app/captain/team/[teamid]/player-stats/page.tsx");
  assert.match(fixtures, /captain-app-secondary[\s\S]*Recent results/);
  assert.match(messages, /captain-app-secondary[\s\S]*What is included/);
  assert.match(results, /captain-app-secondary[\s\S]*Find a result/);
  assert.match(matchday, /How availability and fees work together/);
  assert.match(availability, /captain-app-web-only[\s\S]*View availability history/);
  assert.match(stats, /<CaptainPwaModeOnly mode="app">[\s\S]*Squad leaderboard/);
  assert.match(stats, /captain-app-web-only[\s\S]*Season leaderboard/);
});

test("More preserves its grouped destinations and removes design commentary", () => {
  const more = read("src/app/captain/team/[teamid]/more/page.tsx");
  for (const group of ["Matchday", "Team", "SIXFL TV & competitions", "Help"]) assert.ok(more.includes(group));
  for (const label of ["Availability", "Match reports", "Matchday squad", "PlayerPool", "Player stats", "SIXFL TV", "Priority score", "Team payments", "Team kit", "Fixture planning", "WhatsApp tools", "Cup invitations", "Captain Agreement", "Match rules", "Captain guide", "Help / Contact SIXFL", "Team results", "Availability history"]) assert.ok(more.includes(label), label);
  assert.doesNotMatch(more, /SIXFL inbox|Everything that does not need|permanent bottom tab/);
  assert.match(more, /requireCaptain\(teamid\)/);
});


test("Captain Agreement stays available inside the captain app", () => {
  const page = read("src/app/captain/team/[teamid]/agreement/page.tsx");
  const more = read("src/app/captain/team/[teamid]/more/page.tsx");
  const nav = read("src/lib/captain/app-navigation.ts");

  assert.match(page, /requireCaptain\(teamid\)/);
  assert.match(page, /LEAGUE_AGREEMENT_VERSION/);
  assert.match(page, /leagueAgreementSections/);
  assert.match(more, /Captain Agreement/);
  assert.match(more, /\$\{base\}\/agreement/);
  assert.match(nav, /agreement: "Captain agreement"/);
});
