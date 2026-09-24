const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");

const root = fs.readFileSync("src/app/(admin)/admin/sixfl-tv/page.tsx", "utf8");
const layout = fs.readFileSync("src/app/(admin)/admin/sixfl-tv/layout.tsx", "utf8");
const fixtures = fs.readFileSync("src/app/(admin)/admin/sixfl-tv/fixtures/page.tsx", "utf8");
const settings = fs.readFileSync("src/app/(admin)/admin/sixfl-tv/settings/page.tsx", "utf8");
const weekly = fs.readFileSync("src/app/(admin)/admin/sixfl-tv/goal-of-week/page.tsx", "utf8");
const picker = fs.readFileSync("src/app/(admin)/admin/sixfl-tv/footage/page.tsx", "utf8");
const studio = fs.readFileSync("src/components/admin/sixfl-tv/StudioControls.tsx", "utf8");
const start = fs.readFileSync("src/app/api/admin/sixfl-tv/youtube/start/route.ts", "utf8");
const youtube = fs.readFileSync("src/lib/sixfl-tv/youtube.ts", "utf8");

test("SIXFL TV root and old picker both lead to Fixtures", () => {
  assert.match(root, /redirect\("\/admin\/sixfl-tv\/fixtures"\)/);
  assert.match(picker, /redirect\("\/admin\/sixfl-tv\/fixtures"\)/);
  assert.doesNotMatch(root, /YouTube|Shared SIXFL TV branding|GoalOfWeekAdminPanel|FootageUploader/);
});

test("SIXFL TV navigation is tab-based", () => {
  for (const label of ["Fixtures", "Goal of the Month", "Goal of the Week", "Settings"]) {
    assert.ok(layout.includes(label), `missing tab: ${label}`);
  }
  assert.doesNotMatch(layout, /Upload footage|Published video links|SIXFL TV home/);
});

test("Fixtures owns all match cards and direct footage management", () => {
  assert.match(fixtures, /<h1[^>]*>Fixtures<\/h1>/);
  assert.match(fixtures, /Upload \/ manage footage/);
  assert.match(fixtures, /\/admin\/sixfl-tv\/footage\/\$\{fixture\.id\}/);
  assert.match(fixtures, /LIMIT 200/);
  assert.match(fixtures, /FormListboxField/);
  assert.match(fixtures, /name="league"/);
  assert.match(fixtures, /All leagues/);
  assert.match(fixtures, /f\."sixflTvRecorded" = true/);
  assert.match(fixtures, /f\."leagueId" =/);
  assert.match(fixtures, /border-emerald-400\/45/);
  assert.match(fixtures, /border-red-400\/45/);
  assert.match(fixtures, /bg-emerald-400\/80/);
  assert.match(fixtures, /bg-red-400\/70/);
  assert.match(fixtures, /"Live"/);
  assert.match(fixtures, /"Not live"/);
  assert.match(fixtures, /border-emerald-400\/35/);
  assert.match(fixtures, /border-red-400\/35/);
  assert.match(fixtures, /Video links & display/);
  assert.doesNotMatch(fixtures, /fixture\.status\.toLowerCase\(\)/);
  assert.doesNotMatch(fixtures, /<select\b/);
  assert.doesNotMatch(fixtures, /getYoutubeConnectionStatus|sharedOnly|GoalOfWeekAdminPanel/);
});

test("Settings owns global YouTube and shared branding", () => {
  for (const text of ["Settings", "YouTube", "Check connection", "Shared branding", "Intro and outro"]) {
    assert.ok(settings.includes(text), `missing settings text: ${text}`);
  }
  assert.match(settings, /<FootageUploader initial=\{sharedFootage\} sharedOnly \/>/);
  assert.match(settings, /href="\/api\/admin\/sixfl-tv\/youtube\/start"/);
  assert.doesNotMatch(settings, /Upload \/ manage footage/);
});

test("Goal of the Week owns its editor and archive link", () => {
  assert.match(weekly, /GoalOfWeekAdminPanel/);
  assert.match(weekly, /Historical nominations & voting/);
  assert.match(weekly, /legacy=1/);
});

test("YouTube connection is global rather than fixture-owned", () => {
  assert.match(youtube, /getYoutubeConnectionStatus/);
  assert.match(youtube, /createYoutubeState\(fixtureId: string \| null = null\)/);
  assert.match(start, /rawFixtureId/);
  assert.match(start, /rawFixtureId \? footageId\(rawFixtureId\) : null/);
  assert.match(studio, /Manage YouTube from SIXFL TV/);
  assert.match(studio, /\/admin\/sixfl-tv\/settings/);
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


test("YouTube publishing stays background-only and does not lock the studio", () => {
  assert.match(studio, /YouTube publishing is running in the background/);
  assert.match(studio, /You do not need to keep this match open/);
  assert.match(studio, /href="\/admin\/sixfl-tv\/fixtures"/);
  assert.match(studio, /const activePublishes = useMemo/);
  assert.match(studio, /if \(busy \|\| requestedRenderIsActive\) return/);
  assert.doesNotMatch(studio, /if \(busy \|\| activePublishes\.length > 0\) return/);
  assert.doesNotMatch(studio, /disabled=\{[^}]*activePublishes/);
});

test("thumbnail draft updates cannot create a parent-child render loop", () => {
  assert.match(studio, /const updateThumbnailDraft = useCallback/);
  assert.match(studio, /previous\.headline === draft\.headline/);
  assert.match(studio, /previous\.strapline === draft\.strapline/);
  assert.match(studio, /previous\.showScore === draft\.showScore/);
  assert.match(studio, /onDraftChange=\{updateThumbnailDraft\}/);
  assert.doesNotMatch(studio, /onDraftChange=\{draft => setThumbnailDrafts/);
});
