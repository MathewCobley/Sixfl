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
  'const OPPONENT_CHANGED_SOURCE_TYPE = "FIXTURE_OPPONENT_CHANGED_NOTICE";',
  "async function queueRemovedTeamNotice(input: {",
  "async function queueOpponentChangedNotice(input: {",
  "const removedTeamIds = new Set(",
  "const scheduledNoticeTeamIds = [",
  "const teamFacingDetailsChanged =",
  "teamId: { in: nextParticipantTeamIds },",
  "teamId: { in: teamFacingDetailsChanged ? retainedTeamIds : [] },",
  "if (removedTeamIds.has(teamId)) {",
  "for (const teamId of scheduledNoticeTeamIds) {",
  "if (!teamFacingDetailsChanged) {",
  "IMPORTANT: your team is no longer playing in the fixture below.",
  "The revised fixture does not involve",
  "You do not need to attend it or confirm it.",
  "Your opposition has changed from",
  "your existing confirmation still stands. You do not need to reconfirm.",
  'emailCta: { label: "View my fixtures", url: fixturesUrl }',
  'notificationKind: "TEAM_REMOVED_FROM_FIXTURE"',
  'notificationKind: "OPPONENT_CHANGED_NO_RECONFIRMATION"',
]) {
  requireText(
    changeNoticeRoute,
    expected,
    `Fixture change notices are missing a team-change safeguard: ${expected}`,
  );
}

const opponentHelperStart = changeNoticeRoute.indexOf(
  "async function queueOpponentChangedNotice(input: {",
);
const postHandlerStart = changeNoticeRoute.indexOf(
  "\nexport async function POST(request: Request) {",
);
const opponentHelper =
  opponentHelperStart >= 0 && postHandlerStart > opponentHelperStart
    ? changeNoticeRoute.slice(opponentHelperStart, postHandlerStart)
    : "";

if (!opponentHelper) {
  throw new Error("Opposition-only fixture update helper is missing.");
}
if (opponentHelper.includes("NotificationChannel.SMS")) {
  throw new Error(
    "Opposition-only fixture changes must send an informational email only, not an SMS.",
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

requireText(
  scheduledBranch,
  "teamId: { in: teamFacingDetailsChanged ? retainedTeamIds : [] },",
  "A retained team's confirmation must only be reset when its own team-facing fixture details changed.",
);
requireText(
  scheduledBranch,
  "if (!teamFacingDetailsChanged) {",
  "Opposition-only changes must branch away from the reconfirmation flow.",
);
requireText(
  scheduledBranch,
  "queued += await queueOpponentChangedNotice({",
  "A retained team must receive an informational opposition-change email.",
);

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
  "Production source preparation must apply the fixture team-change safeguards.",
);

console.log(
  "Fixture team-change notification contract passed: removed teams receive a no-action notice, retained teams keep confirmation and receive email-only notice for opposition-only changes, material detail changes still require retained teams to reconfirm, and newly added teams receive their correct confirmation only after save.",
);