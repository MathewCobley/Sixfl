import assert from "node:assert/strict";
import fs from "node:fs";
const read = p => fs.readFileSync(p,"utf8");
const page = read("src/app/(admin)/admin/player-pool/page.tsx");
const row = page.match(/type ProfileRow = \{[\s\S]*?\n\};/)?.[0] || "";
assert.equal((row.match(/prospectId: string;/g) || []).length, 1, "One native prospect ID field must survive preparation");
for (const marker of ["PlayerPoolContactHistory", "PlayerPoolResponseChaseButton", "getPlayerPoolFollowupStates", "PlayerPoolNudgeButton", "BulkPlayerPoolProfileReminderButton", "PlayerPoolSmsChaseHistory", "PlayerPoolJoinedTeams"]) assert.ok(page.includes(marker), marker);
assert.ok(!fs.existsSync("scripts/apply-player-pool-nudge-history.cjs"));
assert.ok(!read("scripts/check-central-standings-usage.cjs").includes("apply-player-pool-nudge-history.cjs"));
assert.match(read("src/lib/notifications/processor.ts"), /getPlayerPoolFollowupDeliveryBlock/);
assert.match(read("src/lib/player-pool/response-chases.ts"), /queueNotificationFromTemplate/);
assert.doesNotMatch(read("src/lib/player-pool/response-chases.ts"), /sendEmailWithResend|sendSmsWithTwilio|queueDirectNotification/);
for (const path of ["src/components/admin/player-pool/PlayerPoolContactHistory.tsx", "src/components/admin/player-pool/PlayerPoolResponseChaseButton.tsx", "src/app/(admin)/admin/player-pool/page.tsx"]) {
  assert.doesNotMatch(read(path), /MutationObserver|document\.querySelector|innerHTML\s*=/);
}
const publicPage = read("src/app/(public)/player-pool/profile/[token]/respond/page.tsx");
assert.doesNotMatch(publicPage, /declinePlayerPoolResponse\(/);
assert.match(publicPage, /form action=/);
assert.match(publicPage, /index: false/);
console.log("Native PlayerPool response controls, history, read-only GET, token POST and provider gate present.");
