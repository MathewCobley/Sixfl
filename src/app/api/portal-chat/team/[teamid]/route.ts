import { randomUUID } from "crypto";
import {
  PortalConversationType,
  PortalMessageSenderRole,
  TeamRole,
  UserRole,
} from "@prisma/client";
import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";

import { authOptions } from "@/auth";
import {
  captainCaptainConversationKey,
  captainChatRef,
  ensureCaptainCaptainConversation,
  ensureCaptainPlayerConversation,
  ensureSixflPortalConversation,
  ensureTeamPortalConversation,
  isCaptainRole,
  previewText,
  privateChatRef,
  SIXFL_CHAT_REF,
} from "@/lib/portal-messaging";
import { queuePushNotifications } from "@/lib/push-notifications";
import { prisma } from "@/lib/prisma";

type ViewRole = "CAPTAIN" | "PLAYER";

type ApiError = {
  error: string;
  status: number;
};

type PrivateTarget = {
  userId: string;
  title: string;
  kind: "PLAYER" | "CAPTAIN";
};

type PortalConversationResult = {
  conversation: Awaited<ReturnType<typeof ensureTeamPortalConversation>>;
  title?: string;
  targetUserId?: string | null;
  memberUserIds?: string[];
};

type AccessContext = {
  actualUserId: string;
  effectiveUserId: string;
  effectiveName: string;
  membershipId: string | null;
  membershipRole: TeamRole | null;
  viewRole: ViewRole;
  isPreview: boolean;
  isAdminTestMode: boolean;
  isSimulatedTestMode: boolean;
  canSend: boolean;
};

function senderRoleFromContext(context: AccessContext) {
  if (context.isAdminTestMode) {
    return PortalMessageSenderRole.ADMIN;
  }

  return isCaptainRole(context.membershipRole)
    ? PortalMessageSenderRole.CAPTAIN
    : PortalMessageSenderRole.PLAYER;
}

function pushPreview(body: string) {
  const compact = body.trim().replace(/\s+/g, " ");
  return compact.length > 140 ? `${compact.slice(0, 137)}...` : compact;
}

function jsonError(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}

function getDisplayName(user: { name: string | null; email: string | null }) {
  return user.name?.trim() || user.email?.trim() || "Player";
}

function normaliseConversationRef(value: string | null, context: AccessContext) {
  const ref = value?.trim() || "team";
  if (ref === "captain" && context.viewRole === "PLAYER") {
    return privateChatRef(context.effectiveUserId);
  }
  return ref;
}

async function getAccessContext(
  request: Request,
  teamId: string,
): Promise<AccessContext | ApiError> {
  const session = await getServerSession(authOptions).catch(() => null);

  if (!session?.user?.email) {
    return { error: "Please sign in again.", status: 401 } as const;
  }

  const email = session.user.email.trim().toLowerCase();
  const actualUser = await prisma.user.findUnique({
    where: { email },
    select: { id: true, name: true, email: true, role: true },
  });

  if (!actualUser) {
    return { error: "Your SIXFL account could not be found.", status: 401 } as const;
  }

  const url = new URL(request.url);
  const previewMembershipId = url.searchParams.get("previewMembershipId")?.trim() || null;
  const adminTestRequested = url.searchParams.get("adminTest") === "1";
  const simulateRequested = url.searchParams.get("simulate") === "1";

  if (actualUser.role === UserRole.ADMIN) {
    if (previewMembershipId) {
      const previewMembership = await prisma.teamMember.findFirst({
        where: { id: previewMembershipId, teamId },
        select: {
          id: true,
          role: true,
          userId: true,
          user: { select: { name: true, email: true } },
        },
      });

      if (!previewMembership) {
        return { error: "That player preview is not linked to this team.", status: 404 } as const;
      }

      return {
        actualUserId: actualUser.id,
        effectiveUserId: previewMembership.userId,
        effectiveName: getDisplayName(previewMembership.user),
        membershipId: previewMembership.id,
        membershipRole: previewMembership.role,
        viewRole: isCaptainRole(previewMembership.role) ? "CAPTAIN" : "PLAYER",
        isPreview: !simulateRequested,
        isAdminTestMode: false,
        isSimulatedTestMode: simulateRequested,
        canSend: simulateRequested,
      } satisfies AccessContext;
    }

    return {
      actualUserId: actualUser.id,
      effectiveUserId: actualUser.id,
      effectiveName: "SIXFL Admin/Test",
      membershipId: null,
      membershipRole: null,
      viewRole: "CAPTAIN",
      isPreview: !adminTestRequested,
      isAdminTestMode: adminTestRequested,
      isSimulatedTestMode: false,
      canSend: adminTestRequested,
    } satisfies AccessContext;
  }

  const membership = await prisma.teamMember.findFirst({
    where: { teamId, userId: actualUser.id },
    select: { id: true, role: true, userId: true },
  });

  if (!membership) {
    return { error: "You are not linked to this team.", status: 403 } as const;
  }

  return {
    actualUserId: actualUser.id,
    effectiveUserId: actualUser.id,
    effectiveName: actualUser.name?.trim() || actualUser.email?.trim() || "Player",
    membershipId: membership.id,
    membershipRole: membership.role,
    viewRole: isCaptainRole(membership.role) ? "CAPTAIN" : "PLAYER",
    isPreview: false,
    isAdminTestMode: false,
    isSimulatedTestMode: false,
    canSend: true,
  } satisfies AccessContext;
}

