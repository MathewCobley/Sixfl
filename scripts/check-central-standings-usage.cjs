const fs = require("node:fs");
const path = require("node:path");

require("./apply-division-aware-dashboard-tables.cjs");
require("./apply-blank-fixture-fee-inheritance.cjs");
require("./prepare-team-kit-badge-ui.cjs");
require("./apply-captain-dom-observer-performance-guard.cjs");
require("./apply-player-payments-freeze-fix.cjs");
require("./apply-matchday-fee-waiver-reasons.cjs");
require("./apply-player-fee-waiver-audit.cjs");
require("./apply-captain-team-switcher-access-guard.cjs");
require("./prepare-standard-pay-per-kit-flow.cjs");
require("./apply-standard-pay-per-kit-flow.cjs");
require("./apply-kit-design-deselect-lock.cjs");
require("./apply-paid-extra-kit-player-details.cjs");
require("./apply-extra-kit-proper-dropdown.cjs");
require("./apply-native-kit-offer-rendering.cjs");
require("./apply-native-free-kit-team-badges.cjs");
require("./apply-admin-email-reply-feedback.cjs");
require("./apply-late-confirmation-warning-delivery.cjs");
require("./apply-captain-team-nudges.cjs");
require("./apply-temporary-player-request-overview.cjs");
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
require("./apply-league-table-form-nowrap.cjs");
require("./apply-shared-player-email-safety.cjs");
require("./fix-shared-email-safety-build.cjs");
require("./apply-shared-player-email-admin-promotion-guard.cjs");
require("./apply-shared-player-email-captain-promotion-guard-v2.cjs");
require("./apply-player-merge-name-safety.cjs");
require("./apply-kit-extra-row-save-and-dropdown-fix.cjs");
require("./apply-extra-kit-save-repair.cjs");
require("./apply-extra-kit-incomplete-order-recovery.cjs");
require("./apply-team-kit-badge-review-stage.cjs");
require("./remove-duplicate-kit-allocation-panel.cjs");
require("./apply-native-team-kit-save-v2.cjs");
require("./apply-kit-reopen-consistency.cjs");
require("./apply-league-kit-design-lock.cjs");
require("./apply-kit-order-payment-readiness.cjs");
require("./apply-kit-pending-payment-editability.cjs");
require("./apply-admin-kit-payment-status.cjs");
require("./apply-admin-kit-readiness-guard.cjs");
require("./apply-kit-size-confirmation.cjs");
require("./apply-night-board-fixture-notes.cjs");
require("./apply-remove-captain-kit-offer-notice.cjs");
require("./apply-neutral-captain-kit-flow.cjs");
require("./apply-clear-kit-payment-cta.cjs");
require("./apply-last-minute-replacement-feature.cjs");
require("./apply-team-referral-rewards.cjs");
require("./apply-fixture-week-scroll-return.cjs");
require("./apply-context-aware-payment-charge-labels.cjs");
require("./apply-community-goal-of-week-ui.cjs");
require("./apply-native-single-fixture-publish.cjs");
require("./fix-goal-of-week-dashboard-promo-payload-narrowing.cjs");
require("./apply-critical-player-dashboard-features.cjs");
require("./apply-late-payment-72h-review.cjs");
require("./apply-visible-late-payment-fees.cjs");
require("./apply-late-payment-fee-sync-safeguard.cjs");
require("./apply-admin-outstanding-balance-copy.cjs");
require("./apply-reopen-failed-stripe-player-payment.cjs");
require("./apply-team-credit-cap-policy.cjs");
require("./fix-team-credit-cap-policy-build.cjs");
require("./apply-team-credit-replenishment-fix.cjs");
require("./fix-team-charge-waiver-build-interpolation.cjs");
require("./apply-team-charge-waiver-accounting.cjs");
require("./fix-team-charge-waiver-public-checkout.cjs");
require("./apply-free-kit-expiry-paid-kit-mode.cjs");
require("./apply-ai-prediction-publication-snapshot.cjs");
require("./fix-ai-prediction-publication-selects.cjs");
require("./apply-ai-prediction-matchup-integrity.cjs");
require("./apply-ai-prediction-text-team-integrity.cjs");
require("./apply-referee-night-score-update-fix.cjs");
require("./apply-fixture-abandonment-workflow.cjs");
require("./fix-fixture-abandonment-build.cjs");
require("./apply-fixture-abandonment-result-decision.cjs");
require("./fix-fixture-abandonment-result-decision-build.cjs");
require("./fix-fixture-abandonment-runtime-schema.cjs");
require("./apply-fixture-abandonment-email-recovery.cjs");
require("./apply-harrogate-current-league-landing.cjs");
require("./apply-rules-v2-hardening.cjs");
require("./apply-team-email-registration-guard.cjs");
require("./check-visible-late-payment-fees.cjs");
require("./apply-venue-neutral-kickoff-window-compat.cjs");
require("./fix-team-kickoff-window-enforcement-build.cjs");
require("./apply-team-kickoff-window-enforcement.cjs");

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
      violations.push(`${relative}: direct leagueTable import: ${directImports.join(" | ").trim()}`);
    }

    if (relative.includes("/leagues/") && /\bfunction\s+buildLeagueTable\s*\(/.test(source)) {
      violations.push(`${relative}: local buildLeagueTable() calculator`);
    }
  }
}

walk(srcRoot);

if (violations.length > 0) {
  console.error("Non-central league table calculations are not allowed.");
  console.error("Use getLeagueStandings() or getTeamStanding() from src/lib/standings.ts.");
  for (const violation of violations) console.error(`- ${violation}`);
  process.exit(1);
}

console.log("Central standings usage check passed.");