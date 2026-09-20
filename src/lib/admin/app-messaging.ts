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

export type AdminAppMessagingDashboard = {
  totalConversations: number;
  messagesLast24Hours: number;
  activePushDevices: number;
  notificationUsers: number;
  recentMessages: AdminAppMessageActivity[];
  pushAudit: AdminPushAuditItem[];
};

function displayName(user: { name: string | null; email: string | null } | null) {
  return user?.name?.trim() || user?.email?.trim() || "SIXFL user";
}

function preview(value: string, max = 120) {
  const compact = value.trim().replace(/\s+/g, " ");
  return compact.length <= max ? compact : `${compact.slice(0, max - 3)}...`;
}

function chatHref(input: {
  teamId: string;
  type: PortalConversationType;
  participantUserId: string | null;
}) {
  if (
    input.type === PortalConversationType.CAPTAIN_PLAYER &&
    input.participantUserId
  ) {
    return `/captain/team/${input.teamId}/chat?conversation=${encodeURIComponent(
      `player:${input.participantUserId}`,
    )}`;
  }

  return `/captain/team/${input.teamId}/chat?conversation=team`;
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
    pushAuditRows,
  ] = await Promise.all([
    prisma.portalConversation.count(),
    prisma.portalMessage.count({
      where: {
        createdAt: { gte: since },
        senderRole: {
          in: [
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
        senderRole: {
          in: [
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
        senderUser: {
          select: { name: true, email: true },
        },
        conversation: {
          select: {
            id: true,
            teamId: true,
            type: true,
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
          },
        },
      },
    }),
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

    const privateChat =
      conversation.type === PortalConversationType.CAPTAIN_PLAYER;

    return {
      id: message.id,
      teamName: conversation.team.name,
      senderName: displayName(message.senderUser),
      body: preview(message.body),
      conversationLabel: privateChat
        ? `Private · ${displayName(conversation.participantUser)} ↔ captain`
        : "Team chat",
      createdAt: message.createdAt,
      unreadRecipientCount,
      href: chatHref({
        teamId: conversation.teamId,
        type: conversation.type,
        participantUserId: conversation.participantUserId,
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
    recentMessages,
    pushAudit,
  };
}
