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
const mergePage = fs.readFileSync(mergePagePath, "utf8");

if (
  !mergePage.includes("Which account should remain active?") ||
  !mergePage.includes("Account that stays active") ||
  !mergePage.includes("Duplicate account that will be disabled") ||
  !mergePage.includes("Result after the merge") ||
  (!mergePage.includes("Keep {keptLabel} — merge and disable {duplicateLabel}") &&
    !mergePage.includes("MergePlayerSubmitButton"))
) {
  throw new Error(
    "Player merge page must clearly identify the account that stays, the duplicate that is disabled and the final team registrations.",
  );
}

const mergeServicePath = path.join(
  process.cwd(),
  "src/lib/players/player-account-merge.ts",
);
let mergeService = fs.readFileSync(mergeServicePath, "utf8");
const emptyDuplicateGuard = [
  "    if (mergedMemberships.length === 0) {",
  '      throw new PlayerMergeConflictError("The duplicate account is not attached to any squad.");',
  "    }",
  "",
].join("\n");

if (mergeService.includes(emptyDuplicateGuard)) {
  mergeService = mergeService.replace(emptyDuplicateGuard, "");
  fs.writeFileSync(mergeServicePath, mergeService, "utf8");
}

if (mergeService.includes("The duplicate account is not attached to any squad.")) {
  throw new Error(
    "Player merge must allow an empty duplicate account to be disabled and merged into the active account.",
  );
}

require("./apply-managed-squad-player-merge-control.cjs");
require("./apply-player-merge-navigation-feedback.cjs");

console.log(
  "Player merge controls are enabled, including safe removal of empty duplicates and clear navigation feedback.",
);
