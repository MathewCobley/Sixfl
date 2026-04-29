// ========================================
// File: src/app/(admin)/admin/messages/actions.ts
// ========================================

"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { NotificationDispatchStatus } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/requireAdmin";
import { normalizePhoneNumber } from "@/lib/messaging/phone";
import {
  archiveMessageThread,
  getMessageThreadById,
  markThreadAsReadForAdmin,
  recordOutboundSms,
  reopenMessageThread,
} from "@/lib/messaging/service";
import { sendEmailWithResend } from "@/lib/notifications/providers/resend";
import { sendSmsWithTwilio } from "@/lib/notifications/providers/twilio";

const ADMIN_MESSAGES_BASE_PATH = "/admin/messaging";
const SMS_QUIET_HOURS_START_HOUR = 22;
const SMS_QUIET_HOURS_END_HOUR = 9;
const SMS_QUIET_HOURS_TIME_ZONE = "Europe/London";

function getStringValue(value: FormDataEntryValue | null): string {
  return typeof value === "string" ? value : "";
}

function getTrimmedValue(value: FormDataEntryValue | null): string {
  return getStringValue(value).trim();
}

function getUkHour(value: Date) {
  const hour = new Intl.DateTimeFormat("en-GB", {
    timeZone: SMS_QUIET_HOURS_TIME_ZONE,
    hour: "2-digit",
    hourCycle: "h23",
  }).format(value);

  return Number(hour);
}

function isWithinSmsQuietHours(value: Date) {
  const hour = getUkHour(value);
  return hour >= SMS_QUIET_HOURS_START_HOUR || hour < SMS_QUIET_HOURS_END_HOUR;
}

function buildMessagesHref(params: {
  filter?: string | null;
  threadId?: string | null;
  extras?: Record<string, string | number | boolean | null | undefined>;
}) {
  const search = new URLSearchParams();

  const filter = params.filter?.trim();
  const threadId = params.threadId?.trim();

  if (filter) {
    search.set("filter", filter);
  }

  if (threadId) {
    search.set("thread", threadId);
  }

  for (const [key, value] of Object.entries(params.extras ?? {})) {
    if (value === null || value === undefined || value === false || value === "") {
      continue;
    }

    search.set(key, String(value));
  }

  const query = search.toString();
  return query ? `${ADMIN_MESSAGES_BASE_PATH}?${query}` : ADMIN_MESSAGES_BASE_PATH;
}

async function revalidateMessageViews(threadId: string) {
  const thread = await getMessageThreadById(threadId);

  revalidatePath("/admin");
  revalidatePath("/admin/messages");
  revalidatePath("/admin/messaging");

  if (thread?.teamId) {
    revalidatePath(`/admin/teams/${thread.teamId}`);
  }

  if (thread?.leagueId) {
    revalidatePath(`/admin/leagues/${thread.leagueId}`);
  }

  return thread;
}

export async function markMessageThreadReadAction(formData: FormData) {
  await requireAdmin();

  const threadId = getTrimmedValue(formData.get("threadId"));
  const filter = getTrimmedValue(formData.get("filter")) || "unread";

  if (!threadId) {
    redirect(buildMessagesHref({ extras: { error: "missing_thread" } }));
  }

  await markThreadAsReadForAdmin(threadId);
  await revalidateMessageViews(threadId);

  redirect(buildMessagesHref({ filter, threadId, extras: { read: 1 } }));
}

