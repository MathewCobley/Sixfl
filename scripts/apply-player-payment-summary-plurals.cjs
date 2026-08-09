const fs = require("node:fs");
const path = require("node:path");

const pagePath = path.join(
  process.cwd(),
  "src/app/captain/team/[teamid]/player-payments/PaymentPageServer.tsx",
);

const source = fs.readFileSync(pagePath, "utf8");

if (
  !source.includes("What is happening with this fixture?") ||
  !source.includes("playerOutstandingPence") ||
  !source.includes('selectedFees.length === 1 ? "" : "s"') ||
  !source.includes("The team balance remaining is")
) {
  throw new Error(
    "Native player-payment summary is missing its player count or real team-balance wording.",
  );
}

if (source.includes("TeamAutoPayCopyBridge")) {
  throw new Error("Player-payment summary must not depend on TeamAutoPayCopyBridge.");
}

console.log(
  "Player-payment summary count and outstanding balance are rendered natively by the server page.",
);