async function getPrivateTarget(input: {
  teamId: string;
  conversationRef: string;
  context: AccessContext;
}): Promise<PrivateTarget | ApiError> {
  const { teamId, context } = input;
  const isCaptainTarget = input.conversationRef.startsWith("captain:");
  const rawTargetUserId = isCaptainTarget
    ? input.conversationRef.slice("captain:".length).trim()
    : input.conversationRef.startsWith("player:")
      ? input.conversationRef.slice("player:".length).trim()
      : "";

  if (context.viewRole === "PLAYER") {
    if (isCaptainTarget || (rawTargetUserId && rawTargetUserId !== context.effectiveUserId)) {
      return { error: "Players can only message their captain privately.", status: 403 } as const;
    }

    const captainCount = await prisma.teamMember.count({
      where: { teamId, role: TeamRole.CAPTAIN },
    });

    if (captainCount === 0) {
      return { error: "This team does not currently have a captain linked.", status: 409 } as const;
    }

    return {
      userId: context.effectiveUserId,
      title: `${context.effectiveName} · Captain chat`,
      kind: "PLAYER",
    };
  }

  if (!rawTargetUserId) {
    return { error: "Choose someone first.", status: 400 } as const;
  }

  const targetMembership = await prisma.teamMember.findFirst({
    where: {
      teamId,
      userId: rawTargetUserId,
      ...(isCaptainTarget
        ? { role: TeamRole.CAPTAIN }
        : { role: { not: TeamRole.CAPTAIN } }),
    },
    select: {
      userId: true,
      role: true,
      user: { select: { name: true, email: true } },
    },
  });

  if (!targetMembership) {
    return {
      error: isCaptainTarget
        ? "That captain is not linked to this team."
        : "That player is not in this squad.",
      status: 404,
    } as const;
  }

  if (
    !context.isAdminTestMode &&
    targetMembership.userId === context.effectiveUserId
  ) {
    return { error: "Choose another person.", status: 400 } as const;
  }

  const targetName = getDisplayName(targetMembership.user);
  return {
    userId: targetMembership.userId,
    title: `${targetName} · ${isCaptainTarget ? "Captain" : "Private"} chat`,
    kind: isCaptainTarget ? "CAPTAIN" : "PLAYER",
  };
}

async function resolveCaptainSourceUserId(
  teamId: string,
  context: AccessContext,
  targetCaptainUserId: string,
) {
  if (
    context.membershipRole === TeamRole.CAPTAIN &&
    context.effectiveUserId !== targetCaptainUserId
  ) {
    return context.effectiveUserId;
  }

  if (!context.isAdminTestMode) return null;

  const source = await prisma.teamMember.findFirst({
    where: {
      teamId,
      role: TeamRole.CAPTAIN,
      userId: { not: targetCaptainUserId },
    },
    orderBy: { createdAt: "asc" },
    select: { userId: true },
  });

  return source?.userId ?? null;
}

async function resolveGroupCreatorUserId(
  teamId: string,
  context: AccessContext,
) {
  if (context.membershipId && context.effectiveUserId) {
    return context.effectiveUserId;
  }

  if (!context.isAdminTestMode) return null;

  const captain = await prisma.teamMember.findFirst({
    where: { teamId, role: TeamRole.CAPTAIN },
    orderBy: { createdAt: "asc" },
    select: { userId: true },
  });

  return captain?.userId ?? null;
}

async function resolveSixflParticipantUserId(
  teamId: string,
  context: AccessContext,
) {
  if (!context.isAdminTestMode) return context.effectiveUserId;

  const captain = await prisma.teamMember.findFirst({
    where: {
      teamId,
      role: TeamRole.CAPTAIN,
    },
    orderBy: { createdAt: "asc" },
    select: { userId: true },
  });

  if (captain?.userId) return captain.userId;

  const member = await prisma.teamMember.findFirst({
    where: { teamId },
    orderBy: { createdAt: "asc" },
    select: { userId: true },
  });

  return member?.userId ?? context.effectiveUserId;
}

type CurrentRegularAudience = {
  regularUserIds: Set<string>;
  captainUserIds: Set<string>;
};

async function getCurrentRegularAudience(teamId: string): Promise<CurrentRegularAudience> {
  const members = await prisma.teamMember.findMany({
    where: { teamId },
    select: { userId: true, isRegular: true, role: true },
  });

  return {
    regularUserIds: new Set(
      members.filter((member) => member.isRegular).map((member) => member.userId),
    ),
    captainUserIds: new Set(
      members.filter((member) => member.role === TeamRole.CAPTAIN).map((member) => member.userId),
    ),
  };
}

function isCurrentRegularSnapshot(
  memberUserIds: string[],
  audience: CurrentRegularAudience,
) {
  if (audience.regularUserIds.size === 0) return false;

  const memberSet = new Set(memberUserIds);
  for (const userId of audience.regularUserIds) {
    if (!memberSet.has(userId)) return false;
  }

  const extraMembers = memberUserIds.filter(
    (userId) => !audience.regularUserIds.has(userId),
  );

  return (
    extraMembers.length <= 1 &&
    extraMembers.every((userId) => audience.captainUserIds.has(userId))
  );
}

