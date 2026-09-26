const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");

function read(path) {
  return fs.readFileSync(path, "utf8");
}

const latestNews = read("src/components/news/LatestNews.tsx");
const newsCard = read("src/components/news/NewsCard.tsx");
const captainHome = read("src/components/captain/CaptainAppHomeView.tsx");
const captainHeader = read("src/components/captain/CaptainAppHeader.tsx");
const captainBottomNav = read("src/components/captain/CaptainPwaBottomNav.tsx");
const captainMore = read("src/app/captain/team/[teamid]/more/page.tsx");
const captainPriority = read("src/app/captain/team/[teamid]/veo-priority/page.tsx");
const captainNews = read("src/app/captain/team/[teamid]/news/page.tsx");
const playerHome = read("src/components/player/PlayerAppHome.tsx");
const playerNav = read("src/components/player/PlayerTeamNav.tsx");
const playerMore = read("src/app/player/team/[teamid]/more/page.tsx");
const playerLeagueResults = read("src/app/player/team/[teamid]/league-results/page.tsx");
const refereeHome = read("src/components/referee/RefereeAppHome.tsx");
const refereeShell = read("src/components/referee/RefereeAppShell.tsx");
const refereeMore = read("src/app/(public)/referee/more/page.tsx");

const publicSiteRoute = /["'`](?:\/leagues\/|\/teams\/|\/goal-of-the-month\?|\/goal-of-the-week\?|\/pricing(?:["'`/?#])|\/faq(?:["'`/?#])|\/contact(?:["'`/?#])|\/venues(?:["'`/?#])|\/register-(?:interest|team)|\/founding-teams|\/privacy-policy|\/safeguarding(?:["'`/?#]))/;

test("captain app navigation stays inside portal routes", () => {
  for (const source of [captainHome, captainHeader, captainBottomNav, captainMore]) {
    assert.doesNotMatch(source, publicSiteRoute);
  }

  assert.match(captainMore, /\$\{base\}\/news/);
  assert.match(captainMore, /\$\{base\}\/goal-of-the-month/);
  assert.match(captainPriority, /\/captain\/team\/\$\{teamid\}\/goal-of-the-month/);
  assert.doesNotMatch(captainPriority, /\/goal-of-the-month\?from=captain/);
  assert.match(captainNews, /Matchweek reports/);
});

test("compact Matchweek news cards use portal-native destinations", () => {
  assert.match(latestNews, /compactHref=/);
  assert.match(latestNews, /\/\$\{scope\}\/team\/\$\{encodeURIComponent\(id\)\}\/news/);
  assert.match(newsCard, /const compactUrl = compactHref \?\? url/);

  const compactSection = newsCard.slice(
    newsCard.indexOf("if (compact && integrated)"),
    newsCard.indexOf("  return (", newsCard.indexOf("if (compact)", newsCard.indexOf("if (compact && integrated)") + 1) + 1),
  );
  assert.match(compactSection, /href=\{compactUrl\}/);
  assert.doesNotMatch(compactSection, /href=\{url\}/);
});

test("player app navigation stays inside player or app-switch routes", () => {
  for (const source of [playerHome, playerMore]) {
    assert.doesNotMatch(source, publicSiteRoute);
  }

  assert.doesNotMatch(playerNav, /\/goal-of-the-month\?from=player/);
  assert.match(playerNav, /\/player\/team\/\$\{teamId\}\/goal-of-the-month/);
  assert.doesNotMatch(playerLeagueResults, /redirect\(\s*\x60\/leagues\//);
  assert.doesNotMatch(playerLeagueResults, /href=.*\/leagues\//);
  assert.match(playerLeagueResults, /League results/);
});

test("referee app navigation stays inside referee or app-switch routes", () => {
  for (const source of [refereeHome, refereeShell, refereeMore]) {
    assert.doesNotMatch(source, publicSiteRoute);
  }

  assert.match(refereeShell, /href="\/dashboard\?app=1"/);
  assert.match(refereeShell, /href: "\/referee\/more"/);
});
