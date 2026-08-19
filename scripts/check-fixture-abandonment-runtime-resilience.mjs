import fs from "node:fs";

const service = fs.readFileSync("src/lib/fixtures/abandonment.ts", "utf8");
const action = fs.readFileSync("src/app/(public)/referee/abandonment-actions.ts", "utf8");
const form = fs.readFileSync("src/components/referee/AbandonedMatchForm.tsx", "utf8");
const page = fs.readFileSync("src/app/(public)/referee/night/[id]/page.tsx", "utf8");
const chain = fs.readFileSync("scripts/check-central-standings-usage.cjs", "utf8");

const failures = [];
const expect = (value, message) => { if (!value) failures.push(message); };

expect(!service.includes('      "awardedHomeScore",\n      "awardedAwayScore",'), "runtime abandonment reads must not depend on optional awarded-result audit columns");
expect(!service.includes('        "awardedHomeScore",\n        "awardedAwayScore",'), "runtime abandonment writes must not depend on optional awarded-result audit columns");
expect(service.includes("matchResult.create") && service.includes("officialResultLine"), "3-0 awards must still be stored as the official MatchResult and included in emails");
expect(service.includes("Abandonment notifications were queued but immediate processing failed"), "notification processor failures must not turn a saved abandonment into an application error");
expect(action.includes("Abandonment was saved but referee-night cashup recalculation failed"), "cashup recalculation failures must not turn a saved abandonment into an application error");
expect(form.includes("officialResult") && page.includes("officialResult={fixture.result"), "recorded abandonment UI must read the official result from MatchResult");
expect(chain.includes('require("./fix-fixture-abandonment-runtime-schema.cjs")'), "runtime abandonment resilience patch must run in the production preparation chain");

if (failures.length) {
  console.error("Abandonment runtime resilience contract failed:");
  failures.forEach((failure) => console.error(` - ${failure}`));
  process.exit(1);
}

console.log("Abandonment runtime resilience contract passed.");
