const fs = require("node:fs");
const path = require("node:path");

const filePath = path.join(
  process.cwd(),
  "src",
  "app",
  "captain",
  "team",
  "[teamid]",
  "fixtures",
  "page.tsx",
);

const source = fs.readFileSync(filePath, "utf8");
const before = '<div className="text-lg font-semibold text-white">{goalsFor} - {goalsAgainst}</div>';
const after = '<div className="text-lg font-semibold text-white">{fixture.result!.homeScore} - {fixture.result!.awayScore}</div>';

if (source.includes(after)) {
  console.log("Captain recent-result score order is already correct.");
  process.exit(0);
}

if (!source.includes(before)) {
  throw new Error("Captain recent-result score display anchor was not found.");
}

fs.writeFileSync(filePath, source.replace(before, after), "utf8");
console.log(
  "Captain recent results now display the score in the same home/away order as the team names while Win/Loss/Draw remains from the captain team's perspective.",
);
