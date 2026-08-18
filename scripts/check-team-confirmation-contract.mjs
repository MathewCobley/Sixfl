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
const emailActionPath = "src/app/(admin)/admin/leads/[id]/response-email-actions.ts";
const page = read(pagePath);
const confirmation = read(confirmationPath);
const emailAction = read(emailActionPath);

expect(
  page.includes("getLeagueConfirmationDetails") && page.includes("const effectiveLeague ="),
  "team confirmation page must load live prospective/current league details",
);
expect(
  !page.includes("Tuesday 8 July") && !page.includes("£40 per team per match"),
  "team confirmation page must not reintroduce hard-coded launch date or fee details",
);
expect(
  page.includes("async function saveTeamNameAction") && page.includes("data: { teamName }"),
  "confirmed leads must be able to save their team name back to the lead",
);
expect(
  page.includes("I’ll confirm the team name later") && page.includes("teamNameLater"),
  "confirmed leads must retain an explicit option to provide the team name later",
);
expect(
  page.includes("convertedTeamId") && page.includes('teamNameError=team-created'),
  "team-name editing must stop once an actual SIXFL team has been created",
);
expect(
  page.includes("No team or fixtures have been created automatically"),
  "confirmation page must clearly state that reserving a place does not auto-create a team or fixtures",
);
expect(
  emailAction.includes("we’ll ask you to confirm your team name") &&
    emailAction.includes("you can add it later"),
  "team confirmation email must explain that team name is requested after reserving and can be supplied later",
);
expect(
  emailAction.includes("Reserving a place does not create the team automatically"),
  "team confirmation email must not imply that reserving the place creates the actual team",
);

const confirmStart = confirmation.indexOf("export async function confirmTeamPlaceFromLead");
const declineStart = confirmation.indexOf("export async function declineTeamPlaceFromLead");
const confirmSource =
  confirmStart >= 0 && declineStart > confirmStart
    ? confirmation.slice(confirmStart, declineStart)
    : "";

expect(
  confirmSource.includes("status: LeadStatus.QUALIFIED"),
  "confirming a team place must continue qualifying the lead",
);
expect(
  !confirmSource.includes("team.create") && !confirmSource.includes("tx.team.create"),
  "confirming a team place must not automatically create a Team record",
);

if (failures.length) {
  console.error("\nTEAM CONFIRMATION CONTRACT FAILED\n");
  for (const failure of failures) console.error(` - ${failure}`);
  console.error("\nDo not merge until the team confirmation workflow is restored.\n");
  process.exit(1);
}

console.log("Team confirmation contract passed.");
