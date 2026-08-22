const fs = require("node:fs");
const path = require("node:path");

const file = path.join(
  process.cwd(),
  "src",
  "lib",
  "captain",
  "onboarding.ts",
);

let source = fs.readFileSync(file, "utf8");

source = source.replace(
  'export const CAPTAIN_AGREEMENT_VERSION = "2.0";',
  'export const CAPTAIN_AGREEMENT_VERSION = "2.1";',
);

source = source.replace(
  '  "I understand that as team captain I am responsible for keeping squad details up to date, confirming fixture availability, arranging payment of match fees, making sure my team follows SIXFL matchday rules, and complying with the current SIXFL League Rules and Match Rules.";',
  '  "I understand that as team captain I am responsible for keeping squad details up to date, confirming fixture availability, arranging payment of match fees, making sure my team follows SIXFL matchday rules, and complying with the current SIXFL League Rules and Match Rules. I also understand that if my team confirms a fixture and then fails to attend without SIXFL agreeing a cancellation or rearrangement, my team is responsible for both its own match fee and the opposition team\'s match fee.";',
);

fs.writeFileSync(file, source, "utf8");
console.log("Captain agreement now states confirmed-fixture no-show liability.");
