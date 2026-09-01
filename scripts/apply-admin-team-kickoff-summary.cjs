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

const captainLayoutPath = path.join(
  process.cwd(),
  "src",
  "app",
  "captain",
  "team",
  "[teamid]",
  "layout.tsx",
);

if (!fs.existsSync(captainLayoutPath)) {
  throw new Error("Captain team layout not found.");
}

let captainSource = fs.readFileSync(captainLayoutPath, "utf8");
let captainChanged = false;

if (!captainSource.includes("earliestKickoffTime: true,")) {
  const captainSelectAnchor = `      teamMode: true,\n      league: {`;
  if (!captainSource.includes(captainSelectAnchor)) {
    throw new Error("Could not find captain team kick-off select anchor.");
  }
  captainSource = captainSource.replace(
    captainSelectAnchor,
    `      teamMode: true,\n      earliestKickoffTime: true,\n      latestKickoffTime: true,\n      league: {`,
  );
  captainChanged = true;
}

if (!captainSource.includes("Kick-off restrictions")) {
  const captainHeaderAnchor = `              {showCaptainTeamSwitcher ? (\n                <div className="rounded-2xl border border-white/10 bg-black/20 p-2">`;
  if (!captainSource.includes(captainHeaderAnchor)) {
    throw new Error("Could not find captain team header right-side anchor.");
  }

  const kickoffBox = `              {(team.earliestKickoffTime || team.latestKickoffTime) ? (\n                <div className="min-w-[220px] rounded-2xl border border-amber-300/25 bg-amber-400/10 px-4 py-3">\n                  <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-amber-200/70">\n                    Kick-off restrictions\n                  </div>\n                  <div className="mt-2 flex flex-wrap gap-2">\n                    {team.earliestKickoffTime ? (\n                      <span className="rounded-full border border-amber-300/20 bg-black/20 px-3 py-1.5 text-xs font-semibold text-amber-50">\n                        Earliest KO {team.earliestKickoffTime}\n                      </span>\n                    ) : null}\n                    {team.latestKickoffTime ? (\n                      <span className="rounded-full border border-amber-300/20 bg-black/20 px-3 py-1.5 text-xs font-semibold text-amber-50">\n                        Latest KO {team.latestKickoffTime}\n                      </span>\n                    ) : null}\n                  </div>\n                </div>\n              ) : null}\n\n`;

  captainSource = captainSource.replace(
    captainHeaderAnchor,
    `${kickoffBox}${captainHeaderAnchor}`,
  );
  captainChanged = true;
}

if (!captainSource.includes("earliestKickoffTime: true,")) {
  throw new Error("Captain team layout does not select earliest kick-off time.");
}
if (!captainSource.includes("Kick-off restrictions")) {
  throw new Error("Captain team layout does not render kick-off restrictions.");
}

if (captainChanged) {
  fs.writeFileSync(captainLayoutPath, captainSource, "utf8");
  console.log("Added team kick-off restrictions to the captain/admin team header.");
} else {
  console.log("Captain/admin team kick-off restriction summary already applied.");
}

const refereeNightDetailPath = path.join(
  process.cwd(),
  "src",
  "app",
  "(admin)",
  "admin",
  "referee-nights",
  "[id]",
  "page.tsx",
);

if (!fs.existsSync(refereeNightDetailPath)) {
  throw new Error("Admin referee-night detail page not found.");
}

let refereeNightSource = fs.readFileSync(refereeNightDetailPath, "utf8");
let refereeNightChanged = false;

const expectedCalculation = `  const expectedTotal = fixtures.reduce((sum, fixture) => {\n    return sum + fixture.paymentCharges.reduce((chargeSum, charge) => chargeSum + charge.amountPence, 0);\n  }, 0);\n`;
if (refereeNightSource.includes(expectedCalculation)) {
  refereeNightSource = refereeNightSource.replace(expectedCalculation, "");
  refereeNightChanged = true;
}

const expectedTile = `            <div className="rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3"><div className="text-[11px] uppercase tracking-[0.16em] text-white/40">Expected</div><div className="mt-1 text-lg font-semibold text-white">{formatMoney(expectedTotal)}</div></div>\n`;
if (refereeNightSource.includes(expectedTile)) {
  refereeNightSource = refereeNightSource.replace(expectedTile, "");
  refereeNightChanged = true;
}

if (refereeNightSource.includes("Expected</div>")) {
  throw new Error("Referee-night Expected total is still rendered.");
}
if (refereeNightSource.includes("expectedTotal")) {
  throw new Error("Referee-night expectedTotal calculation is still present.");
}

if (refereeNightSource.includes('xl:grid-cols-5')) {
  refereeNightSource = refereeNightSource.replace('xl:grid-cols-5', 'xl:grid-cols-4');
  refereeNightChanged = true;
}

if (refereeNightChanged) {
  fs.writeFileSync(refereeNightDetailPath, refereeNightSource, "utf8");
  console.log("Removed the irrelevant Expected total from referee-night summaries.");
} else {
  console.log("Referee-night Expected total already removed.");
}

// Run these last so they extend the fully prepared native source without being
// overwritten by an earlier compatibility step.
require("./apply-admin-lead-prospective-league-filter.cjs");
require("./apply-night-board-confirmation-reset-hardening.cjs");
require("./apply-clear-removed-team-fixture-notices.cjs");
require("./apply-referee-dashboard-click-affordances.cjs");
require("./apply-login-session-retention-guard.cjs");
require("./apply-referee-settled-balance-summary-fix.cjs");
require("./apply-multi-captain-operational-notifications.cjs");
require("./apply-admin-captain-management-visibility.cjs");

// Payment safety must remain absolutely last. It checks the final generated
// fixture-fee source and adds a saved-card cap so a stale £40 charge can never
// debit a team whose agreed automatic match fee is £36.
require("./apply-team-specific-fixture-fee-final-guard.cjs");
