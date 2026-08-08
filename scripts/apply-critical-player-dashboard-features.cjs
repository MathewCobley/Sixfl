const fs = require("node:fs");
const path = require("node:path");

// These two features have previously disappeared when their standalone patch
// scripts dropped out of the prebuild chain. Keep them grouped as one critical
// player-dashboard contract so a normal build restores and verifies both.
require("./apply-player-team-switcher.cjs");
require("./apply-temporary-player-team-label-clarity.cjs");

const root = process.cwd();

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

const playerPage = read("src/app/player/team/[teamid]/page.tsx");
const launcher = read("src/components/captain/TemporaryPlayerPassLauncher.tsx");
const routeScoped = read("src/components/RouteScopedBridges.tsx");

const checks = [
  {
    ok: playerPage.includes("Switch team") && playerPage.includes("playerMemberships.length > 1"),
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
];

const failures = checks.filter((check) => !check.ok);
if (failures.length > 0) {
  console.error("Critical player dashboard feature check failed:");
  for (const failure of failures) console.error(`- ${failure.message}`);
  process.exit(1);
}

console.log(
  "Critical player dashboard features verified: team switching and another-team match-fee setup are present.",
);
