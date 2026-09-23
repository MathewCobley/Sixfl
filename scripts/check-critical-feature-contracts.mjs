import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const failures = [];
let passed = 0;
const protectedAreas = new Set();

function read(relativePath) {
  const absolutePath = path.join(root, relativePath);
  if (!fs.existsSync(absolutePath)) {
    failures.push(`Missing required file: ${relativePath}`);
    return "";
  }
  return fs.readFileSync(absolutePath, "utf8");
}

function pass(area) {
  protectedAreas.add(area);
  passed += 1;
}

function expectText(area, relativePath, source, needle, description) {
  if (!source.includes(needle)) {
    failures.push(`[${area}] ${description} (${relativePath})`);
    return;
  }
  pass(area);
}

function expectRegex(area, relativePath, source, regex, description) {
  if (!regex.test(source)) {
    failures.push(`[${area}] ${description} (${relativePath})`);
    return;
  }
  pass(area);
}

function walkSource(directory, callback) {
  const absoluteDirectory = path.join(root, directory);
  for (const entry of fs.readdirSync(absoluteDirectory, { withFileTypes: true })) {
    const relativePath = path.posix.join(directory.replaceAll("\\", "/"), entry.name);
    if (entry.isDirectory()) {
      walkSource(relativePath, callback);
      continue;
    }
    if (/\.(ts|tsx)$/.test(entry.name)) callback(relativePath, read(relativePath));
  }
}

// ---------------------------------------------------------------------------
// KITS — submitted designs remain reserved, greyed out and server-protected.
// ---------------------------------------------------------------------------
const kitPagePath = "src/app/captain/team/[teamid]/kit/page.tsx";
const kitFormPath = "src/components/captain/TeamKitOrderForm.tsx";
const legacyKitActionPath = "src/app/captain/team/[teamid]/kit/actions.ts";
const nativeKitActionPath = "src/app/captain/team/[teamid]/kit/save-v2.ts";
const kitAssignmentPatchPath = "scripts/apply-kit-player-assignments.cjs";

const kitPage = read(kitPagePath);
const kitForm = read(kitFormPath);
const legacyKitAction = read(legacyKitActionPath);
const nativeKitAction = read(nativeKitActionPath);
const kitAssignmentPatch = read(kitAssignmentPatchPath);

expectText("kits", kitPagePath, kitPage, "const takenDesignIds = new Set", "captain kit page must load reserved design ids");
expectRegex("kits", kitPagePath, kitPage, /orders\."status"::text NOT IN \('DRAFT', 'CANCELLED'\)/, "draft and cancelled kit orders must not reserve designs");
expectText("kits", kitPagePath, kitPage, "taken: takenDesignIds.has(design.id) && design.id !== selectedDesignId", "kit catalogue must tell the form which designs are taken");
expectText("kits", kitFormPath, kitForm, "taken: boolean;", "kit form design model must include taken state");
expectText("kits", kitFormPath, kitForm, "const unavailable = design.taken && !selected;", "kit form must calculate unavailable designs");
expectText("kits", kitFormPath, kitForm, "disabled={unavailable}", "taken designs must be disabled");
expectText("kits", kitFormPath, kitForm, "aria-disabled={unavailable}", "taken designs must expose disabled state accessibly");
expectRegex("kits", kitFormPath, kitForm, /opacity-35[^\n]*grayscale|grayscale[^\n]*opacity-35/, "taken designs must remain visibly greyed out");
expectRegex("kits", kitFormPath, kitForm, />Taken<\/div>|unavailable \? "Taken" : selected \? "Selected" : "Choose"/, "taken designs must be labelled Taken");
expectText("kits", legacyKitActionPath, legacyKitAction, "designConflict", "legacy kit save action must check for design conflicts");
expectText("kits", legacyKitActionPath, legacyKitAction, 'error: "design_taken"', "legacy kit save action must return design_taken on conflict");
expectText("kits", nativeKitActionPath, nativeKitAction, "KIT_DESIGN_TAKEN", "native V2 kit save action must reject a taken design");
expectText("kits", nativeKitActionPath, nativeKitAction, 'error instanceof Error && error.message === "KIT_DESIGN_TAKEN"', "native V2 kit save action must map conflicts to design_taken");
expectRegex("kits", nativeKitActionPath, nativeKitAction, /other_order\."status"::text NOT IN \('DRAFT', 'CANCELLED'\)/, "native V2 conflict guard must ignore only draft and cancelled orders");
expectRegex("kits", nativeKitActionPath, nativeKitAction, /FOR UPDATE OF league/, "native V2 submissions must serialize design reservation per league");
expectText("kits", kitAssignmentPatchPath, kitAssignmentPatch, 'require("./apply-league-kit-design-lock.cjs");', "kit player-assignment preparation must re-apply league design locking");

