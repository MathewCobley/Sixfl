import fs from "node:fs";

const sender = fs.readFileSync("src/lib/fixtures/abandonment-email-recovery.ts", "utf8");
const action = fs.readFileSync("src/app/(public)/referee/abandonment-email-actions.ts", "utf8");
const form = fs.readFileSync("src/components/referee/AbandonedMatchForm.tsx", "utf8");
const chain = fs.readFileSync("scripts/check-central-standings-usage.cjs", "utf8");

const failures = [];
const expect = (condition, message) => {
  if (!condition) failures.push(message);
};

expect(
  sender.includes("resendFixtureAbandonmentEmails") &&
    sender.includes('FROM "FixtureAbandonment"') &&
    sender.includes("officialResultLine"),
  "email recovery must rebuild the saved abandonment decision and current official result",
);
expect(
  sender.includes('role: "responsible_team"') &&
    sender.includes('role: "innocent_team"') &&
    sender.includes("recoveryResend: true"),
  "email recovery must queue separate responsible and innocent team messages",
);
expect(
  sender.includes("getDirectChargePaidTotal") &&
    sender.includes("getPlayerFeeCashReceivedPence") &&
    sender.includes("buildChargePaymentUrl"),
  "responsible-team recovery email must calculate current paid/outstanding money and preserve the payment link",
);
expect(
  action.includes("Only SIXFL admin can resend abandoned-match decision emails") &&
    action.includes("resendFixtureAbandonmentEmails"),
  "only admin may explicitly resend a saved abandonment decision",
);
expect(
  form.includes("Send abandonment emails again") &&
    form.includes("resendNightFixtureAbandonmentEmailsAction") &&
    form.includes("does not change the abandonment, fees or official result"),
  "recorded abandoned fixtures must expose a clear admin recovery button",
);
expect(
  chain.includes('require("./apply-fixture-abandonment-email-recovery.cjs")'),
  "abandonment email recovery UI must be applied by the production preparation chain",
);

if (failures.length) {
  console.error("Abandonment email recovery contract failed:");
  failures.forEach((failure) => console.error(` - ${failure}`));
  process.exit(1);
}

console.log("Abandonment email recovery contract passed.");
