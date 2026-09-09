// ========================================
// File: src/app/(admin)/admin/messages/actions.ts
// ========================================

"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { isRedirectError } from "next/dist/client/components/redirect-error";
import { queueAdminSmsReply } from "@/lib/messaging/admin-sms-reply";
import {
  NotificationDispatchStatus,
} from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/requireAdmin";
import {
  archiveMessageThread,
  getMessageThreadById,
  markThreadAsReadForAdmin,
  reopenMessageThread,
} from "@/lib/messaging/service";

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