// ---------------------------------------------------------------------------
// PAYMENTS — link eligibility, fee override ownership and credit caps.
// ---------------------------------------------------------------------------
const playerPaymentActionPath = "src/app/captain/team/[teamid]/player-payments/actions.ts";
const playerPaymentPagePath = "src/app/captain/team/[teamid]/player-payments/PaymentPageServer.tsx";
const squadEditActionPath = "src/app/captain/team/[teamid]/squad/edit-actions.ts";
const squadEditPagePath = "src/app/captain/team/[teamid]/squad/[membershipId]/edit/page.tsx";
const creditPolicyPath = "src/lib/payments/team-credit-policy.ts";

const playerPaymentAction = read(playerPaymentActionPath);
const playerPaymentPage = read(playerPaymentPagePath);
const squadEditAction = read(squadEditActionPath);
const squadEditPage = read(squadEditPagePath);
const creditPolicy = read(creditPolicyPath);

expectText("payments", playerPaymentActionPath, playerPaymentAction, "selectedMemberIdsForEmailCheck", "player-link creation must resolve the selected players' saved emails");
expectText("payments", playerPaymentActionPath, playerPaymentAction, 'method === "link" && !email', "a payment-link collection must be rejected when the player has no email");
expectText("payments", playerPaymentActionPath, playerPaymentAction, 'error=missing_player_email', "missing-email payment attempts must return the dedicated error state");
expectText("payments", playerPaymentPagePath, playerPaymentPage, "emailRequired:", "captain payment rows must expose missing-email state");
expectText("payments", playerPaymentPagePath, playerPaymentPage, "disabled={ledgerControlled || (player.emailRequired && !player.fee)}", "players without email must not be newly selected for payment links");
expectText("payments", playerPaymentPagePath, playerPaymentPage, "Email required — add an email before sending a payment link", "missing-email reason must remain visible to captains");

