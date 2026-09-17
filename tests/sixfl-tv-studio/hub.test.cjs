const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");

const page = fs.readFileSync("src/app/(admin)/admin/sixfl-tv/page.tsx", "utf8");
const layout = fs.readFileSync("src/app/(admin)/admin/sixfl-tv/layout.tsx", "utf8");
const studio = fs.readFileSync("src/components/admin/sixfl-tv/StudioControls.tsx", "utf8");
const start = fs.readFileSync("src/app/api/admin/sixfl-tv/youtube/start/route.ts", "utf8");
const youtube = fs.readFileSync("src/lib/sixfl-tv/youtube.ts", "utf8");

test("main SIXFL TV page is the media hub", () => {
  for (const text of [
    "SIXFL TV control centre",
    "Published videos",
    "Upload & process matches",
    "Goal of the Month",
    "Goal of the Week",
    "YouTube",
    "Shared SIXFL TV branding",
    "Intro and outro — upload once",
  ]) assert.ok(page.includes(text), `missing hub text: ${text}`);

  assert.match(page, /href="\/admin\/sixfl-tv\/footage"/);
  assert.match(page, /href="\/admin\/sixfl-tv\/goal-of-month"/);
  assert.match(page, /href="\/admin\/sixfl-tv\/goal-of-week\?legacy=1"/);
  assert.match(page, /href="\/api\/admin\/sixfl-tv\/youtube\/start"/);
  assert.match(page, /Upload \/ manage footage/);
  assert.match(page, /\/admin\/sixfl-tv\/footage\/\$\{fixture\.id\}/);
  assert.match(page, /<FootageUploader initial=\{sharedFootage\} sharedOnly \/>/);
});

test("SIXFL TV navigation exposes the core tools on every media page", () => {
  assert.match(layout, /SIXFL TV home/);
  assert.match(layout, /Upload footage/);
  assert.match(layout, /Goal of the Month/);
  assert.match(layout, /Goal of the Week archive/);
});

test("YouTube connection is global rather than fixture-owned", () => {
  assert.match(youtube, /getYoutubeConnectionStatus/);
  assert.match(youtube, /createYoutubeState\(fixtureId: string \| null = null\)/);
  assert.match(start, /rawFixtureId/);
  assert.match(start, /rawFixtureId \? footageId\(rawFixtureId\) : null/);
  assert.match(studio, /Manage YouTube from SIXFL TV/);
  assert.doesNotMatch(studio, /youtube\/start\?fixtureId/);
});


test("shared branding is no longer managed inside a fixture", () => {
  const uploader = fs.readFileSync("src/components/admin/sixfl-tv/FootageUploader.tsx", "utf8");
  const sharedRoute = fs.readFileSync("src/app/api/admin/sixfl-tv/footage/shared/route.ts", "utf8");
  assert.match(uploader, /sharedOnly/);
  assert.match(uploader, /\/api\/admin\/sixfl-tv\/footage\/shared/);
  assert.doesNotMatch(uploader, /Shared intro and outro — upload once/);
  assert.match(sharedRoute, /beginFootage\(null/);
  assert.match(sharedRoute, /putFootagePart\(null/);
  assert.match(sharedRoute, /removeFootage\(null/);
});