export async function sendAdminMessageReplyAction(formData: FormData) {
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

  const toNumber = normalizePhoneNumber(
    thread.phoneNormalized || thread.contactPhone || thread.recipient?.phone,
  );
  const toEmail =
    thread.contactEmail?.trim() ||
    thread.recipient?.email?.trim() ||
    thread.emailNormalized?.trim() ||
    null;

  if (!toNumber && !toEmail) {
    redirect(buildMessagesHref({ filter, threadId, extras: { error: "missing_contact" } }));
  }

  try {
    if (toNumber) {
      if (isWithinSmsQuietHours(new Date())) {
        redirect(buildMessagesHref({ filter, threadId, extras: { error: "sms_quiet_hours" } }));
      }

      const sendResult = await sendSmsWithTwilio({
        to: toNumber,
        body,
      });

      await recordOutboundSms({
        recipientId: thread.recipientId,
        teamId: thread.teamId,
        leagueId: thread.leagueId,
        sourceType: thread.sourceType,
        sourceId: thread.sourceId,
        contactName:
          thread.contactName ?? thread.recipient?.displayName ?? thread.team?.name ?? null,
        phone: toNumber,
        body,
        fromNumber: sendResult.fromNumber,
        toNumber,
        provider: sendResult.provider,
        providerMessageId: sendResult.providerMessageId,
        providerStatus: "sent",
        twilioMessageSid: sendResult.providerMessageId,
        createdByUserId: user?.id ?? null,
        sentAt: new Date(),
      });
    } else if (toEmail) {
      const now = new Date();
      const subject = `SIXFL reply${thread.team?.name ? ` · ${thread.team.name}` : ""}`;
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
    }
  } catch (error) {
    console.error("Failed to send admin message reply", { threadId, error });

    redirect(buildMessagesHref({ filter, threadId, extras: { error: "send_failed" } }));
  }

  await revalidateMessageViews(threadId);

  redirect(buildMessagesHref({ filter, threadId, extras: { sent: 1 } }));
}

export async function cancelQueuedSmsMessageAction(formData: FormData) {
  await requireAdmin();

  const messageId = getTrimmedValue(formData.get("messageId"));
  const threadId = getTrimmedValue(formData.get("threadId"));
  const filter = getTrimmedValue(formData.get("filter")) || "open";

  if (!messageId || !threadId) {
    redirect(buildMessagesHref({ filter, threadId, extras: { error: "missing_message" } }));
  }

  const message = await prisma.messageEntry.findFirst({
    where: {
      id: messageId,
      threadId,
      channel: "SMS",
      direction: "OUTBOUND",
    },
    select: {
      id: true,
      notificationDispatchId: true,
      providerStatus: true,
      dispatch: { select: { id: true, status: true } },
    },
  });

  if (!message?.notificationDispatchId || message.dispatch?.status !== NotificationDispatchStatus.QUEUED) {
    redirect(buildMessagesHref({ filter, threadId, extras: { error: "sms_not_queued" } }));
  }

  await prisma.$transaction([
    prisma.notificationDispatch.update({
      where: { id: message.notificationDispatchId },
      data: {
        status: NotificationDispatchStatus.CANCELLED,
        cancelledAt: new Date(),
        failureReason: "Cancelled by admin before SMS was sent.",
      },
    }),
    prisma.messageEntry.update({
      where: { id: message.id },
      data: {
        providerStatus: "CANCELLED: Cancelled by admin before SMS was sent.",
        sentAt: null,
      },
    }),
  ]);

  await revalidateMessageViews(threadId);

  redirect(buildMessagesHref({ filter, threadId, extras: { cancelled: 1 } }));
}

export async function archiveMessageThreadAction(formData: FormData) {
  await requireAdmin();

  const threadId = getTrimmedValue(formData.get("threadId"));

  if (!threadId) {
    redirect(buildMessagesHref({ extras: { error: "missing_thread" } }));
  }

  await archiveMessageThread(threadId);
  await revalidateMessageViews(threadId);

  redirect(buildMessagesHref({ filter: "archived", threadId, extras: { archived: 1 } }));
}

export async function reopenMessageThreadAction(formData: FormData) {
  await requireAdmin();

  const threadId = getTrimmedValue(formData.get("threadId"));

  if (!threadId) {
    redirect(buildMessagesHref({ extras: { error: "missing_thread" } }));
  }

  await reopenMessageThread(threadId);
  await revalidateMessageViews(threadId);

  redirect(buildMessagesHref({ filter: "open", threadId, extras: { reopened: 1 } }));
}