async function getGroupConversationForRef(input: {
  teamId: string;
  conversationRef: string;
  context: AccessContext;
}): Promise<PortalConversationResult | ApiError> {
  if (!input.conversationRef.startsWith("group:")) {
    return { error: "That group conversation could not be found.", status: 404 } as const;
  }

  const conversationId = input.conversationRef.slice("group:".length).trim();
  if (!conversationId) {
    return { error: "That group conversation could not be found.", status: 404 } as const;
  }

  const conversation = await prisma.portalConversation.findFirst({
    where: {
      id: conversationId,
      teamId: input.teamId,
      type: {
        in: [
          PortalConversationType.REGULARS,
          PortalConversationType.SELECTED_GROUP,
        ],
      },
    },
    include: {
      members: {
        select: {
          userId: true,
          user: { select: { name: true, email: true } },
        },
      },
    },
  });

  if (!conversation) {
    return { error: "That group conversation could not be found.", status: 404 } as const;
  }

  const memberUserIds = conversation.members.map((member) => member.userId);
  if (
    !input.context.isAdminTestMode &&
    !memberUserIds.includes(input.context.effectiveUserId)
  ) {
    return { error: "You are not part of this group conversation.", status: 403 } as const;
  }

  if (
    conversation.type === PortalConversationType.REGULARS &&
    !input.context.isAdminTestMode
  ) {
    const currentAudience = await getCurrentRegularAudience(input.teamId);
    if (!isCurrentRegularSnapshot(memberUserIds, currentAudience)) {
      return { error: "This Regulars chat is no longer current.", status: 404 } as const;
    }
  }

  const directOtherMember =
    conversation.type === PortalConversationType.SELECTED_GROUP &&
    conversation.members.length === 2
      ? conversation.members.find(
          (member) => member.userId !== input.context.effectiveUserId,
        ) ?? null
      : null;

  return {
    conversation,
    title:
      conversation.type === PortalConversationType.REGULARS
        ? "Regulars Chat"
        : directOtherMember
          ? getDisplayName(directOtherMember.user)
          : conversation.title || "Group chat",
    memberUserIds,
  };
}

async function getConversationForRef(input: {
  teamId: string;
  conversationRef: string;
  context: AccessContext;
}): Promise<PortalConversationResult | ApiError> {
  if (input.conversationRef === "team") {
    return {
      conversation: await ensureTeamPortalConversation(input.teamId),
      title: "Whole Squad Chat",
    };
  }

  if (input.conversationRef.startsWith("group:")) {
    return getGroupConversationForRef(input);
  }

  if (input.conversationRef === SIXFL_CHAT_REF) {
    const participantUserId = await resolveSixflParticipantUserId(
      input.teamId,
      input.context,
    );

    return {
      conversation: await ensureSixflPortalConversation(
        input.teamId,
        participantUserId,
        "Message SIXFL",
      ),
      title: "Message SIXFL",
      targetUserId: participantUserId,
    };
  }

  const target = await getPrivateTarget(input);
  if ("error" in target) return target;

  if (target.kind === "CAPTAIN") {
    const sourceCaptainUserId = await resolveCaptainSourceUserId(
      input.teamId,
      input.context,
      target.userId,
    );

    if (!sourceCaptainUserId) {
      return {
        error: "This team needs another captain before a private captain chat can be started.",
        status: 409,
      } as const;
    }

    return {
      conversation: await ensureCaptainCaptainConversation(
        input.teamId,
        sourceCaptainUserId,
        target.userId,
        target.title,
      ),
      title: target.title,
      targetUserId: target.userId,
    };
  }

  return {
    conversation: await ensureCaptainPlayerConversation(
      input.teamId,
      target.userId,
      target.title,
    ),
    title: target.title,
    targetUserId: target.userId,
  };
}

async function unreadCountFor(input: {
  conversationId: string;
  userId: string;
  isPreview: boolean;
}) {
  if (input.isPreview) return 0;

  const read = await prisma.portalConversationRead.findUnique({
    where: {
      conversationId_userId: {
        conversationId: input.conversationId,
        userId: input.userId,
      },
    },
    select: { lastReadAt: true },
  });

  return prisma.portalMessage.count({
    where: {
      conversationId: input.conversationId,
      deletedAt: null,
      senderUserId: { not: input.userId },
      createdAt: { gt: read?.lastReadAt ?? new Date(0) },
    },
  });
}

