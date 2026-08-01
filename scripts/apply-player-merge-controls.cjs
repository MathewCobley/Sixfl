const fs = require("node:fs");
const path = require("node:path");

const filePath = path.join(
  process.cwd(),
  "src/app/(admin)/admin/teams/[id]/squad/page.tsx",
);
let source = fs.readFileSync(filePath, "utf8");

const existingLink = [
  "                      <Link",
  "                        href={`/admin/teams/${team.id}/players/${member.id}/communications`}",
  '                        className={`${adminMemberActionClassName} border-emerald-400/30 bg-emerald-500/10 text-emerald-100 hover:bg-emerald-500/15`}',
  "                      >",
  "                        Player comms",
  "                      </Link>",
].join("\n");

const linkWithMerge = [
  existingLink,
  "",
  "                      <Link",
  "                        href={`/admin/players/merge/${member.user.id}?teamId=${team.id}`}",
  '                        className={`${adminMemberActionClassName} border-red-400/25 bg-red-500/10 text-red-100 hover:bg-red-500/15`}',
  "                      >",
  "                        Merge player",
  "                      </Link>",
].join("\n");

if (!source.includes("/admin/players/merge/${member.user.id}")) {
  if (!source.includes(existingLink)) {
    throw new Error("Admin squad player communications link was not found for merge control.");
  }
  source = source.replace(existingLink, linkWithMerge);
}

fs.writeFileSync(filePath, source, "utf8");

if (!source.includes("Merge player")) {
  throw new Error("Player merge control was not added to the admin squad console.");
}

const mergePagePath = path.join(
  process.cwd(),
  "src/app/(admin)/admin/players/merge/[userId]/page.tsx",
);
let mergePage = fs.readFileSync(mergePagePath, "utf8");
mergePage = mergePage.replace(
  "Team memberships and player history move to the kept account. Where both records exist in the same team, availability, selection and profile data are consolidated. The discarded login is disabled and the merge is audited.",
  "Every squad card and team registration belonging to the duplicate account moves to the account you keep. Where both accounts already have a card in the same team, those cards, profiles, availability, selections and history are consolidated into one. The discarded login is disabled and the merge is audited.",
);
mergePage = mergePage.replace(
  "Merge duplicate into this account",
  "Merge every card from this duplicate account",
);
fs.writeFileSync(mergePagePath, mergePage, "utf8");

if (
  !mergePage.includes("Every squad card and team registration") ||
  !mergePage.includes("Merge every card from this duplicate account")
) {
  throw new Error("Player merge scope was not made clear on the confirmation page.");
}

require("./apply-managed-squad-player-merge-control.cjs");

console.log(
  "Added the full player-account merge workflow to admin and managed squad player cards, with explicit all-card merge wording.",
);
