import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const failures = [];

function read(relativePath) {
  const absolute = path.join(root, relativePath);
  if (!fs.existsSync(absolute)) {
    failures.push(`Missing required file: ${relativePath}`);
    return "";
  }
  return fs.readFileSync(absolute, "utf8");
}

function expect(condition, message) {
  if (!condition) failures.push(message);
}

const service = read("src/lib/fixtures/abandonment.ts");
const action = read("src/app/(public)/referee/abandonment-actions.ts");
const form = read("src/components/referee/AbandonedMatchForm.tsx");
const page = read("src/app/(public)/referee/night/[id]/page.tsx");
const migration = read("prisma/migrations/20260819232000_fixture_abandonment_workflow/migration.sql");
const resultMigration = read("prisma/migrations/20260819234500_fixture_abandonment_result_decision/migration.sql");
const rules = read("src/lib/match-rules.ts");
const preparationChain = read("scripts/check-central-standings-usage.cjs");

expect(
  migration.includes('CREATE TABLE IF NOT EXISTS "FixtureAbandonment"') &&
    migration.includes('"responsibleFinalChargePence"') &&
    migration.includes('"innocentCreditPence"'),
  "abandoned fixtures must be persisted with an auditable fee decision",
);
expect(
  resultMigration.includes('"awardedHomeScore"') &&
    resultMigration.includes('"awardedAwayScore"') &&
    resultMigration.includes('"resultDecidedAt"'),
  "official abandoned-match result decisions must be persisted separately from the score at abandonment",
);
expect(
  rules.includes("The team whose conduct caused the abandonment is responsible for payment of both its own match fee and the opposing team's match fee."),
  "league rules must retain the responsible-team-pays-both abandonment rule",
);
expect(
  service.includes('value: "REFUSED_TO_LEAVE"') &&
    service.includes("Player / manager refused to leave after referee instruction"),
  "referees must have an explicit refused-to-leave abandonment reason",
);
expect(
  service.includes("responsibleFinalChargePence") &&
    service.includes("responsibleOriginalFeePence") &&
    service.includes("innocentOriginalFeePence"),
  "team-conduct abandonments must charge the responsible team both match fees",
);
expect(
  service.includes("PaymentChargeStatus.VOID") &&
    service.includes("innocentPaidPence") &&
    service.includes("tcred_abandonment_"),
  "the innocent team's unpaid fee must be waived and paid money must become team credit where applicable",
);
expect(
  service.includes("playerMatchFee.updateMany") &&
    service.includes('status: "CANCELLED"'),
  "open player payment links for the innocent team must be cancelled",
);
expect(
  service.includes('channel: NotificationChannel.EMAIL') &&
    service.includes('role: "responsible_team"') &&
    service.includes('role: "innocent_team"'),
  "both the responsible and innocent teams must receive abandonment fee emails",
);
expect(
  service.includes("officialResultLine") &&
    service.includes("SIXFL has awarded the official result") &&
    service.includes("hasOfficialResult ? FixtureStatus.COMPLETED : FixtureStatus.CANCELLED") &&
    service.includes("matchResult.create"),
  "an admin-awarded result must become the official table result and be included in both abandonment emails",
);
expect(
  action.includes('resultDecision === "HOME_3_0"') &&
    action.includes('resultDecision === "AWAY_3_0"') &&
    action.includes("Only SIXFL admin can award an official result"),
  "only SIXFL admin may award a 3-0 abandoned-match result",
);
expect(
  action.includes("recordNightFixtureAbandonmentAction") &&
    action.includes("assertNightAccess") &&
    action.includes("confirmAbandonment"),
  "only the assigned referee/admin may record an abandonment and it must require confirmation",
);
expect(
  form.includes("Match abandoned / confirmed team no-show?") &&
    form.includes("Fixture outcome / reason") &&
    form.includes("Team responsible") &&
    form.includes("SIXFL result decision") &&
    form.includes("Award 3-0 to") &&
    form.includes("Record fixture outcome"),
  "referee night UI must expose the abandonment/no-show reason, responsible-team and admin official-result controls",
);
expect(
  page.includes("<AbandonedMatchForm") &&
    page.includes("canDecideResult={user.role === UserRole.ADMIN}") &&
    page.includes("fixture.result || abandonmentsByFixture.has(fixture.id)"),
  "after prebuild the referee night page must render admin result controls and allow an abandoned fixture to complete the cashup",
);
expect(
  preparationChain.includes('require("./apply-fixture-abandonment-workflow.cjs")') &&
    preparationChain.includes('require("./apply-fixture-abandonment-result-decision.cjs")'),
  "abandonment workflow and official-result preparation must run in the production prebuild chain",
);

if (failures.length) {
  console.error("\nFIXTURE ABANDONMENT WORKFLOW CONTRACT FAILED\n");
  for (const failure of failures) console.error(` - ${failure}`);
  process.exit(1);
}

console.log("Fixture abandonment workflow contract passed.");