async function buildConversationList(teamId: string, context: AccessContext) {
  const sixflParticipantUserId = await resolveSixflParticipantUserId(
    teamId,
    context,
  );
  const [teamConversation, sixflConversation, groupConversations, currentRegularAudience] = await Promise.all([
    ensureTeamPortalConversation(teamId),
    ensureSixflPortalConversation(
      teamId,
      sixflParticipantUserId,
      "Message SIXFL",
    ),
    prisma.portalConversation.findMany({
      where: {
        teamId,
        type: {
          in: [
            PortalConversationType.REGULARS,
            PortalConversationType.SELECTED_GROUP,
          ],
        },
        ...(context.isAdminTestMode
          ? {}
          : { members: { some: { userId: context.effectiveUserId } } }),
      },
      orderBy: [{ latestMessageAt: "desc" }, { createdAt: "desc" }],
      select: {
        id: true,
        type: true,
        title: true,
        latestMessageAt: true,
        lastMessagePreview: true,
        members: {
          select: {
            userId: true,
            user: { select: { name: true, email: true } },
          },
        },
        reads: {
          where: { userId: context.effectiveUserId },
          select: { archivedAt: true },
          take: 1,
        },
      },
    }),
    getCurrentRegularAudience(teamId),
  ]);

  const [teamUnread, sixflUnread] = await Promise.all([
    unreadCountFor({
      conversationId: teamConversation.id,
      userId: context.effectiveUserId,
      isPreview: context.isPreview,
    }),
    unreadCountFor({
      conversationId: sixflConversation.id,
      userId: context.effectiveUserId,
      isPreview: context.isPreview,
    }),
  ]);

  const items: Array<{
    ref: string;
    title: string;
    subtitle: string;
    unreadCount: number;
    latestMessageAt: string | null;
    preview: string | null;
    kind: "TEAM" | "GROUP" | "PRIVATE" | "SUPPORT";
    disabled?: boolean;
  }> = [
    {
      ref: "team",
      title: "Whole Squad Chat",
      subtitle: "Everyone in the squad can read and reply",
      unreadCount: teamUnread,
      latestMessageAt: teamConversation.latestMessageAt?.toISOString() ?? null,
      preview: teamConversation.lastMessagePreview,
      kind: "TEAM",
    },
  ];

  const visibleGroupConversations = groupConversations.filter((conversation) => {
    if (
      conversation.type === PortalConversationType.REGULARS &&
      !context.isAdminTestMode &&
      !isCurrentRegularSnapshot(
        conversation.members.map((member) => member.userId),
        currentRegularAudience,
      )
    ) {
      return false;
    }

    const archivedAt = conversation.reads[0]?.archivedAt ?? null;
    if (!archivedAt) return true;
    return Boolean(
      conversation.latestMessageAt &&
        conversation.latestMessageAt.getTime() > archivedAt.getTime(),
    );
  });

  const groupItems = await Promise.all(
    visibleGroupConversations.map(async (conversation) => {
      const isDirectSquadChat =
        conversation.type === PortalConversationType.SELECTED_GROUP &&
        conversation.members.length === 2;
      const otherMember = isDirectSquadChat
        ? conversation.members.find(
            (member) => member.userId !== context.effectiveUserId,
          ) ?? null
        : null;
      const otherName = otherMember
        ? getDisplayName(otherMember.user)
        : null;

      return {
        ref: `group:${conversation.id}`,
        title:
          conversation.type === PortalConversationType.REGULARS
            ? "Regulars Chat"
            : isDirectSquadChat && otherName
              ? otherName
              : conversation.title || "Selected Players",
        subtitle:
          conversation.type === PortalConversationType.REGULARS
            ? `${currentRegularAudience.regularUserIds.size} player${currentRegularAudience.regularUserIds.size === 1 ? "" : "s"} marked as Regulars`
            : isDirectSquadChat
              ? `Private · only you and ${otherName ?? "this teammate"}`
              : `Private group chat · ${conversation.members.length} people`,
        unreadCount: await unreadCountFor({
          conversationId: conversation.id,
          userId: context.effectiveUserId,
          isPreview: context.isPreview,
        }),
        latestMessageAt: conversation.latestMessageAt?.toISOString() ?? null,
        preview: conversation.lastMessagePreview,
        kind: isDirectSquadChat ? ("PRIVATE" as const) : ("GROUP" as const),
      };
    }),
  );

  if (context.viewRole === "PLAYER") {
    const captainCount = await prisma.teamMember.count({
      where: { teamId, role: TeamRole.CAPTAIN },
    });
    const existing = await prisma.portalConversation.findUnique({
      where: {
        conversationKey: `CAPTAIN_PLAYER:${teamId}:${context.effectiveUserId}`,
      },
      select: {
        id: true,
        latestMessageAt: true,
        lastMessagePreview: true,
      },
    });
    const unread = existing
      ? await unreadCountFor({
          conversationId: existing.id,
          userId: context.effectiveUserId,
          isPreview: context.isPreview,
        })
      : 0;

    items.push({
      ref: privateChatRef(context.effectiveUserId),
      title: "Message your captain",
      subtitle:
        captainCount > 0
          ? `Private — only you and your captain${captainCount === 1 ? "" : "s"}`
          : "No captain is currently linked",
      unreadCount: unread,
      latestMessageAt: existing?.latestMessageAt?.toISOString() ?? null,
      preview: existing?.lastMessagePreview ?? null,
      kind: "PRIVATE",
      disabled: captainCount === 0,
    });

    items.push(...groupItems);

    items.push({
      ref: SIXFL_CHAT_REF,
      title: "Message SIXFL",
      subtitle: "Private — only you and SIXFL",
      unreadCount: sixflUnread,
      latestMessageAt: sixflConversation.latestMessageAt?.toISOString() ?? null,
      preview: sixflConversation.lastMessagePreview,
      kind: "SUPPORT",
    });

    return items;
  }

  const members = await prisma.teamMember.findMany({
    where: {
      teamId,
      ...(context.isAdminTestMode
        ? {}
        : { userId: { not: context.effectiveUserId } }),
    },
    orderBy: [{ createdAt: "asc" }],
    select: {
      userId: true,
      role: true,
      isRegular: true,
      user: { select: { name: true, email: true } },
    },
  });

  const [existingPlayerChats, existingCaptainChats] = await Promise.all([
    prisma.portalConversation.findMany({
      where: {
        teamId,
        type: PortalConversationType.CAPTAIN_PLAYER,
        participantUserId: {
          in: members
            .filter((member) => member.role !== TeamRole.CAPTAIN)
            .map((member) => member.userId),
        },
      },
      select: {
        id: true,
        participantUserId: true,
        latestMessageAt: true,
        lastMessagePreview: true,
      },
    }),
    prisma.portalConversation.findMany({
      where: {
        teamId,
        type: PortalConversationType.CAPTAIN_CAPTAIN,
      },
      select: {
        id: true,
        conversationKey: true,
        latestMessageAt: true,
        lastMessagePreview: true,
      },
    }),
  ]);

  const playerChatByUserId = new Map(
    existingPlayerChats
      .filter((conversation) => conversation.participantUserId)
      .map((conversation) => [
        conversation.participantUserId as string,
        conversation,
      ]),
  );
  const captainChatByKey = new Map(
    existingCaptainChats.map((conversation) => [
      conversation.conversationKey,
      conversation,
    ]),
  );

  const allCaptainUserIds = members
    .filter((member) => member.role === TeamRole.CAPTAIN)
    .map((member) => member.userId);

  const privateItems = await Promise.all(
    members.map(async (member) => {
      const isCaptain = member.role === TeamRole.CAPTAIN;
      let conversation:
        | {
            id: string;
            latestMessageAt: Date | null;
            lastMessagePreview: string | null;
          }
        | undefined;
      let disabled = false;

      if (isCaptain) {
        const sourceCaptainUserId =
          context.membershipRole === TeamRole.CAPTAIN
            ? context.effectiveUserId
            : allCaptainUserIds.find((userId) => userId !== member.userId) ?? null;

        if (!sourceCaptainUserId || sourceCaptainUserId === member.userId) {
          disabled = true;
        } else {
          conversation = captainChatByKey.get(
            captainCaptainConversationKey(
              teamId,
              sourceCaptainUserId,
              member.userId,
            ),
          );
        }
      } else {
        conversation = playerChatByUserId.get(member.userId);
      }

      const unread = conversation
        ? await unreadCountFor({
            conversationId: conversation.id,
            userId: context.effectiveUserId,
            isPreview: context.isPreview,
          })
        : 0;

      const roleLabel =
        member.role === TeamRole.CAPTAIN
          ? "Captain"
          : member.role === TeamRole.VICE_CAPTAIN
            ? "Vice captain"
            : member.role === TeamRole.MANAGER
              ? "Manager"
              : "Player";

      return {
        ref: isCaptain
          ? captainChatRef(member.userId)
          : privateChatRef(member.userId),
        title: getDisplayName(member.user),
        subtitle: disabled
          ? "No second captain available"
          : `${roleLabel} · private with you`,
        unreadCount: unread,
        latestMessageAt: conversation?.latestMessageAt?.toISOString() ?? null,
        preview: conversation?.lastMessagePreview ?? null,
        kind: "PRIVATE" as const,
        disabled,
        isRegular: member.isRegular,
      };
    }),
  );

  privateItems.sort((a, b) => {
    const aRegular = a.isRegular ? 1 : 0;
    const bRegular = b.isRegular ? 1 : 0;
    if (aRegular !== bRegular) return bRegular - aRegular;
    const aHasUnread = a.unreadCount > 0 ? 1 : 0;
    const bHasUnread = b.unreadCount > 0 ? 1 : 0;
    if (aHasUnread !== bHasUnread) return bHasUnread - aHasUnread;
    const aTime = a.latestMessageAt ? new Date(a.latestMessageAt).getTime() : 0;
    const bTime = b.latestMessageAt ? new Date(b.latestMessageAt).getTime() : 0;
    if (aTime !== bTime) return bTime - aTime;
    return a.title.localeCompare(b.title);
  });

  items.push(...groupItems);
  items.push(...privateItems);
  items.push({
    ref: SIXFL_CHAT_REF,
    title: "Message SIXFL",
    subtitle: "Private — only you and SIXFL",
    unreadCount: sixflUnread,
    latestMessageAt: sixflConversation.latestMessageAt?.toISOString() ?? null,
    preview: sixflConversation.lastMessagePreview,
    kind: "SUPPORT",
  });

  return items;
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ teamid: string }> },
) {
  const { teamid } = await params;
  const context = await getAccessContext(request, teamid);
  if ("error" in context) return jsonError(context.error, context.status);

  const url = new URL(request.url);
  const conversationRef = normaliseConversationRef(
    url.searchParams.get("conversation"),
    context,
  );
  const selected = await getConversationForRef({
    teamId: teamid,
    conversationRef,
    context,
  });

  if ("error" in selected) return jsonError(selected.error, selected.status);

  const groupCreatorUserId = await resolveGroupCreatorUserId(
    teamid,
    context,
  );

  const [team, audienceOptions] = await Promise.all([
    prisma.team.findUnique({
      where: { id: teamid },
      select: { id: true, name: true, logoUrl: true },
    }),
    prisma.teamMember.findMany({
      where: {
        teamId: teamid,
        ...(groupCreatorUserId
          ? { userId: { not: groupCreatorUserId } }
          : {}),
      },
      orderBy: [{ isRegular: "desc" }, { createdAt: "asc" }],
      select: {
        userId: true,
        role: true,
        isRegular: true,
        user: { select: { name: true, email: true } },
      },
    }),
  ]);
  if (!team) return jsonError("Team not found.", 404);

  const messages = await prisma.portalMessage.findMany({
    where: {
      conversationId: selected.conversation.id,
      deletedAt: null,
    },
    orderBy: { createdAt: "desc" },
    take: 100,
    select: {
      id: true,
      body: true,
      senderUserId: true,
      senderRole: true,
      isAdminTest: true,
      createdAt: true,
      senderUser: {
        select: { name: true, email: true },
      },
    },
  });

  if (!context.isPreview) {
    await prisma.portalConversationRead.upsert({
      where: {
        conversationId_userId: {
          conversationId: selected.conversation.id,
          userId: context.effectiveUserId,
        },
      },
      update: { lastReadAt: new Date(), archivedAt: null },
      create: {
        conversationId: selected.conversation.id,
        userId: context.effectiveUserId,
        lastReadAt: new Date(),
      },
    });
  }

  const list = await buildConversationList(teamid, context);

  return NextResponse.json({
    team,
    viewRole: context.viewRole,
    canSend: context.canSend,
    isPreview: context.isPreview,
    isAdminTestMode: context.isAdminTestMode,
    isSimulatedTestMode: context.isSimulatedTestMode,
    simulatedAsName: context.isSimulatedTestMode ? context.effectiveName : null,
    audienceOptions: audienceOptions.map((member) => ({
      userId: member.userId,
      name: getDisplayName(member.user),
      role: member.role,
      isRegular: member.isRegular,
    })),
    selected: {
      ref: conversationRef,
      id: selected.conversation.id,
      type: selected.conversation.type,
      title: selected.title || selected.conversation.title || "Conversation",
      memberUserIds: selected.memberUserIds ?? [],
    },
    conversations: list,
    messages: messages.reverse().map((message) => ({
      id: message.id,
      body: message.body,
      senderUserId: message.senderUserId,
      senderRole: message.senderRole,
      isAdminTest: message.isAdminTest,
      senderName:
        message.senderRole === PortalMessageSenderRole.ADMIN
          ? "SIXFL Admin/Test"
          : message.senderRole === PortalMessageSenderRole.SYSTEM
            ? "SIXFL"
            : message.senderUser
              ? getDisplayName(message.senderUser)
              : message.senderRole === PortalMessageSenderRole.CAPTAIN
                ? "Captain"
                : "Player",
      createdAt: message.createdAt.toISOString(),
      isMine: message.senderUserId === context.effectiveUserId,
    })),
  });
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ teamid: string }> },
) {
  const { teamid } = await params;
  const context = await getAccessContext(request, teamid);
  if ("error" in context) return jsonError(context.error, context.status);

  if (
    !context.canSend ||
    context.isPreview ||
    (!context.isAdminTestMode && !context.membershipId)
  ) {
    return jsonError("Preview mode is read-only.", 403);
  }

  const payload = (await request.json().catch(() => null)) as
    | {
        action?: unknown;
        audience?: unknown;
        memberUserIds?: unknown;
        conversation?: unknown;
        message?: unknown;
        notifyTeam?: unknown;
      }
    | null;

  if (payload?.action === "archive-group") {
    const conversationRef = normaliseConversationRef(
      typeof payload?.conversation === "string" ? payload.conversation : null,
      context,
    );
    if (!conversationRef.startsWith("group:")) {
      return jsonError("Only group chats can be removed from the list.", 400);
    }

    const selected = await getGroupConversationForRef({
      teamId: teamid,
      conversationRef,
      context,
    });
    if ("error" in selected) return jsonError(selected.error, selected.status);

    const now = new Date();
    await prisma.portalConversationRead.upsert({
      where: {
        conversationId_userId: {
          conversationId: selected.conversation.id,
          userId: context.effectiveUserId,
        },
      },
      update: { lastReadAt: now, archivedAt: now },
      create: {
        conversationId: selected.conversation.id,
        userId: context.effectiveUserId,
        lastReadAt: now,
        archivedAt: now,
      },
    });

    return NextResponse.json({ ok: true, archived: true });
  }

  if (payload?.action === "create-group") {
    const audience = String(payload?.audience ?? "").trim().toUpperCase();
    if (audience !== "REGULARS" && audience !== "SELECTED") {
      return jsonError("Choose Regulars or Selected Players.", 400);
    }

    if (audience === "REGULARS" && context.viewRole !== "CAPTAIN") {
      return jsonError("Only captains can start the Regulars Chat.", 403);
    }

    const creatorUserId = await resolveGroupCreatorUserId(teamid, context);
    if (!creatorUserId) {
      return jsonError("A current squad member must be linked before starting a chat.", 409);
    }

    let recipientMembers: Array<{
      userId: string;
      role: TeamRole;
      user: { name: string | null; email: string | null };
    }> = [];

    if (audience === "REGULARS") {
      recipientMembers = await prisma.teamMember.findMany({
        where: {
          teamId: teamid,
          isRegular: true,
          userId: { not: creatorUserId },
        },
        orderBy: { createdAt: "asc" },
        select: {
          userId: true,
          role: true,
          user: { select: { name: true, email: true } },
        },
      });

      if (recipientMembers.length === 0) {
        return jsonError("No players are marked as Regulars yet.", 409);
      }
    } else {
      const requestedIds = Array.isArray(payload?.memberUserIds)
        ? Array.from(
            new Set(
              payload.memberUserIds
                .map((value) => String(value).trim())
                .filter(Boolean),
            ),
          )
        : [];
      const minimumRecipients = context.viewRole === "PLAYER" ? 1 : 2;

      if (requestedIds.length < minimumRecipients) {
        return jsonError(
          minimumRecipients === 1
            ? "Choose at least one current squad member."
            : "Select at least two people for a group chat.",
          400,
        );
      }

      recipientMembers = await prisma.teamMember.findMany({
        where: {
          teamId: teamid,
          userId: { in: requestedIds, not: creatorUserId },
        },
        orderBy: { createdAt: "asc" },
        select: {
          userId: true,
          role: true,
          user: { select: { name: true, email: true } },
        },
      });

      if (recipientMembers.length !== requestedIds.length) {
        return jsonError("One or more selected people are no longer in this squad.", 409);
      }

      // A player choosing a single captain should open the existing captain
      // conversation instead of creating a second 1-to-1 thread.
      if (
        context.viewRole === "PLAYER" &&
        recipientMembers.length === 1 &&
        recipientMembers[0]?.role === TeamRole.CAPTAIN
      ) {
        return NextResponse.json(
          {
            ok: true,
            conversationRef: privateChatRef(context.effectiveUserId),
            title: "Message your captain",
          },
          { status: 201 },
        );
      }
    }

    const recipientUserIds = recipientMembers.map((member) => member.userId);
    const conversationUserIds = Array.from(
      new Set([creatorUserId, ...recipientUserIds]),
    ).sort();

    const conversationType =
      audience === "REGULARS"
        ? PortalConversationType.REGULARS
        : PortalConversationType.SELECTED_GROUP;
    const conversationKey =
      audience === "REGULARS"
        ? `REGULARS:${teamid}:${conversationUserIds.join(":")}`
        : `SELECTED_GROUP:${teamid}:${conversationUserIds.join(":")}`;

    const title =
      audience === "REGULARS"
        ? "Regulars Chat"
        : (() => {
            const names = recipientMembers.map((member) =>
              getDisplayName(member.user),
            );
            if (names.length <= 3) return names.join(", ");
            return `${names.slice(0, 2).join(", ")} + ${names.length - 2}`;
          })();

    const conversation = await prisma.portalConversation.upsert({
      where: { conversationKey },
      update: { title },
      create: {
        conversationKey,
        teamId: teamid,
        type: conversationType,
        title,
        members: {
          create: conversationUserIds.map((userId) => ({ userId })),
        },
      },
      select: { id: true, title: true },
    });

    return NextResponse.json(
      {
        ok: true,
        conversationRef: `group:${conversation.id}`,
        title: conversation.title,
      },
      { status: 201 },
    );
  }

  const message = String(payload?.message ?? "").trim();
  const notifyTeam =
    !context.isAdminTestMode &&
    !context.isSimulatedTestMode &&
    senderRoleFromContext(context) === PortalMessageSenderRole.CAPTAIN &&
    payload?.notifyTeam === true;

  if (message.length < 1) {
    return jsonError("Type a message first.", 400);
  }
  if (message.length > 2000) {
    return jsonError("Please keep messages under 2,000 characters.", 400);
  }

  const conversationRef = normaliseConversationRef(
    typeof payload?.conversation === "string" ? payload.conversation : null,
    context,
  );
  const selected = await getConversationForRef({
    teamId: teamid,
    conversationRef,
    context,
  });

  if ("error" in selected) return jsonError(selected.error, selected.status);

  const now = new Date();
  const senderRole = senderRoleFromContext(context);

  const entry = await prisma.$transaction(async (tx) => {
    const created = await tx.portalMessage.create({
      data: {
        conversationId: selected.conversation.id,
        senderUserId: context.effectiveUserId,
        senderRole,
        body: message,
        isAdminTest:
          context.isAdminTestMode || context.isSimulatedTestMode,
      },
    });

    await tx.portalConversation.update({
      where: { id: selected.conversation.id },
      data: {
        latestMessageAt: now,
        lastMessagePreview: previewText(message),
      },
    });

    await tx.portalConversationRead.upsert({
      where: {
        conversationId_userId: {
          conversationId: selected.conversation.id,
          userId: context.effectiveUserId,
        },
      },
      update: { lastReadAt: now },
      create: {
        conversationId: selected.conversation.id,
        userId: context.effectiveUserId,
        lastReadAt: now,
      },
    });

    return created;
  });

  try {
    const team = await prisma.team.findUnique({
      where: { id: teamid },
      select: {
        name: true,
        members: {
          select: {
            userId: true,
            role: true,
          },
        },
      },
    });

    if (team) {
      const targets: Array<{
        userId: string;
        title: string;
        body: string;
        url: string;
        tag: string;
        sourceType: string;
        sourceId: string;
      }> = [];
      const bodyPreview = `${context.effectiveName}: ${pushPreview(message)}`;

      if (selected.conversation.type === PortalConversationType.CAPTAIN_CAPTAIN) {
        if (
          selected.targetUserId &&
          selected.targetUserId !== context.effectiveUserId
        ) {
          targets.push({
            userId: selected.targetUserId,
            title: `${team.name} · Private captain message`,
            body: bodyPreview,
            url: `/captain/team/${teamid}/chat?conversation=${encodeURIComponent(
              captainChatRef(context.effectiveUserId),
            )}`,
            tag: `sixfl-captain-${selected.conversation.id}`,
            sourceType: "PORTAL_CAPTAIN_PRIVATE_MESSAGE",
            sourceId: entry.id,
          });
        }
      } else if (selected.conversation.type === PortalConversationType.CAPTAIN_PLAYER) {
        if (senderRole === PortalMessageSenderRole.CAPTAIN) {
          const playerUserId = selected.conversation.participantUserId;

          if (playerUserId && playerUserId !== context.effectiveUserId) {
            targets.push({
              userId: playerUserId,
              title: `${team.name} · Private message`,
              body: bodyPreview,
              url: `/player/team/${teamid}/chat?conversation=captain`,
              tag: `sixfl-private-${selected.conversation.id}`,
              sourceType: "PORTAL_PRIVATE_MESSAGE",
              sourceId: entry.id,
            });
          }
        } else {
          for (const member of team.members) {
            if (
              member.role === TeamRole.CAPTAIN &&
              member.userId !== context.effectiveUserId
            ) {
              targets.push({
                userId: member.userId,
                title: `${team.name} · Private player message`,
                body: bodyPreview,
                url: `/captain/team/${teamid}/chat?conversation=${encodeURIComponent(
                  privateChatRef(context.effectiveUserId),
                )}`,
                tag: `sixfl-private-${selected.conversation.id}`,
                sourceType: "PORTAL_PRIVATE_MESSAGE",
                sourceId: entry.id,
              });
            }
          }
        }
      } else if (
        selected.conversation.type === PortalConversationType.TEAM &&
        senderRole === PortalMessageSenderRole.CAPTAIN &&
        notifyTeam
      ) {
        for (const member of team.members) {
          if (member.userId === context.effectiveUserId) continue;

          const isCaptain = member.role === TeamRole.CAPTAIN;
          targets.push({
            userId: member.userId,
            title: `${team.name} · Important team message`,
            body: bodyPreview,
            url: isCaptain
              ? `/captain/team/${teamid}/chat?conversation=team`
              : `/player/team/${teamid}/chat?conversation=team`,
            tag: `sixfl-team-${teamid}`,
            sourceType: "PORTAL_TEAM_NOTIFICATION",
            sourceId: entry.id,
          });
        }
      } else if (
        selected.conversation.type === PortalConversationType.TEAM &&
        senderRole === PortalMessageSenderRole.PLAYER &&
        /(^|\s)@captain\b/i.test(message)
      ) {
        for (const member of team.members) {
          if (
            member.role === TeamRole.CAPTAIN &&
            member.userId !== context.effectiveUserId
          ) {
            targets.push({
              userId: member.userId,
              title: `${team.name} · @Captain`,
              body: bodyPreview,
              url: `/captain/team/${teamid}/chat?conversation=team`,
              tag: `sixfl-team-${teamid}`,
              sourceType: "PORTAL_CAPTAIN_MENTION",
              sourceId: entry.id,
            });
          }
        }
      }

      if (
        !context.isAdminTestMode &&
        !context.isSimulatedTestMode &&
        targets.length > 0
      ) {
        await queuePushNotifications(targets);
      }
    }
  } catch (error) {
    console.warn("Portal message saved but push notification failed", {
      teamId: teamid,
      messageId: entry.id,
      message: error instanceof Error ? error.message : String(error),
    });
  }

  return NextResponse.json({ ok: true, messageId: entry.id }, { status: 201 });
}


