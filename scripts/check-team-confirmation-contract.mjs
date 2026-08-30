import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const failures = [];

function read(relativePath) {
  const absolutePath = path.join(root, relativePath);
  if (!fs.existsSync(absolutePath)) {
    failures.push(`Missing required file: ${relativePath}`);
    return "";
  }
  return fs.readFileSync(absolutePath, "utf8");
}

function expect(condition, message) {
  if (!condition) failures.push(message);
}

const pagePath = "src/app/(public)/team-confirmation/[token]/page.tsx";
const confirmationPath = "src/lib/leads/teamPlaceConfirmation.ts";
const commitmentEmailActionPath =
  "src/app/(admin)/admin/leads/team-commitment-email-actions.ts";
const reassuranceActionPath =
  "src/app/(admin)/admin/leads/reassurance-email-actions.ts";
const reassuranceSeedPath = "scripts/seed-league-starter-email-template.cjs";
const captainFixturePagePath =
  "src/app/captain/team/[teamid]/fixtures/page.tsx";
const fixtureConfirmationEmailPath =
  "src/lib/fixtures/confirmation-emails.ts";
const fixtureConfirmationReminderPath =
  "src/lib/fixtures/confirmation-reminders.ts";
const teamUnavailablePreparationPath =
  "scripts/apply-team-unavailability-response-copy.cjs";
const sourcePreparationPath =
  "scripts/apply-issue-raised-confirmation-chase-fix.cjs";
const teamUnavailableMigrationPath =
  "prisma/migrations/20260830125000_clarify_team_unavailable_online_response/migration.sql";

const page = read(pagePath);
const confirmation = read(confirmationPath);
const commitmentEmailAction = read(commitmentEmailActionPath);
const reassuranceAction = read(reassuranceActionPath);
const reassuranceSeed = read(reassuranceSeedPath);
const captainFixturePage = read(captainFixturePagePath);
const fixtureConfirmationEmail = read(fixtureConfirmationEmailPath);
const fixtureConfirmationReminder = read(fixtureConfirmationReminderPath);
const teamUnavailablePreparation = read(teamUnavailablePreparationPath);
const sourcePreparation = read(sourcePreparationPath);
const teamUnavailableMigration = read(teamUnavailableMigrationPath);

expect(
  page.includes("getLeagueConfirmationDetails") && page.includes("const effectiveLeague ="),
  "team decision page must load live prospective/current league details",
);
expect(
  !page.includes("Tuesday 8 July") && !page.includes("£40 per team per match"),
  "team decision page must not reintroduce hard-coded launch date or fee details",
);
expect(
  page.includes("async function confirmTeamCommitmentAction") &&
    page.includes('name="teamName"') &&
    page.includes('name="squadSize"'),
  "the positive team decision must collect the team name and approximate squad size",
);
expect(
  page.includes("YES — I WANT TO ENTER A TEAM") &&
    page.includes("No — I’m not entering a team"),
  "team leads must have clear positive and negative decision actions",
);
expect(
  page.includes("We do not need your name, email, phone number or area again"),
  "the team decision page must not ask an existing lead to repeat contact details",
);
expect(
  page.includes("async function saveTeamNameAction") && page.includes("data: { teamName }"),
  "confirmed leads must be able to save or correct their team name on the lead",
);
expect(
  page.includes("Team name not decided yet?") &&
    page.includes("you can add the team name here when it is decided"),
  "leads must be allowed to commit before their team name is final",
);
expect(
  page.includes("convertedTeamId") && page.includes("if (lead.convertedTeamId)"),
  "team-name editing and lead decisions must stop once an actual SIXFL team exists",
);
expect(
  commitmentEmailAction.includes("your team name, if you have chosen one") &&
    commitmentEmailAction.includes("roughly how many players you currently have"),
  "the short commitment email must explain the useful details requested on the decision page",
);
expect(
  commitmentEmailAction.includes("there is no long-term contract tying your team in"),
  "the commitment email must retain the no-contract reassurance",
);

expect(
  reassuranceAction.includes(
    'const TEAM_REASSURANCE_SMS_TEMPLATE_KEY = "team-lead-reassurance-sms"',
  ) && reassuranceAction.includes("DEFAULT_SMS_BODY"),
  "the reassurance flow must define a dedicated editable system SMS template",
);
expect(
  !reassuranceAction.includes("export const TEAM_REASSURANCE"),
  "the reassurance server-action module must export only async actions",
);
expect(
  reassuranceAction.includes(
    "We’ve just emailed you the full details for {{leagueName}}",
  ) && reassuranceAction.includes("check your junk or spam folder"),
  "the automatic SMS must tell the lead to look for the reassurance email",
);
expect(
  reassuranceAction.includes(
    "emailDispatch.status === NotificationDispatchStatus.QUEUED",
  ) &&
    reassuranceAction.includes(
      "templateKey: TEAM_REASSURANCE_SMS_TEMPLATE_KEY",
    ),
  "the reassurance SMS must only queue after the reassurance email has queued",
);
expect(
  reassuranceAction.includes('smsStatus = "NO_PHONE"') &&
    reassuranceAction.includes("This lead does not have a phone number"),
  "a missing phone number must not prevent the reassurance email from being sent",
);
expect(
  reassuranceAction.includes("logNotificationDispatchToThread({ dispatch: smsDispatch, recipient })"),
  "the automatic reassurance SMS must be recorded in communications history",
);
expect(
  reassuranceSeed.includes("team-lead-reassurance-sms") &&
    reassuranceSeed.includes("Team lead reassurance SMS") &&
    reassuranceSeed.includes("channel: 'SMS'"),
  "the reassurance SMS must be seeded into System Templates",
);
expect(
  reassuranceAction.includes("✅ Games recorded and displayed on YouTube") &&
    !reassuranceAction.includes("✅ A properly structured local competition"),
  "the reassurance email fallback must advertise recorded games on YouTube",
);

