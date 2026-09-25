import {
  PortalConversationType,
  PortalMessageSenderRole,
  TeamRole,
} from "@prisma/client";

import { prisma } from "@/lib/prisma";

export type AdminAppMessageActivity = {
  id: string;
  teamName: string;
  senderName: string;
  body: string;
  conversationLabel: string;
  createdAt: Date;
  unreadRecipientCount: number;
  href: string;
  pushLabel: string;
  pushTone: "quiet" | "pending" | "shown" | "suppressed" | "opened" | "disabled";
};

export type AdminPushAuditItem = {
  id: string;
  title: string;
  body: string;
  recipientName: string;
  createdAt: Date;
  statusLabel: string;
  statusTone: "pending" | "shown" | "suppressed" | "opened" | "disabled";
  href: string;
  deviceLabel: string | null;
};

export type AdminSixflSupportConversation = {
  id: string;
  teamName: string;
  participantName: string;
  latestMessageAt: Date | null;
  lastMessagePreview: string | null;
  needsReply: boolean;
  href: string;
};

export type AdminAppMessagingDashboard = {
  totalConversations: number;
  messagesLast24Hours: number;
  activePushDevices: number;
  notificationUsers: number;
  sixflSupportNeedsReplyCount: number;
  sixflSupportMessages: AdminSixflSupportConversation[];
  recentMessages: AdminAppMessageActivity[];
  pushAudit: AdminPushAuditItem[];
};

export type AdminInternalChatConversation = {
  id: string;
  teamName: string;
  conversationType: PortalConversationType;
  conversationLabel: string;
  participantName: string | null;
  lastMessagePreview: string | null;
  latestMessageAt: Date | null;
  messageCount: number;
  needsReply: boolean;
  href: string;
};

function internalConversationLabel(input: {
  type: PortalConversationType;
  title: string | null;
  participantUser: { name: string | null; email: string | null } | null;
}) {
  if (input.type === PortalConversationType.CAPTAIN_PLAYER) {
    return `Private · ${displayName(input.participantUser)} ↔ captain`;
  }
  if (input.type === PortalConversationType.CAPTAIN_CAPTAIN) {
    return "Private · captain ↔ captain";
  }
  if (input.type === PortalConversationType.REGULARS) {
    return input.title?.trim() || "Regulars";
  }
  if (input.type === PortalConversationType.SELECTED_GROUP) {
    return input.title?.trim() || "Selected Players";
  }
  if (input.type === PortalConversationType.SIXFL) {
    return "Message SIXFL";
  }
  return "Whole Squad Chat";
}

export async function getAdminInternalChatConversations(
  limit = 200,
): Promise<AdminInternalChatConversation[]> {
  const conversations = await prisma.portalConversation.findMany({
    orderBy: [{ latestMessageAt: "desc" }, { updatedAt: "desc" }],
    take: Math.max(20, Math.min(500, limit)),
    select: {
      id: true,
      teamId: true,
      type: true,
      conversationKey: true,
      participantUserId: true,
      title: true,
      lastMessagePreview: true,
      latestMessageAt: true,
      participantUser: {
        select: { name: true, email: true },
      },
      team: {
        select: { name: true },
      },
      _count: {
        select: { messages: true },
      },
      messages: {
        where: { deletedAt: null },
        orderBy: { createdAt: "desc" },
        take: 1,
        select: {
          senderRole: true,
          createdAt: true,
        },
      },
    },
  });

  return conversations.map((conversation) => ({
    id: conversation.id,
    teamName: conversation.team.name,
    conversationType: conversation.type,
    conversationLabel: internalConversationLabel(conversation),
    participantName:
      conversation.type === PortalConversationType.CAPTAIN_PLAYER ||
      conversation.type === PortalConversationType.SIXFL
        ? displayName(conversation.participantUser)
        : null,
    lastMessagePreview: conversation.lastMessagePreview,
    latestMessageAt: conversation.latestMessageAt,
    messageCount: conversation._count.messages,
    needsReply:
      conversation.type === PortalConversationType.SIXFL &&
      Boolean(
        conversation.messages[0] &&
          (conversation.messages[0].senderRole === PortalMessageSenderRole.PLAYER ||
            conversation.messages[0].senderRole === PortalMessageSenderRole.CAPTAIN),
      ),
    href: adminPortalChatHref({
      teamId: conversation.teamId,
      conversationId: conversation.id,
      type: conversation.type,
      participantUserId: conversation.participantUserId,
      conversationKey: conversation.conversationKey,
    }),
  }));
}

