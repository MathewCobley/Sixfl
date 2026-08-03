const fs = require("node:fs");
const path = require("node:path");

const layoutPath = path.join(
  process.cwd(),
  "src/app/captain/team/[teamid]/layout.tsx",
);

let source = fs.readFileSync(layoutPath, "utf8");

const standardTeamNav = [
  "    ...(access.isAdmin",
  '      ? [{ href: `/captain/team/${teamid}/prospects`, label: "Prospects" }]',
  "      : []),",
].join("\n");

const managedTeamNav = [
  "    ...(access.isAdmin && isManagedTeam",
  '      ? [{ href: `/captain/team/${teamid}/prospects`, label: "Prospects" }]',
  "      : []),",
].join("\n");

if (!source.includes(managedTeamNav)) {
  if (!source.includes(standardTeamNav)) {
    throw new Error(
      "Expected captain Prospects navigation block was not found in the team layout.",
    );
  }

  source = source.replace(standardTeamNav, managedTeamNav);
}

const allTeamBridge = "      <ProspectsReadableLayout />";
const managedTeamBridge =
  "      {isManagedTeam ? <ProspectsReadableLayout /> : null}";

if (!source.includes(managedTeamBridge)) {
  if (!source.includes(allTeamBridge)) {
    throw new Error(
      "Expected prospects layout helper was not found in the captain team layout.",
    );
  }

  source = source.replace(allTeamBridge, managedTeamBridge);
}

fs.writeFileSync(layoutPath, source, "utf8");

const finalSource = fs.readFileSync(layoutPath, "utf8");
if (
  !finalSource.includes(managedTeamNav) ||
  !finalSource.includes(managedTeamBridge) ||
  finalSource.includes(standardTeamNav)
) {
  throw new Error(
    "Prospects navigation was not restricted to managed squads correctly.",
  );
}

console.log(
  "Prospects navigation and page helper are shown only for admin-managed squads.",
);
