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
import { getTeamMemberProfilesByTeamMemberIds } from "@/lib/teamMemberProfiles";

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

type MessageThreadForReply = NonNullable<
  Awaited<ReturnType<typeof getMessageThreadById>>
>;

async function resolveReplyTarget(thread: MessageThreadForReply) {
  const isManagedSquadMember =
    thread.sourceType === "TEAM_MEMBER" && Boolean(thread.sourceId);

  let name =
    thread.contactName?.trim() ||
    thread.recipient?.displayName?.trim() ||
    thread.team?.name?.trim() ||
    null;
  let email =
    thread.contactEmail?.trim() ||
    thread.emailNormalized?.trim() ||
    thread.recipient?.email?.trim() ||
    null;
  let phone = normalizePhoneNumber(
    thread.phoneNormalized || thread.contactPhone || thread.recipient?.phone,
  );

  if (isManagedSquadMember && thread.sourceId) {
    const membership = await prisma.teamMember.findUnique({
      where: { id: thread.sourceId },
      select: {
        id: true,
        user: {
          select: {
            name: true,
            email: true,
          },
        },
      },
    });

    if (membership) {
      const profiles = await getTeamMemberProfilesByTeamMemberIds([membership.id]);
      const profile = profiles.get(membership.id) ?? null;

      name =
        membership.user.name?.trim() ||
        membership.user.email?.trim() ||
        name;
      email = membership.user.email?.trim() || email;
      phone = normalizePhoneNumber(profile?.phone ?? null);
    } else {
      // Never fall back to the captain/team contact for a member-specific thread.
      phone = null;
    }
  }

  return {
    isManagedSquadMember,
    name,
    email,
    phone,
  };
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

  const target = await resolveReplyTarget(thread);
  const toNumber = target.phone;
  const toEmail = target.email;

  if (!toNumber && !toEmail) {
    redirect(buildMessagesHref({ filter, threadId, extras: { error: "missing_contact" } }));
  }

  try {
    if (toNumber) {
      const recipient = target.isManagedSquadMember
        ? await upsertNotificationRecipient({
            sourceType: NotificationRecipientSourceType.GENERAL,
            sourceId: thread.id,
            audience: NotificationAudience.GENERAL,
            displayName: target.name,
            email: toEmail,
            phone: toNumber,
            transactionalSmsOptIn: true,
            metadata: {
              threadId: thread.id,
              teamId: thread.teamId,
              leagueId: thread.leagueId,
              teamMemberId: thread.sourceId,
              contactName: target.name,
              manualReplyRecipient: true,
            },
          })
        : thread.recipientId
          ? thread.recipient
          : await upsertNotificationRecipient({
              sourceType: NotificationRecipientSourceType.GENERAL,
              sourceId: thread.id,
              audience: NotificationAudience.GENERAL,
              displayName:
                target.name ?? thread.team?.name ?? thread.recipient?.displayName ?? null,
              email: toEmail,
              phone: toNumber,
              transactionalSmsOptIn: true,
              metadata: {
                threadId: thread.id,
                teamId: thread.teamId,
                leagueId: thread.leagueId,
                contactName: target.name ?? thread.team?.name ?? null,
                manualReplyRecipient: true,
              },
            });

      const recipientId =
        target.isManagedSquadMember ? recipient?.id : thread.recipientId ?? recipient?.id;

      if (!recipientId) {
        redirect(buildMessagesHref({ filter, threadId, extras: { error: "missing_contact" } }));
      }

      await prisma.notificationRecipient.update({
        where: { id: recipientId },
        data: {
          displayName: target.name,
          email: toEmail,
          emailNormalized: toEmail?.toLowerCase() ?? null,
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
        sourceType: "MESSAGE_THREAD",
        sourceId: thread.id,
        metadata: {
          threadId: thread.id,
          originalSourceType: thread.sourceType,
          originalSourceId: thread.sourceId,
          teamId: thread.teamId,
          leagueId: thread.leagueId,
          teamMemberId: target.isManagedSquadMember ? thread.sourceId : null,
          contactName: target.name ?? thread.team?.name ?? null,
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
          contactName: target.name ?? thread.contactName,
          contactEmail: toEmail ?? thread.contactEmail,
          emailNormalized: toEmail?.toLowerCase() ?? thread.emailNormalized,
          contactPhone: toNumber,
          phoneNormalized: toNumber,
          latestMessageAt: now,
          latestOutboundAt: now,
          lastOutboundMessageId: entry.id,
          lastMessagePreview: dispatch.bodyText.trim().replace(/\s+/g, " ").slice(0, 140),
        },
      });
    } else if (toEmail) {
      const now = new Date();
      const subject = `SIXFL reply${target.name ? ` · ${target.name}` : thread.team?.name ? ` · ${thread.team.name}` : ""}`;
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
          recipientId: target.isManagedSquadMember ? null : thread.recipientId,
          contactName: target.name ?? thread.contactName,
          contactEmail: toEmail,
          emailNormalized: toEmail.toLowerCase(),
          contactPhone: target.isManagedSquadMember ? null : thread.contactPhone,
          phoneNormalized: target.isManagedSquadMember ? null : thread.phoneNormalized,
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