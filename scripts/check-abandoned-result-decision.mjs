import fs from "node:fs";

const files = [
  "src/lib/fixtures/abandonment.ts",
  "src/app/(public)/referee/abandonment-actions.ts",
  "src/components/referee/AbandonedMatchForm.tsx",
  "src/app/(public)/referee/night/[id]/page.tsx",
];
const source = files.map((file) => fs.readFileSync(file, "utf8")).join("\n");

const required = [
  "awardedHomeScore",
  "awardedAwayScore",
  "SIXFL has awarded the official result",
  "HOME_3_0",
  "AWAY_3_0",
  "Only SIXFL admin can award an official result",
  "SIXFL result decision",
  "Award 3-0 to",
  "hasOfficialResult ? FixtureStatus.COMPLETED : FixtureStatus.CANCELLED",
];

const missing = required.filter((marker) => !source.includes(marker));
if (missing.length) {
  console.error("Abandoned result decision contract failed:", missing.join(", "));
  process.exit(1);
}

console.log("Abandoned result decision contract passed.");
