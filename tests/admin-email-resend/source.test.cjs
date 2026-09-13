const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");

const read = (path) => fs.readFileSync(path, "utf8");

test("resend panel only offers successfully sent admin-authored emails and requires confirmation", () => {
  const panel = read("src/components/admin/messages/AdminEmailResendPanel.tsx");
  const router = read("src/components/admin/messages/AdminMessageThreadReplyRouter.tsx");

  assert.match(panel, /message\.channel === "EMAIL"/);
  assert.match(panel, /message\.direction === "OUTBOUND"/);
  assert.match(panel, /message\.participantRole === "ADMIN"/);
  assert.match(panel, /message\.dispatch\?\.status === "SENT"/);
  assert.match(panel, /name="confirmed" required/);
  assert.match(panel, /Resend email/);
  assert.match(panel, /exact saved email/);
  assert.match(router, /AdminEmailResendPanel/);
  assert.match(router, /messages=\{labelledThread\.messages\}/);
});

test("server action revalidates the real message and never trusts browser content", () => {
  const actions = read("src/app/(admin)/admin/messages/actions.ts");

  assert.match(actions, /resendAdminEmailAction/);
  assert.match(actions, /await requireAdmin\(\)/);
  assert.match(actions, /channel: "EMAIL"/);
  assert.match(actions, /direction: "OUTBOUND"/);
  assert.match(actions, /participantRole: "ADMIN"/);
  assert.match(actions, /NotificationDispatchStatus\.SENT/);
  assert.match(actions, /queueStoredAdminEmailResend/);
  assert.doesNotMatch(actions, /formData\.get\("subject"\)/);
  assert.doesNotMatch(actions, /formData\.get\("body"\)/);
});

test("resend helper copies stored content, preserves preferences and creates a distinct queued record", () => {
  const helper = read("src/lib/notifications/admin-email-resend.ts");

  assert.match(helper, /subject: original\.subject/);
  assert.match(helper, /bodyText: original\.bodyText/);
  assert.match(helper, /bodyHtml: original\.bodyHtml/);
  assert.match(helper, /templateId: original\.templateId/);
  assert.match(helper, /sourceType: RESEND_SOURCE_TYPE/);
  assert.match(helper, /sourceId: original\.id/);
  assert.match(helper, /NotificationDispatchStatus\.QUEUED/);
  assert.match(helper, /currentRecipientEmail !== expectedRecipientEmail/);
  assert.match(helper, /isSuppressed/);
  assert.match(helper, /transactionalEmailOptIn/);
  assert.match(helper, /marketingEmailOptIn/);
  assert.match(helper, /preferences\?\.emailEnabled/);
  assert.match(helper, /DUPLICATE_GUARD_MS/);
  assert.match(helper, /getEmailReplyDomain/);
  assert.doesNotMatch(helper, /sendEmailWithResend|sendEmail\(|queueDirectNotification/);
});
