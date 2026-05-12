// ========================================
// File: src/app/(admin)/admin/messages/email-reply-actions.ts
// ========================================

"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/requireAdmin";
import { getMessageThreadById } from "@/lib/messaging/service";
import { sendEmailWithResend } from "@/lib/notifications/providers/resend";

const ADMIN_MESSAGES_BASE_PATH = "/admin/messaging";

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
    const replyTo = thread.replyAddress?.trim() || "hello@sixfl.co.uk";
    const sendResult = await sendEmailWithResend({
      to: toEmail,
      subject,
      text: body,
      html: null,
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
