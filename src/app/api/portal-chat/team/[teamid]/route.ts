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
  ensureCaptainPlayerConversation,
  ensureTeamPortalConversation,
  isCaptainRole,
  previewText,
  privateChatRef,
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
};

type PortalConversationResult = {
  conversation: Awaited<ReturnType<typeof ensureTeamPortalConversation>>;
};

type AccessContext = {
  actualUserId: string;
  effectiveUserId: string;
  effectiveName: string;
  membershipId: string | null;
  membershipRole: TeamRole | null;
  viewRole: ViewRole;
  isPreview: boolean;
  canSend: boolean;
};

function senderRoleFromContext(context: AccessContext) {
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

  // Team chat stays dark-launched until the player/captain app is ready.
  // Admins can still open the feature in read-only preview mode for testing.
  if (actualUser.role !== UserRole.ADMIN) {
    return { error: "Team chat is not available yet.", status: 404 } as const;
  }

  const url = new URL(request.url);
  const previewMembershipId = url.searchParams.get("previewMembershipId")?.trim() || null;

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
        isPreview: true,
        canSend: false,
      } satisfies AccessContext;
    }

    return {
      actualUserId: actualUser.id,
      effectiveUserId: actualUser.id,
      effectiveName: actualUser.name?.trim() || "SIXFL admin",
      membershipId: null,
      membershipRole: null,
      viewRole: "CAPTAIN",
      isPreview: true,
      canSend: false,
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
    canSend: true,
  } satisfies AccessContext;
}

async function getPrivateTarget(input: {
  teamId: string;
  conversationRef: string;
  context: AccessContext;
}): Promise<PrivateTarget | ApiError> {
  const { teamId, context } = input;
  const rawTargetUserId = input.conversationRef.startsWith("player:")
    ? input.conversationRef.slice("player:".length).trim()
    : "";

  if (context.viewRole === "PLAYER") {
    if (rawTargetUserId && rawTargetUserId !== context.effectiveUserId) {
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
    };
  }

  if (!rawTargetUserId) {
    return { error: "Choose a player first.", status: 400 } as const;
  }

  const targetMembership = await prisma.teamMember.findFirst({
    where: {
      teamId,
      userId: rawTargetUserId,
      role: { not: TeamRole.CAPTAIN },
    },
    select: {
      userId: true,
      user: { select: { name: true, email: true } },
    },
  });

  if (!targetMembership) {
    return { error: "That player is not in this squad.", status: 404 } as const;
  }

  const targetName = getDisplayName(targetMembership.user);
  return {
    userId: targetMembership.userId,
    title: `${targetName} · Captain chat`,
  };
}

async function getConversationForRef(input: {
  teamId: string;
  conversationRef: string;
  context: AccessContext;
}): Promise<PortalConversationResult | ApiError> {
  if (input.conversationRef === "team") {
    return { conversation: await ensureTeamPortalConversation(input.teamId) };
  }

  const target = await getPrivateTarget(input);
  if ("error" in target) return target;

  return {
    conversation: await ensureCaptainPlayerConversation(
      input.teamId,
      target.userId,
      target.title,
    ),
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
  const teamConversation = await ensureTeamPortalConversation(teamId);
  const teamUnread = await unreadCountFor({
    conversationId: teamConversation.id,
    userId: context.effectiveUserId,
    isPreview: context.isPreview,
  });

  const items: Array<{
    ref: string;
    title: string;
    subtitle: string;
    unreadCount: number;
    latestMessageAt: string | null;
    preview: string | null;
    kind: "TEAM" | "PRIVATE";
    disabled?: boolean;
  }> = [
    {
      ref: "team",
      title: "Team chat",
      subtitle: "Everyone in the registered squad",
      unreadCount: teamUnread,
      latestMessageAt: teamConversation.latestMessageAt?.toISOString() ?? null,
      preview: teamConversation.lastMessagePreview,
      kind: "TEAM",
    },
  ];

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
      title: "Message captain",
      subtitle:
        captainCount > 0
          ? "Private · only you and the team captain(s)"
          : "No captain is currently linked",
      unreadCount: unread,
      latestMessageAt: existing?.latestMessageAt?.toISOString() ?? null,
      preview: existing?.lastMessagePreview ?? null,
      kind: "PRIVATE",
      disabled: captainCount === 0,
    });

    return items;
  }

  const members = await prisma.teamMember.findMany({
    where: {
      teamId,
      role: { not: TeamRole.CAPTAIN },
    },
    select: {
      userId: true,
      role: true,
      user: { select: { name: true, email: true } },
    },
  });

  const existing = await prisma.portalConversation.findMany({
    where: {
      teamId,
      type: PortalConversationType.CAPTAIN_PLAYER,
      participantUserId: { in: members.map((member) => member.userId) },
    },
    select: {
      id: true,
      participantUserId: true,
      latestMessageAt: true,
      lastMessagePreview: true,
    },
  });
  const existingByUserId = new Map(
    existing
      .filter((conversation) => conversation.participantUserId)
      .map((conversation) => [conversation.participantUserId as string, conversation]),
  );

  const playerItems = await Promise.all(
    members.map(async (member) => {
      const conversation = existingByUserId.get(member.userId);
      const unread = conversation
        ? await unreadCountFor({
            conversationId: conversation.id,
            userId: context.effectiveUserId,
            isPreview: context.isPreview,
          })
        : 0;

      return {
        ref: privateChatRef(member.userId),
        title: getDisplayName(member.user),
        subtitle:
          member.role === TeamRole.VICE_CAPTAIN
            ? "Vice captain · private"
            : member.role === TeamRole.MANAGER
              ? "Manager · private"
              : "Player · private",
        unreadCount: unread,
        latestMessageAt: conversation?.latestMessageAt?.toISOString() ?? null,
        preview: conversation?.lastMessagePreview ?? null,
        kind: "PRIVATE" as const,
      };
    }),
  );

  playerItems.sort((a, b) => {
    const aHasUnread = a.unreadCount > 0 ? 1 : 0;
    const bHasUnread = b.unreadCount > 0 ? 1 : 0;
    if (aHasUnread !== bHasUnread) return bHasUnread - aHasUnread;
    const aTime = a.latestMessageAt ? new Date(a.latestMessageAt).getTime() : 0;
    const bTime = b.latestMessageAt ? new Date(b.latestMessageAt).getTime() : 0;
    if (aTime !== bTime) return bTime - aTime;
    return a.title.localeCompare(b.title);
  });

  items.push(...playerItems);
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

  const team = await prisma.team.findUnique({
    where: { id: teamid },
    select: { id: true, name: true, logoUrl: true },
  });
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
      update: { lastReadAt: new Date() },
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
    selected: {
      ref: conversationRef,
      id: selected.conversation.id,
      type: selected.conversation.type,
      title:
        conversationRef === "team"
          ? "Team chat"
          : selected.conversation.title || "Captain chat",
    },
    conversations: list,
    messages: messages.reverse().map((message) => ({
      id: message.id,
      body: message.body,
      senderUserId: message.senderUserId,
      senderRole: message.senderRole,
      senderName:
        message.senderRole === PortalMessageSenderRole.SYSTEM
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

  if (!context.canSend || context.isPreview || !context.membershipId) {
    return jsonError("Preview mode is read-only.", 403);
  }

  const payload = (await request.json().catch(() => null)) as
    | { conversation?: unknown; message?: unknown; notifyTeam?: unknown }
    | null;
  const message = String(payload?.message ?? "").trim();
  const notifyTeam =
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

      if (selected.conversation.type === PortalConversationType.CAPTAIN_PLAYER) {
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

      if (targets.length > 0) {
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
