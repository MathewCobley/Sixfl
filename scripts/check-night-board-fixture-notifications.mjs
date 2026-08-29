import fs from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

function requireText(source, expected, message) {
  if (!source.includes(expected)) {
    throw new Error(message);
  }
}

const route = read("src/app/api/admin/night-board/update-match/route.ts");
const notifications = read(
  "src/lib/fixtures/night-board-change-notifications.ts",
);
const layout = read("src/app/(admin)/admin/layout.tsx");
const notice = read(
  "src/components/admin/night-board/NightBoardSaveNotice.tsx",
);
const repairMigration = read(
  "prisma/migrations/20260829214500_reset_stale_units_microwave_confirmations/migration.sql",
);

requireText(
  route,
  'from "@/lib/fixtures/night-board-change-notifications"',
  "Night Board save route must use the native fixture-change notification service.",
);
requireText(
  route,
  "await queueNightBoardFixtureChangeNotifications({",
  "Night Board save route must queue fixture-change notifications.",
);

for (const expected of [
  "await prisma.$transaction(async (tx) => {",
  "await tx.fixture.update({",
  "await tx.fixtureCaptainConfirmation.updateMany({",
  "const teamFacingDetailsChanged =",
  "const shouldResetTeamResponses =",
  "Boolean(fixture.publishedAt)",
  "status !== FixtureStatus.COMPLETED",
  "FixtureCaptainConfirmationStatus.PENDING",
  "FixtureCaptainConfirmationStatus.CONFIRMED",
  "FixtureCaptainConfirmationStatus.ISSUE_RAISED",
  "confirmedAt: null",
  "issueRaisedAt: null",
  "lastChasedAt: null",
  "confirmedByUserId: null",
  "note: getConfirmationResetNote(status)",
]) {
  requireText(
    route,
    expected,
    `Night Board save route is missing confirmation invalidation safeguard: ${expected}`,
  );
}

const transactionPosition = route.indexOf(
  "await prisma.$transaction(async (tx) => {",
);
const updatePosition = route.indexOf("await tx.fixture.update({");
const confirmationResetPosition = route.indexOf(
  "await tx.fixtureCaptainConfirmation.updateMany({",
);
const paymentSyncPosition = route.indexOf(
  "const sync = await resyncMatchFeeMessages({",
);
const notificationPosition = route.indexOf(
  "await queueNightBoardFixtureChangeNotifications({",
);
if (
  transactionPosition < 0 ||
  updatePosition <= transactionPosition ||
  confirmationResetPosition <= updatePosition ||
  paymentSyncPosition <= confirmationResetPosition ||
  notificationPosition <= paymentSyncPosition
) {
  throw new Error(
    "Night Board team responses must be invalidated in the same transaction as the fixture update, before payment or notification follow-up work can fail.",
  );
}

for (const expected of [
  "NotificationAudience.TEAM",
  "NotificationAudience.REFEREE",
  "NotificationChannel.EMAIL",
  "NotificationChannel.SMS",
  "FixtureCaptainConfirmationStatus.PENDING",
  "FixtureCaptainConfirmationStatus.CONFIRMED",
  "FixtureCaptainConfirmationStatus.ISSUE_RAISED",
  "async function resetTeamResponses(input: {",
  "issueRaisedAt: null",
  "lastChasedAt: null",
  '"FIXTURE_REMINDER"',
  "queueNotificationFromTemplate({",
]) {
  requireText(
    notifications,
    expected,
    `Night Board notification service is missing required contract: ${expected}`,
  );
}

requireText(
  notifications,
  "input.before.referee?.id !== input.after.referee?.id",
  "Referee assignment changes must notify both the removed and newly assigned referee.",
);
requireText(
  route,
  'url.searchParams.set("matchSaved", "1")',
  "Night Board save response must carry visible notification results.",
);
requireText(
  layout,
  "import NightBoardSaveNotice",
  "Admin layout must mount the Night Board save notice.",
);
requireText(
  layout,
  "<NightBoardSaveNotice />",
  "Night Board save notice is not rendered.",
);
requireText(
  notice,
  "Match saved and notifications queued",
  "Night Board save notice must clearly report successful notification queuing.",
);
requireText(
  notice,
  "some messages need attention",
  "Night Board save notice must clearly report skipped or failed notifications.",
);

for (const expected of [
  "northallerton wednesday mens",
  "the units",
  "microwave afc",
  "2026-09-02",
  "'CONFIRMED'",
  "'ISSUE_RAISED'",
  '"status" = \'PENDING\'',
  '"confirmedAt" = NULL',
  '"issueRaisedAt" = NULL',
  '"lastChasedAt" = NULL',
  '"confirmedByUserId" = NULL',
]) {
  requireText(
    repairMigration,
    expected,
    `The targeted stale-response repair is missing required safeguard: ${expected}`,
  );
}

console.log(
  "Night Board fixture-change contract passed: changed published fixtures invalidate confirmed and issue-raised team responses atomically, stale timestamps are cleared, the affected Northallerton fixture is repaired, team/referee notifications remain native, and the admin sees delivery counts.",
);
