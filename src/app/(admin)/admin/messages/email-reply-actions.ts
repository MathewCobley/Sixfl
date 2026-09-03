// ========================================
// File: src/app/(admin)/admin/messages/email-reply-actions.ts
// ========================================

"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { buildThreadReplyAddress } from "@/lib/email/reply-address";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/requireAdmin";
import { getMessageThreadById } from "@/lib/messaging/service";
import { sendEmailWithResend } from "@/lib/notifications/providers/resend";

const ADMIN_MESSAGES_BASE_PATH = "/admin/messaging";
const SIXFL_EMAIL_LOGO_URL = "https://www.sixfl.co.uk/sixfl-email.png";

function getStringValue(value: FormDataEntryValue | null): string {
  return typeof value === "string" ? value : "";
}

function getTrimmedValue(value: FormDataEntryValue | null): string {
  return getStringValue(value).trim();
}

function buildMessagesHref(params: {
  filter?: string | null;
  threadId?: string | null;
  extras?: Record<string, string | number | boolean | null | undefined>;
}) {
  const search = new URLSearchParams();
  const filter = params.filter?.trim();
  const threadId = params.threadId?.trim();

  if (filter) search.set("filter", filter);
  if (threadId) search.set("thread", threadId);

  for (const [key, value] of Object.entries(params.extras ?? {})) {
    if (value === null || value === undefined || value === false || value === "") continue;
    search.set(key, String(value));
  }

  const query = search.toString();
  return query ? `${ADMIN_MESSAGES_BASE_PATH}?${query}` : ADMIN_MESSAGES_BASE_PATH;
}

