const fs = require("node:fs");
const path = require("node:path");

require("./apply-native-captain-collected-summary.cjs");

const pagePath = path.join(
  process.cwd(),
  "src/app/captain/team/[teamid]/player-payments/PaymentPageServer.tsx",
);

const source = fs.readFileSync(pagePath, "utf8");

if (
  !source.includes("What is happening with this fixture?") ||
  !source.includes("playerOutstandingPence") ||
  !source.includes('selectedFees.length === 1 ? "" : "s"') ||
  !source.includes("The team balance remaining is") ||
  !source.includes("captainCollectedPence") ||
  !source.includes("Paid directly to captain:") ||
  !source.includes("captain passes on to SIXFL")
) {
  throw new Error(
    "Native player-payment summary is missing its real balance, player count or captain-collected money wording.",
  );
}

if (source.includes("TeamAutoPayCopyBridge")) {
  throw new Error("Player-payment summary must not depend on TeamAutoPayCopyBridge.");
}

console.log(
  "Player-payment summary, real outstanding balance and captain-collected money are rendered natively by the server page.",
);

// Keep the team payment page's saved-card state native and explicit after all
// other payment-page build patches have finished.
require("./apply-native-team-payment-copy.cjs");

// Captains must also be able to close unpaid player payment links before the
// fixture charge itself has been settled.
require("./apply-captain-cancel-unpaid-player-links.cjs");

// Make the team-credit rule and the amount still payable completely explicit
// on Team payments, including when credit covers the whole fixture fee.
require("./apply-captain-team-credit-explanation.cjs");
