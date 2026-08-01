const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const actionsPath = path.join(
  root,
  "src/app/captain/team/[teamid]/player-payments/actions.ts",
);

let source = fs.readFileSync(actionsPath, "utf8");

// Player payment rows are only a collection method. They must never alter the
// fixed amount SIXFL charges the team for a fixture.
source = source.replace(
  /\nasync function syncTeamChargeForZeroFeeWaivers\([\s\S]*?\nasync function emailPlayerPaymentLinks/,
  "\nasync function emailPlayerPaymentLinks",
);
source = source.replace(
  /\n\s*await syncTeamChargeForZeroFeeWaivers\(\{ teamId, fixtureId \}\);/g,
  "",
);
source = source.replaceAll(
  "Player fee override is £0.00, so this share reduces the team balance but is not counted as money collected.",
  "Player fee override is £0.00, so no player payment link is created. The fixed team fixture fee is unchanged.",
);

fs.writeFileSync(actionsPath, source, "utf8");

if (source.includes("syncTeamChargeForZeroFeeWaivers")) {
  throw new Error(
    "The obsolete zero-fee team-charge adjustment is still present in player payment actions.",
  );
}

require("./apply-admin-only-player-fee-override.cjs");

console.log(
  "Player collections cannot change fixed fixture charges; fee overrides remain admin-only.",
);