expect(
  reassuranceAction.includes(
    'const LIVE_LEAGUE_REASSURANCE_TEMPLATE_KEY =\n  "team-lead-reassurance-live-email"',
  ) &&
    reassuranceAction.includes("DEFAULT_LIVE_BODY") &&
    reassuranceSeed.includes("team-lead-reassurance-live-email"),
  "a separate editable live-league reassurance email must exist in System Templates",
);
expect(
  reassuranceAction.includes('{ status: "COMPLETED" }') &&
    reassuranceAction.includes("publishedAt: { not: null }, kickoffAt: { lte: now }") &&
    reassuranceAction.includes("effectiveLeague.isActive && startedFixture"),
  "a live league must be identified by an active current league with a completed fixture or a published fixture whose kick-off has passed",
);
expect(
  reassuranceAction.includes("pricedFixture?.matchFeePence") &&
    reassuranceAction.includes("pricedTeam?.standardMatchFeePence") &&
    reassuranceAction.includes("This is a live league, but SIXFL could not find its match fee"),
  "live-league emails must resolve an actual match fee or stop instead of displaying To be confirmed",
);
expect(
  reassuranceAction.includes("League status: Already underway") &&
    reassuranceAction.includes("We agree your starting week") &&
    reassuranceAction.includes("YES — I WANT TO JOIN THIS LEAGUE"),
  "the live-league email must explain that the league is underway and that SIXFL will agree the team's first playing week",
);
expect(
  reassuranceAction.includes("const templateKey = isLiveLeague") &&
    reassuranceAction.includes("leagueMode,") &&
    reassuranceAction.includes("liveLeagueDetection"),
  "the reassurance sender must automatically choose and record the correct league version",
);

expect(
  sourcePreparation.includes(
    'require("./apply-team-unavailability-response-copy.cjs")',
  ) && teamUnavailablePreparation.includes(captainFixturePagePath),
  "the complete development and production source-preparation chain must apply the team-unavailability correction",
);
expect(
  captainFixturePage.includes('name="unavailableReason"') &&
    captainFixturePage.includes("required") &&
    captainFixturePage.includes("minLength={5}") &&
    captainFixturePage.includes("maxLength={500}"),
  "captains must provide a brief reason when saying the whole team cannot play",
);
expect(
  captainFixturePage.includes("TEAM_UNAVAILABLE_NOTE_PREFIX") &&
    captainFixturePage.includes("Reason given:") &&
    captainFixturePage.includes("the captain selected “No — our team cannot play”"),
  "stored team-unavailable notes must identify an online selection and retain the captain's reason",
);
expect(
  !captainFixturePage.includes(
    "captain has told SIXFL they cannot fulfil this fixture",
  ),
  "the captain fixture page must not falsely imply that the captain contacted SIXFL directly",
);
expect(
  captainFixturePage.includes(
    "Only use this when the whole team cannot fulfil the fixture",
  ) &&
    captainFixturePage.includes("SIXFL will be alerted immediately") &&
    captainFixturePage.includes("Send — our team cannot play"),
  "the No action must clearly explain what it means before the captain submits it",
);
expect(
  fixtureConfirmationEmail.includes(
    "Choose No only if the whole team cannot fulfil the fixture",
  ) &&
    fixtureConfirmationEmail.includes(
      "You will be asked for a brief reason and SIXFL will be alerted immediately",
    ),
  "fixture confirmation emails must explain that No is a whole-team issue report",
);
expect(
  fixtureConfirmationReminder.includes(
    "Use No only if the whole team cannot play",
  ) &&
    fixtureConfirmationReminder.includes(
      "PREVIOUS_CLEAR_CONFIRMATION_SMS_BODY",
    ),
  "fixture confirmation SMS reminders must explain the No action and upgrade the previous default wording",
);
expect(
  teamUnavailableMigration.includes(
    "Team unavailable: captain has told SIXFL they cannot fulfil this fixture.",
  ) &&
    teamUnavailableMigration.includes(
      "This was an online response; the previous form did not collect a reason.",
    ),
  "the existing misleading stored notes must be corrected during deployment",
);

const confirmStart = confirmation.indexOf("export async function confirmTeamPlaceFromLead");
const declineStart = confirmation.indexOf("export async function declineTeamPlaceFromLead");
const confirmSource =
  confirmStart >= 0 && declineStart > confirmStart
    ? confirmation.slice(confirmStart, declineStart)
    : "";

expect(
  confirmSource.includes("status: LeadStatus.QUALIFIED"),
  "confirming a team commitment must continue qualifying the lead",
);
expect(
  !confirmSource.includes("team.create") && !confirmSource.includes("tx.team.create"),
  "confirming a team commitment must not automatically create a Team record",
);

if (failures.length) {
  console.error("\nTEAM CONFIRMATION CONTRACT FAILED\n");
  for (const failure of failures) console.error(` - ${failure}`);
  console.error("\nDo not merge until the team confirmation workflow is restored.\n");
  process.exit(1);
}

console.log("Team confirmation and reassurance contract passed.");
