import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const layout = fs.readFileSync(path.join(root, "src/app/captain/team/[teamid]/layout.tsx"), "utf8");

const required = [
  "availabilityCount?: number;",
  "playerPoolAvailableCount",
  "profile.\"status\" = 'AVAILABLE'",
  "profile.\"leagueId\" = ${team.league.id}",
  "{item.availabilityCount} available",
  "available in your league",
];

const missing = required.filter((marker) => !layout.includes(marker));
if (missing.length) {
  console.error("Captain PlayerPool availability badge contract failed:");
  for (const marker of missing) console.error(`- missing ${marker}`);
  process.exit(1);
}

console.log("Captain PlayerPool availability badge contract passed.");
