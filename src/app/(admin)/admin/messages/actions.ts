// ========================================
// File: src/app/(admin)/admin/messages/actions.ts
// ========================================

"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { isRedirectError } from "next/dist/client/components/redirect-error";
import { queueAdminSmsReply } from "@/lib/messaging/admin-sms-reply";
import { resolveThreadPlayerTarget } from "@/lib/messaging/thread-player-target";
import {
  NotificationDispatchStatus,
  Prisma,
} from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/requireAdmin";
import { queueStoredAdminEmailResend } from "@/lib/notifications/admin-email-resend";
import {
  archiveMessageThread,
  getMessageThreadById,
  markThreadAsReadForAdmin,
  reopenMessageThread,
} from "@/lib/messaging/service";

const ADMIN_MESSAGES_BASE_PATH = "/admin/messaging";


const PROSPECT_RECRUITMENT_SOURCE_TYPES = new Set([
  "TEAM_PLAYER_PROSPECT",
  "MANAGED_SQUAD_JOIN_CONFIRMATION",
  "MANAGED_SQUAD_REGISTRATION_REMINDER",
  "MANAGED_SQUAD_JOIN_CHASE",
  "MANAGED_SQUAD_JOIN_FINAL_CHASE",
]);

const STOPPABLE_PROSPECT_STATUSES = new Set([
  "NEW",
  "CONTACTED",
  "TRIAL",
  "BACKUP",
  "QUALIFIED",
]);

function getMetadataString(metadata: unknown, key: string) {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) {
    return null;
  }

  const value = (metadata as Record<string, unknown>)[key];
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function appendInternalNote(existingNotes: string | null, line: string) {
  const existing = existingNotes?.trim();
  if (!existing) return line;
  return `${existing}\n${line}`;
}

function formatDecisionTimestamp(value: Date) {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/London",
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(value);
}

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

