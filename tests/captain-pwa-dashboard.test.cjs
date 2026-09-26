const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const read = (file) => fs.readFileSync(file, "utf8");

test("captain PWA keeps the real overview calculations and a separate website view", () => {
  const page = read("src/app/captain/team/[teamid]/page.tsx");
  const server = read("src/components/captain/CaptainAppHome.tsx");
  const view = read("src/components/captain/CaptainAppHomeView.tsx");
  const header = read("src/components/captain/CaptainAppHeader.tsx");
  assert.match(page, /<CaptainPwaModeOnly mode="app">[\s\S]*<CaptainAppHome/);
  assert.match(page, /<CaptainPwaModeOnly mode="web">/);
  assert.match(page, /CaptainVeoPriorityCard/);
  assert.match(server, /requireCaptain\(props.teamId\)/);
  assert.match(server, /teamName=\{team.name\}/);
  assert.match(server, /teamLogoUrl=\{team.logoUrl\}/);
  assert.doesNotMatch(view, /<h1>\{teamName\}<\/h1>/);
  assert.match(header, /<strong>\{teamName\}<\/strong>/);
  assert.match(header, /Captain Portal/);
  assert.match(view, /className=\{styles\.matchTeams\}/);
  assert.match(view, /className=\{styles\.actionGrid\}/);
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
  assert.match(header, /const contextLabel = title === "Home" \? "Captain Portal"/);
  assert.match(layout, /<CaptainPwaModeOnly mode="web">[\s\S]*captain-team-header/);
  assert.match(nav, /unreadCount: unreadChatCount/);
  assert.match(nav, /\/chat-unread/);
  for (const label of ["Home", "Fixtures", "Squad", "Payments", "Chat", "More"]) assert.ok(nav.includes(`label: "${label}"`));
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
  for (const title of ["Fixtures", "Squad", "Squad payments", "Team payments", "Chat", "SIXFL inbox", "Availability", "Match reports", "Matchday squad", "PlayerPool", "Player stats", "SIXFL TV", "Priority score", "Team kit", "Fixture planning", "WhatsApp", "Cup invitations", "Captain agreement", "Match rules", "Captain guide", "Help", "More"]) assert.ok(routes.includes(title), title);
});

