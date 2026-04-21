// ========================================
// File: src/app/(admin)/admin/messages/actions.ts
// ========================================

"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/requireAdmin";
import { normalizePhoneNumber } from "@/lib/messaging/phone";
import {
  archiveMessageThread,
  getMessageThreadById,
  markThreadAsReadForAdmin,
  recordOutboundSms,
  reopenMessageThread,
} from "@/lib/messaging/service";
import { sendSmsWithTwilio } from "@/lib/notifications/providers/twilio";

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

  redirect(
    buildMessagesHref({
      filter,
      threadId,
      extras: { read: 1 },
    }),
  );
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
    redirect(
      buildMessagesHref({
        filter,
        threadId,
        extras: { error: "empty_body" },
      }),
    );
  }

  const thread = await getMessageThreadById(threadId);

  if (!thread) {
    redirect(
      buildMessagesHref({
        filter,
        extras: { error: "missing_thread" },
      }),
    );
  }

  if (thread.status !== "OPEN") {
    redirect(
      buildMessagesHref({
        filter,
        threadId,
        extras: { error: "thread_not_open" },
      }),
    );
  }

  const toNumber = normalizePhoneNumber(
    thread.phoneNormalized || thread.contactPhone || thread.recipient?.phone,
  );

  if (!toNumber) {
    redirect(
      buildMessagesHref({
        filter,
        threadId,
        extras: { error: "missing_phone" },
      }),
    );
  }

  try {
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
        thread.contactName ??
        thread.recipient?.displayName ??
        thread.team?.name ??
        null,
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
  } catch (error) {
    console.error("Failed to send admin SMS reply", {
      threadId,
      error,
    });

    redirect(
      buildMessagesHref({
        filter,
        threadId,
        extras: { error: "send_failed" },
      }),
    );
  }

  await revalidateMessageViews(threadId);

  redirect(
    buildMessagesHref({
      filter,
      threadId,
      extras: { sent: 1 },
    }),
  );
}

export async function archiveMessageThreadAction(formData: FormData) {
  await requireAdmin();

  const threadId = getTrimmedValue(formData.get("threadId"));

  if (!threadId) {
    redirect(buildMessagesHref({ extras: { error: "missing_thread" } }));
  }

  await archiveMessageThread(threadId);
  await revalidateMessageViews(threadId);

  redirect(
    buildMessagesHref({
      filter: "archived",
      threadId,
      extras: { archived: 1 },
    }),
  );
}

export async function reopenMessageThreadAction(formData: FormData) {
  await requireAdmin();

  const threadId = getTrimmedValue(formData.get("threadId"));

  if (!threadId) {
    redirect(buildMessagesHref({ extras: { error: "missing_thread" } }));
  }

  await reopenMessageThread(threadId);
  await revalidateMessageViews(threadId);

  redirect(
    buildMessagesHref({
      filter: "open",
      threadId,
      extras: { reopened: 1 },
    }),
  );
}
