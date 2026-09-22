const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");

const read = (file) => fs.readFileSync(file, "utf8");

test("SIXFL Chat brands the messaging feature while Whole Squad Chat remains the team-wide audience", () => {
  const chat = read("src/components/messaging/PortalChat.tsx");
  const helper = read("src/lib/portal-messaging.ts");
  const captainLayout = read("src/app/captain/team/[teamid]/layout.tsx");
  const playerHome = read("src/components/player/PlayerAppHome.tsx");
  const captainPage = read("src/app/captain/team/[teamid]/chat/page.tsx");
  const playerPage = read("src/app/player/team/[teamid]/chat/page.tsx");
  const adminPanel = read("src/components/admin/messaging/AdminAppMessagingPanel.tsx");

  assert.match(chat, /SIXFL Chat/);
  assert.match(chat, /Whole Squad Chat/);
  assert.match(helper, /title: "Whole Squad Chat"/);
  assert.match(captainLayout, /label: "SIXFL Chat"/);
  assert.match(playerHome, />SIXFL Chat<\/span>/);
  assert.match(captainPage, /title: "SIXFL Chat \| SIXFL"/);
  assert.match(playerPage, /title: "SIXFL Chat \| SIXFL"/);
  assert.match(adminPanel, /Whole Squad Chat control centre/);
});

test("captains control Regulars from both squad views", () => {
  const schema = read("prisma/schema.prisma");
  const action = read("src/app/captain/team/[teamid]/regulars/actions.ts");
  const captainSquad = read("src/app/captain/team/[teamid]/captain-squad/page.tsx");
  const adminSquad = read("src/app/captain/team/[teamid]/squad/page.tsx");

  assert.match(schema, /isRegular Boolean @default\(false\)/);
  assert.match(action, /setSquadMemberRegularAction/);
  assert.match(action, /data: \{ isRegular \}/);
  assert.match(captainSquad, /Mark Regular/);
  assert.match(captainSquad, /Regular ✓/);
  assert.match(adminSquad, /Mark Regular/);
  assert.match(adminSquad, /Regular ✓/);
  assert.match(captainSquad, /label="Regulars"/);
});

