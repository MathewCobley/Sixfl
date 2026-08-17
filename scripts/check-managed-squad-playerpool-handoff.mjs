import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const moveRoutePath =
  "src/app/api/captain/team/[teamid]/move-player-to-prospect/route.ts";
const prospectRoutePath =
  "src/app/api/admin/player-prospects/[prospectId]/player-pool/route.ts";
const servicePath = "src/lib/player-pool/sendProspectToPlayerPool.ts";
const managedSquadLinksPath =
  "src/components/captain/ManagedSquadEditLinks.tsx";

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

const moveRoute = read(moveRoutePath);
const prospectRoute = read(prospectRoutePath);
const service = read(servicePath);
const managedSquadLinks = read(managedSquadLinksPath);
const failures = [];

function expect(source, marker, message) {
  if (!source.includes(marker)) failures.push(message);
}

expect(
  moveRoute,
  'import { sendProspectToPlayerPool } from "@/lib/player-pool/sendProspectToPlayerPool";',
  "Managed squad PlayerPool move must use the shared PlayerPool service.",
);
expect(
  moveRoute,
  "memberContext.user.email?.trim()",
  "Managed squad PlayerPool move must reject missing email before removing the squad member.",
);
expect(
  moveRoute,
  "const result = await moveTeamMemberToProspect",
  "Managed squad PlayerPool move must still remove the player from the active squad safely.",
);
expect(
  moveRoute,
  "const playerPool = await sendProspectToPlayerPool",
  "Managed squad PlayerPool move must immediately create/reuse the PlayerPool profile.",
);
expect(
  moveRoute,
  "requestedLeagueId: memberContext.team.league?.id ?? null",
  "Managed squad PlayerPool move must preserve the original team's league context.",
);
expect(
  moveRoute,
  'revalidatePath("/admin/player-pool")',
  "Managed squad PlayerPool move must refresh the admin PlayerPool.",
);
expect(
  prospectRoute,
  "sendProspectToPlayerPool({",
  "The player-prospects PlayerPool action must use the same shared service.",
);
expect(
  service,
  'FROM "PlayerPoolProfile"',
  "Shared PlayerPool service must reuse existing profiles before creating another one.",
);
expect(
  service,
  "queueNotificationFromTemplate({",
  "Shared PlayerPool service must preserve the normal profile-form invitation.",
);

const moveFunctionStart = managedSquadLinks.indexOf(
  "async function movePlayerToProspects(",
);
const moveFunctionEnd = managedSquadLinks.indexOf(
  "\nasync function markPlayerNotInterested(",
  moveFunctionStart,
);
if (moveFunctionStart < 0 || moveFunctionEnd < 0) {
  failures.push("Managed squad PlayerPool move UI function must remain available.");
} else {
  const moveFunction = managedSquadLinks.slice(moveFunctionStart, moveFunctionEnd);
  expect(
    moveFunction,
    "/move-player-to-prospect",
    "Managed squad PlayerPool button must call the direct PlayerPool handoff endpoint.",
  );
  expect(
    moveFunction,
    'window.location.href = "/admin/player-pool";',
    "Successful managed squad PlayerPool moves must finish on Admin PlayerPool.",
  );
  if (moveFunction.includes('window.location.href = "/admin/player-prospects";')) {
    failures.push(
      "Successful managed squad PlayerPool moves must not redirect back to Player Prospects.",
    );
  }
}

if (failures.length) {
  console.error("\nMANAGED SQUAD → PLAYERPOOL HANDOFF CHECK FAILED\n");
  failures.forEach((failure) => console.error(` - ${failure}`));
  process.exit(1);
}

console.log("Managed squad → PlayerPool handoff check passed.");
