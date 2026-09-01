const fs = require("node:fs");
const path = require("node:path");

const pagePath = path.join(
  process.cwd(),
  "src",
  "app",
  "(admin)",
  "admin",
  "teams",
  "page.tsx",
);

if (!fs.existsSync(pagePath)) {
  throw new Error("Admin teams page not found.");
}

let source = fs.readFileSync(pagePath, "utf8");
let changed = false;

if (!source.includes("earliestKickoffTime: true,")) {
  const selectAnchor = "      latestKickoffTime: true,\n      leagueId: true,";

  if (!source.includes(selectAnchor)) {
    throw new Error("Could not find admin team kick-off select anchor.");
  }

  source = source.replace(
    selectAnchor,
    "      earliestKickoffTime: true,\n      latestKickoffTime: true,\n      leagueId: true,",
  );
  changed = true;
}

const latestBadge = `                          {team.latestKickoffTime ? (\n                            <span className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-[11px] text-white/65">\n                              Latest KO {team.latestKickoffTime}\n                            </span>\n                          ) : null}`;

const earliestAndLatestBadges = `                          {team.earliestKickoffTime ? (\n                            <span className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-[11px] text-white/65">\n                              Earliest KO {team.earliestKickoffTime}\n                            </span>\n                          ) : null}\n                          {team.latestKickoffTime ? (\n                            <span className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-[11px] text-white/65">\n                              Latest KO {team.latestKickoffTime}\n                            </span>\n                          ) : null}`;

if (!source.includes("Earliest KO {team.earliestKickoffTime}")) {
  if (!source.includes(latestBadge)) {
    throw new Error("Could not find admin team latest kick-off badge anchor.");
  }

  source = source.replace(latestBadge, earliestAndLatestBadges);
  changed = true;
}

if (!source.includes("earliestKickoffTime: true,")) {
  throw new Error("Earliest kick-off field is not selected on admin teams page.");
}

if (!source.includes("Earliest KO {team.earliestKickoffTime}")) {
  throw new Error("Earliest kick-off badge is not rendered on admin teams page.");
}

if (changed) {
  fs.writeFileSync(pagePath, source, "utf8");
  console.log("Added earliest kick-off restrictions to the admin Teams summary.");
} else {
  console.log("Admin Teams earliest kick-off summary already applied.");
}

// Run these last so they extend the fully prepared native source without being
// overwritten by an earlier compatibility step.
require("./apply-admin-lead-prospective-league-filter.cjs");
require("./apply-night-board-confirmation-reset-hardening.cjs");
require("./apply-clear-removed-team-fixture-notices.cjs");
require("./apply-referee-dashboard-click-affordances.cjs");
require("./apply-login-session-retention-guard.cjs");
require("./apply-referee-settled-balance-summary-fix.cjs");

// Payment safety must remain absolutely last. It checks the final generated
// fixture-fee source and adds a saved-card cap so a stale £40 charge can never
// debit a team whose agreed automatic match fee is £36.
require("./apply-team-specific-fixture-fee-final-guard.cjs");
