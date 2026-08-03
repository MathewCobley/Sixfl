const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const routerPath =
  "src/components/admin/messages/AdminMessageThreadReplyRouter.tsx";
const actionPath =
  "src/app/(admin)/admin/messages/email-reply-actions.ts";

function absolute(filePath) {
  return path.join(root, filePath);
}

function read(filePath) {
  return fs.readFileSync(absolute(filePath), "utf8");
}

function write(filePath, source) {
  fs.writeFileSync(absolute(filePath), source, "utf8");
}

function replaceRequired(source, before, after, label) {
  if (source.includes(after)) return source;
  if (!source.includes(before)) {
    throw new Error(`Expected ${label} source was not found.`);
  }
  return source.replace(before, after);
}

let router = read(routerPath);

if (!router.includes('import { useSearchParams } from "next/navigation";')) {
  router = replaceRequired(
    router,
    'import Link from "next/link";\nimport { useFormStatus } from "react-dom";',
    [
      'import Link from "next/link";',
      'import { useSearchParams } from "next/navigation";',
      'import { useFormStatus } from "react-dom";',
    ].join("\n"),
    "email reply search-param import",
  );
}

if (!router.includes("type EmailReplyNotice =")) {
  router = replaceRequired(
    router,
    [
      "type DispatchMetadata = {",
      "  origin?: unknown;",
      "  originLabel?: unknown;",
      "  mode?: unknown;",
      "};",
    ].join("\n"),
    [
      "type DispatchMetadata = {",
      "  origin?: unknown;",
      "  originLabel?: unknown;",
      "  mode?: unknown;",
      "};",
      "",
      "type EmailReplyNotice = {",
      '  tone: "success" | "warning" | "error";',
      "  message: string;",
      "};",
      "",
      "function getEmailReplyNotice(input: {",
      "  status: string | null;",
      "  statusThreadId: string | null;",
      "  selectedThreadId: string | null;",
      "}): EmailReplyNotice | null {",
      "  if (!input.status) return null;",
      "  if (",
      "    input.statusThreadId &&",
      "    input.selectedThreadId &&",
      "    input.statusThreadId !== input.selectedThreadId",
      "  ) {",
      "    return null;",
      "  }",
      "",
      "  switch (input.status) {",
      '    case "sent":',
      "      return {",
      '        tone: "success",',
      '        message: "Email sent and added to this conversation timeline.",',
      "      };",
      '    case "duplicate":',
      "      return {",
      '        tone: "warning",',
      '        message: "That exact reply was already sent recently. A duplicate email was not sent.",',
      "      };",
      '    case "empty_body":',
      "      return {",
      '        tone: "error",',
      '        message: "Type a reply before pressing Send email reply.",',
      "      };",
      '    case "thread_not_open":',
      "      return {",
      '        tone: "error",',
      '        message: "This conversation is no longer open, so an email reply cannot be sent from it.",',
      "      };",
      '    case "missing_email":',
      "      return {",
      '        tone: "error",',
      '        message: "No usable email address is saved for this conversation.",',
      "      };",
      '    case "send_failed":',
      "      return {",
      '        tone: "error",',
      '        message: "The email was not sent. Check Delivery issues and the recipient address, then try again.",',
      "      };",
      "    default:",
      "      return {",
      '        tone: "error",',
      '        message: "The email reply could not be completed. Refresh the conversation and try again.",',
      "      };",
      "  }",
      "}",
    ].join("\n"),
    "inline email reply notice helper",
  );
}

router = replaceRequired(
  router,
  '{pending ? "Sending..." : "Send email reply"}',
  '{pending ? "Sending email… please wait" : "Send email reply"}',
  "clear email reply pending text",
);

if (!router.includes("  const searchParams = useSearchParams();")) {
  router = replaceRequired(
    router,
    "export default function AdminMessageThreadReplyRouter({ selectedFilter, thread }: Props) {\n  const labelledThread = normaliseAutomatedMessageLabels(thread);",
    [
      "export default function AdminMessageThreadReplyRouter({ selectedFilter, thread }: Props) {",
      "  const searchParams = useSearchParams();",
      "  const labelledThread = normaliseAutomatedMessageLabels(thread);",
    ].join("\n"),
    "email reply query state",
  );
}

if (!router.includes("  const replyNotice = getEmailReplyNotice")) {
  router = replaceRequired(
    router,
    [
      "  const canReply = Boolean(",
      '    showEmailReply && replyEmail && labelledThread?.status === "OPEN",',
      "  );",
    ].join("\n"),
    [
      "  const canReply = Boolean(",
      '    showEmailReply && replyEmail && labelledThread?.status === "OPEN",',
      "  );",
      "  const replyNotice = getEmailReplyNotice({",
      '    status: searchParams.get("emailReply"),',
      '    statusThreadId: searchParams.get("emailReplyThread"),',
      "    selectedThreadId: labelledThread?.id ?? null,",
      "  });",
      "  const replyFormKey = [",
      '    labelledThread?.id ?? "none",',
      '    labelledThread?.latestOutboundAt ?? "none",',
      '    searchParams.get("emailReply") ?? "none",',
      '  ].join(":");',
    ].join("\n"),
    "inline email reply notice state",
  );
}

router = replaceRequired(
  router,
  '<form action={sendAdminEmailReplyAction} className="mt-4 space-y-4">',
  '<form key={replyFormKey} action={sendAdminEmailReplyAction} className="mt-4 space-y-4">',
  "email reply form reset key",
);

