const fs = require("node:fs");
const path = require("node:path");

const filePath = path.join(
  process.cwd(),
  "src/app/captain/team/[teamid]/player-payments/actions.ts",
);

let source = fs.readFileSync(filePath, "utf8");
source = source.replace(
  'description: `Team credit automatically used against ${activeTeamCharge.title} before creating new player payment links.`,',
  'description: "Team credit automatically used against this fixture before creating new player payment links.",',
);

if (source.includes("activeTeamCharge.title")) {
  throw new Error("Team credit cap policy still references an unavailable charge title.");
}

fs.writeFileSync(filePath, source, "utf8");
console.log("Applied team credit cap build compatibility fix.");
