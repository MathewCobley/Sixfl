// ========================================
// File: src/app/api/captain/team/[teamid]/availability-history-nudges/route.ts
// ========================================

import { NextResponse } from "next/server";
import {
  NotificationAudience,
  NotificationChannel,
  NotificationRecipientSourceType,
} from "@prisma/client";

import { logNotificationDispatchToThread } from "@/lib/communications/log-dispatch";
import { processNotificationQueue } from "@/lib/notifications/processor";
import { upsertNotificationRecipient } from "@/lib/notifications/recipients";
import { queueDirectNotification } from "@/lib/notifications/service";
import { prisma } from "@/lib/prisma";
import { requireCaptain } from "@/lib/requireCaptain";

export const dynamic = "force-dynamic";

const AVAILABILITY_HISTORY_NUDGE_SOURCE_TYPE =
  "CAPTAIN_AVAILABILITY_HISTORY_NUDGE";

function getNudgeSourceId(teamId: string, teamMemberId: string) {
  return `${teamId}:${teamMemberId}`;
}

function getSiteUrl() {
  return (
    process.env.NEXT_PUBLIC_SITE_URL?.trim() ||
    process.env.SITE_URL?.trim() ||
    process.env.NEXT_PUBLIC_APP_URL?.trim() ||
    process.env.APP_URL?.trim() ||
    process.env.NEXTAUTH_URL?.trim() ||
    "https://www.sixfl.co.uk"
  ).replace(/\/+$/, "");
}

function getFirstName(value: string) {
  return value.trim().split(/\s+/)[0] || "there";
}

function getPlayerDisplayName(input: {
  name: string | null;
  email: string | null;
}) {
  return input.name?.trim() || input.email?.trim() || "Player";
}

function getLeagueLabel(input: {
  name: string;
  season: string | null;
} | null) {
  if (!input) return "SIXFL";
  return input.season ? `${input.name} — ${input.season}` : input.name;
}

