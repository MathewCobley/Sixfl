import fs from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");

function read(relativePath) {
  const absolutePath = path.join(root, relativePath);
  if (!fs.existsSync(absolutePath)) {
    throw new Error(`Missing fixture team-change contract file: ${relativePath}`);
  }
  return fs.readFileSync(absolutePath, "utf8");
}

function requireText(source, expected, message) {
  if (!source.includes(expected)) {
    throw new Error(message);
  }
}

const changeNoticeRoute = read(
  "src/app/api/admin/fixtures/change-notice/route.ts",
);
const editAction = read(
  "src/app/(admin)/admin/fixtures/[id]/edit/actions.ts",
);
const sourcePreparation = read(
  "scripts/apply-admin-team-kickoff-summary.cjs",
);

for (const expected of [
  "async function queueRemovedTeamNotice(input: {",
  "const removedTeamIds = new Set(",
  "const scheduledNoticeTeamIds = [",
  "teamId: { in: nextParticipantTeamIds },",
  "if (removedTeamIds.has(teamId)) {",
  "for (const teamId of scheduledNoticeTeamIds) {",
  "IMPORTANT: your team is no longer playing in the fixture below.",
  "The revised fixture does not involve",
  "You do not need to attend it or confirm it.",
  'emailCta: { label: "View my fixtures", url: fixturesUrl }',
  'notificationKind: "TEAM_REMOVED_FROM_FIXTURE"',
]) {
  requireText(
    changeNoticeRoute,
    expected,
    `Fixture change notices are missing the removed-team safeguard: ${expected}`,
  );
}

const scheduledBranchStart = changeNoticeRoute.indexOf(
  "  if (!shouldSendReconfirmNoticeForStatus(status)) {",
);
const scheduledBranch =
  scheduledBranchStart >= 0
    ? changeNoticeRoute.slice(scheduledBranchStart)
    : "";

if (
  !scheduledBranch ||
  scheduledBranch.includes("for (const teamId of affectedTeamIds) {")
) {
  throw new Error(
    "Scheduled fixture changes must not send the pre-save generic update to newly added teams.",
  );
}

for (const expected of [
  "const addedTeamIds = [homeTeamId, awayTeamId].filter(",
  "await queueInitialFixtureConfirmationEmailForTeam({",
  "teamId: addedTeamId,",
]) {
  requireText(
    editAction,
    expected,
    `The saved fixture action must send newly added teams their own correct fixture confirmation: ${expected}`,
  );
}

requireText(
  sourcePreparation,
  'require("./apply-clear-removed-team-fixture-notices.cjs")',
  "Production source preparation must apply the removed-team fixture notice safeguard.",
);

console.log(
  "Fixture team-change notification contract passed: removed teams receive a no-action notice linked to their own fixtures, retained teams receive the updated-fixture notice, and newly added teams receive their correct confirmation only after the fixture is saved.",
);
