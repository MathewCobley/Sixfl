const fs = require("node:fs");
const path = require("node:path");

const root = process.cwd();
const broadcastPath = path.join(root, "src", "lib", "communications", "send-team-broadcast.ts");
const leagueActionsPath = path.join(root, "src", "app", "(admin)", "admin", "communications", "actions.ts");
const teamBulkActionsPath = path.join(root, "src", "app", "(admin)", "admin", "communications", "team-bulk-actions.ts");

for (const target of [broadcastPath, leagueActionsPath, teamBulkActionsPath]) {
  if (!fs.existsSync(target)) throw new Error(`Unified email target not found: ${target}`);
}

function replaceOnce(source, anchor, replacement, description) {
  if (source.includes(replacement)) return source;
  if (!source.includes(anchor)) throw new Error(`Unified email patch could not find ${description}.`);
  return source.replace(anchor, replacement);
}

// ---------------------------------------------------------------------------
// The normal team broadcaster remains the low-level standard/poll sender, but
// it now respects the same transactional/marketing decision as Team Messages.
// ---------------------------------------------------------------------------
let broadcast = fs.readFileSync(broadcastPath, "utf8");
if (!broadcast.includes("isTransactional?: boolean;")) {
  broadcast = replaceOnce(
    broadcast,
    "  createdByUserId?: string | null;\n};",
    "  createdByUserId?: string | null;\n  isTransactional?: boolean;\n};",
    "send-team-broadcast input type",
  );
}
broadcast = broadcast.replace(
  "    isTransactional: true,",
  "    isTransactional: input.isTransactional ?? true,",
);
fs.writeFileSync(broadcastPath, broadcast, "utf8");

// ---------------------------------------------------------------------------
// League Broadcast: all selected team messages now enter the canonical router.
// That router decides whether the template is standard, poll or Cup workflow.
// ---------------------------------------------------------------------------
let leagueActions = fs.readFileSync(leagueActionsPath, "utf8");
leagueActions = replaceOnce(
  leagueActions,
  'import { sendTeamBroadcastMessage } from "@/lib/communications/send-team-broadcast";',
  'import { sendSIXFLTeamCommunication } from "@/lib/communications/send-sixfl-team-communication";',
  "league communication sender import",
);
leagueActions = leagueActions.replace(
  "const result = await sendTeamBroadcastMessage({",
  "const result = await sendSIXFLTeamCommunication({",
);
fs.writeFileSync(leagueActionsPath, leagueActions, "utf8");

// ---------------------------------------------------------------------------
// Team Messages: earlier compatibility patches used a dedicated Cup branch.
// Keep those old safeguards in the prepared source but make the branch
// unreachable; every team-contact message now enters the same canonical router.
// Individual player/prospect messages remain direct recipient messages.
// ---------------------------------------------------------------------------
let teamActions = fs.readFileSync(teamBulkActionsPath, "utf8");
const unifiedImport =
  'import { sendSIXFLTeamCommunication } from "@/lib/communications/send-sixfl-team-communication";';
if (!teamActions.includes(unifiedImport)) {
  teamActions = replaceOnce(
    teamActions,
    'import { sendTeamBroadcastMessage } from "@/lib/communications/send-team-broadcast";\n',
    'import { sendTeamBroadcastMessage } from "@/lib/communications/send-team-broadcast";\n' + unifiedImport + "\n",
    "Team Messages broadcaster import",
  );
}

teamActions = teamActions.replace(
  "  if (channel === NotificationChannel.EMAIL && isCupTemplate) {",
  "  if (false && channel === NotificationChannel.EMAIL && isCupTemplate) {",
);
teamActions = teamActions.replace(
  '    if (parsed.type === "team" && usesPoll) {',
  '    if (parsed.type === "team") {',
);
teamActions = teamActions.replace(
  "      const result = await sendTeamBroadcastMessage({",
  "      const result = await sendSIXFLTeamCommunication({",
);
teamActions = replaceOnce(
  teamActions,
  "        variables,\n        createdByUserId,\n      });",
  "        variables,\n        createdByUserId,\n        isTransactional,\n        sendMode: cupSendMode === \"test\" ? \"TEST\" : \"SEND\",\n      });",
  "Team Messages canonical sender options",
);
fs.writeFileSync(teamBulkActionsPath, teamActions, "utf8");

for (const [file, markers] of [
  [broadcastPath, ["isTransactional?: boolean", "input.isTransactional ?? true"]],
  [leagueActionsPath, ["sendSIXFLTeamCommunication"]],
  [teamBulkActionsPath, ["sendSIXFLTeamCommunication", 'if (parsed.type === "team")', "sendMode: cupSendMode"]],
]) {
  const finalSource = fs.readFileSync(file, "utf8");
  for (const marker of markers) {
    if (!finalSource.includes(marker)) throw new Error(`Unified email marker missing in ${file}: ${marker}`);
  }
}

console.log("Unified SIXFL team-email engine applied to Team Messages and League Broadcast.");
