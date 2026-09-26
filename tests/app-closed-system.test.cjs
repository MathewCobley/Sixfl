const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");

function read(path) {
  return fs.readFileSync(path, "utf8");
}

test("captain app newsletters never hand off to the public league website", () => {
  const latest = read("src/components/news/LatestNews.tsx");
  const card = read("src/components/news/NewsCard.tsx");
  const captainNews = read("src/app/captain/team/[teamid]/news/page.tsx");

  assert.match(
    latest,
    /\/${scope}\/team\/${encodeURIComponent\(id\)}\/news\?league=/,
  );
  assert.match(card, /const url = articleHref \?\? newsPath/);
  assert.match(captainNews, /requireCaptain\(teamid\)/);
  assert.match(captainNews, /getPublishedNews/);
  assert.match(captainNews, /listPublishedNews/);
  assert.doesNotMatch(captainNews, /href=\{?["'\x60]\/leagues\//);
});

test("captain app rules, Goal of the Month and recruitment stay in the portal", () => {
  const guide = read("src/app/captain/team/[teamid]/guide/page.tsx");
  const priority = read("src/app/captain/team/[teamid]/veo-priority/page.tsx");
  const more = read("src/app/captain/team/[teamid]/more/page.tsx");
  const prospects = read("src/app/captain/team/[teamid]/prospects/page.tsx");
  const leagueRules = read("src/app/captain/team/[teamid]/league-rules/page.tsx");
  const goalOfMonth = read(
    "src/app/captain/team/[teamid]/goal-of-the-month/page.tsx",
  );

  assert.match(guide, /\/captain\/team\/${team\.id}\/league-rules/);
  assert.doesNotMatch(guide, /href="\/league-rules"/);

  assert.match(
    priority,
    /\/captain\/team\/${teamid}\/goal-of-the-month/,
  );
  assert.doesNotMatch(priority, /\/goal-of-the-month\?from=captain/);

  for (const route of [
    "news",
    "goal-of-the-month",
    "league-rules",
  ]) {
    assert.match(more, new RegExp("\\/captain\\/team|\\$\\{base\\}\\/" + route));
  }

  assert.match(prospects, /CopyToClipboardButton/);
  assert.match(prospects, /Copy signup link/);
  assert.doesNotMatch(prospects, /<a href=\{joinUrl/);
  assert.doesNotMatch(prospects, /Open signup link|Open join page/);

  assert.match(leagueRules, /requireCaptain\(teamid\)/);
  assert.match(leagueRules, /title="League Rules"/);
  assert.match(goalOfMonth, /requireCaptain\(teamid\)/);
  assert.match(goalOfMonth, /<MonthlyGoalsPanel playerApp \/>/);
});

test("player installed-app routes stay inside the player portal", () => {
  const home = read("src/components/player/PlayerAppHome.tsx");
  const nav = read("src/components/player/PlayerTeamNav.tsx");
  const more = read("src/app/player/team/[teamid]/more/page.tsx");
  const availability = read(
    "src/app/player/team/[teamid]/availability/page.tsx",
  );

  assert.match(home, /\/player\/team\/${teamId}\/news/);
  assert.match(more, /\/player\/team\/${teamid}\/news/);
  assert.match(more, /\/player\/team\/${teamid}\/goal-of-the-month/);
  assert.match(more, /\/player\/team\/${teamid}\/league-rules/);
  assert.match(more, /\/player\/team\/${teamid}\/match-rules/);

  const appTabs = nav.slice(nav.indexOf("const appTabs"), nav.indexOf("export default"));
  assert.doesNotMatch(appTabs, /\/leagues\//);
  assert.doesNotMatch(appTabs, /href:\s*"\/(?!player\/team\/|dashboard)/);

  assert.match(
    availability,
    /<PlayerPwaModeOnly mode="app">[\s\S]*<PlayerAppFixtures/,
  );
  assert.match(
    availability,
    /<PlayerPwaModeOnly mode="web">[\s\S]*href=\{\`\/leagues\//,
  );
});

test("referee installed-app navigation stays inside referee routes", () => {
  const home = read("src/components/referee/RefereeAppHome.tsx");
  const shell = read("src/components/referee/RefereeAppShell.tsx");
  const more = read("src/app/(public)/referee/more/page.tsx");

  for (const source of [home, shell, more]) {
    assert.doesNotMatch(source, /href="\/leagues\//);
    assert.doesNotMatch(source, /href="\/league-rules"/);
    assert.doesNotMatch(source, /href="\/match-rules"/);
    assert.doesNotMatch(source, /href="\/goal-of-the-month/);
  }

  assert.match(home, /href="\/referee\/match-rules"/);
  assert.match(more, /href:\s*"\/referee\/league-rules"/);
  assert.match(more, /href:\s*"\/referee\/agreement"/);
  assert.match(shell, /href:\s*"\/referee\/nights"/);
  assert.match(shell, /href:\s*"\/referee\/availability"/);
  assert.match(shell, /href:\s*"\/referee\/ledger"/);
});