expectText("payments", squadEditActionPath, squadEditAction, "const nextPlayerMatchFeeOverride = access.isAdmin", "captains must not be able to change player fee overrides server-side");
expectText("payments", squadEditActionPath, squadEditAction, "TeamMemberFeeOverrideAudit", "player fee override changes must retain an audit trail");
expectRegex("payments", squadEditPagePath, squadEditPage, /\{access\.isAdmin \? \([\s\S]{0,1600}name="playerMatchFeeOverride"/, "player fee override control must remain inside the admin-only UI block");
expectRegex("payments", squadEditPagePath, squadEditPage, /Match fee settings? · Admin only[\s\S]{0,2200}name="playerMatchFeeCap"/, "admin-only maximum player charge control must remain available");

expectText("payments", creditPolicyPath, creditPolicy, 'team.teamMode !== "STANDARD"', "team credit policy must remain limited to standard teams");
expectText("payments", creditPolicyPath, creditPolicy, "positivePence(team.standardMatchFeePence) || fixtureFeePence", "team credit must remain capped from the standard/fixture match fee");
expectText("payments", creditPolicyPath, creditPolicy, "applyExistingTeamCreditToChargeFirst", "existing team credit must continue to be consumed before new collection");
expectText("payments", creditPolicyPath, creditPolicy, "Math.max(creditCapPence - creditBalancePence, 0)", "credit headroom must never exceed the one-match-fee cap");
expectText("payments", creditPolicyPath, creditPolicy, "Math.max(Math.round(input.outstandingFixturePence), 0)", "maximum new collection must remain based on outstanding fixture balance plus credit headroom");

// ---------------------------------------------------------------------------
// PLAYER IDENTITY — never merge differently named people just because an email
// address is shared. The email lock also prevents two concurrent activations
// from racing through the identity check.
// ---------------------------------------------------------------------------
const identitySafetyPath = "src/lib/players/player-identity-safety.ts";
const managedJoinPath = "src/app/squad/join/[token]/page.tsx";
const activationPath = "src/app/squad/activate/[token]/page.tsx";
const identitySafety = read(identitySafetyPath);
const managedJoin = read(managedJoinPath);
const activation = read(activationPath);

expectText("player identity", identitySafetyPath, identitySafety, 'code: "SHARED_EMAIL_DIFFERENT_PLAYER"', "shared-email conflicts must keep a dedicated identity-conflict result");
expectText("player identity", identitySafetyPath, identitySafety, 'SELECT pg_advisory_xact_lock(hashtext($1))', "player login email checks must be serialized to avoid concurrent duplicate-account races");
expectText("player identity", identitySafetyPath, identitySafety, "differentProspectOnThisTeam", "a different prospect on the same team must remain a hard identity conflict");
expectText("player identity", identitySafetyPath, identitySafety, "existingHasName && !namesMatch && !exactProspectLink", "differently named existing accounts must not be reused solely by email");
expectText("player identity", identitySafetyPath, identitySafety, "PlayerDuplicateAttempt", "blocked identity collisions must remain auditable");
expectText("player identity", managedJoinPath, managedJoin, "resolveProspectPlayerAccount", "managed squad joining must pass through central player identity safety");
expectText("player identity", managedJoinPath, managedJoin, 'source: "SHARED_EMAIL_ACCOUNT_PENDING"', "managed squad joins with an identity conflict must remain pending rather than merging people");
expectText("player identity", activationPath, activation, "resolveProspectPlayerAccount", "signed-in squad activation must pass through central player identity safety");
expectText("player identity", activationPath, activation, "This email already belongs to a different player account", "activation must visibly stop when a shared email belongs to a different player");

// ---------------------------------------------------------------------------
// LEAGUE TABLES — one central standings service, no second calculator silently
// reintroduced by a new page.
// ---------------------------------------------------------------------------
const standingsPath = "src/lib/standings.ts";
const standings = read(standingsPath);
expectText("standings", standingsPath, standings, "getLeagueStandings", "central standings service must retain the league standings entry point");
expectText("standings", standingsPath, standings, "getTeamStanding", "central standings service must retain the team standing entry point");

const standingsViolations = [];
walkSource("src", (relativePath, source) => {
  if (relativePath === "src/lib/leagueTable.ts" || relativePath === standingsPath) return;
  const directImport = source
    .split("\n")
    .some(
      (line) =>
        !/^\s*import\s+type\b/.test(line) &&
        (line.includes('from "@/lib/leagueTable"') || line.includes("from '@/lib/leagueTable'")),
    );
  if (directImport) standingsViolations.push(`${relativePath}: direct @/lib/leagueTable import`);
  if (relativePath.includes("/leagues/") && /\bfunction\s+buildLeagueTable\s*\(/.test(source)) {
    standingsViolations.push(`${relativePath}: local buildLeagueTable() calculator`);
  }
});
if (standingsViolations.length) {
  failures.push(`[standings] central standings ownership broken: ${standingsViolations.join("; ")}`);
} else {
  pass("standings");
}

// LEAGUE PUBLICATION — admins can prepare future leagues without exposing them
// publicly before the scheduled UK go-live time. Draft fixture status remains
// the existing safety boundary for payment, reminder and chase automation.
// ---------------------------------------------------------------------------
const leagueSchemaPath = "prisma/schema.prisma";
const leagueMigrationPath = "prisma/migrations/20260921234000_schedule_league_publication/migration.sql";
const leagueFormPath = "src/components/admin/leagues/LeagueForm.tsx";
const leagueActionsPath = "src/app/(admin)/admin/leagues/actions.ts";
const publicLeagueLayoutPath = "src/app/(public)/leagues/[slug]/layout.tsx";
const publicLeagueDirectoryPath = "src/app/(public)/leagues/page.tsx";
const homepageLeaguesPath = "src/lib/leagues/homepage-leagues.ts";
const fixtureGeneratePath = "src/app/(admin)/admin/fixtures/generate/page.tsx";
const sitemapPath = "src/app/sitemap.ts";

const leagueSchema = read(leagueSchemaPath);
const leagueMigration = read(leagueMigrationPath);
const leagueForm = read(leagueFormPath);
const leagueActions = read(leagueActionsPath);
const publicLeagueLayout = read(publicLeagueLayoutPath);
const publicLeagueDirectory = read(publicLeagueDirectoryPath);
const homepageLeagues = read(homepageLeaguesPath);
const fixtureGenerate = read(fixtureGeneratePath);
const sitemap = read(sitemapPath);

expectText("league publication", leagueSchemaPath, leagueSchema, "publicAt DateTime?", "league model must retain a scheduled public go-live");
expectText("league publication", leagueMigrationPath, leagueMigration, 'SET "publicAt" = "createdAt"', "existing leagues must be backfilled as already public");
expectText("league publication", leagueFormPath, leagueForm, 'name="publicAt"', "admin league form must expose the go-live control");
expectText("league publication", leagueFormPath, leagueForm, "Leave blank to keep this league private", "admin form must explain private pre-launch behaviour");
expectText("league publication", leagueActionsPath, leagueActions, "parsePublicAt", "server action must parse the scheduled UK go-live");
expectText("league publication", publicLeagueLayoutPath, publicLeagueLayout, "publicAt: { lte: new Date() }", "direct public league routes must stay closed before go-live");
expectText("league publication", publicLeagueDirectoryPath, publicLeagueDirectory, "publicAt: { lte: new Date() }", "public league directory must exclude scheduled leagues");
expectText("league publication", homepageLeaguesPath, homepageLeagues, 'league."publicAt" <= NOW()', "homepage league directory must respect go-live");
expectText("league publication", fixtureGeneratePath, fixtureGenerate, "{ publicAt: null }", "private active leagues must remain available in admin fixture generation");
expectText("league publication", fixtureGeneratePath, fixtureGenerate, "{ publicAt: { gt: new Date() } }", "future scheduled leagues must remain available in admin fixture generation");
expectText("league publication", sitemapPath, sitemap, "publicAt: { lte: new Date() }", "scheduled leagues must stay out of the public sitemap");

// ---------------------------------------------------------------------------
// REFEREE CASH — duplicate/over-limit cash stays blocked, but validation must
// return the referee to the night with a clear explanation instead of crashing.
// ---------------------------------------------------------------------------
const refereeCashActionsPath = "src/app/(public)/referee/actions.ts";
const refereeCashPagePath = "src/app/(public)/referee/night/[id]/page.tsx";
const refereeCashActions = read(refereeCashActionsPath);
const refereeCashPage = read(refereeCashPagePath);

expectText("referee cash", refereeCashActionsPath, refereeCashActions, "redirectCashEntryError", "referee cash validation must return the user to the night instead of throwing a blank server-error page");
expectText("referee cash", refereeCashActionsPath, refereeCashActions, "existingNightCashPence", "rejected duplicate cash must carry already-recorded cash context back to the referee");
expectText("referee cash", refereeCashActionsPath, refereeCashActions, "remainingPence > 0 || allocations.length === 0", "cash above the remaining team balance must stay blocked");
expectRegex("referee cash", refereeCashActionsPath, refereeCashActions, /create:\s*\{[\s\S]{0,700}amountPence: fixtureFeePence/, "fallback referee cash charge must use the fixture fee, never the amount handed to the referee");
expectText("referee cash", refereeCashPagePath, refereeCashPage, "Cash was not recorded", "cash validation errors must be visible inline on the referee night");
expectText("referee cash", refereeCashPagePath, refereeCashPage, "Already recorded tonight:", "the cash form must make previously recorded cash obvious before another entry is submitted");
expectText("referee cash", refereeCashPagePath, refereeCashPage, "check that you are not entering the same cash twice", "duplicate-cash errors must explain the likely cause");

// ---------------------------------------------------------------------------
// PLAYER PWA — keep the approved app-style first screen compact, data-backed,
// and exact in admin player preview.
// ---------------------------------------------------------------------------
const playerAppHomePath = "src/components/player/PlayerAppHome.tsx";
const playerAppPagePath = "src/app/player/team/[teamid]/page.tsx";
const playerAppNavPath = "src/components/player/PlayerTeamNav.tsx";
const playerAppMorePath = "src/app/player/team/[teamid]/more/page.tsx";
const playerAppChatPath = "src/app/player/team/[teamid]/chat/page.tsx";
const portalChatApiPath = "src/app/api/portal-chat/team/[teamid]/route.ts";
const playerChatUnreadApiPath = "src/app/api/player/team/[teamid]/chat-unread/route.ts";
const playerAppTvPath = "src/app/player/team/[teamid]/tv/page.tsx";
const playerAppReferralsPath = "src/app/player/team/[teamid]/referrals/page.tsx";
const playerAppLeagueRulesPath = "src/app/player/team/[teamid]/league-rules/page.tsx";
const playerAppMatchRulesPath = "src/app/player/team/[teamid]/match-rules/page.tsx";
const playerAppHelpPath = "src/app/player/team/[teamid]/help/page.tsx";
const playerAppSwitchAccountPath = "src/app/player/team/[teamid]/switch-account/page.tsx";
const playerAppHome = read(playerAppHomePath);
const playerAppPage = read(playerAppPagePath);
const playerAppNav = read(playerAppNavPath);
const playerAppMore = read(playerAppMorePath);
const playerAppChat = read(playerAppChatPath);
const portalChatApi = read(portalChatApiPath);
const playerChatUnreadApi = read(playerChatUnreadApiPath);
const playerAppTv = read(playerAppTvPath);
const playerAppReferrals = read(playerAppReferralsPath);
const playerAppLeagueRules = read(playerAppLeagueRulesPath);
const playerAppMatchRules = read(playerAppMatchRulesPath);
const playerAppHelp = read(playerAppHelpPath);
const playerAppSwitchAccount = read(playerAppSwitchAccountPath);

expectText("player pwa", playerAppHomePath, playerAppHome, 'resultsHref = `${fixturesHref}#recent-results`', "player app recent-form navigation must stay inside the Fixtures app screen");
expectRegex("player pwa", playerAppHomePath, playerAppHome, /^(?![\s\S]*\/player\/referrals)[\s\S]*$/, "player app home must not link out to the website referral page");
expectText("player pwa", playerAppHomePath, playerAppHome, "Recent form", "player app home must retain compact recent form");
expectText("player pwa", playerAppHomePath, playerAppHome, 'title: "SIXFL Chat"', "player PWA Home must retain the SIXFL Chat quick action");
expectText("player pwa", playerAppHomePath, playerAppHome, "body: unreadMessageLabel", "player PWA Home must show Messages or the unread count on the chat tile");
expectText("player pwa", playerAppPagePath, playerAppPage, "getTeamMemberProfilesByTeamMemberIds", "player app home must use the existing player profile source");
expectText("player pwa", playerAppPagePath, playerAppPage, "getPortalChatUnreadCount", "player app home must use shared portal-chat unread logic");
expectText("player pwa", playerAppPagePath, playerAppPage, "prisma.fixtureSelection.findFirst", "player app home must use saved fixture selection data");
expectText("player pwa", playerAppHomePath, playerAppHome, "NOT SELECTED YET", "player app home must keep non-final selection wording safe");
expectText("player pwa", playerAppHomePath, playerAppHome, "NOT IN SQUAD", "player app home must expose explicit final non-selection when known");
expectText("player pwa", playerAppHomePath, playerAppHome, "unreadMessageLabel", "player app home must surface unread SIXFL Chat status");
expectText("player pwa", playerAppNavPath, playerAppNav, 'label: "Chat"', "player app bottom navigation must keep Chat permanent");
expectText("player pwa", playerAppNavPath, playerAppNav, 'label: "Payments"', "player app bottom navigation must expose Payments");
expectText("player pwa", playerAppNavPath, playerAppNav, 'label: "More"', "player app bottom navigation must keep More");
expectRegex("player pwa", playerAppNavPath, playerAppNav, /const appTabs[\s\S]*label: "Chat"[\s\S]*label: "Payments"[\s\S]*label: "More"/, "player app bottom navigation must keep Home, Fixtures, Chat, Payments and More in the primary set");
expectRegex("player pwa", playerAppNavPath, playerAppNav, /^(?![\s\S]*label: "Stats")[\s\S]*$/, "Stats must not replace permanent Chat in the player app bottom navigation");
expectText("player pwa", playerChatUnreadApiPath, playerChatUnreadApi, "getPortalChatUnreadCount", "player app nav unread badge must use the shared chat unread source");
expectRegex("player pwa", portalChatApiPath, portalChatApi, /^(?![\s\S]*Whole Squad Chat is not available yet)[\s\S]*$/, "linked players must not be blocked by the old chat dark-launch gate");
expectText("player pwa", playerAppChatPath, playerAppChat, "user.teamMembers.length === 0", "player chat must allow linked players while rejecting unrelated users");
expectText("player pwa", playerAppMorePath, playerAppMore, 'label: "My stats"', "More must keep player stats as a secondary destination");
expectText("player pwa", playerAppMorePath, playerAppMore, 'label: "SIXFL TV"', "More must keep SIXFL TV as an app destination");
expectText("player pwa", playerAppMorePath, playerAppMore, 'label: "Refer a team · £75"', "More must keep referrals as an app destination");
expectRegex("player pwa", playerAppMorePath, playerAppMore, /^(?![\s\S]*label: "Payments")(?![\s\S]*label: "Recent results")[\s\S]*$/, "More must not duplicate permanent bottom tabs or Fixtures content");
expectText("player pwa", playerAppTvPath, playerAppTv, '<PlayerPwaModeOnly mode="app">', "SIXFL TV must have a dedicated app presentation");
expectText("player pwa", playerAppReferralsPath, playerAppReferrals, "Player app", "referrals opened from More must stay inside the player app");
expectText("player pwa", playerAppMorePath, playerAppMore, 'label: "League Rules"', "More must expose app-native League Rules");
expectText("player pwa", playerAppMorePath, playerAppMore, 'label: "Match Rules"', "More must expose app-native Match Rules");
expectText("player pwa", playerAppMorePath, playerAppMore, 'label: "Help / Contact SIXFL"', "More must expose app-native Help / Contact SIXFL");
expectText("player pwa", playerAppMorePath, playerAppMore, 'label: "Switch team account"', "More must use the exact Switch team account wording");
expectText("player pwa", playerAppMorePath, playerAppMore, "linkedTeamAccounts.length > 1", "Switch team account must only appear for multi-team players");
expectText("player pwa", playerAppLeagueRulesPath, playerAppLeagueRules, "PlayerAppRulesPage", "League Rules must use the compact player app rules view");
expectText("player pwa", playerAppMatchRulesPath, playerAppMatchRules, "PlayerAppRulesPage", "Match Rules must use the compact player app rules view");
expectText("player pwa", playerAppHelpPath, playerAppHelp, "conversation=sixfl", "Help / Contact SIXFL must open the private SIXFL conversation inside Chat");
expectText("player pwa", playerAppSwitchAccountPath, playerAppSwitchAccount, "getPlayerTeamMembershipsByUserId", "Switch team account must use shared multi-team membership data");
expectText("player pwa", playerAppSwitchAccountPath, playerAppSwitchAccount, "Switch team account", "team switch screen must use the requested account wording");

// ---------------------------------------------------------------------------
// ADMIN PWA VIEWER — keep the selected test subject and phone-preview route
// when an administrator leaves and returns to the diagnostics page.
// ---------------------------------------------------------------------------
const adminPwaViewerPath = "src/components/admin/pwa/PwaViewerPicker.tsx";
const adminPwaDiagnosticsPath = "src/components/admin/PwaDiagnosticsPanel.tsx";
const adminPwaViewer = read(adminPwaViewerPath);
const adminPwaDiagnostics = read(adminPwaDiagnosticsPath);

expectText("admin pwa viewer", adminPwaViewerPath, adminPwaViewer, "sixfl-admin-pwa-viewer-selection-v1", "viewer picker must persist the selected captain/player/referee");
expectText("admin pwa viewer", adminPwaViewerPath, adminPwaViewer, "window.localStorage.getItem", "viewer picker must restore persisted test subjects");
expectText("admin pwa viewer", adminPwaViewerPath, adminPwaViewer, "storedMembership?.membershipId", "restored player selection must be validated against the restored team");
expectText("admin pwa viewer", adminPwaDiagnosticsPath, adminPwaDiagnostics, "sixfl-admin-pwa-preview-path-v1", "phone preview must remember the last selected viewer route");
expectText("admin pwa viewer", adminPwaDiagnosticsPath, adminPwaDiagnostics, "previewPathHydrated", "stored preview route must be restored before persistence writes defaults");

// ---------------------------------------------------------------------------
// PLAYERPOOL — keep the native captain discovery/introduction workflow visible.
// ---------------------------------------------------------------------------
const playerPoolPagePath = "src/app/captain/team/[teamid]/player-pool/page.tsx";
const playerPoolPage = read(playerPoolPagePath);
expectText("PlayerPool", playerPoolPagePath, playerPoolPage, "PLAYER_POOL_LOGO_URL", "captain PlayerPool page must retain its branded native header");
expectText("PlayerPool", playerPoolPagePath, playerPoolPage, "Players for {team.name}", "captains must retain the team-specific PlayerPool view");
expectText("PlayerPool", playerPoolPagePath, playerPoolPage, "requestPlayerPoolIntroductionAction", "captains must retain the introduction-request action");
expectText("PlayerPool", playerPoolPagePath, playerPoolPage, "addPlayerPoolPlayerToSquadAction", "approved PlayerPool introductions must retain the add-to-squad action");

// ---------------------------------------------------------------------------
// COMMUNICATIONS — queue confirmation must not wait for non-critical history
// mirroring or immediate provider processing.
// ---------------------------------------------------------------------------
const afterResponsePath = "src/lib/server/after-response.ts";
const teamBulkCommunicationsPath = "src/app/(admin)/admin/communications/team-bulk-actions.ts";
const allTeamCommunicationsPath = "src/app/(admin)/admin/communications/all-team-actions.ts";
const sharedTeamBroadcastPath = "src/lib/communications/send-team-broadcast.ts";

const afterResponse = read(afterResponsePath);
const teamBulkCommunications = read(teamBulkCommunicationsPath);
const allTeamCommunications = read(allTeamCommunicationsPath);
const sharedTeamBroadcast = read(sharedTeamBroadcastPath);

expectText("communications", afterResponsePath, afterResponse, 'import { after } from "next/server";', "after-response work must use the supported Next.js lifecycle");
expectText("communications", afterResponsePath, afterResponse, "await task();", "after-response tasks must remain awaited inside the lifecycle callback");
expectText("communications", teamBulkCommunicationsPath, teamBulkCommunications, "await Promise.all(", "multi-recipient team communications must queue independent recipients concurrently");
expectText("communications", teamBulkCommunicationsPath, teamBulkCommunications, 'runAfterResponse("team-communications-history"', "message-thread history must not delay the queue confirmation");
expectText("communications", sharedTeamBroadcastPath, sharedTeamBroadcast, "deferThreadHistory?: boolean;", "shared team broadcasts must support deferred history mirroring");
expectText("communications", sharedTeamBroadcastPath, sharedTeamBroadcast, 'runAfterResponse("team-broadcast-thread-history"', "deferred team-broadcast history must use after-response execution");
expectText("communications", allTeamCommunicationsPath, allTeamCommunications, 'runAfterResponse("selected-team-notification-processing"', "selected-team provider processing must not hold the browser response open");

// ---------------------------------------------------------------------------
// CAPTAIN FIXTURE PLANNING — the overview prompt must advertise both full-week
// unavailability and one-off kick-off time restrictions.
// ---------------------------------------------------------------------------
const captainTeamNudgesPath = "src/components/captain/CaptainTeamNudges.tsx";
const captainWeeksUnavailablePath = "src/app/captain/team/[teamid]/weeks-unavailable/page.tsx";
const captainTeamNudges = read(captainTeamNudgesPath);
const captainWeeksUnavailable = read(captainWeeksUnavailablePath);

expectText("captain fixture planning", captainTeamNudgesPath, captainTeamNudges, "need a specific kick-off time?", "captain overview must mention future kick-off time needs");
expectText("captain fixture planning", captainTeamNudgesPath, captainTeamNudges, "one-off kick-off time such as after 8pm", "captain overview must explain the time restriction example");
expectText("captain fixture planning", captainTeamNudgesPath, captainTeamNudges, "data-team-week-unavailability-callout", "native planning prompt must suppress stale legacy bridge duplication");
expectText("captain fixture planning", captainWeeksUnavailablePath, captainWeeksUnavailable, "need a specific kick-off time", "fixture-planning page heading must cover time restrictions");
expectText("captain fixture planning", captainWeeksUnavailablePath, captainWeeksUnavailable, "Temporary time restriction", "fixture-planning page must retain the actual time-restriction control");

// ---------------------------------------------------------------------------
// TEAM REFERRALS — the £75 scheme must stay discoverable and the registration
// handoff must continue carrying the referring player's code into the lead.
// ---------------------------------------------------------------------------
const playerReferralPagePath = "src/app/player/referrals/page.tsx";
const playerTeamNavPath = "src/components/player/PlayerTeamNav.tsx";
const homepagePath = "src/app/(public)/page.tsx";
const referralPreparationPath = "scripts/apply-team-referral-rewards.cjs";

const playerReferralPage = read(playerReferralPagePath);
const playerTeamNav = read(playerTeamNavPath);
const homepage = read(homepagePath);
const referralPreparation = read(referralPreparationPath);

expectText("team referrals", playerReferralPagePath, playerReferralPage, "Refer a team and earn £75", "player referral reward page must remain available");
expectText("team referrals", playerReferralPagePath, playerReferralPage, "register-interest?type=team&ref=", "player referral page must generate a team-registration link containing the referral code");
expectText("team referrals", playerTeamNavPath, playerTeamNav, 'href: "/player/referrals"', "player navigation must permanently expose the referral page");
expectText("team referrals", playerTeamNavPath, playerTeamNav, "Refer a team · £75", "player navigation must clearly advertise the £75 team referral reward");
expectText("team referrals", homepagePath, homepage, 'href: "/player/referrals"', "public homepage must expose the referral scheme");
expectText("team referrals", homepagePath, homepage, "Refer a team · Earn £75", "homepage referral entry point must explain the reward");
expectText("team referrals", referralPreparationPath, referralPreparation, "attachReferralToLead", "registration preparation must continue attaching valid referral codes to team leads");
expectText("team referrals", referralPreparationPath, referralPreparation, 'name="referralCode"', "team registration must continue carrying the referral code through the form");

// ---------------------------------------------------------------------------
// DRAFT FIXTURE NOTIFICATIONS — deleting an unpublished fixture must remain
// silent. Draft fixtures have never been communicated to teams.
// ---------------------------------------------------------------------------
const fixtureCancellationNotificationsPath = "src/lib/fixtures/cancellation-notifications.ts";
const deleteFixtureActionPath = "src/app/(admin)/admin/fixtures/delete-fixture-action.ts";
const fixtureCancellationNotifications = read(fixtureCancellationNotificationsPath);
const deleteFixtureAction = read(deleteFixtureActionPath);

expectText("draft fixture notifications", fixtureCancellationNotificationsPath, fixtureCancellationNotifications, "publishedAt: Date | null", "fixture cancellation notification input must carry publication state");
expectText("draft fixture notifications", fixtureCancellationNotificationsPath, fixtureCancellationNotifications, "if (!fixture.publishedAt)", "cancellation helper must reject unpublished fixtures before resolving recipients");
expectText("draft fixture notifications", deleteFixtureActionPath, deleteFixtureAction, "publishedAt: true", "fixture deletion must read publication state before deleting the fixture");
expectText("draft fixture notifications", deleteFixtureActionPath, deleteFixtureAction, "fixture.publishedAt", "fixture deletion must only queue cancellation mail for a published fixture");

// ---------------------------------------------------------------------------
// PLAYER PAYMENT-LINK HISTORY — player ledgers must retain every issued link,
// record opens, and preserve removed links as permanent audit history.
// ---------------------------------------------------------------------------
const playerPaymentLinkSchemaPath = "prisma/schema.prisma";
const playerPaymentLinkMigrationPath = "prisma/migrations/20260922235500_player_payment_link_history/migration.sql";
const playerPaymentLinkOpenPath = "src/lib/payments/player-payment-link-history.ts";
const publicPlayerPaymentLinkPagePath = "src/app/pay/player-match-fee/[token]/page.tsx";
const playerLedgerPath = "src/app/player/team/[teamid]/ledger/page.tsx";
const playerLedgerAppPath = "src/components/player/PlayerAppPayments.tsx";
const playerLedgerStatementPath = "src/components/payments/PlayerLedgerStatement.tsx";

const playerPaymentLinkSchema = read(playerPaymentLinkSchemaPath);
const playerPaymentLinkMigration = read(playerPaymentLinkMigrationPath);
const playerPaymentLinkOpen = read(playerPaymentLinkOpenPath);
const publicPlayerPaymentLinkPage = read(publicPlayerPaymentLinkPagePath);
const playerLedgerPage = read(playerLedgerPath);
const playerLedgerApp = read(playerLedgerAppPath);
const playerLedgerStatement = read(playerLedgerStatementPath);

expectText("player payment link history", playerPaymentLinkSchemaPath, playerPaymentLinkSchema, "model PlayerPaymentLinkHistory", "schema must retain permanent player payment-link history");
expectText("player payment link history", playerPaymentLinkSchemaPath, playerPaymentLinkSchema, "@@unique([feeId, paymentToken])", "each unique fee/token link must have one lifecycle row");
expectText("player payment link history", playerPaymentLinkMigrationPath, playerPaymentLinkMigration, "NOTIFICATION_BACKFILL", "migration must recover historical links from stored notification metadata");
expectText("player payment link history", playerPaymentLinkMigrationPath, playerPaymentLinkMigration, "exact removal time was not recorded", "legacy removed links must state when an exact timestamp is unavailable");
expectText("player payment link history", playerPaymentLinkMigrationPath, playerPaymentLinkMigration, "Player payment-link history is permanent", "link-history rows must not be deletable");
expectText("player payment link history", playerPaymentLinkOpenPath, playerPaymentLinkOpen, '"openCount"="PlayerPaymentLinkHistory"."openCount"+1', "opening a payment link must increment its audit counter");
expectText("player payment link history", publicPlayerPaymentLinkPagePath, publicPlayerPaymentLinkPage, "recordPlayerPaymentLinkOpened", "the real payment page must record link opens");
expectText("player payment link history", playerLedgerPath, playerLedgerPage, "account.paymentLinks", "player ledger route must load link history from the account");
expectText("player payment link history", playerLedgerAppPath, playerLedgerApp, "Payment link history", "player app ledger must display all recorded payment links");
expectText("player payment link history", playerLedgerStatementPath, playerLedgerStatement, "Payment link history", "web ledger statement must display link history");
expectText("player payment link history", playerLedgerAppPath, playerLedgerApp, "Every recorded player payment link stays here, even after it is removed.", "player app must explain that removed links remain in history");

if (failures.length) {
  console.error("\nSIXFL CRITICAL FEATURE CONTRACTS FAILED\n");
  for (const failure of failures) console.error(` - ${failure}`);
  console.error(
    "\nDo not merge this change. Restore the existing behaviour or deliberately update the contract with an approved product change.\n",
  );
  process.exit(1);
}

console.log(`SIXFL critical feature contracts passed (${passed} assertions).`);
console.log(`Protected areas: ${Array.from(protectedAreas).join(", ")}.`);
