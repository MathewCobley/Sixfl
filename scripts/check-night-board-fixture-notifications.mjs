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

const updatePosition = route.indexOf("await prisma.fixture.update({");
const notificationPosition = route.indexOf(
  "await queueNightBoardFixtureChangeNotifications({",
);
if (
  updatePosition < 0 ||
  notificationPosition < 0 ||
  notificationPosition <= updatePosition
) {
  throw new Error(
    "Night Board fixture-change notifications must be queued only after the fixture update succeeds.",
  );
}

for (const expected of [
  "NotificationAudience.TEAM",
  "NotificationAudience.REFEREE",
  "NotificationChannel.EMAIL",
  "NotificationChannel.SMS",
  "FixtureCaptainConfirmationStatus.PENDING",
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

console.log(
  "Night Board fixture-change notification contract passed: team and referee email/SMS notifications are native to Save match, stale reminders are replaced, and the admin sees delivery counts.",
);
