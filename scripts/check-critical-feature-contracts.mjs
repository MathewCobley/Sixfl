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

// ---------------------------------------------------------------------------
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
// PLAYER PWA — keep the approved app-style first screen compact, data-backed
// and chat-dark-launched for real players.
// ---------------------------------------------------------------------------
const playerAppHomePath = "src/components/player/PlayerAppHome.tsx";
const playerAppPagePath = "src/app/player/team/[teamid]/page.tsx";
const playerAppNavPath = "src/components/player/PlayerTeamNav.tsx";
const playerAppHome = read(playerAppHomePath);
const playerAppPage = read(playerAppPagePath);
const playerAppNav = read(playerAppNavPath);

expectText("player pwa", playerAppHomePath, playerAppHome, "Refer a new team and earn £75", "player app home must retain the referral banner");
expectText("player pwa", playerAppHomePath, playerAppHome, "Recent form", "player app home must retain compact recent form");
expectText("player pwa", playerAppHomePath, playerAppHome, 'title: "SIXFL Chat"', "admin preview must retain the SIXFL Chat tile");
expectText("player pwa", playerAppHomePath, playerAppHome, 'title: "My Stats"', "live players must receive a safe non-chat fourth tile");
expectText("player pwa", playerAppPagePath, playerAppPage, "getTeamMemberProfilesByTeamMemberIds", "player app home must use the existing player profile source");
expectText("player pwa", playerAppPagePath, playerAppPage, 'showTeamChat={user.role === UserRole.ADMIN}', "real players must not have Team Chat enabled before launch");
expectText("player pwa", playerAppNavPath, playerAppNav, 'label: "Payments"', "player app bottom navigation must expose Payments");
expectText("player pwa", playerAppNavPath, playerAppNav, 'label: "More"', "player app bottom navigation must keep More");

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
