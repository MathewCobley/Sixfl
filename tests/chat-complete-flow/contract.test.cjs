const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");

const read = (file) => fs.readFileSync(file, "utf8");

test("captains can privately message another captain", () => {
  const schema = read("prisma/schema.prisma");
  const helper = read("src/lib/portal-messaging.ts");
  const route = read("src/app/api/portal-chat/team/[teamid]/route.ts");

  assert.match(schema, /CAPTAIN_CAPTAIN/);
  assert.match(helper, /captainCaptainConversationKey/);
  assert.match(helper, /ensureCaptainCaptainConversation/);
  assert.match(route, /captainChatRef\(member\.userId\)/);
  assert.match(route, /PortalConversationType\.CAPTAIN_CAPTAIN/);
  assert.match(route, /role: TeamRole\.CAPTAIN/);
  assert.match(route, /\$\{roleLabel\} · private with you/);
});

test("admin preview can send simulated replies without notifying real users", () => {
  const schema = read("prisma/schema.prisma");
  const route = read("src/app/api/portal-chat/team/[teamid]/route.ts");
  const playerPage = read("src/app/player/team/[teamid]/chat/page.tsx");
  const chat = read("src/components/messaging/PortalChat.tsx");

  assert.match(schema, /isAdminTest Boolean @default\(false\)/);
  assert.match(playerPage, /simulateTestMode=\{Boolean\(previewMembershipId\)\}/);
  assert.match(route, /simulateRequested/);
  assert.match(route, /isSimulatedTestMode: simulateRequested/);
  assert.match(route, /canSend: simulateRequested/);
  assert.match(route, /isAdminTest:[\s\S]*context\.isSimulatedTestMode/);
  assert.match(route, /!context\.isSimulatedTestMode[\s\S]*queuePushNotifications/);
  assert.match(chat, /Simulated Test Reply/);
  assert.match(chat, /No phone push notifications are sent/);
});

test("captain copy is addressed to the captain rather than system wording", () => {
  const chat = read("src/components/messaging/PortalChat.tsx");
  const route = read("src/app/api/portal-chat/team/[teamid]/route.ts");

  assert.match(chat, /Private between \$\{selectedItem\?\.title \?\? "this person"\} and you/);
  assert.match(chat, /Use Whole Squad Chat, Regulars, Selected Players or a private conversation/);
  assert.match(chat, /Private messages/);
  assert.match(route, /private with you/);
  assert.doesNotMatch(chat, /team captain\(s\)/i);
  assert.doesNotMatch(chat, /Private player messages/);
});

test("Message SIXFL is an in-chat conversation with a composer", () => {
  const helper = read("src/lib/portal-messaging.ts");
  const route = read("src/app/api/portal-chat/team/[teamid]/route.ts");
  const chat = read("src/components/messaging/PortalChat.tsx");

  assert.match(helper, /ensureSixflPortalConversation/);
  assert.match(route, /SIXFL_CHAT_REF/);
  assert.match(route, /resolveSixflParticipantUserId/);
  assert.match(route, /kind: "SUPPORT"/);
  assert.match(chat, /supportItems/);
  assert.match(chat, /Private between you and SIXFL/);
  assert.match(chat, /Message SIXFL…/);
  assert.match(chat, /onSelect=\{setSelectedRef\}/);
  assert.doesNotMatch(chat, /sixflHref/);
});
