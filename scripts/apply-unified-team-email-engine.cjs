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
// Workflow placeholders are therefore allowed through the generic unresolved-
// token guard and resolved by the canonical router instead.
// ---------------------------------------------------------------------------
let leagueActions = fs.readFileSync(leagueActionsPath, "utf8");
leagueActions = replaceOnce(
  leagueActions,
  'import { sendTeamBroadcastMessage } from "@/lib/communications/send-team-broadcast";',
  'import { sendSIXFLTeamCommunication } from "@/lib/communications/send-sixfl-team-communication";',
  "league communication sender import",
);

if (!leagueActions.includes("TEAM_EMAIL_WORKFLOW_TOKENS")) {
  leagueActions = replaceOnce(
    leagueActions,
    'const POLL_TOKENS = ["pollOptions", "pollLink"];',
    'const POLL_TOKENS = ["pollOptions", "pollLink"];\nconst TEAM_EMAIL_WORKFLOW_TOKENS = [\n  "cupName",\n  "cupFormat",\n  "matchFee",\n  "venueNote",\n  "scheduleNote",\n  "responseDeadline",\n  "yesResponseUrl",\n  "noResponseUrl",\n  "yesUrl",\n  "noUrl",\n];',
    "league workflow token list",
  );
}

leagueActions = leagueActions.replace(
  "      extraTokens: selectedPollId ? POLL_TOKENS : [],",
  "      extraTokens: [...(selectedPollId ? POLL_TOKENS : []), ...TEAM_EMAIL_WORKFLOW_TOKENS],",
);
leagueActions = leagueActions.replace(
  "const result = await sendTeamBroadcastMessage({",
  "const result = await sendSIXFLTeamCommunication({",
);
fs.writeFileSync(leagueActionsPath, leagueActions, "utf8");

// ---------------------------------------------------------------------------
// Team Messages: remove the older route-specific Cup send branch from the
// prepared source. All team-contact messages now enter the same canonical
// router. Individual player/prospect messages remain direct-recipient messages.
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

const legacyCupStart = teamActions.indexOf("  // ordinary Team Messages Cup send\n");
if (legacyCupStart !== -1) {
  const legacyCupEnd = teamActions.indexOf(
    '  if (usesPoll && parsedRecipients.some((item) => item.parsed.type !== "team")) {',
    legacyCupStart,
  );
  if (legacyCupEnd === -1) {
    throw new Error("Unified email patch found the old Cup branch but not its end marker.");
  }
  teamActions = teamActions.slice(0, legacyCupStart) + teamActions.slice(legacyCupEnd);
}

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
  [leagueActionsPath, ["sendSIXFLTeamCommunication", "TEAM_EMAIL_WORKFLOW_TOKENS"]],
  [teamBulkActionsPath, ["sendSIXFLTeamCommunication", 'if (parsed.type === "team")', "sendMode: cupSendMode"]],
]) {
  const finalSource = fs.readFileSync(file, "utf8");
  for (const marker of markers) {
    if (!finalSource.includes(marker)) throw new Error(`Unified email marker missing in ${file}: ${marker}`);
  }
}

if (fs.readFileSync(teamBulkActionsPath, "utf8").includes("ordinary Team Messages Cup send")) {
  throw new Error("Legacy Team Messages Cup branch survived unified email preparation.");
}

console.log("Unified SIXFL team-email engine applied to Team Messages and League Broadcast.");

require("./apply-referee-part-cash-payment.cjs");
require("./apply-referee-part-cash-referee-view.cjs");