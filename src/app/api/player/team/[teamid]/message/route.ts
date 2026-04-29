// ========================================
// File: src/app/api/player/team/[teamid]/message/route.ts
// ========================================

import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";

import { authOptions } from "@/auth";
import { normalizePhoneNumber } from "@/lib/messaging/phone";
import { prisma } from "@/lib/prisma";
import { getTeamMemberProfilesByTeamMemberIds } from "@/lib/teamMemberProfiles";

function buildLastMessagePreview(body: string) {
  const trimmed = body.trim().replace(/\s+/g, " ");
  if (!trimmed) return "";
  return trimmed.length > 140 ? `${trimmed.slice(0, 137)}...` : trimmed;
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Could not send message.";
}

async function getLinkedPlayerContext(teamid: string) {
  const session = await getServerSession(authOptions);

  if (!session?.user?.email) {
    return { error: "Please sign in again." as const, status: 401 as const };
  }

  const email = session.user.email.trim().toLowerCase();
  const user = await prisma.user.findUnique({
    where: { email },
    select: {
      id: true,
      name: true,
      email: true,
      teamMembers: {
        where: { teamId: teamid },
        select: {
          id: true,
          teamId: true,
          role: true,
          team: { select: { id: true, name: true, leagueId: true } },
        },
        take: 1,
      },
    },
  });

  const membership = user?.teamMembers[0] ?? null;

  if (!user || !membership) {
    return { error: "You are not linked to this team." as const, status: 403 as const };
  }

  const profiles = await getTeamMemberProfilesByTeamMemberIds([membership.id]);
  const profile = profiles.get(membership.id) ?? null;
  const phone = normalizePhoneNumber(profile?.phone ?? null);
  const displayName = user.name?.trim() || user.email?.trim() || "Player";

  return {
    user,
    membership,
    phone,
    displayName,
  };
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ teamid: string }> },
) {
  const { teamid } = await params;
  const context = await getLinkedPlayerContext(teamid);

  if ("error" in context) {
    return NextResponse.json({ error: context.error }, { status: context.status });
  }

  const thread = await prisma.messageThread.findFirst({
    where: {
      teamId: teamid,
      sourceType: "TEAM_MEMBER",
      sourceId: context.membership.id,
      status: "OPEN",
    },
    orderBy: [{ latestMessageAt: "desc" }, { updatedAt: "desc" }],
    select: {
      id: true,
      latestMessageAt: true,
      messages: {
        orderBy: [{ createdAt: "asc" }],
        take: 50,
        select: {
          id: true,
          direction: true,
          participantRole: true,
          channel: true,
          body: true,
          providerStatus: true,
          createdAt: true,
          sentAt: true,
          receivedAt: true,
        },
      },
    },
  });

  return NextResponse.json({
    threadId: thread?.id ?? null,
    latestMessageAt: thread?.latestMessageAt?.toISOString() ?? null,
    messages:
      thread?.messages.map((message) => ({
        id: message.id,
        direction: message.direction,
        participantRole: message.participantRole,
        channel: message.channel,
        body: message.body,
        providerStatus: message.providerStatus,
        createdAt: message.createdAt.toISOString(),
        sentAt: message.sentAt?.toISOString() ?? null,
        receivedAt: message.receivedAt?.toISOString() ?? null,
      })) ?? [],
  });
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ teamid: string }> },
) {
  const { teamid } = await params;
  const context = await getLinkedPlayerContext(teamid);

  if ("error" in context) {
    return NextResponse.json({ error: context.error }, { status: context.status });
  }

  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  const message = String((body as { message?: unknown }).message ?? "").trim();

  if (message.length < 3) {
    return NextResponse.json({ error: "Please type a short message first." }, { status: 400 });
  }

  if (message.length > 1200) {
    return NextResponse.json({ error: "Please keep the message under 1,200 characters." }, { status: 400 });
  }

  try {
    const now = new Date();

    const existingThread = await prisma.messageThread.findFirst({
      where: {
        teamId: teamid,
        sourceType: "TEAM_MEMBER",
        sourceId: context.membership.id,
        status: "OPEN",
      },
      orderBy: [{ latestMessageAt: "desc" }, { updatedAt: "desc" }],
      select: { id: true },
    });

    const thread = existingThread
      ? await prisma.messageThread.update({
          where: { id: existingThread.id },
          data: {
            channel: context.phone ? "SMS" : "EMAIL",
            teamId: teamid,
            leagueId: context.membership.team.leagueId,
            sourceType: "TEAM_MEMBER",
            sourceId: context.membership.id,
            contactName: context.displayName,
            contactPhone: context.phone,
            phoneNormalized: context.phone,
            contactEmail: context.user.email,
            emailNormalized: context.user.email?.trim().toLowerCase() ?? null,
            latestMessageAt: now,
            latestInboundAt: now,
            lastMessagePreview: buildLastMessagePreview(message),
            unreadForAdminCount: { increment: 1 },
          },
        })
      : await prisma.messageThread.create({
          data: {
            channel: context.phone ? "SMS" : "EMAIL",
            status: "OPEN",
            teamId: teamid,
            leagueId: context.membership.team.leagueId,
            sourceType: "TEAM_MEMBER",
            sourceId: context.membership.id,
            contactName: context.displayName,
            contactPhone: context.phone,
            phoneNormalized: context.phone,
            contactEmail: context.user.email,
            emailNormalized: context.user.email?.trim().toLowerCase() ?? null,
            latestMessageAt: now,
            latestInboundAt: now,
            lastMessagePreview: buildLastMessagePreview(message),
            unreadForAdminCount: 1,
          },
        });

    const entry = await prisma.messageEntry.create({
      data: {
        threadId: thread.id,
        channel: context.phone ? "SMS" : "EMAIL",
        direction: "INBOUND",
        participantRole: "CONTACT",
        body: message,
        subject: `Player message from ${context.displayName}`,
        textBody: message,
        fromNumber: context.phone,
        fromEmail: context.user.email,
        provider: "sixfl-player-dashboard",
        providerStatus: "received",
        receivedAt: now,
      },
    });

    await prisma.$transaction([
      prisma.messageThread.update({
        where: { id: thread.id },
        data: { lastInboundMessageId: entry.id },
      }),
      prisma.inboxAlert.create({
        data: {
          threadId: thread.id,
          messageId: entry.id,
          type: "PLAYER_DASHBOARD_MESSAGE",
          status: "PENDING",
        },
      }),
    ]);

    return NextResponse.json({ ok: true, threadId: thread.id });
  } catch (error) {
    return NextResponse.json({ error: getErrorMessage(error) }, { status: 500 });
  }
}
