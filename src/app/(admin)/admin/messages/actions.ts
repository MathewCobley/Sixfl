// ========================================
// File: src/app/(admin)/admin/messages/actions.ts
// ========================================

"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  NotificationAudience,
  NotificationChannel,
  NotificationDispatchStatus,
  NotificationRecipientSourceType,
} from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/requireAdmin";
import { normalizePhoneNumber } from "@/lib/messaging/phone";
import {
  archiveMessageThread,
  getMessageThreadById,
  markThreadAsReadForAdmin,
  reopenMessageThread,
} from "@/lib/messaging/service";
import { upsertNotificationRecipient } from "@/lib/notifications/recipients";
import { sendEmailWithResend } from "@/lib/notifications/providers/resend";
import { queueDirectNotification } from "@/lib/notifications/service";

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
      const recipient = thread.recipientId
        ? thread.recipient
        : await upsertNotificationRecipient({
            sourceType: NotificationRecipientSourceType.GENERAL,
            sourceId: thread.id,
            audience: NotificationAudience.GENERAL,
            displayName:
              thread.contactName ?? thread.team?.name ?? thread.recipient?.displayName ?? null,
            email: toEmail,
            phone: toNumber,
            transactionalSmsOptIn: true,
            metadata: {
              threadId: thread.id,
              teamId: thread.teamId,
              leagueId: thread.leagueId,
              contactName: thread.contactName ?? thread.team?.name ?? null,
              manualReplyRecipient: true,
            },
          });

      const recipientId = thread.recipientId ?? recipient?.id;

      if (!recipientId) {
        redirect(buildMessagesHref({ filter, threadId, extras: { error: "missing_contact" } }));
      }

      await prisma.notificationRecipient.update({
        where: { id: recipientId },
        data: {
          phone: toNumber,
          phoneNormalized: toNumber,
          transactionalSmsOptIn: true,
          preferences: {
            upsert: {
              create: {
                smsEnabled: true,
              },
              update: {
                smsEnabled: true,
              },
            },
          },
          lastSyncedAt: new Date(),
        },
      });

      const dispatch = await queueDirectNotification({
        recipientId,
        channel: NotificationChannel.SMS,
        audience: NotificationAudience.GENERAL,
        body,
        sourceType: thread.sourceType ?? "MESSAGE_THREAD",
        sourceId: thread.sourceId ?? thread.id,
        metadata: {
          threadId: thread.id,
          teamId: thread.teamId,
          leagueId: thread.leagueId,
          contactName: thread.contactName ?? thread.team?.name ?? null,
          manualSmsReply: true,
        },
        createdByUserId: user?.id ?? null,
      });

      if (dispatch.status !== NotificationDispatchStatus.QUEUED) {
        redirect(buildMessagesHref({ filter, threadId, extras: { error: "send_failed" } }));
      }

      const now = new Date();
      const entry = await prisma.messageEntry.create({
        data: {
          threadId: thread.id,
          channel: "SMS",
          direction: "OUTBOUND",
          participantRole: "ADMIN",
          body: dispatch.bodyText,
          textBody: dispatch.bodyText,
          toNumber,
          provider: "twilio",
          providerStatus: "queued",
          notificationDispatchId: dispatch.id,
          createdByUserId: user?.id ?? null,
          sentAt: null,
        },
      });

      await prisma.messageThread.update({
        where: { id: thread.id },
        data: {
          recipientId,
          teamId: thread.teamId,
          leagueId: thread.leagueId,
          contactPhone: thread.contactPhone ?? toNumber,
          phoneNormalized: thread.phoneNormalized ?? toNumber,
          latestMessageAt: now,
          latestOutboundAt: now,
          lastOutboundMessageId: entry.id,
          lastMessagePreview: dispatch.bodyText.trim().replace(/\s+/g, " ").slice(0, 140),
        },
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
    console.error("Failed to queue admin message reply", { threadId, error });

    redirect(buildMessagesHref({ filter, threadId, extras: { error: "send_failed" } }));
  }

  await revalidateMessageViews(threadId);

  redirect(buildMessagesHref({ filter, threadId, extras: { queued: 1 } }));
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

export async function reassignMessageThreadTeamAction(formData: FormData) {
  await requireAdmin();

  const threadId = getTrimmedValue(formData.get("threadId"));
  const filter = getTrimmedValue(formData.get("filter")) || "open";
  const teamId = getTrimmedValue(formData.get("teamId"));

  if (!threadId) {
    redirect(buildMessagesHref({ filter, extras: { error: "missing_thread" } }));
  }

  const currentThread = await getMessageThreadById(threadId);

  if (!currentThread) {
    redirect(buildMessagesHref({ filter, extras: { error: "missing_thread" } }));
  }

  const oldTeamId = currentThread.teamId;
  const nextTeam = teamId
    ? await prisma.team.findUnique({
        where: { id: teamId },
        select: {
          id: true,
          leagueId: true,
        },
      })
    : null;

  if (teamId && !nextTeam) {
    redirect(buildMessagesHref({ filter, threadId, extras: { error: "team_not_found" } }));
  }

  await prisma.messageThread.update({
    where: { id: threadId },
    data: {
      teamId: nextTeam?.id ?? null,
      leagueId: nextTeam?.leagueId ?? null,
    },
  });

  if (oldTeamId) {
    revalidatePath(`/admin/teams/${oldTeamId}`);
  }

  if (nextTeam?.id) {
    revalidatePath(`/admin/teams/${nextTeam.id}`);
  }

  await revalidateMessageViews(threadId);

  redirect(buildMessagesHref({ filter, threadId, extras: { reassigned: 1 } }));
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
