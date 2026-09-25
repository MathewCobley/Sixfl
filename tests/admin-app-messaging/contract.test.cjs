const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");

const read = (file) => fs.readFileSync(file, "utf8");

test("admin communications includes the dark-launch app messaging centre", () => {
  const page = read("src/app/(admin)/admin/messaging/page.tsx");
  const panel = read("src/components/admin/messaging/AdminAppMessagingPanel.tsx");

  assert.match(page, /getAdminAppMessagingDashboard/);
  assert.match(page, /<AdminAppMessagingPanel data=\{appMessaging\} \/>/);
  assert.match(panel, /Whole Squad Chat control centre/);
  assert.match(panel, /Dark launch/);
  assert.match(panel, /SMS and email remain unchanged during the pilot/);
  assert.match(panel, /Recent app messages/);
  assert.match(panel, /Push notification audit/);
  assert.match(panel, /Unread by/);
  assert.match(panel, /Internal Chat Console/);
  assert.match(panel, /\/admin\/messaging\/chat/);
});

test("admin has a dedicated internal app chat console", () => {
  const page = read("src/app/(admin)/admin/messaging/chat/page.tsx");
  const admin = read("src/lib/admin/app-messaging.ts");

  assert.match(page, /Internal Chat Console/);
  assert.match(page, /Internal app chat only/);
  assert.match(page, /No SMS · No email/);
  assert.match(page, /getAdminInternalChatConversations/);
  assert.match(page, /Admin Test Mode/);
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
  const consolePage = read("src/app/(admin)/admin/messaging/chat/page.tsx");
  const layout = read("src/app/(admin)/admin/layout.tsx");
  const sidebar = read("src/components/admin/AdminSidebar.tsx");

  assert.match(admin, /getAdminSixflSupportConversations/);
  assert.match(admin, /getAdminSixflSupportNeedsReplyCount/);
  assert.match(admin, /sixflSupportNeedsReplyCount/);
  assert.match(admin, /type: \{ not: PortalConversationType\.SIXFL \}/);
  assert.match(admin, /latest\?\.senderRole === PortalMessageSenderRole\.PLAYER/);
  assert.match(admin, /latest\?\.senderRole === PortalMessageSenderRole\.CAPTAIN/);
  assert.match(admin, /\/admin\/messaging\/chat\/support\/\$\{input\.conversationId\}/);

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
  const page = read("src/app/(admin)/admin/messaging/chat/support/[conversationId]/page.tsx");
  const action = read("src/app/(admin)/admin/messaging/chat/support/[conversationId]/actions.ts");

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
});