function getReplySubject(thread: NonNullable<Awaited<ReturnType<typeof getMessageThreadById>>>) {
  const subject = thread.messages.find(
    (message) => message.channel === "EMAIL" && message.subject?.trim(),
  )?.subject;
  const cleaned = subject?.replace(/^re:\s*/i, "").trim();

  if (cleaned) return `Re: ${cleaned}`;
  return `SIXFL reply${thread.team?.name ? ` · ${thread.team.name}` : ""}`;
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function formatPlainTextForHtml(value: string) {
  return escapeHtml(value.trim())
    .split(/\n{2,}/)
    .map((paragraph) =>
      paragraph
        .split("\n")
        .map((line) => line.trimEnd())
        .join("<br />"),
    )
    .map((paragraph) => `<p style="margin:0 0 18px 0;">${paragraph}</p>`)
    .join("");
}

function buildManualReplyHtml(input: {
  body: string;
  teamName: string | null;
}) {
  const teamLabel = input.teamName?.trim() || "SIXFL";
  const bodyHtml = formatPlainTextForHtml(input.body);

  return `<!doctype html>
<html>
  <head>
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <meta http-equiv="Content-Type" content="text/html; charset=UTF-8" />
    <title>SIXFL reply</title>
  </head>
  <body style="margin:0;padding:0;background:#06110d;font-family:Arial,Helvetica,sans-serif;color:#f8fafc;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#06110d;padding:28px 12px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:680px;background:#0b1712;border:1px solid rgba(16,185,129,0.22);border-radius:24px;overflow:hidden;">
            <tr>
              <td style="padding:28px 28px 18px 28px;border-bottom:1px solid rgba(255,255,255,0.08);">
                <img src="${SIXFL_EMAIL_LOGO_URL}" alt="SIXFL" width="108" style="display:block;width:108px;max-width:108px;height:auto;margin-bottom:18px;" />
                <div style="font-size:11px;letter-spacing:0.22em;text-transform:uppercase;color:#6ee7b7;font-weight:700;margin-bottom:8px;">SIXFL reply</div>
                <h1 style="margin:0;color:#ffffff;font-size:24px;line-height:1.25;font-weight:800;">${escapeHtml(teamLabel)}</h1>
              </td>
            </tr>
            <tr>
              <td style="padding:28px;">
                <div style="background:#07110d;border:1px solid rgba(255,255,255,0.10);border-radius:18px;padding:22px 22px 6px 22px;color:#f8fafc;font-size:15px;line-height:1.75;">
                  ${bodyHtml}
                </div>
                <div style="margin-top:24px;color:#94a3b8;font-size:13px;line-height:1.6;">
                  <strong style="color:#ffffff;">SIXFL</strong><br />
                  6-a-side football. Done properly.
                </div>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

async function revalidateMessageViews(threadId: string) {
  const thread = await getMessageThreadById(threadId);

  revalidatePath("/admin");
  revalidatePath("/admin/messages");
  revalidatePath("/admin/messaging");

  if (thread?.teamId) revalidatePath(`/admin/teams/${thread.teamId}`);
  if (thread?.leagueId) revalidatePath(`/admin/leagues/${thread.leagueId}`);
}

export async function sendAdminEmailReplyAction(formData: FormData) {
  const { user } = await requireAdmin();

  const threadId = getTrimmedValue(formData.get("threadId"));
  const filter = getTrimmedValue(formData.get("filter")) || "open";
  const body = getStringValue(formData.get("body"));

  if (!threadId) {
    redirect(buildMessagesHref({ extras: { error: "missing_thread" } }));
  }

  if (!body.trim()) {
    redirect(buildMessagesHref({ filter, threadId, extras: { error: "empty_body" } }));
  }

  const thread = await getMessageThreadById(threadId);

  if (!thread) {
    redirect(buildMessagesHref({ filter, extras: { error: "missing_thread" } }));
  }

  if (thread.status !== "OPEN") {
    redirect(buildMessagesHref({ filter, threadId, extras: { error: "thread_not_open" } }));
  }

  const toEmail =
    thread.contactEmail?.trim() ||
    thread.recipient?.email?.trim() ||
    thread.emailNormalized?.trim() ||
    null;

  if (!toEmail) {
    redirect(buildMessagesHref({ filter, threadId, extras: { error: "missing_email" } }));
  }

  try {
    const now = new Date();
    const subject = getReplySubject(thread);
    let replyTo = thread.replyAddress?.trim() || null;

    if (!replyTo) {
      replyTo = buildThreadReplyAddress(thread.id);
      await prisma.messageThread.update({
        where: { id: thread.id },
        data: { replyAddress: replyTo },
      });
    }

    const html = buildManualReplyHtml({
      body,
      teamName: thread.team?.name ?? thread.contactName ?? null,
    });
    const sendResult = await sendEmailWithResend({
      to: toEmail,
      subject,
      text: body,
      html,
      replyTo,
    });

    const entry = await prisma.messageEntry.create({
      data: {
        threadId: thread.id,
        channel: "EMAIL",
        direction: "OUTBOUND",
        participantRole: "ADMIN",
        body,
        subject,
        textBody: body,
        htmlBody: html,
        toEmail,
        provider: sendResult.provider,
        providerMessageId: sendResult.providerMessageId,
        providerStatus: "sent",
        resendEmailId: sendResult.providerMessageId,
        resendPayload: sendResult.responsePayload,
        createdByUserId: user?.id ?? null,
        sentAt: now,
      },
    });

    await prisma.messageThread.update({
      where: { id: thread.id },
      data: {
        channel: "EMAIL",
        latestMessageAt: now,
        latestOutboundAt: now,
        lastOutboundMessageId: entry.id,
        lastMessagePreview: body.trim().replace(/\s+/g, " ").slice(0, 140),
      },
    });
  } catch (error) {
    console.error("Failed to send admin email reply", { threadId, error });
    redirect(buildMessagesHref({ filter, threadId, extras: { error: "send_failed" } }));
  }

  await revalidateMessageViews(threadId);
  redirect(buildMessagesHref({ filter, threadId, extras: { queued: 1, channel: "email" } }));
}
