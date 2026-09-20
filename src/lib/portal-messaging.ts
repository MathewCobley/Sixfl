import { PortalConversationType, TeamRole } from "@prisma/client";

import { prisma } from "@/lib/prisma";

export const TEAM_CHAT_REF = "team";

export function privateChatRef(userId: string) {
  return `player:${userId}`;
}

export function teamConversationKey(teamId: string) {
  return `TEAM:${teamId}`;
}

export function captainPlayerConversationKey(teamId: string, playerUserId: string) {
  return `CAPTAIN_PLAYER:${teamId}:${playerUserId}`;
}

export function isCaptainRole(role: TeamRole | null | undefined) {
  return role === TeamRole.CAPTAIN;
}

export function previewText(body: string) {
  const compact = body.trim().replace(/\s+/g, " ");
  if (!compact) return "";
  return compact.length > 120 ? `${compact.slice(0, 117)}...` : compact;
}

export async function ensureTeamPortalConversation(teamId: string) {
  return prisma.portalConversation.upsert({
    where: { conversationKey: teamConversationKey(teamId) },
    update: {},
    create: {
      conversationKey: teamConversationKey(teamId),
      teamId,
      type: PortalConversationType.TEAM,
      title: "Team chat",
    },
  });
}

export async function ensureCaptainPlayerConversation(
  teamId: string,
  playerUserId: string,
  title?: string | null,
) {
  return prisma.portalConversation.upsert({
    where: { conversationKey: captainPlayerConversationKey(teamId, playerUserId) },
    update: title ? { title } : {},
    create: {
      conversationKey: captainPlayerConversationKey(teamId, playerUserId),
      teamId,
      type: PortalConversationType.CAPTAIN_PLAYER,
      participantUserId: playerUserId,
      title: title || "Captain chat",
    },
  });
}

export async function getPortalChatUnreadCount(input: {
  teamId: string;
  userId: string;
  role: TeamRole | null;
}) {
  const isCaptain = isCaptainRole(input.role);

  const conversations = await prisma.portalConversation.findMany({
    where: {
      teamId: input.teamId,
      OR: [
        { type: PortalConversationType.TEAM },
        ...(isCaptain
          ? [{ type: PortalConversationType.CAPTAIN_PLAYER as const }]
          : [
              {
                type: PortalConversationType.CAPTAIN_PLAYER as const,
                participantUserId: input.userId,
              },
            ]),
      ],
    },
    select: {
      id: true,
      reads: {
        where: { userId: input.userId },
        select: { lastReadAt: true },
        take: 1,
      },
    },
  });

  const counts = await Promise.all(
    conversations.map((conversation) =>
      prisma.portalMessage.count({
        where: {
          conversationId: conversation.id,
          deletedAt: null,
          senderUserId: { not: input.userId },
          createdAt: {
            gt: conversation.reads[0]?.lastReadAt ?? new Date(0),
          },
        },
      }),
    ),
  );

  return counts.reduce((sum, count) => sum + count, 0);
}
