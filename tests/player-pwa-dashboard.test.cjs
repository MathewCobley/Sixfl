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
  assert.doesNotMatch(home, /\/player\/referrals/);
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

test("player app bottom navigation keeps Chat permanent and moves Stats into More", () => {
  const nav = read("src/components/player/PlayerTeamNav.tsx");
  const appTabs = nav.slice(nav.indexOf("const appTabs"), nav.indexOf("export default"));

  assert.match(appTabs, /label: "Home"/);
  assert.match(appTabs, /label: "Fixtures"/);
  assert.match(appTabs, /label: "Chat"/);
  assert.match(appTabs, /label: "Payments"/);
  assert.match(appTabs, /label: "More"/);
  assert.doesNotMatch(appTabs, /label: "Stats"/);
  assert.doesNotMatch(appTabs, /label: "TV"/);
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



test("player PWA stats follow the same player across recreated team records", () => {
  const page = read("src/app/player/team/[teamid]/page.tsx");

  assert.match(page, /normaliseHistoricalTeamName/);
  assert.match(page, /historicalTeamIds/);
  assert.match(page, /historical_member\."userId" = \$\{membership\.user\.id\}/);
  assert.match(page, /performance\."teamId" IN/);
  assert.doesNotMatch(
    page,
    /WHERE performance\."teamMemberId" = \$\{membership\.id\}\s+AND performance\."teamId" = \$\{teamid\}/,
  );
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

test("player PWA fixtures uses a dedicated mobile-first layout", () => {
  const page = read("src/app/player/team/[teamid]/availability/page.tsx");
  const app = read("src/components/player/PlayerAppFixtures.tsx");

  assert.match(page, /PlayerPwaModeOnly mode="app"/);
  assert.match(page, /<PlayerAppFixtures/);
  assert.match(page, /PlayerPwaModeOnly mode="web"/);
  assert.match(app, /Next match/);
  assert.match(app, /Upcoming fixtures/);
  assert.match(app, /Recent results/);
  assert.match(app, /Fixture updates/);
  assert.match(app, /Join waiting list/);
  assert.match(app, /Send withdrawal request/);
  assert.doesNotMatch(app, /Choose fixture/);
});

test("player PWA fixtures shows availability and real saved selection state", () => {
  const page = read("src/app/player/team/[teamid]/availability/page.tsx");
  const actions = read("src/app/player/team/[teamid]/availability/actions.ts");
  const app = read("src/components/player/PlayerAppFixtures.tsx");

  assert.match(page, /selections:\s*\{/);
  assert.match(page, /selectionStatus: true/);
  assert.match(page, /selectionStatus === "SELECTED"/);
  assert.match(app, /Not selected yet/);
  assert.match(app, /Not in squad/);
  assert.match(app, /You're selected/);
  assert.match(app, /Can you play\?/);
  assert.match(actions, /selectionStatus: "SELECTED"/);
  assert.match(actions, /input\.fixture\.selections\.map/);
});

test("player PWA fixtures surfaces cancellations and keeps results inside the app", () => {
  const page = read("src/app/player/team/[teamid]/availability/page.tsx");
  const app = read("src/components/player/PlayerAppFixtures.tsx");

  assert.match(page, /status: FixtureStatus\.CANCELLED/);
  assert.match(page, /status: FixtureStatus\.COMPLETED/);
  assert.match(app, /id="recent-results"/);
  assert.match(app, /Cancelled/);
  assert.doesNotMatch(app, /league-results/);
  assert.doesNotMatch(app, /Match highlights/);
  assert.doesNotMatch(page, /sixflTvUrl: true/);
  assert.match(page, /Confirm availability/);
  assert.match(page, /Choose fixture/);
});



test("player PWA navigation is a closed app and does not expose public website links", () => {
  const home = read("src/components/player/PlayerAppHome.tsx");
  const fixtures = read("src/components/player/PlayerAppFixtures.tsx");
  const more = read("src/app/player/team/[teamid]/more/page.tsx");
  const nav = read("src/components/player/PlayerTeamNav.tsx");
  const appTabs = nav.slice(nav.indexOf("const appTabs"), nav.indexOf("export default"));

  for (const source of [home, fixtures, more, appTabs]) {
    assert.doesNotMatch(source, /\/leagues\//);
    assert.doesNotMatch(source, /["'`]\/goal-of-the-month/);
    assert.doesNotMatch(source, /\/player\/referrals/);
    assert.doesNotMatch(source, /href=["']\/faq/);
  }

  assert.doesNotMatch(more, /Open full SIXFL website/);
  assert.doesNotMatch(more, /href=["']\/["']/);
  assert.match(home, /resultsHref = `\$\{fixturesHref\}#recent-results`/);
  assert.match(more, /\/stats/);
  assert.match(more, /\/tv/);
  assert.match(more, /\/referrals/);
  assert.doesNotMatch(more, /\/ledger/);
  assert.doesNotMatch(more, /recent-results/);
});

test("player Stats has a dedicated mobile PWA presentation while web stats remain available", () => {
  const page = read("src/app/player/team/[teamid]/stats/page.tsx");
  const app = read("src/components/player/PlayerAppStats.tsx");

  assert.match(page, /PlayerPwaModeOnly mode="app"/);
  assert.match(page, /<PlayerAppStats/);
  assert.match(page, /PlayerPwaModeOnly mode="web"/);
  assert.match(page, /previewMembershipId/);
  assert.match(app, /Your season/);
  assert.match(app, /Team leaders/);
  assert.match(app, /Squad leaderboard/);
  assert.match(app, /Recent matches/);
  assert.match(app, /G\+A/);
  assert.doesNotMatch(app, /<table/);
  assert.doesNotMatch(app, /href=/);
});


test("permanent Player Chat is available to linked players and unread nav checks are read-only", () => {
  const page = read("src/app/player/team/[teamid]/chat/page.tsx");
  const api = read("src/app/api/portal-chat/team/[teamid]/route.ts");
  const unreadApi = read("src/app/api/player/team/[teamid]/chat-unread/route.ts");
  const nav = read("src/components/player/PlayerTeamNav.tsx");

  assert.match(page, /user\.role !== UserRole\.ADMIN && user\.teamMembers\.length === 0/);
  assert.doesNotMatch(api, /Whole Squad Chat is not available yet/);
  assert.match(unreadApi, /getPortalChatUnreadCount/);
  assert.match(unreadApi, /previewMembershipId/);
  assert.doesNotMatch(unreadApi, /portalConversationRead\.upsert/);
  assert.match(nav, /chat-unread/);
  assert.match(nav, /setInterval\(refreshUnreadCount, 30000\)/);
});

test("More contains only secondary app-native destinations", () => {
  const more = read("src/app/player/team/[teamid]/more/page.tsx");
  const tv = read("src/app/player/team/[teamid]/tv/page.tsx");
  const referrals = read("src/app/player/team/[teamid]/referrals/page.tsx");
  const stats = read("src/app/player/team/[teamid]/stats/page.tsx");
  const leagueRules = read("src/app/player/team/[teamid]/league-rules/page.tsx");
  const matchRules = read("src/app/player/team/[teamid]/match-rules/page.tsx");
  const help = read("src/app/player/team/[teamid]/help/page.tsx");
  const switchAccount = read("src/app/player/team/[teamid]/switch-account/page.tsx");

  assert.match(more, /My stats/);
  assert.match(more, /SIXFL TV/);
  assert.match(more, /label: "Goal of the Month"/);
  assert.match(more, /withPreview\(`\/player\/team\/\$\{teamid\}\/goal-of-the-month`, previewMembershipId\)/);
  assert.match(more, /Refer a team · £75/);
  assert.match(more, /League Rules/);
  assert.match(more, /Match Rules/);
  assert.match(more, /Help \/ Contact SIXFL/);
  assert.match(more, /Switch team account/);
  assert.match(more, /linkedTeamAccounts\.length > 1/);
  assert.doesNotMatch(more, /label: "Payments"/);
  assert.doesNotMatch(more, /label: "Recent results"/);

  assert.match(stats, /PlayerPwaModeOnly mode="app"/);
  assert.match(tv, /PlayerPwaModeOnly mode="app"/);
  assert.match(tv, /PlayerPwaModeOnly mode="web"/);
  assert.match(referrals, /Player app/);
  assert.match(referrals, /\/player\/team\/\$\{teamid\}\/referrals/);
  assert.match(leagueRules, /PlayerAppRulesPage/);
  assert.match(matchRules, /PlayerAppRulesPage/);
  assert.match(help, /conversation=sixfl/);
  assert.match(switchAccount, /Switch team account/);
  assert.match(switchAccount, /getPlayerTeamMembershipsByUserId/);
  assert.match(switchAccount, /VIEWING/);
  assert.match(switchAccount, /SWITCH/);
});
