import { PortalConversationType, TeamRole } from "@prisma/client";

import { prisma } from "@/lib/prisma";

export const TEAM_CHAT_REF = "team";

export function privateChatRef(userId: string) {
  return `player:${userId}`;
}

export function captainChatRef(userId: string) {
  return `captain:${userId}`;
}

export const SIXFL_CHAT_REF = "sixfl";

export function teamConversationKey(teamId: string) {
  return `TEAM:${teamId}`;
}

export function captainPlayerConversationKey(teamId: string, playerUserId: string) {
  return `CAPTAIN_PLAYER:${teamId}:${playerUserId}`;
}

export function captainCaptainConversationKey(
  teamId: string,
  firstCaptainUserId: string,
  secondCaptainUserId: string,
) {
  const [first, second] = [firstCaptainUserId, secondCaptainUserId].sort();
  return `CAPTAIN_CAPTAIN:${teamId}:${first}:${second}`;
}

export function sixflConversationKey(teamId: string, userId: string) {
  return `SIXFL:${teamId}:${userId}`;
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
    update: { title: "Whole Squad Chat" },
    create: {
      conversationKey: teamConversationKey(teamId),
      teamId,
      type: PortalConversationType.TEAM,
      title: "Whole Squad Chat",
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

export async function ensureCaptainCaptainConversation(
  teamId: string,
  firstCaptainUserId: string,
  secondCaptainUserId: string,
  title?: string | null,
) {
  const conversationKey = captainCaptainConversationKey(
    teamId,
    firstCaptainUserId,
    secondCaptainUserId,
  );

  return prisma.portalConversation.upsert({
    where: { conversationKey },
    update: title ? { title } : {},
    create: {
      conversationKey,
      teamId,
      type: PortalConversationType.CAPTAIN_CAPTAIN,
      title: title || "Captain chat",
    },
  });
}

export async function ensureSixflPortalConversation(
  teamId: string,
  userId: string,
  title?: string | null,
) {
  return prisma.portalConversation.upsert({
    where: { conversationKey: sixflConversationKey(teamId, userId) },
    update: title ? { title } : {},
    create: {
      conversationKey: sixflConversationKey(teamId, userId),
      teamId,
      type: PortalConversationType.SIXFL,
      participantUserId: userId,
      title: title || "Message SIXFL",
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
        {
          type: PortalConversationType.SIXFL,
          participantUserId: input.userId,
        },
        ...(isCaptain
          ? [
              { type: PortalConversationType.CAPTAIN_PLAYER },
              { type: PortalConversationType.CAPTAIN_CAPTAIN },
            ]
          : [
              {
                type: PortalConversationType.CAPTAIN_PLAYER,
                participantUserId: input.userId,
              },
            ]),
        {
          type: PortalConversationType.REGULARS,
          members: { some: { userId: input.userId } },
        },
        {
          type: PortalConversationType.SELECTED_GROUP,
          members: { some: { userId: input.userId } },
        },
      ],
    },
    select: {
      id: true,
      type: true,
      conversationKey: true,
      reads: {
        where: { userId: input.userId },
        select: { lastReadAt: true },
        take: 1,
      },
    },
  });

  const relevantConversations = conversations.filter((conversation) => {
    if (conversation.type !== PortalConversationType.CAPTAIN_CAPTAIN) {
      return true;
    }

    const parts = conversation.conversationKey.split(":");
    return parts.includes(input.userId);
  });

  const counts = await Promise.all(
    relevantConversations.map((conversation) =>
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
