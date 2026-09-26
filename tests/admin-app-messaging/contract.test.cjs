const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");

const read = (file) => fs.readFileSync(file, "utf8");

test("admin keeps Comms and Chat as separate top-level areas", () => {
  const comms = read("src/app/(admin)/admin/messaging/page.tsx");
  const chat = read("src/app/(admin)/admin/chat/page.tsx");
  const sidebar = read("src/components/admin/AdminSidebar.tsx");

  assert.match(comms, /Email and SMS only/);
  assert.doesNotMatch(comms, /AdminAppMessagingPanel/);
  assert.doesNotMatch(comms, /getAdminAppMessagingDashboard/);

  assert.match(chat, /title: "Chat \| SIXFL Admin"/);
  assert.match(chat, />\s*Chat\s*</);
  assert.match(chat, /Messages to SIXFL/);
  assert.match(chat, /Squad chat monitor/);
  assert.match(chat, /<details className="group/);
  assert.match(chat, /Push notification audit/);

  assert.match(sidebar, /name: "Comms"[\s\S]*href: "\/admin\/messaging"/);
  assert.match(sidebar, /name: "Chat"[\s\S]*href: "\/admin\/chat"/);
  assert.match(sidebar, /description: "Email\/SMS"/);
  assert.match(sidebar, /description: "App messages"/);
});

test("admin Chat tab has the internal app conversation console", () => {
  const page = read("src/app/(admin)/admin/chat/page.tsx");
  const legacy = read("src/app/(admin)/admin/messaging/chat/page.tsx");
  const admin = read("src/lib/admin/app-messaging.ts");

  assert.match(page, /getAdminInternalChatConversations/);
  assert.match(page, /Messages sent directly to SIXFL stay separate from normal squad chat/);
  assert.match(page, /Squad chat monitor/);
  assert.match(legacy, /redirect\("\/admin\/chat"\)/);

  assert.match(admin, /getAdminInternalChatConversations/);
  assert.match(admin, /PortalConversationType\.REGULARS/);
  assert.match(admin, /PortalConversationType\.SELECTED_GROUP/);
  assert.match(admin, /PortalConversationType\.CAPTAIN_PLAYER/);
  assert.match(admin, /PortalConversationType\.CAPTAIN_CAPTAIN/);
});

test("push audit records real device outcomes", () => {
  const worker = read("public/sw.js");
  const pending = read("src/app/api/push/pending/route.ts");
  const receipt = read("src/app/api/push/receipt/route.ts");
  const schema = read("prisma/schema.prisma");

  assert.match(worker, /SUPPRESSED_VISIBLE/);
  assert.match(worker, /SHOWN/);
  assert.match(worker, /CLICKED/);
  assert.match(worker, /recordPushReceipt/);
  assert.match(pending, /status: "FETCHED"/);
  assert.match(receipt, /PushNotificationDelivery|pushNotificationDelivery/);
  assert.match(schema, /model PushNotificationDelivery/);
  assert.match(schema, /targetedDeviceCount Int @default\(0\)/);
});

test("push attempts are audited even when a recipient has no enabled device", () => {
  const helper = read("src/lib/push-notifications.ts");
  const admin = read("src/lib/admin/app-messaging.ts");

  assert.match(helper, /targetedDeviceCount/);
  assert.doesNotMatch(
    helper,
    /if \(subscriptions\.length === 0\)[\s\S]{0,250}return/,
  );
  assert.match(admin, /Notifications not enabled/);
  assert.match(admin, /Chat already open/);
  assert.match(admin, /Shown on phone/);
  assert.match(admin, /Opened/);
});

test("admin latest activity includes app chat events", () => {
  const activity = read("src/lib/admin/latest-activity.ts");

  assert.match(activity, /APP_MESSAGE/);
  assert.match(activity, /sent an app message/);
  assert.match(activity, /\/admin\/messaging#app-messaging/);
});


test("messages sent to SIXFL have a separate admin inbox and alert", () => {
  const admin = read("src/lib/admin/app-messaging.ts");
  const panel = read("src/components/admin/messaging/AdminAppMessagingPanel.tsx");
  const consolePage = read("src/app/(admin)/admin/chat/page.tsx");
  const layout = read("src/app/(admin)/admin/layout.tsx");
  const sidebar = read("src/components/admin/AdminSidebar.tsx");

  assert.match(admin, /getAdminSixflSupportConversations/);
  assert.match(admin, /getAdminSixflSupportNeedsReplyCount/);
  assert.match(admin, /sixflSupportNeedsReplyCount/);
  assert.match(admin, /type: \{ not: PortalConversationType\.SIXFL \}/);
  assert.match(admin, /latest\?\.senderRole === PortalMessageSenderRole\.PLAYER/);
  assert.match(admin, /latest\?\.senderRole === PortalMessageSenderRole\.CAPTAIN/);
  assert.match(admin, /\/admin\/chat\/support\/\$\{input\.conversationId\}/);

  assert.match(panel, /Messages to SIXFL/);
  assert.match(panel, /Direct messages to SIXFL are kept separate from squad chat/);
  assert.match(panel, /New · needs reply/);
  assert.match(panel, /Squad chat activity/);

  assert.match(consolePage, /id="sixfl-inbox"/);
  assert.match(consolePage, /Messages to SIXFL/);
  assert.match(consolePage, /Squad conversations/);
  assert.match(consolePage, /conversation\.needsReply/);

  assert.match(layout, /getAdminSixflSupportNeedsReplyCount/);
  assert.match(layout, /totalMessagingAlertCount/);
  assert.match(layout, /sixflSupportNeedsReplyCount > 0/);
  assert.match(sidebar, /sixflSupportNeedsReplyCount/);
  assert.match(sidebar, /app message\$\{sixflSupportNeedsReplyCount === 1 \? "" : "s"\} to SIXFL need reply/);
});

test("admin can reply to a Message SIXFL thread from a dedicated support screen", () => {
  const page = read("src/app/(admin)/admin/chat/support/[conversationId]/page.tsx");
  const action = read("src/app/(admin)/admin/chat/support/[conversationId]/actions.ts");
  const legacy = read("src/app/(admin)/admin/messaging/chat/support/[conversationId]/page.tsx");

  assert.match(page, /Message to SIXFL/);
  assert.match(page, /Reply as SIXFL/);
  assert.match(page, /Needs reply/);
  assert.match(page, /sendAdminSixflChatReplyAction/);

  assert.match(action, /type: PortalConversationType\.SIXFL/);
  assert.match(action, /senderRole: PortalMessageSenderRole\.ADMIN/);
  assert.match(action, /portalConversation\.update/);
  assert.match(action, /queuePushNotifications/);
  assert.match(action, /PORTAL_SIXFL_REPLY/);
  assert.match(action, /conversation=sixfl/);
  assert.match(legacy, /redirect\(\`\/admin\/chat\/support\/\$\{conversationId\}\`\)/);
});


test("Comms and Chat keep independent sidebar alert badges", () => {
  const sidebar = read("src/components/admin/AdminSidebar.tsx");
  const layout = read("src/app/(admin)/admin/layout.tsx");

  assert.match(sidebar, /const showCommsBadge =[\s\S]*item\.href === "\/admin\/messaging"/);
  assert.match(sidebar, /const showChatBadge =[\s\S]*item\.href === "\/admin\/chat"/);
  assert.match(sidebar, /unreadMessagingCount > 0/);
  assert.match(sidebar, /sixflSupportNeedsReplyCount > 0/);
  assert.match(layout, /"\/admin\/chat#sixfl-inbox"/);
});


test("Comms opens on team conversations and keeps senders behind a Send messages tab", () => {
  const page = read("src/app/(admin)/admin/messaging/page.tsx");
  const tabs = read("src/components/admin/communications/CommunicationsTabs.tsx");

  assert.match(tabs, /label: "Inbox"/);
  assert.match(tabs, /href: "\/admin\/messaging\?view=send"/);
  assert.match(tabs, /label: "Send messages"/);
  assert.match(tabs, /searchParams\.get\("view"\) === "send"/);

  assert.match(page, /const selectedView = sp\.view === "send" \? "send" : "inbox"/);
  assert.match(page, /selectedView === "inbox"[\s\S]*<AdminMessagesInbox/);
  assert.match(page, /selectedView === "send"[\s\S]*<CommunicationsTeamLauncher/);
  assert.match(page, /selectedView === "send"[\s\S]*<CommunicationsProspectLauncher/);
  assert.match(page, /selectedView === "send"[\s\S]*<CommunicationsLeagueLauncher/);
  assert.match(page, /selectedView === "send"[\s\S]*<CommunicationsLeadLauncher/);

  const sendStart = page.indexOf('{selectedView === "send" ? (');
  const inboxStart = page.indexOf('{selectedView === "inbox" ? (', sendStart);
  assert.ok(sendStart >= 0 && inboxStart > sendStart);
});
