const fs = require("node:fs");
const path = require("node:path");

// The player team switcher is applied earlier in the normal prebuild chain via
// apply-player-pool-edit-details -> apply-player-merge-controls. Do not rerun
// that source patch here: its layout pass deliberately changes presentation
// copy, so a second patch pass can misread the polished version as missing.
// Keep the temporary-player label patch here, then verify both features from
// their structural contracts rather than fragile headings.
require("./apply-temporary-player-team-label-clarity.cjs");
require("./apply-player-dashboard-temporary-fees-inline.cjs");

const root = process.cwd();

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

const playerPage = read("src/app/player/team/[teamid]/page.tsx");
const launcher = read("src/components/captain/TemporaryPlayerPassLauncher.tsx");
const routeScoped = read("src/components/RouteScopedBridges.tsx");

const checks = [
  {
    ok:
      playerPage.includes("const playerMemberships = (") &&
      playerPage.includes("playerMemberships.length > 1") &&
      playerPage.includes("teamMembership.team.id === teamid") &&
      playerPage.includes("previewMembershipId=${teamMembership.id}"),
    message: "Player multi-team switcher is missing from the player team dashboard.",
  },
  {
    ok:
      launcher.includes("Set up match fee") &&
      launcher.includes("Playing for, or played for, another SIXFL team?"),
    message: "Temporary-player match-fee launcher is missing its player-facing payment entry point.",
  },
  {
    ok:
      routeScoped.includes("if (isPlayerTeamRoot) return <TemporaryPlayerPassLauncher />;") ||
      playerPage.includes("<TemporaryPlayerPassLauncher"),
    message: "The player team dashboard no longer mounts the temporary-player match-fee launcher.",
  },
  {
    ok:
      playerPage.includes('fee."temporaryUserId" = ${user.id}') &&
      playerPage.includes("const allPlayerFees = [") &&
      playerPage.includes("Temporary player · {fee.temporaryTeamName}"),
    message: "Temporary-player fees are not integrated into the main player match-fee ledger.",
  },
];

const failures = checks.filter((check) => !check.ok);
if (failures.length > 0) {
  console.error("Critical player dashboard feature check failed:");
  for (const failure of failures) console.error(`- ${failure.message}`);
  process.exit(1);
}

console.log(
  "Critical player dashboard features verified: team switching, temporary-player setup and unified player fee visibility are present.",
);