function displayName(user: { name: string | null; email: string | null } | null) {
  return user?.name?.trim() || user?.email?.trim() || "SIXFL user";
}

function preview(value: string, max = 120) {
  const compact = value.trim().replace(/\s+/g, " ");
  return compact.length <= max ? compact : `${compact.slice(0, max - 3)}...`;
}

export function adminPortalChatHref(input: {
  teamId: string;
  conversationId: string;
  type: PortalConversationType;
  participantUserId: string | null;
  conversationKey: string;
}) {
  if (
    input.type === PortalConversationType.CAPTAIN_PLAYER &&
    input.participantUserId
  ) {
    return `/captain/team/${input.teamId}/chat?conversation=${encodeURIComponent(
      `player:${input.participantUserId}`,
    )}`;
  }

  if (input.type === PortalConversationType.CAPTAIN_CAPTAIN) {
    const captainIds = input.conversationKey.split(":").slice(-2);
    const targetCaptainId = captainIds[1] || captainIds[0] || "";
    return `/captain/team/${input.teamId}/chat?conversation=${encodeURIComponent(
      `captain:${targetCaptainId}`,
    )}`;
  }

  if (
    input.type === PortalConversationType.REGULARS ||
    input.type === PortalConversationType.SELECTED_GROUP
  ) {
    return `/captain/team/${input.teamId}/chat?conversation=${encodeURIComponent(
      `group:${input.conversationId}`,
    )}`;
  }

  if (input.type === PortalConversationType.SIXFL) {
    return `/admin/messaging/chat/support/${input.conversationId}`;
  }

  return `/captain/team/${input.teamId}/chat?conversation=team`;
}

export async function getAdminSixflSupportConversations(
  limit = 50,
): Promise<AdminSixflSupportConversation[]> {
  const conversations = await prisma.portalConversation.findMany({
    where: { type: PortalConversationType.SIXFL },
    orderBy: [{ latestMessageAt: "desc" }, { updatedAt: "desc" }],
    take: Math.max(5, Math.min(200, limit)),
    select: {
      id: true,
      teamId: true,
      lastMessagePreview: true,
      latestMessageAt: true,
      participantUser: {
        select: { name: true, email: true },
      },
      team: {
        select: { name: true },
      },
      messages: {
        where: { deletedAt: null },
        orderBy: { createdAt: "desc" },
        take: 1,
        select: {
          senderRole: true,
        },
      },
    },
  });

  return conversations.map((conversation) => {
    const latest = conversation.messages[0] ?? null;
    const needsReply =
      latest?.senderRole === PortalMessageSenderRole.PLAYER ||
      latest?.senderRole === PortalMessageSenderRole.CAPTAIN;

    return {
      id: conversation.id,
      teamName: conversation.team.name,
      participantName: displayName(conversation.participantUser),
      latestMessageAt: conversation.latestMessageAt,
      lastMessagePreview: conversation.lastMessagePreview,
      needsReply,
      href: `/admin/messaging/chat/support/${conversation.id}`,
    };
  });
}

export async function getAdminSixflSupportNeedsReplyCount() {
  const conversations = await getAdminSixflSupportConversations(200);
  return conversations.filter((conversation) => conversation.needsReply).length;
}

export async function getAdminSixflSupportConversation(conversationId: string) {
  const conversation = await prisma.portalConversation.findFirst({
    where: {
      id: conversationId,
      type: PortalConversationType.SIXFL,
    },
    select: {
      id: true,
      teamId: true,
      title: true,
      participantUserId: true,
      participantUser: {
        select: { id: true, name: true, email: true },
      },
      team: {
        select: { id: true, name: true },
      },
      messages: {
        where: { deletedAt: null },
        orderBy: { createdAt: "asc" },
        select: {
          id: true,
          body: true,
          senderRole: true,
          senderUserId: true,
          senderUser: {
            select: { name: true, email: true },
          },
          createdAt: true,
        },
      },
    },
  });

  if (!conversation) return null;

  const latest =
    conversation.messages[conversation.messages.length - 1] ?? null;
  return {
    ...conversation,
    participantName: displayName(conversation.participantUser),
    needsReply:
      latest?.senderRole === PortalMessageSenderRole.PLAYER ||
      latest?.senderRole === PortalMessageSenderRole.CAPTAIN,
  };
}