if (!router.includes("{replyNotice ? (")) {
  router = replaceRequired(
    router,
    [
      "            <ReplyButton disabled={!canReply} />",
      "          </form>",
    ].join("\n"),
    [
      "            <ReplyButton disabled={!canReply} />",
      "            {replyNotice ? (",
      "              <div",
      '                role="status"',
      '                aria-live="polite"',
      "                className={[",
      '                  "rounded-2xl border px-4 py-3 text-sm leading-6",',
      "                  replyNotice.tone === \"success\"",
      '                    ? "border-emerald-400/25 bg-emerald-500/10 text-emerald-100"',
      '                    : replyNotice.tone === "warning"',
      '                      ? "border-amber-400/25 bg-amber-500/10 text-amber-100"',
      '                      : "border-red-400/25 bg-red-500/10 text-red-100",',
      '                ].join(" ")}',
      "              >",
      "                {replyNotice.message}",
      "              </div>",
      "            ) : null}",
      "          </form>",
    ].join("\n"),
    "inline email reply result",
  );
}

write(routerPath, router);

let action = read(actionPath);

action = replaceRequired(
  action,
  '  const body = getStringValue(formData.get("body"));',
  '  const body = getStringValue(formData.get("body")).trim();',
  "trimmed email reply body",
);

const redirectReplacements = [
  [
    'redirect(buildMessagesHref({ extras: { error: "missing_thread" } }));',
    'redirect(buildMessagesHref({ extras: { emailReply: "missing_thread" } }));',
  ],
  [
    'redirect(buildMessagesHref({ filter, threadId, extras: { error: "empty_body" } }));',
    'redirect(buildMessagesHref({ filter, threadId, extras: { emailReply: "empty_body", emailReplyThread: threadId } }));',
  ],
  [
    'redirect(buildMessagesHref({ filter, extras: { error: "missing_thread" } }));',
    'redirect(buildMessagesHref({ filter, extras: { emailReply: "missing_thread" } }));',
  ],
  [
    'redirect(buildMessagesHref({ filter, threadId, extras: { error: "thread_not_open" } }));',
    'redirect(buildMessagesHref({ filter, threadId, extras: { emailReply: "thread_not_open", emailReplyThread: threadId } }));',
  ],
  [
    'redirect(buildMessagesHref({ filter, threadId, extras: { error: "missing_email" } }));',
    'redirect(buildMessagesHref({ filter, threadId, extras: { emailReply: "missing_email", emailReplyThread: threadId } }));',
  ],
  [
    'redirect(buildMessagesHref({ filter, threadId, extras: { error: "send_failed" } }));',
    'redirect(buildMessagesHref({ filter, threadId, extras: { emailReply: "send_failed", emailReplyThread: threadId } }));',
  ],
  [
    'redirect(buildMessagesHref({ filter, threadId, extras: { queued: 1, channel: "email" } }));',
    'redirect(buildMessagesHref({ filter, threadId, extras: { emailReply: "sent", emailReplyThread: threadId } }));',
  ],
];

for (const [before, after] of redirectReplacements) {
  action = replaceRequired(action, before, after, `email reply redirect ${before}`);
}

if (!action.includes("const recentDuplicate = await prisma.messageEntry.findFirst")) {
  action = replaceRequired(
    action,
    [
      "  if (!toEmail) {",
      '    redirect(buildMessagesHref({ filter, threadId, extras: { emailReply: "missing_email", emailReplyThread: threadId } }));',
      "  }",
      "",
      "  try {",
    ].join("\n"),
    [
      "  if (!toEmail) {",
      '    redirect(buildMessagesHref({ filter, threadId, extras: { emailReply: "missing_email", emailReplyThread: threadId } }));',
      "  }",
      "",
      "  const recentDuplicate = await prisma.messageEntry.findFirst({",
      "    where: {",
      "      threadId: thread.id,",
      '      channel: "EMAIL",',
      '      direction: "OUTBOUND",',
      "      toEmail,",
      "      body,",
      '      providerStatus: "sent",',
      "      createdAt: {",
      "        gte: new Date(Date.now() - 2 * 60 * 1000),",
      "      },",
      "    },",
      "    select: { id: true },",
      "  });",
      "",
      "  if (recentDuplicate) {",
      "    redirect(",
      "      buildMessagesHref({",
      "        filter,",
      "        threadId,",
      '        extras: { emailReply: "duplicate", emailReplyThread: threadId },',
      "      }),",
      "    );",
      "  }",
      "",
      "  try {",
    ].join("\n"),
    "recent identical email reply guard",
  );
}

if (!action.includes("fromEmail: sendResult.fromEmail,")) {
  action = replaceRequired(
    action,
    [
      "        htmlBody: html,",
      "        toEmail,",
      "        provider: sendResult.provider,",
    ].join("\n"),
    [
      "        htmlBody: html,",
      "        fromEmail: sendResult.fromEmail,",
      "        toEmail,",
      "        provider: sendResult.provider,",
    ].join("\n"),
    "manual email sender audit field",
  );
}

write(actionPath, action);

const finalRouter = read(routerPath);
const finalAction = read(actionPath);

if (
  !finalRouter.includes("Sending email… please wait") ||
  !finalRouter.includes("Email sent and added to this conversation timeline.") ||
  !finalRouter.includes("key={replyFormKey}") ||
  !finalAction.includes("const recentDuplicate = await prisma.messageEntry.findFirst") ||
  !finalAction.includes('emailReply: "sent"') ||
  finalAction.includes("extras: { queued: 1, channel: \"email\" }")
) {
  throw new Error(
    "Admin email reply feedback and duplicate protection were not applied correctly.",
  );
}

console.log(
  "Admin email replies now show pending, sent, failed and duplicate results beside the button.",
);