export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ teamid: string }> },
) {
  const { teamid } = await params;
  const context = await getAccessContext(request, teamid);
  if ("error" in context) return jsonError(context.error, context.status);

  if (!context.isAdminTestMode || context.isPreview || !context.canSend) {
    return jsonError("Admin Test Mode is required to clear chat history.", 403);
  }

  const payload = (await request.json().catch(() => null)) as
    | { confirmTeamName?: unknown }
    | null;
  const confirmTeamName = String(payload?.confirmTeamName ?? "").trim();

  const team = await prisma.team.findUnique({
    where: { id: teamid },
    select: { id: true, name: true },
  });

  if (!team) return jsonError("Team not found.", 404);

  if (confirmTeamName !== team.name) {
    return jsonError("Type the exact team name to clear test messages.", 400);
  }

  const messageIds = (
    await prisma.portalMessage.findMany({
      where: {
        conversation: { teamId: teamid },
      },
      select: { id: true },
    })
  ).map((message) => message.id);

  const result = await prisma.$transaction(async (tx) => {
    const deletedPushNotifications =
      messageIds.length > 0
        ? await tx.pushNotification.deleteMany({
            where: { sourceId: { in: messageIds } },
          })
        : { count: 0 };

    const deletedConversations = await tx.portalConversation.deleteMany({
      where: { teamId: teamid },
    });

    return {
      deletedMessages: messageIds.length,
      deletedConversations: deletedConversations.count,
      deletedPushNotifications: deletedPushNotifications.count,
    };
  });

  return NextResponse.json({ ok: true, ...result });
}
