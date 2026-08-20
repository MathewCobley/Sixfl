import fs from "node:fs";

const migration = fs.readFileSync(
  "prisma/migrations/20260820000000_add_formal_conduct_notice_template/migration.sql",
  "utf8",
);
const sender = fs.readFileSync(
  "src/lib/fixtures/formal-conduct-notice.ts",
  "utf8",
);
const manualAction = fs.readFileSync(
  "src/app/(public)/referee/abandonment-conduct-actions.ts",
  "utf8",
);
const abandonmentAction = fs.readFileSync(
  "src/app/(public)/referee/abandonment-actions.ts",
  "utf8",
);
const recoveryUi = fs.readFileSync(
  "scripts/apply-fixture-abandonment-email-recovery.cjs",
  "utf8",
);

const failures = [];
const expect = (condition, message) => {
  if (!condition) failures.push(message);
};

expect(
  migration.includes("fixture-abandonment-formal-conduct-email") &&
    migration.includes("The referee’s decision on the night is final") &&
    migration.includes("will not be tolerated") &&
    migration.includes('ON CONFLICT ("key") DO NOTHING'),
  "formal conduct wording must live in an editable system template and preserve admin edits",
);
expect(
  sender.includes("queueNotificationFromTemplate") &&
    sender.includes("FORMAL_CONDUCT_NOTICE_TEMPLATE_KEY") &&
    sender.includes("logNotificationDispatchToThread") &&
    sender.includes("processNotificationQueue"),
  "formal conduct notices must use the template notification pipeline, be logged to the conversation timeline and be processed immediately",
);
expect(
  sender.includes("REFUSED_TO_LEAVE") &&
    sender.includes("TEAM_CONDUCT") &&
    sender.includes("VIOLENT_OR_THREATENING_CONDUCT") &&
    sender.includes("SERIOUS_MISCONDUCT"),
  "all team-conduct abandonment reasons must qualify for a formal notice",
);
expect(
  abandonmentAction.includes("isFixtureConductAbandonmentReason") &&
    abandonmentAction.includes("sendFixtureFormalConductNotice") &&
    abandonmentAction.includes("separate formal conduct notice could not be sent"),
  "new conduct-related abandonments must automatically attempt the separate formal conduct notice without undoing a saved abandonment if delivery fails",
);
expect(
  manualAction.includes("Only SIXFL admin can send a formal conduct notice") &&
    manualAction.includes("formal-conduct-sent") &&
    manualAction.includes("formal-conduct-failed") &&
    manualAction.includes("resend: true"),
  "admin must have an explicit recovery action with visible sent/failed feedback",
);
expect(
  recoveryUi.includes("Send formal conduct notice now") &&
    recoveryUi.includes("Formal conduct notice · {responsibleName}") &&
    recoveryUi.includes("formal-conduct-sent") &&
    recoveryUi.includes("team&apos;s conversation timeline"),
  "recorded conduct abandonments must expose the admin send button and clear delivery feedback",
);
expect(
  !sender.includes("The referee’s decision on the night is final") &&
    !sender.includes("will not be tolerated"),
  "final customer-facing conduct wording must not be hard-coded in the sender",
);

if (failures.length) {
  console.error("Formal conduct notice contract failed:");
  failures.forEach((failure) => console.error(` - ${failure}`));
  process.exit(1);
}

console.log("Formal conduct notice contract passed.");
