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

const recipientPath = "src/lib/notifications/team-operational-recipients.ts";
const emailPath = "src/lib/fixtures/confirmation-emails.ts";
const smsPath = "src/lib/fixtures/confirmation-reminders.ts";

const recipients = read(recipientPath);
const emails = read(emailPath);
const sms = read(smsPath);

expect(
  recipients.includes("where: { teamId: input.teamId, role: TeamRole.CAPTAIN }") &&
    recipients.includes("upsertTeamOperationalEmailRecipients") &&
    recipients.includes("upsertTeamOperationalSmsRecipients"),
  "operational fixture recipient resolution must include every captain membership",
);

expect(
  recipients.includes("seen.has(key)") &&
    recipients.includes("recipient.email?.trim().toLowerCase()") &&
    recipients.includes("recipient.phone?.replace(/\\D/g, \"\")"),
  "all-captain operational recipients must deduplicate shared email addresses and phone numbers",
);

expect(
  emails.includes("upsertTeamOperationalEmailRecipients") &&
    emails.includes("for (const recipient of recipients)") &&
    emails.includes("recipientId: input.recipientId"),
  "fixture publication and confirmation emails must fan out to all captains and deduplicate per recipient",
);

expect(
  emails.includes("const initialAlreadySent = await hasDispatch({") &&
    emails.includes("recipientId: recipient.id") &&
    emails.includes('sourceType: getSourceType("initial")'),
  "fixture email recovery must check each captain separately so a second captain can receive a fixture already sent to the primary contact",
);

expect(
  sms.includes("upsertTeamOperationalSmsRecipients") &&
    sms.includes("recipientId: true") &&
    sms.includes("dispatch.recipientId !== recipient.id") &&
    sms.includes("for (const recipient of recipients)"),
  "fixture confirmation SMS reminders must fan out to every captain with a saved phone number",
);

if (failures.length) {
  console.error("\nMULTI-CAPTAIN FIXTURE NOTIFICATION CONTRACT FAILED\n");
  for (const failure of failures) console.error(` - ${failure}`);
  console.error("\nDo not merge until all captain fixture notifications are preserved.\n");
  process.exit(1);
}

console.log("Multi-captain fixture notification contract passed.");
