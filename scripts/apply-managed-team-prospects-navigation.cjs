const fs = require("node:fs");
const path = require("node:path");

const layoutPath = path.join(
  process.cwd(),
  "src/app/captain/team/[teamid]/layout.tsx",
);

let source = fs.readFileSync(layoutPath, "utf8");

const prospectsHref =
  'href: `/captain/team/${teamid}/prospects`, label: "Prospects"';

function getProspectsNavBlock(input) {
  const prospectsIndex = input.indexOf(prospectsHref);
  if (prospectsIndex < 0) return null;

  const guardStart = input.lastIndexOf("...(access.isAdmin", prospectsIndex);
  const guardEnd = input.indexOf("),", prospectsIndex);
  if (guardStart < 0 || guardEnd < 0) return null;

  return {
    start: guardStart,
    end: guardEnd + 2,
    value: input.slice(guardStart, guardEnd + 2),
  };
}

const prospectsBlock = getProspectsNavBlock(source);
if (!prospectsBlock) {
  throw new Error(
    "Expected captain Prospects navigation block was not found in the team layout.",
  );
}

if (!prospectsBlock.value.includes("access.isAdmin && isManagedTeam")) {
  const replacement = prospectsBlock.value.replace(
    "...(access.isAdmin",
    "...(access.isAdmin && isManagedTeam",
  );
  source =
    source.slice(0, prospectsBlock.start) +
    replacement +
    source.slice(prospectsBlock.end);
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
const finalProspectsBlock = getProspectsNavBlock(finalSource);
if (
  !finalProspectsBlock?.value.includes("access.isAdmin && isManagedTeam") ||
  !finalSource.includes(managedTeamBridge)
) {
  throw new Error(
    "Prospects navigation was not restricted to managed squads correctly.",
  );
}

console.log(
  "Prospects navigation and page helper are shown only for admin-managed squads.",
);
