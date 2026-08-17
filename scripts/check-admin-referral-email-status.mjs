import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const pagePath = "src/app/(admin)/admin/referrals/page.tsx";
const actionsPath = "src/app/(admin)/admin/referrals/actions.ts";

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

const page = read(pagePath);
const actions = read(actionsPath);
const failures = [];

for (const marker of [
  "team-referral-recorded",
  "Referral email",
  "Retry email",
  "failureReason",
  "sentAt",
  "retryReferralRecordedEmailAction",
]) {
  if (!page.includes(marker)) {
    failures.push(`Admin referrals page is missing referral email status marker: ${marker}`);
  }
}

for (const marker of [
  'import { queueReferralRecordedEmail } from "@/lib/team-referral-notifications";',
  "export async function retryReferralRecordedEmailAction",
  "await queueReferralRecordedEmail(referralId)",
  'referralRedirect({ email: "queued" })',
  'referralRedirect({ email: "blocked" })',
]) {
  if (!actions.includes(marker)) {
    failures.push(`Admin referral retry action is missing safety marker: ${marker}`);
  }
}

if (failures.length) {
  console.error("\nADMIN REFERRAL EMAIL STATUS CONTRACT FAILED\n");
  failures.forEach((failure) => console.error(` - ${failure}`));
  process.exit(1);
}

console.log("Admin referral email status contract passed.");