export async function stopProspectChasingFromThreadAction(formData: FormData) {
  const access = await requireAdmin();

  const threadId = getTrimmedValue(formData.get("threadId"));
  const filter = getTrimmedValue(formData.get("filter")) || "open";

  if (!threadId) {
    redirect(buildMessagesHref({ filter, extras: { error: "missing_thread" } }));
  }

  const thread = await getMessageThreadById(threadId);
  if (!thread) {
    redirect(buildMessagesHref({ filter, extras: { error: "missing_thread" } }));
  }

  const target = await resolveThreadPlayerTarget(thread);
  if (!target || target.kind !== "PROSPECT") {
    redirect(buildMessagesHref({ filter, threadId, extras: { error: "player_not_linked" } }));
  }

  const actorLabel =
    access.user?.name?.trim() ||
    access.user?.email?.trim() ||
    "SIXFL admin";
  const now = new Date();
  let cancelledCount = 0;

  const result = await prisma.$transaction(async (tx) => {
    await tx.$queryRaw(
      Prisma.sql`SELECT id FROM "TeamPlayerProspect" WHERE id = ${target.id} FOR UPDATE`,
    );

    const prospect = await tx.teamPlayerProspect.findUnique({
      where: { id: target.id },
      select: {
        id: true,
        teamId: true,
        firstName: true,
        lastName: true,
        status: true,
        notes: true,
      },
    });

    if (!prospect) {
      return { ok: false as const, reason: "player_not_linked" };
    }

    if (
      prospect.status === "ACTIVE_SQUAD" ||
      !STOPPABLE_PROSPECT_STATUSES.has(prospect.status)
    ) {
      if (prospect.status === "DECLINED") {
        await tx.messageThread.update({
          where: { id: threadId },
          data: { status: "ARCHIVED", unreadForAdminCount: 0 },
        });
        return {
          ok: true as const,
          teamId: prospect.teamId ?? target.teamId,
          alreadyDeclined: true,
        };
      }

      return { ok: false as const, reason: "prospect_not_stoppable" };
    }

    const originalTeamId = prospect.teamId ?? target.teamId;
    if (prospect.teamId && prospect.teamId !== target.teamId) {
      return { ok: false as const, reason: "player_not_linked" };
    }

    const recipient = await tx.notificationRecipient.findUnique({
      where: {
        sourceType_sourceId: {
          sourceType: "GENERAL",
          sourceId: `team-prospect:${prospect.id}`,
        },
      },
      select: { id: true },
    });

    const pendingDispatches = await tx.notificationDispatch.findMany({
      where: {
        status: {
          in: [
            NotificationDispatchStatus.QUEUED,
            NotificationDispatchStatus.PROCESSING,
          ],
        },
        sentAt: null,
        providerMessageId: null,
        OR: [
          { sourceId: prospect.id },
          ...(recipient ? [{ recipientId: recipient.id }] : []),
        ],
      },
      select: {
        id: true,
        sourceType: true,
        sourceId: true,
        metadata: true,
      },
    });

    const ownedDispatchIds = pendingDispatches
      .filter((dispatch) => {
        if (!dispatch.sourceType || !PROSPECT_RECRUITMENT_SOURCE_TYPES.has(dispatch.sourceType)) {
          return false;
        }

        return (
          dispatch.sourceId === prospect.id ||
          getMetadataString(dispatch.metadata, "prospectId") === prospect.id
        );
      })
      .map((dispatch) => dispatch.id);

    if (ownedDispatchIds.length > 0) {
      const cancelled = await tx.notificationDispatch.updateMany({
        where: {
          id: { in: ownedDispatchIds },
          status: {
            in: [
              NotificationDispatchStatus.QUEUED,
              NotificationDispatchStatus.PROCESSING,
            ],
          },
          sentAt: null,
          providerMessageId: null,
        },
        data: {
          status: NotificationDispatchStatus.CANCELLED,
          cancelledAt: now,
          failureReason:
            "Prospect marked not interested by admin from Communications.",
        },
      });

      cancelledCount = cancelled.count;

      await tx.messageEntry.updateMany({
        where: {
          notificationDispatchId: { in: ownedDispatchIds },
          sentAt: null,
        },
        data: {
          providerStatus:
            "CANCELLED: Prospect marked not interested by admin from Communications.",
        },
      });
    }

    const teamName = thread.team?.name?.trim() || "their team";
    const note = `Player replied NO for ${teamName}; ${actorLabel} recorded this from Communications on ${formatDecisionTimestamp(now)}. Marked declined and removed from the active prospect list; unsent recruitment chases stopped.`;

    await tx.teamPlayerProspect.update({
      where: { id: prospect.id },
      data: {
        status: "DECLINED",
        teamId: null,
        lastContactedAt: now,
        notes: appendInternalNote(prospect.notes, note),
      },
    });

    await tx.messageThread.update({
      where: { id: threadId },
      data: {
        status: "ARCHIVED",
        unreadForAdminCount: 0,
      },
    });

    return {
      ok: true as const,
      teamId: originalTeamId,
      alreadyDeclined: false,
    };
  });

  if (!result.ok) {
    redirect(buildMessagesHref({ filter, threadId, extras: { error: result.reason } }));
  }

  await revalidateMessageViews(threadId);
  revalidatePath("/admin/player-prospects");
  if (result.teamId) {
    revalidatePath(`/admin/teams/${result.teamId}/prospects`);
    revalidatePath(`/captain/team/${result.teamId}/prospects`);
  }

  redirect(
    buildMessagesHref({
      filter: "archived",
      threadId,
      extras: {
        stopped: 1,
        cancelled: cancelledCount || undefined,
      },
    }),
  );
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

export async function resendAdminEmailAction(formData: FormData) {
  const access = await requireAdmin();

  const messageId = getTrimmedValue(formData.get("messageId"));
  const threadId = getTrimmedValue(formData.get("threadId"));
  const filter = getTrimmedValue(formData.get("filter")) || "open";
  const confirmed = getTrimmedValue(formData.get("confirmed")) === "on";
  const actorId = access.user?.id?.trim() || "";

  if (!messageId || !threadId || !actorId) {
    redirect(buildMessagesHref({ filter, threadId, extras: { error: "email_resend_unavailable" } }));
  }

  if (!confirmed) {
    redirect(buildMessagesHref({ filter, threadId, extras: { error: "email_resend_confirmation" } }));
  }

  const message = await prisma.messageEntry.findFirst({
    where: {
      id: messageId,
      threadId,
      channel: "EMAIL",
      direction: "OUTBOUND",
      participantRole: "ADMIN",
    },
    select: {
      id: true,
      toEmail: true,
      sentAt: true,
    },
  });

  if (!message?.sentAt || !message.toEmail?.trim()) {
    redirect(buildMessagesHref({ filter, threadId, extras: { error: "email_resend_unavailable" } }));
  }

  try {
    const result = await queueStoredAdminEmailResend({
      messageId: message.id,
      threadId,
      expectedRecipientEmail: message.toEmail,
      createdByUserId: actorId,
      actorName: access.user?.name || access.user?.email || "SIXFL admin",
    });

    await revalidateMessageViews(threadId);
    redirect(
      buildMessagesHref({
        filter,
        threadId,
        extras: result.reused ? { resend_existing: 1 } : { resent: 1 },
      }),
    );
  } catch (error) {
    if (isRedirectError(error)) throw error;
    await revalidateMessageViews(threadId);
    redirect(buildMessagesHref({ filter, threadId, extras: { error: "email_resend_blocked" } }));
  }
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
