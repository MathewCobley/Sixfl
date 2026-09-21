const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");

const read = (file) => fs.readFileSync(file, "utf8");

test("player PWA home follows the approved compact dashboard hierarchy", () => {
  const home = read("src/components/player/PlayerAppHome.tsx");

  assert.match(home, /teamLogoUrl/);
  assert.match(home, /playerImageUrl/);
  assert.match(home, /squadNumber/);
  assert.match(home, /preferredPosition/);
  assert.match(home, /Matches/);
  assert.match(home, /Goals/);
  assert.match(home, /Assists/);
  assert.match(home, /Next match/);
  assert.match(home, /My Fixtures/);
  assert.match(home, /Availability/);
  assert.match(home, /Match Fees/);
  assert.match(home, /Recent form/);
  assert.match(home, /Refer a new team and earn £75/);
});

test("Player PWA Home always exposes SIXFL Chat while admin preview keeps the same Home content", () => {
  const home = read("src/components/player/PlayerAppHome.tsx");
  const page = read("src/app/player/team/[teamid]/page.tsx");
  const nav = read("src/components/player/PlayerTeamNav.tsx");

  assert.match(home, /title: "SIXFL Chat"/);
  assert.match(home, /body: unreadMessageLabel/);
  assert.doesNotMatch(home, /title: "My Stats"/);
  assert.doesNotMatch(page, /showTeamChat=/);
  assert.match(nav, /effectiveShowTeamChat = showTeamChat && !previewMembershipId/);
});

test("player app bottom navigation stays to five primary destinations", () => {
  const nav = read("src/components/player/PlayerTeamNav.tsx");

  assert.match(nav, /label: "Home"/);
  assert.match(nav, /label: "Fixtures"/);
  assert.match(nav, /label: "Payments"/);
  assert.match(nav, /label: "More"/);
  assert.doesNotMatch(nav, /label: "TV",/);
});

test("player PWA home uses real profile and performance data", () => {
  const page = read("src/app/player/team/[teamid]/page.tsx");

  assert.match(page, /getTeamMemberProfilesByTeamMemberIds/);
  assert.match(page, /PlayerMatchPerformance/);
  assert.match(page, /squadNumber=\{playerProfile\?\.squadNumber/);
  assert.match(page, /preferredPosition=\{playerProfile\?\.preferredPositions/);
  assert.match(page, /stats=\{playerAppStats\}/);
  assert.match(page, /recentResults=\{recentResults\}/);
});


test("player PWA CSS never hides the dashboard just because it contains the referral link", () => {
  const header = read("src/components/player/PlayerPwaPortalHeader.tsx");

  assert.doesNotMatch(
    header,
    /section:has\(a\[href=["']\\\/player\\\/referrals["']\]\)/,
  );
});


test("player PWA keeps the first-screen actions compact and recent form tidy", () => {
  const home = read("src/components/player/PlayerAppHome.tsx");

  assert.match(home, /min-h-\[4\.75rem\]/);
  assert.match(home, /grid grid-cols-5 gap-1\.5/);
  assert.match(home, /recentResults\.slice\(0, 5\)/);
  assert.doesNotMatch(home, /min-w-\[8\.2rem\]/);
});


test("player appearances are backfilled from reliable completed-match evidence", () => {
  const migration = read(
    "prisma/migrations/20260921233000_backfill_player_appearances/migration.sql",
  );

  assert.match(migration, /FixtureSelection/);
  assert.match(migration, /selectionStatus" = 'SELECTED'/);
  assert.match(migration, /PlayerMatchFee/);
  assert.match(migration, /'PAID', 'WAIVED'/);
  assert.match(migration, /source" = 'CAPTAIN_RECORDED'/);
  assert.match(migration, /MatchResult_sync_inferred_appearances/);
  assert.match(migration, /FixtureSelection_sync_inferred_appearance/);
  assert.match(migration, /PlayerMatchFee_sync_inferred_appearance/);
  assert.doesNotMatch(migration, /'OPEN', 'PAID', 'WAIVED'/);
});


test("player PWA header stays clean and team badges render without white discs", () => {
  const header = read("src/components/player/PlayerPwaPortalHeader.tsx");
  const home = read("src/components/player/PlayerAppHome.tsx");

  assert.doesNotMatch(header, /leagueName|teamLabel|season/);
  assert.doesNotMatch(header, /rounded-full border border-white\/10 bg-white/);
  assert.doesNotMatch(home, /rounded-full border border-white\/10 bg-white/);
  assert.doesNotMatch(home, /rounded-full bg-white/);
});

test("recent form includes each opponent badge without adding opponent-name clutter", () => {
  const home = read("src/components/player/PlayerAppHome.tsx");
  const page = read("src/app/player/team/[teamid]/page.tsx");

  assert.match(home, /opponentLogoUrl/);
  assert.match(home, /max-h-4 max-w-4 object-contain/);
  assert.match(page, /opponentLogoUrl: isHome \? fixture\.awayTeam\.logoUrl : fixture\.homeTeam\.logoUrl/);
  assert.match(page, /homeTeam: \{ select: \{ name: true, logoUrl: true \} \}/);
  assert.match(page, /awayTeam: \{ select: \{ name: true, logoUrl: true \} \}/);
});

test("next fixture selection status comes from FixtureSelection and uses safe player wording", () => {
  const home = read("src/components/player/PlayerAppHome.tsx");
  const page = read("src/app/player/team/[teamid]/page.tsx");

  assert.match(page, /prisma\.fixtureSelection\.findFirst/);
  assert.match(page, /selectionStatus: true/);
  assert.match(page, /nextSelection\?\.selectionStatus === "SELECTED"/);
  assert.match(page, /nextSelection\?\.selectionStatus === "NOT_IN_SQUAD"/);
  assert.doesNotMatch(
    page,
    /selectionStatus === "NOT_SELECTED"[\s\S]{0,120}"NOT_IN_SQUAD"/,
  );
  assert.match(home, /label: "SELECTED"/);
  assert.match(home, /label: "NOT SELECTED YET"/);
  assert.match(home, /label: "NOT IN SQUAD"/);
});

test("player Home uses shared portal-chat unread logic for the previewed player's identity", () => {
  const home = read("src/components/player/PlayerAppHome.tsx");
  const page = read("src/app/player/team/[teamid]/page.tsx");
  const unread = read("src/lib/portal-messaging.ts");

  assert.match(unread, /export async function getPortalChatUnreadCount/);
  assert.match(page, /getPortalChatUnreadCount/);
  assert.match(page, /userId: membership\.user\.id/);
  assert.match(page, /role: membership\.role/);
  assert.match(home, /unreadChatCount/);
  assert.match(home, /unread message/);
  assert.match(home, /unreadChatCount > 99 \? "99\+" : unreadChatCount/);
});
