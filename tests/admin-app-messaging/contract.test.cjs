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
