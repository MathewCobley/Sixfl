const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");

const read = (file) => fs.readFileSync(file, "utf8");

test("admin chat test mode is writable without opening team chat to users", () => {
  const route = read("src/app/api/portal-chat/team/[teamid]/route.ts");
  const captainPage = read("src/app/captain/team/[teamid]/chat/page.tsx");
  const playerPage = read("src/app/player/team/[teamid]/chat/page.tsx");

  assert.match(route, /actualUser\.role !== UserRole\.ADMIN/);
  assert.match(route, /Whole Squad Chat is not available yet/);
  assert.match(route, /adminTestRequested/);
  assert.match(route, /isAdminTestMode: adminTestRequested/);
  assert.match(route, /canSend: adminTestRequested/);
  assert.match(route, /PortalMessageSenderRole\.ADMIN/);
  assert.match(captainPage, /adminTestMode/);
  assert.doesNotMatch(playerPage, /adminTestMode/);
  assert.match(playerPage, /previewMembershipId/);
});

test("admin test messages never trigger phone push notifications", () => {
  const route = read("src/app/api/portal-chat/team/[teamid]/route.ts");
  const chat = read("src/components/messaging/PortalChat.tsx");

  assert.match(route, /!context\.isAdminTestMode[\s\S]*!context\.isSimulatedTestMode[\s\S]*targets\.length > 0[\s\S]*queuePushNotifications/);
  assert.match(route, /!context\.isAdminTestMode[\s\S]*!context\.isSimulatedTestMode[\s\S]*notifyTeam/);
  assert.match(chat, /Admin Test Mode/);
  assert.match(chat, /No phone push notifications are sent/);
  assert.match(chat, /Admin Test Mode · stored in chat · no phone alert/);
});

test("admin can clear all test chat history only after typing the exact team name", () => {
  const route = read("src/app/api/portal-chat/team/[teamid]/route.ts");
  const chat = read("src/components/messaging/PortalChat.tsx");

  assert.match(route, /export async function DELETE/);
  assert.match(route, /Admin Test Mode is required to clear chat history/);
  assert.match(route, /confirmTeamName !== team\.name/);
  assert.match(route, /pushNotification\.deleteMany/);
  assert.match(route, /portalConversation\.deleteMany/);
  assert.match(chat, /Clear test messages/);
  assert.match(chat, /window\.prompt/);
  assert.match(chat, /Type the exact team name to continue/);
});

test("admin messaging audit includes ADMIN test messages", () => {
  const dashboard = read("src/lib/admin/app-messaging.ts");

  assert.match(dashboard, /PortalMessageSenderRole\.ADMIN/);
  assert.match(dashboard, /PortalMessageSenderRole\.CAPTAIN/);
  assert.match(dashboard, /PortalMessageSenderRole\.PLAYER/);
});