function pushStatus(input: {
  targetedDeviceCount: number;
  deliveries: Array<{ status: string }>;
}) {
  const statuses = new Set(input.deliveries.map((delivery) => delivery.status));

  if (statuses.has("CLICKED")) {
    return { label: "Opened", tone: "opened" as const };
  }
  if (statuses.has("SUPPRESSED_VISIBLE")) {
    return { label: "Chat already open", tone: "suppressed" as const };
  }
  if (statuses.has("SHOWN")) {
    return { label: "Shown on phone", tone: "shown" as const };
  }
  if (statuses.has("FETCHED")) {
    return { label: "Reached device", tone: "shown" as const };
  }
  if (input.targetedDeviceCount === 0) {
    return { label: "Notifications not enabled", tone: "disabled" as const };
  }

  return { label: "Push sent · awaiting receipt", tone: "pending" as const };
}

export async function getAdminAppMessagingDashboard(
  messageLimit = 15,
  pushLimit = 15,
): Promise<AdminAppMessagingDashboard> {
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000);

  const [
    totalConversations,
    messagesLast24Hours,
    activeSubscriptions,
    notificationUsers,
    messages,
    supportConversations,
    pushAuditRows,
  ] = await Promise.all([
    prisma.portalConversation.count(),
    prisma.portalMessage.count({
      where: {
        createdAt: { gte: since },
        senderRole: {
          in: [
            PortalMessageSenderRole.ADMIN,
            PortalMessageSenderRole.CAPTAIN,
            PortalMessageSenderRole.PLAYER,
          ],
        },
        deletedAt: null,
      },
    }),
    prisma.pushSubscription.count({
      where: { disabledAt: null },
    }),
    prisma.pushSubscription.findMany({
      where: { disabledAt: null },
      distinct: ["userId"],
      select: { userId: true },
    }),
    prisma.portalMessage.findMany({
      where: {
        deletedAt: null,
        conversation: {
          type: { not: PortalConversationType.SIXFL },
        },
        senderRole: {
          in: [
            PortalMessageSenderRole.ADMIN,
            PortalMessageSenderRole.CAPTAIN,
            PortalMessageSenderRole.PLAYER,
          ],
        },
      },
      orderBy: [{ createdAt: "desc" }],
      take: Math.max(5, Math.min(40, messageLimit)),
      select: {
        id: true,
        body: true,
        createdAt: true,
        senderUserId: true,
        senderRole: true,
        isAdminTest: true,
        senderUser: {
          select: { name: true, email: true },
        },
        conversation: {
          select: {
            id: true,
            teamId: true,
            type: true,
            conversationKey: true,
            participantUserId: true,
            participantUser: {
              select: { name: true, email: true },
            },
            team: {
              select: {
                name: true,
                members: {
                  select: {
                    userId: true,
                    role: true,
                  },
                },
              },
            },
            reads: {
              select: {
                userId: true,
                lastReadAt: true,
              },
            },
            members: {
              select: { userId: true },
            },
          },
        },
      },
    }),
    getAdminSixflSupportConversations(40),
    prisma.pushNotification.findMany({
      orderBy: [{ createdAt: "desc" }],
      take: Math.max(5, Math.min(40, pushLimit)),
      select: {
        id: true,
        title: true,
        body: true,
        url: true,
        createdAt: true,
        targetedDeviceCount: true,
        user: {
          select: { name: true, email: true },
        },
        deliveries: {
          orderBy: [{ recordedAt: "desc" }],
          select: {
            status: true,
            subscription: {
              select: { userAgent: true },
            },
          },
        },
      },
    }),
  ]);

  const messageIds = messages.map((message) => message.id);
  const pushForMessages =
    messageIds.length > 0
      ? await prisma.pushNotification.findMany({
          where: {
            sourceId: { in: messageIds },
          },
          select: {
            sourceId: true,
            targetedDeviceCount: true,
            deliveries: {
              select: { status: true },
            },
          },
        })
      : [];

  const pushByMessageId = new Map<
    string,
    Array<{
      targetedDeviceCount: number;
      deliveries: Array<{ status: string }>;
    }>
  >();

  for (const push of pushForMessages) {
    if (!push.sourceId) continue;
    const rows = pushByMessageId.get(push.sourceId) ?? [];
    rows.push(push);
    pushByMessageId.set(push.sourceId, rows);
  }

  const recentMessages: AdminAppMessageActivity[] = messages.map((message) => {
    const conversation = message.conversation;
    const readByUser = new Map(
      conversation.reads.map((read) => [read.userId, read.lastReadAt]),
    );

    const recipients =
      conversation.type === PortalConversationType.CAPTAIN_PLAYER
        ? conversation.team.members
            .filter(
              (member) =>
                member.role === TeamRole.CAPTAIN ||
                member.userId === conversation.participantUserId,
            )
            .map((member) => member.userId)
        : conversation.type === PortalConversationType.CAPTAIN_CAPTAIN
          ? conversation.conversationKey.split(":").slice(-2)
          : conversation.type === PortalConversationType.REGULARS ||
            conversation.type === PortalConversationType.SELECTED_GROUP
          ? conversation.members.map((member) => member.userId)
          : conversation.type === PortalConversationType.SIXFL
            ? conversation.participantUserId
              ? [conversation.participantUserId]
              : []
            : conversation.team.members.map((member) => member.userId);

    const unreadRecipientCount = recipients.filter((userId) => {
      if (userId === message.senderUserId) return false;
      const readAt = readByUser.get(userId);
      return !readAt || readAt < message.createdAt;
    }).length;

    const pushes = pushByMessageId.get(message.id) ?? [];
    let pushLabel = "No phone alert";
    let pushTone: AdminAppMessageActivity["pushTone"] = "quiet";

    if (pushes.length > 0) {
      const combined = {
        targetedDeviceCount: pushes.reduce(
          (sum, row) => sum + row.targetedDeviceCount,
          0,
        ),
        deliveries: pushes.flatMap((row) => row.deliveries),
      };
      const status = pushStatus(combined);
      pushLabel = status.label;
      pushTone = status.tone;
    }

    const conversationLabel =
      conversation.type === PortalConversationType.CAPTAIN_PLAYER
        ? `Private · ${displayName(conversation.participantUser)} ↔ captain`
        : conversation.type === PortalConversationType.CAPTAIN_CAPTAIN
          ? "Private · captain ↔ captain"
          : conversation.type === PortalConversationType.REGULARS
          ? "Regulars"
          : conversation.type === PortalConversationType.SELECTED_GROUP
            ? "Selected Players"
            : conversation.type === PortalConversationType.SIXFL
              ? "Message SIXFL"
              : "Whole Squad Chat";

    return {
      id: message.id,
      teamName: conversation.team.name,
      senderName: displayName(message.senderUser),
      body: preview(message.body),
      conversationLabel: message.isAdminTest
        ? `${conversationLabel} · test`
        : conversationLabel,
      createdAt: message.createdAt,
      unreadRecipientCount,
      href: adminPortalChatHref({
        teamId: conversation.teamId,
        conversationId: conversation.id,
        type: conversation.type,
        participantUserId: conversation.participantUserId,
        conversationKey: conversation.conversationKey,
      }),
      pushLabel,
      pushTone,
    };
  });

  const pushAudit: AdminPushAuditItem[] = pushAuditRows.map((item) => {
    const status = pushStatus({
      targetedDeviceCount: item.targetedDeviceCount,
      deliveries: item.deliveries,
    });

    const latestDevice =
      item.deliveries.find((delivery) => delivery.subscription.userAgent)
        ?.subscription.userAgent ?? null;

    return {
      id: item.id,
      title: item.title,
      body: preview(item.body),
      recipientName: displayName(item.user),
      createdAt: item.createdAt,
      statusLabel: status.label,
      statusTone: status.tone,
      href: item.url,
      deviceLabel: latestDevice,
    };
  });

  return {
    totalConversations,
    messagesLast24Hours,
    activePushDevices: activeSubscriptions,
    notificationUsers: notificationUsers.length,
    sixflSupportNeedsReplyCount: supportConversations.filter(
      (conversation) => conversation.needsReply,
    ).length,
    sixflSupportMessages: supportConversations.slice(0, 8),
    recentMessages,
    pushAudit,
  };
}
