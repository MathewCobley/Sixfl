const fs = require("node:fs");
const path = require("node:path");

require("./apply-captain-dom-observer-performance-guard.cjs");
require("./apply-player-payments-freeze-fix.cjs");
require("./apply-matchday-fee-waiver-reasons.cjs");
require("./apply-captain-team-switcher-access-guard.cjs");
require("./prepare-standard-pay-per-kit-flow.cjs");
require("./apply-standard-pay-per-kit-flow.cjs");
require("./apply-kit-design-deselect-lock.cjs");
require("./apply-paid-extra-kit-player-details.cjs");
require("./apply-native-kit-offer-rendering.cjs");
require("./apply-native-free-kit-team-badges.cjs");
require("./apply-admin-email-reply-feedback.cjs");
require("./apply-late-confirmation-warning-delivery.cjs");
require("./apply-captain-team-nudges.cjs");
require("./apply-captain-fixture-status-layout.cjs");
require("./apply-managed-team-prospects-navigation.cjs");
require("./apply-pending-activation-player-pool-action.cjs");
require("./apply-player-pool-lead-closure.cjs");
require("./apply-player-pool-nudge-history.cjs");
require("./apply-orphan-player-fee-identity.cjs");
require("./apply-nights-fixtures-predictor-column.cjs");
require("./apply-nights-fixtures-team-badges.cjs");
require("./apply-nights-fixtures-final-polish.cjs");
require("./apply-nights-fixtures-layout-balance.cjs");
require("./apply-shared-player-email-safety.cjs");
require("./fix-shared-email-safety-build.cjs");
require("./apply-shared-player-email-promotion-guard.cjs");

const srcRoot = path.join(process.cwd(), "src");
const violations = [];

function walk(directory) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      walk(fullPath);
      continue;
    }
    if (!/\.(ts|tsx)$/.test(entry.name)) continue;

    const relative = path.relative(process.cwd(), fullPath).replaceAll("\\", "/");
    if (relative === "src/lib/leagueTable.ts" || relative === "src/lib/standings.ts") continue;

    const source = fs.readFileSync(fullPath, "utf8");
    const directImports = source
      .split("\n")
      .filter((line) => line.includes('from "@/lib/leagueTable"') || line.includes("from '@/lib/leagueTable'"))
      .filter((line) => !/^\s*import\s+type\b/.test(line));

    if (directImports.length > 0) {
      violations.push(`${relative}: ${directImports.join(" | ").trim()}`);
    }
  }
}

walk(srcRoot);

if (violations.length > 0) {
  console.error("Direct league table calculation imports are not allowed.");
  console.error("Use getLeagueStandings() or getTeamStanding() from src/lib/standings.ts.");
  for (const violation of violations) console.error(`- ${violation}`);
  process.exit(1);
}

console.log("Central standings usage check passed.");
