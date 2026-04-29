// ========================================
// File: src/app/player/team/[teamid]/message/actions.ts
// ========================================

"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";

import { authOptions } from "@/auth";
import { normalizePhoneNumber } from "@/lib/messaging/phone";
import { prisma } from "@/lib/prisma";
import { getTeamMemberProfilesByTeamMemberIds } from "@/lib/teamMemberProfiles";

function getString(formData: FormData, key: string) {
  return String(formData.get(key) ?? "").trim();
}

function buildPlayerDashboardPath(teamId: string, input?: { saved?: string; error?: string }) {
  const params = new URLSearchParams();
  if (input?.saved) params.set("saved", input.saved);
  if (input?.error) params.set("error", input.error);
  const query = params.toString();
  return `/player/team/${teamId}${query ? `?${query}` : ""}#message-sixfl`;
}

function buildPreviewText(body: string) {
  const trimmed = body.trim().replace(/\s+/g, " ");
  return trimmed.length > 140 ? `${trimmed.slice(0, 137)}...` : trimmed;
}

export async function sendPlayerDashboardMessageAction(formData: FormData) {
  const session = await getServerSession(authOptions);

  const teamId = getString(formData, "teamId");
  const body = getString(formData, "body");

  if (!session?.user?.email) {
    redirect(`/login?callbackUrl=${encodeURIComponent(`/player/team/${teamId}`)}`);
  }

  if (!teamId) {
    redirect("/player");
  }

  if (body.length < 3) {
    redirect(buildPlayerDashboardPath(teamId, { error: "message-too-short" }));
  }

  const email = session.user.email.trim().toLowerCase();

  const user = await prisma.user.findUnique({
    where: { email },
    select: {
      id: true,
      name: true,
      email: true,
      teamMembers: {
        where: { teamId },
        select: {
          id: true,
          teamId: true,
          role: true,
          team: {
            select: {
              id: true,
              name: true,
              leagueId: true,
            },
          },
        },
        take: 1,
      },
    },
  });

  const membership = user?.teamMembers[0] ?? null;

  if (!user || !membership) {
    redirect(buildPlayerDashboardPath(teamId, { error: "not-linked" }));
  }

  const profiles = await getTeamMemberProfilesByTeamMemberIds([membership.id]);
  const profile = profiles.get(membership.id) ?? null;
  const phone = normalizePhoneNumber(profile?.phone ?? null);
  const displayName = user.name?.trim() || user.email?.trim() || "Player";
  const now = new Date();

  const existingThread = await prisma.messageThread.findFirst({
    where: {
      teamId,
      sourceType: "TEAM_MEMBER",
      sourceId: membership.id,
      status: "OPEN",
    },
    orderBy: [{ latestMessageAt: "desc" }, { updatedAt: "desc" }],
    select: {
      id: true,
    },
  });

  const thread = existingThread
    ? await prisma.messageThread.update({
        where: { id: existingThread.id },
        data: {
          channel: phone ? "SMS" : "EMAIL",
          teamId,
          leagueId: membership.team.leagueId,
          sourceType: "TEAM_MEMBER",
          sourceId: membership.id,
          contactName: displayName,
          contactPhone: phone,
          phoneNormalized: phone,
          contactEmail: user.email,
          emailNormalized: user.email?.trim().toLowerCase() ?? null,
          latestMessageAt: now,
          latestInboundAt: now,
          lastMessagePreview: buildPreviewText(body),
          unreadForAdminCount: {
            increment: 1,
          },
        },
      })
    : await prisma.messageThread.create({
        data: {
          channel: phone ? "SMS" : "EMAIL",
          status: "OPEN",
          teamId,
          leagueId: membership.team.leagueId,
          sourceType: "TEAM_MEMBER",
          sourceId: membership.id,
          contactName: displayName,
          contactPhone: phone,
          phoneNormalized: phone,
          contactEmail: user.email,
          emailNormalized: user.email?.trim().toLowerCase() ?? null,
          latestMessageAt: now,
          latestInboundAt: now,
          lastMessagePreview: buildPreviewText(body),
          unreadForAdminCount: 1,
        },
      });

  const entry = await prisma.messageEntry.create({
    data: {
      threadId: thread.id,
      channel: phone ? "SMS" : "EMAIL",
      direction: "INBOUND",
      participantRole: "CONTACT",
      body,
      subject: `Player message from ${displayName}`,
      textBody: body,
      fromNumber: phone,
      fromEmail: user.email,
      provider: "sixfl-player-dashboard",
      providerStatus: "received",
      receivedAt: now,
    },
  });

  await prisma.messageThread.update({
    where: { id: thread.id },
    data: {
      lastInboundMessageId: entry.id,
    },
  });

  await prisma.inboxAlert.create({
    data: {
      threadId: thread.id,
      messageId: entry.id,
      type: "PLAYER_DASHBOARD_MESSAGE",
      status: "PENDING",
    },
  });

  revalidatePath(`/player/team/${teamId}`);
  revalidatePath("/admin/messaging");
  revalidatePath("/admin/messages");
  revalidatePath("/admin");
  revalidatePath(`/admin/teams/${teamId}`);

  redirect(buildPlayerDashboardPath(teamId, { saved: "message-sent" }));
}
