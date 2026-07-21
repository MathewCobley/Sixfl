// ========================================
// File: src/app/player/team/[teamid]/availability/actions.ts
// ========================================

"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import {
  NotificationAudience,
  NotificationChannel,
  UserRole,
} from "@prisma/client";

import { authOptions } from "@/auth";
import { logNotificationDispatchToThread } from "@/lib/communications/log-dispatch";
import { formatDateTimeInLondon } from "@/lib/datetime/london";
import {
  closeFixturePlayerRequest,
  upsertOpenFixturePlayerRequest,
  type FixturePlayerRequestType,
} from "@/lib/fixturePlayerRequests";
import { processNotificationQueue } from "@/lib/notifications/processor";
import { queueDirectNotification } from "@/lib/notifications/service";
import { upsertTeamNotificationRecipient } from "@/lib/notifications/team-contacts";
import { prisma } from "@/lib/prisma";

const VALID_RESPONSES = new Set(["AVAILABLE", "MAYBE", "UNAVAILABLE"]);

type PlayerActionContext = {
  user: {
    id: string;
    role: UserRole;
  };
  teamMember: {
    id: string;
    user: {
      name: string | null;
      email: string | null;
    };
  };
};

function getString(formData: FormData, key: string) {
  return String(formData.get(key) ?? "").trim();
}

