const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");

function patchFile(filePath, replacements) {
  const absolutePath = path.join(root, filePath);
  let source = fs.readFileSync(absolutePath, "utf8");

  for (const { before, after, label } of replacements) {
    if (source.includes(after)) continue;
    if (!source.includes(before)) {
      throw new Error(`Expected ${label} source was not found in ${filePath}`);
    }
    source = source.replace(before, after);
  }

  fs.writeFileSync(absolutePath, source, "utf8");
}

const adminLayoutPath = "src/app/(admin)/admin/layout.tsx";
const deliveryIssuesPagePath = "src/app/(admin)/admin/delivery-issues/page.tsx";
const resendWebhookRoutePath = "src/app/api/webhooks/resend/route.ts";
const notificationWebhooksPath = "src/lib/notifications/webhooks.ts";

// The admin delivery banner is now owned directly by the React layout source.
// Do not rewrite the layout during prebuild: exact-string source transforms are
// brittle and can break deployments when unrelated layout markup changes.

patchFile(deliveryIssuesPagePath, [
  {
    label: "delayed email panel import",
    before: 'import { prisma } from "@/lib/prisma";',
    after: [
      'import AdminDelayedEmailDeliveryPanel from "@/components/admin/notifications/AdminDelayedEmailDeliveryPanel";',
      'import { prisma } from "@/lib/prisma";',
    ].join("\n"),
  },
  {
    label: "common Gmail typo detection",
    before: '    [/@gmal\\.com$/, "@gmail.com"],',
    after: [
      '    [/@gmal\\.com$/, "@gmail.com"],',
      '    [/@gamil\\.com$/, "@gmail.com"],',
      '    [/@gmail\\.co\\.uk$/, "@gmail.com"],',
    ].join("\n"),
  },
  {
    label: "delayed email panel render",
    before: [
      "      </div>",
      "",
      "      {recipients.length === 0 ? (",
    ].join("\n"),
    after: [
      "      </div>",
      "",
      "      <AdminDelayedEmailDeliveryPanel />",
      "",
      "      {recipients.length === 0 ? (",
    ].join("\n"),
  },
]);

patchFile(resendWebhookRoutePath, [
  {
    label: "delivery admin alert import",
    before: 'import { handleResendWebhook } from "@/lib/notifications/webhooks";',
    after: [
      'import { notifyAdminsOfResendDeliveryEvent } from "@/lib/notifications/admin-delivery-alert";',
      'import { handleResendWebhook } from "@/lib/notifications/webhooks";',
    ].join("\n"),
  },
  {
    label: "delivery admin alert call",
    before: [
      "    const { event } = await verifyResendWebhookRequest(request);",
      "    const result = await handleResendWebhook(event);",
      "",
      "    return jsonResponse({",
    ].join("\n"),
    after: [
      "    const { event } = await verifyResendWebhookRequest(request);",
      "    const result = await handleResendWebhook(event);",
      "    const adminAlert = await notifyAdminsOfResendDeliveryEvent({",
      "      event,",
      "      result,",
      "      deliveryId,",
      "    });",
      "",
      "    return jsonResponse({",
      "      adminAlert,",
    ].join("\n"),
  },
]);

patchFile(notificationWebhooksPath, [
  {
    label: "Resend suppressed reason extraction",
    before: [
      '    getNestedString(data, ["bounce", "message"]),',
      '    getNestedString(data, ["complaint", "type"]),',
      '    getNestedString(data, ["suppression", "reason"]),',
    ].join("\n"),
    after: [
      '    getNestedString(data, ["bounce", "message"]),',
      '    getNestedString(data, ["bounce", "subType"]),',
      '    getNestedString(data, ["bounce", "type"]),',
      '    getNestedString(data, ["complaint", "type"]),',
      '    getNestedString(data, ["suppressed", "message"]),',
      '    getNestedString(data, ["suppressed", "type"]),',
      '    getNestedString(data, ["suppression", "reason"]),',
    ].join("\n"),
  },
]);

for (const filePath of [
  adminLayoutPath,
  deliveryIssuesPagePath,
  resendWebhookRoutePath,
  notificationWebhooksPath,
]) {
  const source = fs.readFileSync(path.join(root, filePath), "utf8");

  if (
    filePath === adminLayoutPath &&
    (!source.includes('import AdminDeliveryIssueBanner from "@/components/admin/notifications/AdminDeliveryIssueBanner";') ||
      !source.includes("<AdminDeliveryIssueBanner />"))
  ) {
    throw new Error("Admin email delivery banner must be mounted directly in the admin layout source.");
  }
  if (
    filePath === deliveryIssuesPagePath &&
    (!source.includes("AdminDelayedEmailDeliveryPanel") ||
      !source.includes("/@gamil\\.com$/") ||
      !source.includes("/@gmail\\.co\\.uk$/"))
  ) {
    throw new Error("Delivery issues page enhancements were not applied.");
  }
  if (
    filePath === resendWebhookRoutePath &&
    !source.includes("notifyAdminsOfResendDeliveryEvent")
  ) {
    throw new Error("Resend admin alert call was not applied.");
  }
  if (
    filePath === notificationWebhooksPath &&
    !source.includes('["suppressed", "message"]')
  ) {
    throw new Error("Resend suppression reason extraction was not applied.");
  }
}

require("./apply-email-delivery-resolution.cjs");

console.log(
  "Applied prominent in-admin warnings, delayed email details, clear controls and deduplicated admin email alerts for Resend delivery problems.",
);