async function processNudgeNow() {
  try {
    await processNotificationQueue(10);
  } catch (error) {
    console.error("Failed to process availability history nudge immediately", error);
  }
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ teamid: string }> },
) {
  const { teamid } = await params;
  await requireCaptain(teamid);

  const team = await prisma.team.findUnique({
    where: { id: teamid },
    select: {
      id: true,
      members: {
        select: {
          id: true,
          user: {
            select: {
              email: true,
            },
          },
        },
      },
    },
  });

  if (!team) {
    return NextResponse.json({ error: "Team not found." }, { status: 404 });
  }

  const sourceIds = team.members.map((member) =>
    getNudgeSourceId(team.id, member.id),
  );

  const dispatches = sourceIds.length
    ? await prisma.notificationDispatch.findMany({
        where: {
          sourceType: AVAILABILITY_HISTORY_NUDGE_SOURCE_TYPE,
          sourceId: { in: sourceIds },
        },
        orderBy: [{ createdAt: "desc" }],
        select: {
          sourceId: true,
          status: true,
          createdAt: true,
          processedAt: true,
          sentAt: true,
        },
      })
    : [];

  const latestBySourceId = new Map<
    string,
    {
      status: string;
      lastNudgeAt: Date;
      nudgeCount: number;
    }
  >();

  for (const dispatch of dispatches) {
    if (!dispatch.sourceId) continue;

    const existing = latestBySourceId.get(dispatch.sourceId);
    if (existing) {
      existing.nudgeCount += 1;
      continue;
    }

    latestBySourceId.set(dispatch.sourceId, {
      status: dispatch.status,
      lastNudgeAt:
        dispatch.sentAt ?? dispatch.processedAt ?? dispatch.createdAt,
      nudgeCount: 1,
    });
  }

  return NextResponse.json({
    players: team.members.map((member) => {
      const latest = latestBySourceId.get(
        getNudgeSourceId(team.id, member.id),
      );

      return {
        teamMemberId: member.id,
        email: member.user.email?.trim().toLowerCase() ?? null,
        lastNudgeAt: latest?.lastNudgeAt.toISOString() ?? null,
        nudgeStatus: latest?.status ?? null,
        nudgeCount: latest?.nudgeCount ?? 0,
      };
    }),
  });
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ teamid: string }> },
) {
  const { teamid } = await params;
  const access = await requireCaptain(teamid);
  const body = (await request.json().catch(() => null)) as {
    teamMemberId?: string;
  } | null;
  const teamMemberId = body?.teamMemberId?.trim() ?? "";

  if (!teamMemberId) {
    return NextResponse.json(
      { error: "Player is required." },
      { status: 400 },
    );
  }

  const [team, member] = await Promise.all([
    prisma.team.findUnique({
      where: { id: teamid },
      select: {
        id: true,
        name: true,
        logoUrl: true,
        league: {
          select: {
            name: true,
            season: true,
          },
        },
      },
    }),
    prisma.teamMember.findFirst({
      where: {
        id: teamMemberId,
        teamId: teamid,
      },
      select: {
        id: true,
        user: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
      },
    }),
  ]);

  if (!team || !member) {
    return NextResponse.json(
      { error: "Player or team not found." },
      { status: 404 },
    );
  }

  const email = member.user.email?.trim().toLowerCase() ?? "";
  if (!email) {
    return NextResponse.json(
      { error: "This player does not have an email address saved." },
      { status: 400 },
    );
  }

  const displayName = getPlayerDisplayName(member.user);
  const firstName = getFirstName(displayName);
  const availabilityUrl = `${getSiteUrl()}/player/team/${team.id}/availability`;
  const leagueName = getLeagueLabel(team.league);

  const recipient = await upsertNotificationRecipient({
    sourceType: NotificationRecipientSourceType.GENERAL,
    sourceId: `team-member:${member.id}`,
    audience: NotificationAudience.PLAYER,
    displayName,
    email,
    phone: null,
    marketingEmailOptIn: true,
    marketingSmsOptIn: true,
    transactionalEmailOptIn: true,
    transactionalSmsOptIn: true,
    metadata: {
      teamId: team.id,
      teamMemberId: member.id,
      userId: member.user.id,
      entityType: "TEAM_MEMBER",
    },
  });

  await prisma.notificationPreference.upsert({
    where: { recipientId: recipient.id },
    update: { emailEnabled: true },
    create: {
      recipientId: recipient.id,
      emailEnabled: true,
      smsEnabled: false,
      urgentSmsEnabled: false,
    },
  });

  const dispatch = await queueDirectNotification({
    recipientId: recipient.id,
    channel: NotificationChannel.EMAIL,
    audience: NotificationAudience.PLAYER,
    subject: `Please update your availability for ${team.name}`,
    body: [
      `Hi ${firstName},`,
      "",
      `We have noticed that you have not been confirming your availability for ${team.name} fixtures.`,
      "",
      "Please select Available, Maybe or Unavailable whenever an availability request is sent. If you do not update your availability, you will not be selected for games.",
      "",
      `Update your availability here: ${availabilityUrl}`,
      "",
      "Thanks,",
      "SIXFL",
    ].join("\n"),
    isTransactional: true,
    sourceType: AVAILABILITY_HISTORY_NUDGE_SOURCE_TYPE,
    sourceId: getNudgeSourceId(team.id, member.id),
    emailBranding: {
      teamName: team.name,
      teamLogoUrl: team.logoUrl,
      leagueName,
    },
    emailCta: {
      label: "Update availability",
      url: availabilityUrl,
    },
    metadata: {
      origin: "captain_availability_history_nudge",
      originLabel: "Availability response nudge sent from history page",
      teamId: team.id,
      teamMemberId: member.id,
      userId: member.user.id,
      availabilityUrl,
      leagueName,
    },
    createdByUserId: access.user?.id ?? null,
  });

  await logNotificationDispatchToThread({ dispatch, recipient });
  await processNudgeNow();

  const refreshedDispatch = await prisma.notificationDispatch.findUnique({
    where: { id: dispatch.id },
    select: {
      status: true,
      createdAt: true,
      processedAt: true,
      sentAt: true,
    },
  });

  const nudgeCount = await prisma.notificationDispatch.count({
    where: {
      sourceType: AVAILABILITY_HISTORY_NUDGE_SOURCE_TYPE,
      sourceId: getNudgeSourceId(team.id, member.id),
    },
  });

  return NextResponse.json({
    ok: true,
    teamMemberId: member.id,
    lastNudgeAt: (
      refreshedDispatch?.sentAt ??
      refreshedDispatch?.processedAt ??
      refreshedDispatch?.createdAt ??
      dispatch.createdAt
    ).toISOString(),
    nudgeStatus: refreshedDispatch?.status ?? dispatch.status,
    nudgeCount,
  });
}