test("latest news is part of the native Home flow rather than appended after it", () => {
  const template = read("src/app/captain/team/[teamid]/template.tsx");
  const page = read("src/app/captain/team/[teamid]/page.tsx");
  const home = read("src/components/captain/CaptainAppHomeView.tsx");
  const latest = read("src/components/news/LatestNews.tsx");
  const card = read("src/components/news/NewsCard.tsx");

  assert.match(template, /mode="web"[\s\S]*LatestNews scope="captain"[\s\S]*\{children\}/);
  assert.doesNotMatch(template, /mode="app"[\s\S]*LatestNews scope="captain"/);
  assert.match(page, /news=\{<LatestNews scope="captain" presentation="integrated" \/>\}/);
  assert.ok(home.indexOf("styles.newsSlot") < home.indexOf('aria-label="Team tools"'));
  assert.match(latest, /integrated=\{integrated\}/);
  for (const text of ["Latest from SIXFL", "Read report →"]) assert.ok(card.includes(text));
  assert.doesNotMatch(card.match(/if \(compact && integrated\)[\s\S]*?return \([\s\S]*?\n  \}/)?.[0] ?? "", /a\.introduction|bg-emerald-400 px-3\.5/);
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
  for (const label of ["SIXFL inbox", "Availability", "Match reports", "Matchday squad", "PlayerPool", "Player stats", "SIXFL TV", "Priority score", "Team payments", "Team kit", "Fixture planning", "WhatsApp tools", "Cup invitations", "Captain Agreement", "Match rules", "Captain guide", "Help / Contact SIXFL", "Team results", "Availability history"]) assert.ok(more.includes(label), label);
  assert.doesNotMatch(more, /Everything that does not need|permanent bottom tab/);
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


test("captain portal requires the current Captain Agreement but admin previews never accept for captains", () => {
  const layout = read("src/app/captain/team/[teamid]/layout.tsx");
  const action = read("src/app/actions/agreements.ts");

  assert.match(layout, /hasAcceptedCurrentAgreement\(access\.user\.id, "CAPTAIN"\)/);
  assert.match(layout, /<MandatoryAgreementGate[\s\S]*agreementType="CAPTAIN"/);
  assert.match(layout, /!access\.isAdmin/);
  assert.match(layout, /access\.accessMode === "captain"/);
  assert.match(action, /role: TeamRole\.CAPTAIN/);
  assert.match(action, /Only registered captains can accept the Captain Agreement/);
});


test("captain league table is compact and app-native on mobile", () => {
  const table = read("src/components/captain/CaptainDashboardLeagueTable.tsx");
  const page = read("src/app/captain/team/[teamid]/table/page.tsx");
  const home = read("src/components/captain/CaptainAppHomeView.tsx");

  assert.match(table, /Tap a team to see its full record and recent form/);
  assert.match(table, /grid-cols-\[2\.15rem_minmax\(0,1fr\)_2\.25rem_2\.7rem_2\.7rem\]/);
  assert.match(table, /<details[\s\S]*<summary/);
  assert.match(table, />Pos<\/span>[\s\S]*>Team<\/span>[\s\S]*>P<\/span>[\s\S]*>GD<\/span>[\s\S]*>Pts<\/span>/);
  assert.match(table, /currentTeamIds: initialCurrentTeamIds = \[\]/);
  assert.match(page, /currentTeamIds=\{relatedTeamIds\}/);
  assert.match(home, /className=\{styles\.tableShortcut\}/);
  assert.match(home, />League table<\/strong>/);

  const mobileStart = table.indexOf('<div className="lg:hidden">');
  const desktopStart = table.indexOf('<div className="hidden w-full overflow-hidden lg:block">');
  assert.ok(mobileStart >= 0 && desktopStart > mobileStart);
  assert.doesNotMatch(table.slice(mobileStart, desktopStart), /href=\{\`\/teams\//);
});


test("captain squad payments has a native app hub instead of the website dashboard", () => {
  const page = read("src/app/captain/team/[teamid]/player-payments/PaymentPageServer.tsx");
  const gate = read("src/app/captain/team/[teamid]/player-payments/page.tsx");
  const layout = read("src/app/captain/team/[teamid]/player-payments/layout.tsx");

  assert.match(page, /<CaptainPwaModeOnly mode="app">[\s\S]*data-captain-app-payments-native/);
  assert.match(page, /aria-label="Payment shortcuts"/);
  for (const copy of [
    "Player balances",
    "Team payments",
    "Squad details",
    "Credit ledger",
    "Player payments",
    "Send link again",
    "Update player collection",
    "Set up player collection",
  ]) assert.ok(page.includes(copy), copy);
  assert.match(page, /stillToCoverPence > 0[\s\S]*SquadPaymentCollectionForm/);
  assert.match(page, /This fixture is fully covered\. No new player payment links can be created/);

  const appStart = page.indexOf('<CaptainPwaModeOnly mode="app">');
  const webStart = page.indexOf('<CaptainPwaModeOnly mode="web">');
  assert.ok(appStart >= 0 && webStart > appStart);
  const native = page.slice(appStart, webStart);
  assert.doesNotMatch(native, /Collect money from your players|What is happening with this fixture\?/);

  assert.match(gate, /<CaptainPwaModeOnly mode="app">[\s\S]*Payment links need player emails/);
  assert.match(gate, /Fix squad details/);
  assert.match(gate, /<CaptainPwaModeOnly mode="web">[\s\S]*Squad payments not ready/);

  assert.match(layout, /<CaptainPwaModeOnly mode="app">[\s\S]*Guest approvals[\s\S]*Fixture-specific/);
  assert.match(layout, /<details[\s\S]*FixtureGuestApprovals/);
  assert.match(layout, /<CaptainPwaModeOnly mode="web">[\s\S]*FixtureGuestApprovals[\s\S]*\{children\}/);
});


test("portal headers identify the app while Home stays a bottom-nav destination", () => {
  const captainHeader = read("src/components/captain/CaptainAppHeader.tsx");
  const playerHeader = read("src/components/player/PlayerPwaPortalHeader.tsx");
  const refereeHome = read("src/components/referee/RefereeAppHome.tsx");

  assert.match(captainHeader, /Captain Portal/);
  assert.match(playerHeader, /Player Portal · \{teamName\}/);
  assert.match(refereeHome, />\s*Referee Portal\s*</);
  assert.match(read("src/components/captain/CaptainPwaBottomNav.tsx"), /label: "Home"/);
  assert.match(refereeHome, /label: "Home"/);
});
