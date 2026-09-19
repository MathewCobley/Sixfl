const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");

const fixturesPage = fs.readFileSync("src/app/(admin)/admin/sixfl-tv/fixtures/page.tsx", "utf8");
const analytics = fs.readFileSync("src/lib/sixfl-tv/analytics.ts", "utf8");

test("SIXFL TV fixture cards show current YouTube views and growth", () => {
  assert.match(fixturesPage, /getSixflTvVideoViewMetrics/);
  assert.match(fixturesPage, /views/);
  assert.match(fixturesPage, /last 7 days/);
  assert.match(fixturesPage, /since tracking/);
  assert.match(fixturesPage, /Views pending/);
  assert.match(fixturesPage, /Total ·/);
});

test("seven-day growth comes from stored metric snapshots, not guessed API history", () => {
  assert.match(analytics, /SixflTvYoutubeMetricSnapshot/);
  assert.match(analytics, /sevenDaysAgo/);
  assert.match(analytics, /capturedAt\.getTime\(\) <= sevenDaysAgo/);
  assert.match(analytics, /hasSevenDayBaseline/);
  assert.match(analytics, /trackingStartedAt/);
  assert.doesNotMatch(fixturesPage, /googleapis\.com\/youtube/);
});