function getAvailabilityPath(input: {
  teamId: string;
  fixtureId?: string;
  saved?: string;
  previewMembershipId?: string | null;
}) {
  const params = new URLSearchParams();
  if (input.fixtureId) params.set("fixtureId", input.fixtureId);
  if (input.saved) params.set("saved", input.saved);
  if (input.previewMembershipId) {
    params.set("previewMembershipId", input.previewMembershipId);
  }

  const query = params.toString();
  return `/player/team/${input.teamId}/availability${query ? `?${query}` : ""}`;
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

function formatFixtureDate(value: Date) {
  return formatDateTimeInLondon(value, {
    weekday: "short",
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

async function getPlayerActionContext(input: {
  teamId: string;
  requestedPreviewMembershipId: string | null;
  redirectPath: (saved?: string) => string;
}): Promise<PlayerActionContext> {
  const session = await getServerSession(authOptions);

  if (!session?.user?.email) {
    redirect("/login");
  }

  const user = await prisma.user.findUnique({
    where: { email: session.user.email.trim().toLowerCase() },
    select: {
      id: true,
      role: true,
      teamMembers: {
        where: { teamId: input.teamId },
        select: {
          id: true,
          user: { select: { name: true, email: true } },
        },
        take: 1,
      },
    },
  });

  const previewMembership =
    input.requestedPreviewMembershipId && user?.role === UserRole.ADMIN
      ? await prisma.teamMember.findFirst({
          where: {
            id: input.requestedPreviewMembershipId,
            teamId: input.teamId,
          },
          select: {
            id: true,
            user: { select: { name: true, email: true } },
          },
        })
      : null;
  const teamMember = previewMembership ?? user?.teamMembers[0] ?? null;

  if (!user || !teamMember) {
    redirect(input.redirectPath("not-linked"));
  }

  return { user, teamMember };
}

async function getFixtureSelectionContext(input: {
  fixtureId: string;
  teamId: string;
}) {
  return prisma.fixture.findFirst({
    where: {
      id: input.fixtureId,
      publishedAt: { not: null },
      OR: [{ homeTeamId: input.teamId }, { awayTeamId: input.teamId }],
    },
    select: {
      id: true,
      kickoffAt: true,
      homeTeamId: true,
      homeTeam: {
        select: {
          name: true,
          matchdayTargetSize: true,
        },
      },
      awayTeam: {
        select: {
          name: true,
          matchdayTargetSize: true,
        },
      },
      playerMatchFees: {
        where: {
          teamId: input.teamId,
          status: { not: "CANCELLED" },
        },
        select: {
          teamMemberId: true,
          status: true,
        },
      },
    },
  });
}

async function notifyCaptainOfPlayerRequest(input: {
  teamId: string;
  fixtureId: string;
  teamMemberId: string;
  type: FixturePlayerRequestType;
  playerName: string;
  fixtureLabel: string;
  kickoffAt: Date;
  reason?: string | null;
}) {
  try {
    const { recipient } = await upsertTeamNotificationRecipient(input.teamId);
    const requestsUrl = `${getSiteUrl()}/captain/team/${input.teamId}/availability/requests?fixtureId=${encodeURIComponent(input.fixtureId)}`;
    const requestLabel =
      input.type === "WITHDRAWAL"
        ? "can no longer play and has asked to withdraw"
        : "has joined the waiting list";
    const reasonText = input.reason?.trim()
      ? ` Reason: ${input.reason.trim()}.`
      : "";
    const body = `${input.playerName} ${requestLabel} for ${input.fixtureLabel} on ${formatFixtureDate(input.kickoffAt)}.${reasonText} Review: ${requestsUrl}`;
    const channel = recipient.phone?.trim()
      ? NotificationChannel.SMS
      : NotificationChannel.EMAIL;

    if (channel === NotificationChannel.EMAIL && !recipient.email?.trim()) return;

    const dispatch = await queueDirectNotification({
      recipientId: recipient.id,
      channel,
      audience: NotificationAudience.TEAM,
      subject:
        channel === NotificationChannel.EMAIL
          ? input.type === "WITHDRAWAL"
            ? `${input.playerName} cannot play`
            : `${input.playerName} joined the waiting list`
          : null,
      body,
      isTransactional: true,
      sourceType:
        input.type === "WITHDRAWAL"
          ? "PLAYER_FIXTURE_WITHDRAWAL_REQUEST"
          : "PLAYER_FIXTURE_WAITLIST_REQUEST",
      sourceId: `${input.fixtureId}:${input.teamMemberId}`,
      metadata: {
        origin: "player_fixture_request",
        originLabel:
          input.type === "WITHDRAWAL"
            ? "Player withdrawal request"
            : "Player fixture waiting list",
        teamId: input.teamId,
        fixtureId: input.fixtureId,
        teamMemberId: input.teamMemberId,
        requestType: input.type,
        requestsUrl,
      },
    });

    await logNotificationDispatchToThread({ dispatch, recipient });

    try {
      await processNotificationQueue(5);
    } catch (error) {
      console.error("Failed to process player fixture request notification", error);
    }
  } catch (error) {
    console.error("Failed to notify captain about player fixture request", error);
  }
}

function getSelectionState(input: {
  fixture: NonNullable<Awaited<ReturnType<typeof getFixtureSelectionContext>>>;
  teamId: string;
  teamMemberId: string;
}) {
  const targetSize =
    input.fixture.homeTeamId === input.teamId
      ? input.fixture.homeTeam.matchdayTargetSize ?? 0
      : input.fixture.awayTeam.matchdayTargetSize ?? 0;
  const selectedMemberIds = new Set(
    input.fixture.playerMatchFees
      .map((fee) => fee.teamMemberId)
      .filter((id): id is string => Boolean(id)),
  );

  return {
    selectedMemberIds,
    playerAlreadySelected: selectedMemberIds.has(input.teamMemberId),
    squadIsFull: targetSize > 0 && selectedMemberIds.size >= targetSize,
  };
}

export async function updatePlayerFixtureAvailabilityAction(formData: FormData) {
  const teamId = getString(formData, "teamId");
  const fixtureId = getString(formData, "fixtureId");
  const response = getString(formData, "response");
  const note = getString(formData, "note") || null;
  const requestedPreviewMembershipId =
    getString(formData, "previewMembershipId") || null;

  const redirectPath = (saved?: string) =>
    getAvailabilityPath({
      teamId,
      fixtureId,
      saved,
      previewMembershipId: requestedPreviewMembershipId,
    });

  if (!teamId || !fixtureId || !VALID_RESPONSES.has(response)) {
    redirect(redirectPath("invalid"));
  }

  const { user, teamMember } = await getPlayerActionContext({
    teamId,
    requestedPreviewMembershipId,
    redirectPath,
  });
  const fixture = await getFixtureSelectionContext({ fixtureId, teamId });

  if (!fixture) {
    redirect(redirectPath("fixture-not-found"));
  }

  const { squadIsFull, playerAlreadySelected } = getSelectionState({
    fixture,
    teamId,
    teamMemberId: teamMember.id,
  });

  if (playerAlreadySelected && user.role !== UserRole.ADMIN) {
    redirect(redirectPath("selected-player-locked"));
  }

  if (response === "AVAILABLE" && squadIsFull && !playerAlreadySelected) {
    redirect(redirectPath("squad-full"));
  }

  await prisma.fixtureAvailability.upsert({
    where: {
      fixtureId_teamMemberId: {
        fixtureId,
        teamMemberId: teamMember.id,
      },
    },
    update: {
      response,
      note,
      respondedAt: new Date(),
    },
    create: {
      fixtureId,
      teamMemberId: teamMember.id,
      response,
      note,
      respondedAt: new Date(),
    },
  });

  if (response !== "AVAILABLE") {
    await closeFixturePlayerRequest({
      fixtureId,
      teamId,
      teamMemberId: teamMember.id,
      type: "WAITLIST",
      status: "CANCELLED",
    });
  }

  revalidatePath(`/player/team/${teamId}`);
  revalidatePath(getAvailabilityPath({ teamId, fixtureId }));
  revalidatePath(`/admin/teams/${teamId}/availability`);
  revalidatePath(`/captain/team/${teamId}/availability`);
  revalidatePath(`/captain/team/${teamId}/availability/requests`);

  redirect(redirectPath("availability-updated"));
}

export async function requestPlayerWithdrawalAction(formData: FormData) {
  const teamId = getString(formData, "teamId");
  const fixtureId = getString(formData, "fixtureId");
  const reason = getString(formData, "reason");
  const requestedPreviewMembershipId =
    getString(formData, "previewMembershipId") || null;
  const redirectPath = (saved?: string) =>
    getAvailabilityPath({
      teamId,
      fixtureId,
      saved,
      previewMembershipId: requestedPreviewMembershipId,
    });

  if (!teamId || !fixtureId) redirect(redirectPath("invalid"));
  if (reason.length < 5) redirect(redirectPath("withdrawal-reason-required"));

  const { user, teamMember } = await getPlayerActionContext({
    teamId,
    requestedPreviewMembershipId,
    redirectPath,
  });
  const fixture = await getFixtureSelectionContext({ fixtureId, teamId });

  if (!fixture) redirect(redirectPath("fixture-not-found"));

  const { playerAlreadySelected } = getSelectionState({
    fixture,
    teamId,
    teamMemberId: teamMember.id,
  });

  if (!playerAlreadySelected) redirect(redirectPath("not-selected"));

  await upsertOpenFixturePlayerRequest({
    fixtureId,
    teamId,
    teamMemberId: teamMember.id,
    type: "WITHDRAWAL",
    reason,
  });
  await closeFixturePlayerRequest({
    fixtureId,
    teamId,
    teamMemberId: teamMember.id,
    type: "WAITLIST",
    status: "CANCELLED",
  });

  if (user.role !== UserRole.ADMIN) {
    await notifyCaptainOfPlayerRequest({
      teamId,
      fixtureId,
      teamMemberId: teamMember.id,
      type: "WITHDRAWAL",
      playerName:
        teamMember.user.name || teamMember.user.email || "A selected player",
      fixtureLabel: `${fixture.homeTeam.name} vs ${fixture.awayTeam.name}`,
      kickoffAt: fixture.kickoffAt,
      reason,
    });
  }

  revalidatePath(`/captain/team/${teamId}/availability`);
  revalidatePath(`/captain/team/${teamId}/availability/requests`);
  revalidatePath(getAvailabilityPath({ teamId, fixtureId }));
  redirect(redirectPath("withdrawal-requested"));
}

export async function joinPlayerFixtureWaitlistAction(formData: FormData) {
  const teamId = getString(formData, "teamId");
  const fixtureId = getString(formData, "fixtureId");
  const requestedPreviewMembershipId =
    getString(formData, "previewMembershipId") || null;
  const redirectPath = (saved?: string) =>
    getAvailabilityPath({
      teamId,
      fixtureId,
      saved,
      previewMembershipId: requestedPreviewMembershipId,
    });

  if (!teamId || !fixtureId) redirect(redirectPath("invalid"));

  const { user, teamMember } = await getPlayerActionContext({
    teamId,
    requestedPreviewMembershipId,
    redirectPath,
  });
  const fixture = await getFixtureSelectionContext({ fixtureId, teamId });

  if (!fixture) redirect(redirectPath("fixture-not-found"));

  const { squadIsFull, playerAlreadySelected } = getSelectionState({
    fixture,
    teamId,
    teamMemberId: teamMember.id,
  });

  if (playerAlreadySelected) redirect(redirectPath("already-selected"));
  if (!squadIsFull) redirect(redirectPath("squad-not-full"));

  await prisma.fixtureAvailability.upsert({
    where: {
      fixtureId_teamMemberId: {
        fixtureId,
        teamMemberId: teamMember.id,
      },
    },
    update: {
      response: "AVAILABLE",
      respondedAt: new Date(),
    },
    create: {
      fixtureId,
      teamMemberId: teamMember.id,
      response: "AVAILABLE",
      respondedAt: new Date(),
    },
  });

  await upsertOpenFixturePlayerRequest({
    fixtureId,
    teamId,
    teamMemberId: teamMember.id,
    type: "WAITLIST",
    reason: "Available if a place becomes free.",
  });

  if (user.role !== UserRole.ADMIN) {
    await notifyCaptainOfPlayerRequest({
      teamId,
      fixtureId,
      teamMemberId: teamMember.id,
      type: "WAITLIST",
      playerName: teamMember.user.name || teamMember.user.email || "A player",
      fixtureLabel: `${fixture.homeTeam.name} vs ${fixture.awayTeam.name}`,
      kickoffAt: fixture.kickoffAt,
    });
  }

  revalidatePath(`/captain/team/${teamId}/availability`);
  revalidatePath(`/captain/team/${teamId}/availability/requests`);
  revalidatePath(getAvailabilityPath({ teamId, fixtureId }));
  redirect(redirectPath("waitlist-joined"));
}

export async function leavePlayerFixtureWaitlistAction(formData: FormData) {
  const teamId = getString(formData, "teamId");
  const fixtureId = getString(formData, "fixtureId");
  const requestedPreviewMembershipId =
    getString(formData, "previewMembershipId") || null;
  const redirectPath = (saved?: string) =>
    getAvailabilityPath({
      teamId,
      fixtureId,
      saved,
      previewMembershipId: requestedPreviewMembershipId,
    });

  if (!teamId || !fixtureId) redirect(redirectPath("invalid"));

  const { teamMember } = await getPlayerActionContext({
    teamId,
    requestedPreviewMembershipId,
    redirectPath,
  });

  await closeFixturePlayerRequest({
    fixtureId,
    teamId,
    teamMemberId: teamMember.id,
    type: "WAITLIST",
    status: "CANCELLED",
  });

  revalidatePath(`/captain/team/${teamId}/availability/requests`);
  revalidatePath(getAvailabilityPath({ teamId, fixtureId }));
  redirect(redirectPath("waitlist-left"));
}