test("Regulars and Selected Players create snapshot group conversations", () => {
  const schema = read("prisma/schema.prisma");
  const route = read("src/app/api/portal-chat/team/[teamid]/route.ts");

  assert.match(schema, /REGULARS/);
  assert.match(schema, /SELECTED_GROUP/);
  assert.match(schema, /model PortalConversationMember/);
  assert.match(schema, /@@unique\(\[conversationId, userId\]\)/);

  assert.match(route, /action === "create-group"/);
  assert.match(route, /audience !== "REGULARS" && audience !== "SELECTED"/);
  assert.match(route, /isRegular: true/);
  assert.match(route, /PortalConversationType\.REGULARS/);
  assert.match(route, /PortalConversationType\.SELECTED_GROUP/);
  assert.match(route, /members:\s*\{\s*create: conversationUserIds\.map/);
  assert.match(route, /REGULARS:\$\{teamid\}:\$\{conversationUserIds\.join\(":"\)\}/);
  assert.match(route, /SELECTED_GROUP:\$\{teamid\}:\$\{conversationUserIds\.join\(":"\)\}/);
});

test("Regulars are listed before other private chat players", () => {
  const route = read("src/app/api/portal-chat/team/[teamid]/route.ts");

  assert.match(route, /isRegular: member\.isRegular/);
  assert.match(route, /const aRegular = a\.isRegular \? 1 : 0/);
  assert.match(route, /const bRegular = b\.isRegular \? 1 : 0/);
  assert.match(route, /if \(aRegular !== bRegular\) return bRegular - aRegular/);
});

test("group chat UI supports Regulars and multi-select selected players", () => {
  const chat = read("src/components/messaging/PortalChat.tsx");

  assert.match(chat, /New message/);
  assert.match(chat, /Regulars Chat/);
  assert.match(chat, /player\{regularCount === 1 \? "" : "s"\} marked as Regulars/);
  assert.match(chat, /Selected Players/);
  assert.match(chat, /selectedGroupUserIds/);
  assert.match(chat, /Start group · \{selectedGroupUserIds\.length\} selected/);
  assert.match(chat, /selectedGroupUserIds\.length < 2/);
  assert.match(chat, /startGroupConversation\("REGULARS"\)/);
  assert.match(chat, /startGroupConversation\("SELECTED"\)/);
});

test("Regulars are listed first in chat recipient and private-message lists", () => {
  const chat = read("src/components/messaging/PortalChat.tsx");

  assert.match(chat, /const regularUserIds = new Set/);
  assert.match(chat, /const sortedAudienceOptions =/);
  assert.match(chat, /a\.isRegular !== b\.isRegular/);
  assert.match(chat, /regularDifference/);
  assert.match(chat, /sortedAudienceOptions\.map\(\(person\) =>/);
});

test("selected group chat highlights the exact recipient players", () => {
  const chat = read("src/components/messaging/PortalChat.tsx");
  const route = read("src/app/api/portal-chat/team/[teamid]/route.ts");

  assert.match(route, /memberUserIds: selected\.memberUserIds \?\? \[\]/);
  assert.match(chat, /memberUserIds: string\[\]/);
  assert.match(chat, /highlightedGroupRecipientIds/);
  assert.match(chat, /recipientHighlighted=\{Boolean\(/);
  assert.match(chat, />\s*Included\s*</);
  assert.match(chat, /recipients highlighted on the left/);
});


test("normal player and captain views only show the current Regulars audience", () => {
  const chat = read("src/components/messaging/PortalChat.tsx");
  const route = read("src/app/api/portal-chat/team/[teamid]/route.ts");

  assert.match(route, /getCurrentRegularAudience/);
  assert.match(route, /isCurrentRegularSnapshot/);
  assert.match(route, /This Regulars chat is no longer current/);
  assert.match(route, /conversation\.type === PortalConversationType\.REGULARS[\s\S]{0,260}!context\.isAdminTestMode/);
  assert.match(route, /"Regulars Chat"/);
  assert.match(route, /marked as Regulars/);
  assert.doesNotMatch(route, /Regulars · \$\{recipientUserIds\.length\}/);

  assert.match(chat, /Who do you want to message\?/);
  assert.match(chat, /Latest: \{item\.preview\}/);
  assert.match(chat, /Everyone in the squad can read and reply/);
  assert.match(route, /Private — only you and SIXFL/);
  assert.match(chat, /Private between you and SIXFL/);
});

test("old group chats can be removed from one user's list without deleting history", () => {
  const schema = read("prisma/schema.prisma");
  const migration = read(
    "prisma/migrations/20260921151000_archive_portal_group_chats/migration.sql",
  );
  const chat = read("src/components/messaging/PortalChat.tsx");
  const route = read("src/app/api/portal-chat/team/[teamid]/route.ts");

  assert.match(schema, /archivedAt\s+DateTime\?/);
  assert.match(migration, /ADD COLUMN "archivedAt"/);
  assert.match(route, /action === "archive-group"/);
  assert.match(route, /archivedAt: now/);
  assert.match(route, /visibleGroupConversations/);
  assert.match(route, /latestMessageAt\.getTime\(\) > archivedAt\.getTime\(\)/);
  assert.match(route, /update: \{ lastReadAt: new Date\(\), archivedAt: null \}/);
  assert.match(chat, /removeSelectedGroupChat/);
  assert.match(chat, /Remove chat/);
  assert.match(chat, /history is kept and it will return if a new message is sent/);
});

test("group chats are only listed for snapshotted members outside admin test mode", () => {
  const route = read("src/app/api/portal-chat/team/[teamid]/route.ts");
  const unread = read("src/lib/portal-messaging.ts");

  assert.match(route, /members: \{ some: \{ userId: context\.effectiveUserId \} \}/);
  assert.match(route, /You are not part of this group conversation/);
  assert.match(unread, /PortalConversationType\.REGULARS/);
  assert.match(unread, /PortalConversationType\.SELECTED_GROUP/);
  assert.match(unread, /members: \{ some: \{ userId: input\.userId \} \}/);
});

test("group chat remains quiet by default", () => {
  const route = read("src/app/api/portal-chat/team/[teamid]/route.ts");

  const pushStart = route.indexOf("const targets:");
  const pushEnd = route.indexOf("queuePushNotifications", pushStart);
  const pushSection = route.slice(pushStart, pushEnd);

  assert.doesNotMatch(pushSection, /PortalConversationType\.REGULARS/);
  assert.doesNotMatch(pushSection, /PortalConversationType\.SELECTED_GROUP/);
});
