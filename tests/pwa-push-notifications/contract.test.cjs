const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "../..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

test("portal push stays quiet by default", () => {
  const chat = read("src/components/messaging/PortalChat.tsx");
  const route = read("src/app/api/portal-chat/team/[teamid]/route.ts");

  assert.match(chat, /useState\(false\).*notifyTeam|notifyTeam.*useState\(false\)/s);
  assert.match(chat, /Notify whole squad on their phone/);
  assert.match(chat, /Off by default/);
  assert.match(chat, /normal chat stays quiet/i);

  assert.match(
    route,
    /senderRoleFromContext\(context\) === PortalMessageSenderRole\.CAPTAIN[\s\S]*payload\?\.notifyTeam === true/,
  );
  assert.match(route, /@captain\\b/i);
  assert.match(route, /PORTAL_PRIVATE_MESSAGE/);
  assert.match(route, /PORTAL_TEAM_NOTIFICATION/);
  assert.match(route, /PORTAL_CAPTAIN_MENTION/);
});

test("permission is user initiated and ordinary chat is not advertised as noisy", () => {
  const control = read("src/components/pwa/PushNotificationControl.tsx");

  assert.match(control, /onClick=\{enableNotifications\}/);
  assert.match(control, /Notification\.requestPermission\(\)/);
  assert.match(control, /Normal chat replies will not pop up on your phone/);
  const effectStart = control.indexOf("useEffect(() =>");
  const enableStart = control.indexOf("async function enableNotifications");
  assert.ok(effectStart >= 0 && enableStart > effectStart);
  const effectSource = control.slice(effectStart, enableStart);

  assert.doesNotMatch(
    effectSource,
    /Notification\.requestPermission\(\)/,
    "notification permission must not be requested automatically from an effect",
  );
});

test("service worker collapses repeated notifications and suppresses visible-chat popups", () => {
  const worker = read("public/sw.js");

  assert.match(worker, /self\.addEventListener\("push"/);
  assert.match(worker, /self\.addEventListener\("notificationclick"/);
  assert.match(worker, /renotify:\s*false/);
  assert.match(worker, /tag:\s*notification\.tag/);
  assert.match(worker, /isMatchingChatAlreadyVisible/);
  assert.match(worker, /client\.visibilityState === "visible"/);
});

test("push delivery uses device opt-in storage and expires queued notification events", () => {
  const schema = read("prisma/schema.prisma");
  const helper = read("src/lib/push-notifications.ts");

  assert.match(schema, /model PushSubscription/);
  assert.match(schema, /disabledAt DateTime\?/);
  assert.match(schema, /model PushNotification/);
  assert.match(schema, /expiresAt DateTime\?/);
  assert.match(helper, /24 \* 60 \* 60 \* 1000/);
  assert.match(helper, /WEB_PUSH_VAPID_PRIVATE_KEY/);
  assert.match(helper, /disabledAt: new Date\(\)/);
});


test("sign-out guard removes the browser push subscription", () => {
  const guard = read("src/components/pwa/PushSubscriptionSessionGuard.tsx");
  const providers = read("src/app/providers.tsx");

  assert.match(guard, /status !== "unauthenticated"/);
  assert.match(guard, /subscription\.unsubscribe\(\)/);
  assert.match(guard, /SIXFL_CLEAR_PUSH_DEVICE_TOKEN/);
  assert.match(providers, /<PushSubscriptionSessionGuard \/>/);
});
