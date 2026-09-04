import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const failures = [];

function read(relativePath) {
  const absolutePath = path.join(root, relativePath);
  if (!fs.existsSync(absolutePath)) {
    failures.push(`Missing required file: ${relativePath}`);
    return "";
  }
  return fs.readFileSync(absolutePath, "utf8");
}

function expect(source, marker, message) {
  if (!source.includes(marker)) failures.push(message);
}

function reject(source, marker, message) {
  if (source.includes(marker)) failures.push(message);
}

const reminderService = read("src/lib/player-pool/profile-reminders.ts");
const individualRoute = read(
  "src/app/api/admin/player-pool/[profileId]/nudge/route.ts",
);
const bulkRoute = read(
  "src/app/api/admin/player-pool/bulk-profile-reminders/route.ts",
);
const bulkControl = read(
  "src/components/admin/player-pool/BulkPlayerPoolProfileReminderButton.tsx",
);
const individualControl = read(
  "src/components/admin/player-pool/PlayerPoolNudgeButton.tsx",
);
const playerPoolPage = read("src/app/(admin)/admin/player-pool/page.tsx");
const oldBridge = read(
  "src/components/admin/player-pool/PlayerPoolNudgeBridge.tsx",
);

expect(
  reminderService,
  '"player-pool-profile-reminder-email"',
  "Profile reminders must use their own editable notification template.",
);
expect(
  reminderService,
  'ctaLabel: "Complete my PlayerPool profile"',
  "The reminder email must retain a clear profile-completion button.",
);
expect(
  reminderService,
  'ctaUrlKey: "profileUrl"',
  "The reminder button must resolve each player's secure profile URL.",
);
expect(
  reminderService,
  "## ⚽ What is SIXFL PlayerPool?",
  "The email must explain what PlayerPool is.",
);
expect(
  reminderService,
  "## 🚀 How PlayerPool works",
  "The email must explain the controlled introduction process.",
);
expect(
  reminderService,
  "## 🏆 What is a SIXFL league like?",
  "The email must explain how SIXFL league football works.",
);
expect(
  reminderService,
  "Your private contact details are not made public",
  "The PlayerPool reminder must preserve the contact privacy explanation.",
);
expect(
  reminderService,
  "does not charge you anything and does not commit you to a team",
  "The reminder must make the no-charge and no-commitment position clear.",
);
expect(
  reminderService,
  "PLAYER_POOL_PROFILE_REMINDER_SOURCE_TYPE",
  "Individual and bulk reminders must share one auditable source type.",
);

expect(
  individualRoute,
  "queuePlayerPoolProfileReminder",
  "The individual reminder button must use the full shared PlayerPool email.",
);
expect(
  bulkRoute,
  'profile."status" = \'INVITED\'',
  "Bulk reminders must be limited to invited PlayerPool profiles.",
);
expect(
  bulkRoute,
  'profile."profileSubmittedAt" IS NULL',
  "Bulk reminders must exclude every completed profile.",
);
expect(
  bulkRoute,
  "Promise.allSettled",
  "One bad profile must not stop the rest of a bulk reminder run.",
);
expect(
  bulkRoute,
  'origin: "player_pool_profile_bulk_reminder"',
  "Bulk reminder dispatches must retain auditable origin metadata.",
);
expect(
  bulkControl,
  "Email all awaiting profiles",
  "The Awaiting profile screen must expose a clear bulk email button.",
);
expect(
  bulkControl,
  "window.confirm",
  "The bulk email action must require an explicit confirmation.",
);
expect(
  bulkControl,
  "The latest email date is shown on each player card below.",
  "The bulk result must tell the admin where to verify per-player dates.",
);
expect(
  individualControl,
  "Last profile email:",
  "Each PlayerPool card must display its latest reminder date.",
);
expect(
  individualControl,
  "initialLastNudgeStatus",
  "Each date must remain paired with delivery status.",
);
expect(
  individualControl,
  "initialLastNudgeBy",
  "Each reminder date must retain sender attribution.",
);

expect(
  playerPoolPage,
  "BulkPlayerPoolProfileReminderButton",
  "Production-prepared PlayerPool source must render the bulk reminder natively.",
);
expect(
  playerPoolPage,
  'selectedView === "awaiting"',
  "The bulk reminder must appear only in the Awaiting profile section.",
);
expect(
  playerPoolPage,
  "awaitingCount={counts.awaiting}",
  "The bulk button count must come from actual awaiting PlayerPool profiles.",
);
expect(
  playerPoolPage,
  'dispatch."sourceType" = \'PLAYER_POOL_PROFILE_NUDGE\'',
  "The PlayerPool page must read persistent dispatch history for reminder dates.",
);
expect(
  playerPoolPage,
  "ensurePlayerPoolProfileReminderTemplate",
  "Opening PlayerPool admin must make the editable reminder template available.",
);
expect(
  oldBridge,
  "return null;",
  "The retired PlayerPool DOM bridge must remain inert.",
);
reject(
  oldBridge,
  "MutationObserver",
  "The PlayerPool reminder workflow must not return to DOM observation.",
);
reject(
  oldBridge,
  "document.querySelector",
  "The PlayerPool reminder workflow must not scrape rendered cards.",
);

if (failures.length) {
  console.error("\nPLAYERPOOL PROFILE REMINDER CONTRACT FAILED\n");
  for (const failure of failures) console.error(` - ${failure}`);
  process.exit(1);
}

console.log(
  "PlayerPool profile reminder contract passed: rich email, awaiting-only bulk send, secure CTA, native controls and persistent per-player dates are present.",
);