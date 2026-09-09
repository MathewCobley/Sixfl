// Temporary authoring helper. Removed from the final native source tree.
const fs = require('node:fs');
const cp = require('node:child_process');
const read = p => fs.readFileSync(p, 'utf8');
const write = (p, s) => fs.writeFileSync(p, s);
function replace(p, before, after) {
  const source = read(p);
  if (source.split(before).length !== 2) throw Error('Expected one exact anchor in ' + p + ': ' + before.slice(0, 100));
  write(p, source.replace(before, after));
}
// Preserve existing attribution natively before retiring its source rewriting.
cp.execFileSync(process.execPath, ['scripts/apply-message-sender-attribution.cjs'], { stdio: 'inherit' });
const thread = 'src/components/admin/messages/AdminMessageThread.tsx';
const inbox = 'src/components/admin/messages/AdminMessagesInbox.tsx';
const page = 'src/app/(admin)/admin/messaging/page.tsx';
const service = 'src/lib/messaging/service.ts';
const actions = 'src/app/(admin)/admin/messages/actions.ts';
replace(thread, 'import { Fragment, useMemo } from "react";', 'import { Fragment } from "react";\nimport AdminSmsReplyForm from "@/components/admin/messages/AdminSmsReplyForm";\nimport { smsReplyStatusLabel } from "@/lib/messaging/sms-reply-display";');
replace(thread, '  sendAdminMessageReplyAction,\n', '');
for (const p of [thread, inbox]) {
  replace(p, 'type SelectedThread = {\n  id: string;', 'type SelectedThread = {\n  smsReplyPhone?: string | null;\n  smsReplyActorId?: string;\n  id: string;');
  replace(p, '    dispatch?: {\n      id: string;', '    dispatch?: {\n      status?: string;\n      failureReason?: string | null;\n      scheduledFor?: string | null;\n      sentAt?: string | null;\n      id: string;');
}
const sortStart = read(thread).indexOf('  const orderedMessages = useMemo(');
const sortEnd = read(thread).indexOf('\n\n  return (', sortStart);
if (sortStart < 0 || sortEnd < 0) throw Error('Missing native timeline sort');
write(thread, read(thread).slice(0, sortStart) + '  const orderedMessages = [...thread.messages].sort((a, b) =>\n    new Date(b.receivedAt || b.sentAt || b.createdAt).getTime() -\n    new Date(a.receivedAt || a.sentAt || a.createdAt).getTime(),\n  );' + read(thread).slice(sortEnd));
replace(thread, '    thread.phoneNormalized || thread.recipient?.phone || thread.contactPhone;', '    thread.smsReplyPhone !== undefined ? thread.smsReplyPhone : thread.phoneNormalized || thread.contactPhone || thread.recipient?.phone;');
const start = read(thread).indexOf('            <form action={sendAdminMessageReplyAction}');
const end = read(thread).indexOf('            </form>', start) + '            </form>'.length;
if (start < 0 || end < start) throw Error('Missing SMS form');
write(thread, read(thread).slice(0, start) + '            <AdminSmsReplyForm\n              key={`${thread.smsReplyActorId || ""}:${thread.id}`}\n              threadId={thread.id}\n              actorId={thread.smsReplyActorId || ""}\n              phone={replyPhoneRaw || null}\n              canReply={canSmsReply}\n            />' + read(thread).slice(end));
// The old help text is now owned by the explicit POST form.
const helpStart = read(thread).indexOf('  const replyHelpText =');
const helpEnd = read(thread).indexOf('\n\n', helpStart);
if (helpStart >= 0 && helpEnd > helpStart) write(thread, read(thread).slice(0, helpStart) + read(thread).slice(helpEnd));
replace(thread, '  const replyPhoneLabel = formatPhone(replyPhoneRaw);\n', '');
replace(thread, '  return `Sent ${formatDateTime(message.sentAt || message.createdAt)}`;', '  if (message.channel === "SMS") {\n    const status = message.dispatch?.status || (message.sentAt ? "SENT" : message.providerStatus);\n    return `${smsReplyStatusLabel(status, message.providerStatus)} · ${formatDateTime(message.dispatch?.sentAt || message.sentAt || message.createdAt)}`;\n  }\n  return message.sentAt ? `Sent ${formatDateTime(message.sentAt)}` : `Recorded ${formatDateTime(message.createdAt)}`;');
replace(service, '              metadata: true,\n', '              metadata: true,\n              status: true,\n              failureReason: true,\n              scheduledFor: true,\n              sentAt: true,\n');
replace(page, 'import { requireAdmin } from "@/lib/requireAdmin";', 'import { requireAdmin } from "@/lib/requireAdmin";\nimport { getAdminSmsReplyTarget } from "@/lib/messaging/admin-sms-reply";');
replace(page, '  await requireAdmin();', '  const { user: replyActor } = await requireAdmin();');
replace(page, '  const prospectLauncherOptions = prospects.flatMap', '  const smsReplyTarget = fallbackThread ? await getAdminSmsReplyTarget(fallbackThread) : null;\n\n  const prospectLauncherOptions = prospects.flatMap');
replace(page, '                  id: fallbackThread.id,', '                  id: fallbackThread.id,\n                  smsReplyPhone: smsReplyTarget?.phone ?? null,\n                  smsReplyActorId: replyActor?.id ?? "",');
replace(page, '                    subject: message.subject ?? null,', '                    subject: message.subject ?? null,\n                    providerStatus: message.providerStatus ?? null,');
replace(page, '                          metadata: message.dispatch.metadata,', '                          metadata: message.dispatch.metadata,\n                          status: message.dispatch.status,\n                          failureReason: message.dispatch.failureReason,\n                          scheduledFor: message.dispatch.scheduledFor.toISOString(),\n                          sentAt: message.dispatch.sentAt?.toISOString() ?? null,');
// Keep one shared submission service. An already-open legacy form without an
// idempotency reference fails closed; it cannot queue an untracked second SMS.
let source = read(actions);
let a = source.indexOf('type MessageThreadForReply =');
let b = source.indexOf('export async function markMessageThreadReadAction', a);
if (a < 0 || b < a) throw Error('Missing old reply target');
source = source.slice(0, a) + source.slice(b);
a = source.indexOf('export async function sendAdminMessageReplyAction');
b = source.indexOf('export async function cancelQueuedSmsMessageAction', a);
if (a < 0 || b < a) throw Error('Missing old SMS action');
source = source.slice(0, a) + `export async function sendAdminMessageReplyAction(formData: FormData) {
  const threadId = getTrimmedValue(formData.get("threadId"));
  const filter = getTrimmedValue(formData.get("filter")) || "open";
  let saved = false;
  try {
    const result = await queueAdminSmsReply({
      threadId, requestId: getTrimmedValue(formData.get("requestId")),
      body: getStringValue(formData.get("body")), expectedPhone: getTrimmedValue(formData.get("expectedPhone")),
    });
    saved = ["QUEUED", "PROCESSING", "SENT"].includes(result.status);
  } catch (error) {
    if (isRedirectError(error)) throw error;
    // No provider calls, auto-retries, or logging of customer message content.
  }
  await revalidateMessageViews(threadId);
  redirect(buildMessagesHref({ filter, threadId, extras: saved ? { queued: 1 } : { error: "reply_refresh_required" } }));
}

` + source.slice(b);
source = source.replace('import { redirect } from "next/navigation";', 'import { redirect } from "next/navigation";\nimport { isRedirectError } from "next/dist/client/components/redirect-error";\nimport { queueAdminSmsReply } from "@/lib/messaging/admin-sms-reply";');
// Remove imports used only by the retired direct sender.
for (const line of [
  '  NotificationAudience,\n', '  NotificationChannel,\n', '  NotificationRecipientSourceType,\n',
  'import { normalizePhoneNumber } from "@/lib/messaging/phone";\n',
  'import { upsertNotificationRecipient } from "@/lib/notifications/recipients";\n',
  'import { sendEmailWithResend } from "@/lib/notifications/providers/resend";\n',
  'import { queueDirectNotification } from "@/lib/notifications/service";\n',
  'import { getTeamMemberProfilesByTeamMemberIds } from "@/lib/teamMemberProfiles";\n'
]) source = source.replace(line, '');
write(actions, source);
replace(thread, '      case "send_failed":', '      case "reply_refresh_required":\n        return { tone: "error", message: "This reply was not queued. Refresh the conversation to load the new SMS reply form." };\n      case "send_failed":');
write('scripts/apply-message-sender-attribution.cjs', `// Compatibility entry point: attribution now lives in the owning native sources.
// Keep this read-only until the legacy prebuild invocation is removed.
const fs = require("node:fs");
for (const file of ["src/lib/messaging/service.ts", "src/app/(admin)/admin/messaging/page.tsx", "src/components/admin/messages/AdminMessagesInbox.tsx", "src/components/admin/messages/AdminMessageThread.tsx"]) {
  if (!fs.readFileSync(file, "utf8").includes("createdByUser")) throw new Error("Native message attribution missing: " + file);
}
console.log("Native message sender attribution verified (no source rewriting).");
`);
const doc = 'docs/critical-feature-contracts.md';
write(doc, read(doc) + '\n## Administrator SMS replies\n\nThe native inbox reply form uses an explicit authenticated JSON POST, not a redirecting server-action form. A controlled per-actor/per-thread draft and stable request reference survive errors and reloads. The shared SMS service saves notification, message and thread update in one transaction, serializes thread submissions, and uses a deterministic message ID to make same-request retries idempotent. Recovery GET never queues or sends. Existing SMS opt-outs, suppression, quiet hours, mixed email/SMS history and member-only identity boundaries remain enforced. Queued/failed messages are never labelled sent from their creation time. Tests run the real service and route against disposable PostgreSQL with all provider traffic blocked, plus real browser submission/recovery and post-prebuild source contracts. No historical messages are replayed.\n');
console.log('Native SMS reply source integration complete.');
