const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");

const appOwnedFiles = [
  "src/components/captain/CaptainAppHomeView.tsx",
  "src/components/captain/CaptainPwaBottomNav.tsx",
  "src/app/captain/team/[teamid]/more/page.tsx",
  "src/components/player/PlayerAppHome.tsx",
  "src/app/player/team/[teamid]/more/page.tsx",
  "src/app/player/team/[teamid]/league-results/page.tsx",
  "src/components/referee/RefereeAppHome.tsx",
  "src/components/referee/RefereeAppShell.tsx",
  "src/app/(public)/referee/more/page.tsx",
];

const forbiddenPublicRoute =
  /\/(?:leagues|teams|pricing|contact|faq|founding-teams|register-interest|venues)(?:\/|["'`?])/;

test("captain, player and referee app-owned screens do not link to public website routes", () => {
  for (const path of appOwnedFiles) {
    const source = fs.readFileSync(path, "utf8");
    assert.doesNotMatch(
      source,
      forbiddenPublicRoute,
      `${path} must keep installed-app navigation inside a portal route`,
    );
  }
});

test("captain matchweek reports use the native captain news route", () => {
  const latestNews = fs.readFileSync("src/components/news/LatestNews.tsx", "utf8");
  const newsCard = fs.readFileSync("src/components/news/NewsCard.tsx", "utf8");
  const captainNews = fs.readFileSync(
    "src/app/captain/team/[teamid]/news/page.tsx",
    "utf8",
  );

  assert.match(
    latestNews,
    /scope === "captain" \|\| scope === "player"/,
  );
  assert.match(
    latestNews,
    /\/\$\{scope\}\/team\/\$\{encodeURIComponent\(id\)\}\/news\?league=/,
  );
  assert.match(newsCard, /urlOverride \?\? newsPath/);
  assert.match(captainNews, /requireCaptain\(teamid\)/);
  assert.doesNotMatch(captainNews, /\/leagues\//);
  assert.doesNotMatch(captainNews, /\/teams\//);
});

test("player league results render natively instead of redirecting to the public league page", () => {
  const source = fs.readFileSync(
    "src/app/player/team/[teamid]/league-results/page.tsx",
    "utf8",
  );

  assert.match(source, /prisma\.fixture\.findMany/);
  assert.match(source, /Latest \{results\.length\} published result/);
  assert.doesNotMatch(source, /redirect\(\`\/leagues\//);
  assert.doesNotMatch(source, /href=.*\/leagues\//);
});
