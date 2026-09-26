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

  assert.ok(
    latest.includes(
      "/${scope}/team/${encodeURIComponent(id)}/news?league=",
    ),
  );
  assert.ok(card.includes("const url = articleHref ?? newsPath"));
  assert.ok(captainNews.includes("requireCaptain(teamid)"));
  assert.ok(captainNews.includes("getPublishedNews"));
  assert.ok(captainNews.includes("listPublishedNews"));
  assert.equal(captainNews.includes("/leagues/"), false);
});

test("captain app rules, Goal of the Month and recruitment stay in the portal", () => {
  const guide = read("src/app/captain/team/[teamid]/guide/page.tsx");
  const priority = read("src/app/captain/team/[teamid]/veo-priority/page.tsx");
  const more = read("src/app/captain/team/[teamid]/more/page.tsx");
  const prospects = read("src/app/captain/team/[teamid]/prospects/page.tsx");
  const priorityCard = read("src/components/captain/CaptainVeoPriorityCard.tsx");
  const leagueRules = read("src/app/captain/team/[teamid]/league-rules/page.tsx");
  const goalOfMonth = read(
    "src/app/captain/team/[teamid]/goal-of-the-month/page.tsx",
  );

  assert.ok(guide.includes("/captain/team/${team.id}/league-rules"));
  assert.equal(guide.includes('href="/league-rules"'), false);

  assert.ok(priority.includes("/captain/team/${teamid}/goal-of-the-month"));
  assert.equal(priority.includes("/goal-of-the-month?from=captain"), false);
  assert.ok(priorityCard.includes("/captain/team/${teamId}/goal-of-the-month"));
  assert.equal(priorityCard.includes('href="/goal-of-the-month"'), false);

  for (const route of ["news", "goal-of-the-month", "league-rules"]) {
    assert.ok(more.includes("${base}/" + route), route);
  }

  assert.ok(prospects.includes("CopyToClipboardButton"));
  assert.ok(prospects.includes("Copy signup link"));
  assert.equal(prospects.includes("<a href={joinUrl"), false);
  assert.equal(prospects.includes("Open signup link"), false);
  assert.equal(prospects.includes("Open join page"), false);

  assert.ok(leagueRules.includes("requireCaptain(teamid)"));
  assert.ok(leagueRules.includes('title="League Rules"'));
  assert.ok(goalOfMonth.includes("requireCaptain(teamid)"));
  assert.ok(goalOfMonth.includes("<MonthlyGoalsPanel playerApp />"));
});

test("player installed-app routes stay inside the player portal", () => {
  const home = read("src/components/player/PlayerAppHome.tsx");
  const nav = read("src/components/player/PlayerTeamNav.tsx");
  const more = read("src/app/player/team/[teamid]/more/page.tsx");
  const availability = read(
    "src/app/player/team/[teamid]/availability/page.tsx",
  );

  assert.ok(home.includes("/player/team/${teamId}/news"));
  assert.ok(more.includes("/player/team/${teamid}/news"));
  assert.ok(more.includes("/player/team/${teamid}/goal-of-the-month"));
  assert.ok(more.includes("/player/team/${teamid}/league-rules"));
  assert.ok(more.includes("/player/team/${teamid}/match-rules"));

  const webTabs = nav.slice(nav.indexOf("const tabs"), nav.indexOf("const appTabs"));
  const appTabs = nav.slice(
    nav.indexOf("const appTabs"),
    nav.indexOf("export default"),
  );
  assert.equal(webTabs.includes("/goal-of-the-month?from=player"), false);
  assert.ok(webTabs.includes("/player/team/${teamId}/goal-of-the-month"));
  assert.ok(webTabs.includes("/player/team/${teamId}/referrals"));
  assert.equal(appTabs.includes("/leagues/"), false);
  assert.equal(appTabs.includes('href: "/goal-of-the-month'), false);
  assert.equal(appTabs.includes('href: "/league-rules"'), false);
  assert.equal(appTabs.includes('href: "/match-rules"'), false);

  const appGate = availability.indexOf('<PlayerPwaModeOnly mode="app">');
  const webGate = availability.indexOf('<PlayerPwaModeOnly mode="web">');
  const publicLeagueLink = availability.indexOf("href={`/leagues/");
  assert.ok(appGate >= 0);
  assert.ok(webGate > appGate);
  assert.ok(publicLeagueLink > webGate);
});

test("referee installed-app navigation stays inside referee routes", () => {
  const home = read("src/components/referee/RefereeAppHome.tsx");
  const shell = read("src/components/referee/RefereeAppShell.tsx");
  const more = read("src/app/(public)/referee/more/page.tsx");

  for (const source of [home, shell, more]) {
    assert.equal(source.includes('href="/leagues/'), false);
    assert.equal(source.includes('href="/league-rules"'), false);
    assert.equal(source.includes('href="/match-rules"'), false);
    assert.equal(source.includes('href="/goal-of-the-month'), false);
  }

  assert.ok(home.includes('href="/referee/match-rules"'));
  assert.ok(more.includes('href: "/referee/league-rules"'));
  assert.ok(more.includes('href: "/referee/agreement"'));
  assert.ok(shell.includes('href: "/referee/nights"'));
  assert.ok(shell.includes('href: "/referee/availability"'));
  assert.ok(shell.includes('href: "/referee/ledger"'));
});
