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

const paymentServicePath = "src/lib/payments/player-match-fees.ts";
const paymentActionPath = "src/app/captain/team/[teamid]/player-payments/actions.ts";
const paymentPagePath = "src/app/captain/team/[teamid]/player-payments/PaymentPageServer.tsx";
const legacyEmailGuardPath = "scripts/apply-player-payment-email-required.cjs";

const service = read(paymentServicePath);
const action = read(paymentActionPath);
const page = read(paymentPagePath);
const legacyGuard = read(legacyEmailGuardPath);

expect(
  service.includes('"standardCreditStartedAt"') &&
    service.includes("getStandardTeamPaymentDispatchBoundary") &&
    service.includes("createdAt: { gte: input.notBefore }"),
  "standard-team payment requests must ignore managed-era dispatch history before the mode-change boundary",
);
expect(
  service.includes("force?: boolean") && service.includes("shouldQueueEmail && !input.force"),
  "player payment notification service must support an explicit captain resend that bypasses normal dedupe",
);
expect(
  action.includes("selectedMemberIdsForEmailCheck") &&
    action.includes('error=missing_player_email'),
  "player-link creation must natively reject players without a saved email",
);
expect(
  action.includes("resendCaptainPlayerPaymentLinkAction") &&
    action.includes("force: true") &&
    action.includes("emailsQueued=${delivery.queued}"),
  "captains must have a forced resend path and collection saving must report actual queued email count",
);
expect(
  page.includes("emailRequired:") &&
    page.includes("disabled={player.emailRequired && !player.fee}") &&
    page.includes("Send payment link again"),
  "captain payment page must expose missing-email state and a resend control for open requests",
);
expect(
  page.includes('saved === "payment_link_resent"') &&
    page.includes("No new payment-link email was queued"),
  "captain payment page must distinguish saved collection state from actual email delivery",
);
expect(
  legacyGuard.includes('if (!actions.includes("selectedMemberIdsForEmailCheck"))'),
  "legacy prebuild email guard must recognise native server protection and remain idempotent",
);
expect(
  service.includes("queueNotificationFromTemplate") && !action.includes("resend.emails.send"),
  "player payment requests and resends must continue through the notification template service",
);

if (failures.length) {
  console.error("\nSTANDARD TEAM PLAYER PAYMENT LINK CONTRACT FAILED\n");
  for (const failure of failures) console.error(` - ${failure}`);
  console.error("\nDo not merge until standard-team player payment-link delivery is restored.\n");
  process.exit(1);
}

console.log("Standard-team player payment link contract passed.");
