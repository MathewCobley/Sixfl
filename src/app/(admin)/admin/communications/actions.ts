// ========================================
// File: src/app/(admin)/admin/communications/actions.ts
// ========================================

"use server";

import { redirect } from "next/navigation";
import {
  NotificationAudience,
  NotificationChannel,
  NotificationRecipientSourceType,
} from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/requireAdmin";
import { sendTeamBroadcastMessage } from "@/lib/communications/send-team-broadcast";
import { logNotificationDispatchToThread } from "@/lib/communications/log-dispatch";
import { upsertTeamNotificationRecipient } from "@/lib/notifications/team-contacts";
import { getPhoneDisplayValue } from "@/lib/notifications/phone";
import { upsertNotificationRecipient } from "@/lib/notifications/recipients";
import { queueDirectNotification } from "@/lib/notifications/service";
import { getTeamMemberProfilesByTeamMemberIds } from "@/lib/teamMemberProfiles";

function getTrimmedValue(value: FormDataEntryValue | null) {
  return String(value ?? "").trim();
}

function getSafeRedirectPath(value: FormDataEntryValue | null, fallback: string) {
  const text = String(value ?? "").trim();
  return text || fallback;
}

function getFullName(input: { firstName: string; lastName: string | null }) {
  return [input.firstName, input.lastName].filter(Boolean).join(" ").trim();
}

type CommunicationRecipientContext = {
  recipient: Awaited<ReturnType<typeof upsertNotificationRecipient>>;
  audience: NotificationAudience;
  sourceType: string;
  sourceId: string;
  displayName: string;
  emailBranding: {
    teamName: string;
    leagueName: string | null;
  };
  metadata: Record<string, unknown>;
};

async function getTeamCommunicationRecipientContext(input: {
  teamId: string;
  recipientType: string;
  recipientId: string | null;
}): Promise<CommunicationRecipientContext> {
  const { teamId, recipientType, recipientId } = input;

  if (recipientType === "teamMember" && recipientId) {
    const member = await prisma.teamMember.findFirst({
      where: {
        id: recipientId,
        teamId,
      },
      select: {
        id: true,
        role: true,
        user: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
        team: {
          select: {
            id: true,
            name: true,
            league: {
              select: {
                name: true,
                season: true,
              },
            },
          },
        },
      },
    });

    if (!member) {
      redirect(`/admin/teams/${teamId}/communications?error=Player%20not%20found.`);
    }

    const profiles = await getTeamMemberProfilesByTeamMemberIds([member.id]);
    const profile = profiles.get(member.id) ?? null;
    const displayName = member.user.name?.trim() || member.user.email?.trim() || "Squad member";
    const leagueName = member.team.league
      ? `${member.team.league.name}${member.team.league.season ? ` — ${member.team.league.season}` : ""}`
      : null;

    const recipient = await upsertNotificationRecipient({
      sourceType: NotificationRecipientSourceType.GENERAL,
      sourceId: `team-member:${member.id}`,
      audience: NotificationAudience.PLAYER,
      displayName,
      email: member.user.email?.trim() || null,
      phone: getPhoneDisplayValue(profile?.phone ?? null),
      marketingEmailOptIn: true,
      marketingSmsOptIn: true,
      transactionalEmailOptIn: true,
      transactionalSmsOptIn: true,
      metadata: {
        teamId,
        teamMemberId: member.id,
        userId: member.user.id,
        sourceProspectId: profile?.sourceProspectId ?? null,
        entityType: "TEAM_MEMBER",
      },
    });

    return {
      recipient,
      audience: NotificationAudience.PLAYER,
      sourceType: "TEAM_MEMBER",
      sourceId: member.id,
      displayName,
      emailBranding: {
        teamName: member.team.name,
        leagueName,
      },
      metadata: {
        recipientType: "teamMember",
        teamMemberId: member.id,
        userId: member.user.id,
        sourceProspectId: profile?.sourceProspectId ?? null,
      },
    };
  }

  if (recipientType === "prospect" && recipientId) {
    const prospect = await prisma.teamPlayerProspect.findFirst({
      where: {
        id: recipientId,
        teamId,
      },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        email: true,
        phone: true,
        status: true,
        team: {
          select: {
            id: true,
            name: true,
            league: {
              select: {
                name: true,
                season: true,
              },
            },
          },
        },
      },
    });

    if (!prospect) {
      redirect(`/admin/teams/${teamId}/communications?error=Player%20prospect%20not%20found.`);
    }

    const displayName = getFullName(prospect) || prospect.firstName;
    const leagueName = prospect.team.league
      ? `${prospect.team.league.name}${prospect.team.league.season ? ` — ${prospect.team.league.season}` : ""}`
      : null;

    const recipient = await upsertNotificationRecipient({
      sourceType: NotificationRecipientSourceType.GENERAL,
      sourceId: `team-prospect:${prospect.id}`,
      audience: NotificationAudience.PLAYER,
      displayName,
      email: prospect.email?.trim() || null,
      phone: getPhoneDisplayValue(prospect.phone),
      marketingEmailOptIn: true,
      marketingSmsOptIn: true,
      transactionalEmailOptIn: true,
      transactionalSmsOptIn: true,
      metadata: {
        teamId,
        prospectId: prospect.id,
        entityType: "TEAM_PROSPECT",
      },
    });

    return {
      recipient,
      audience: NotificationAudience.PLAYER,
      sourceType: "TEAM_PLAYER_PROSPECT",
      sourceId: prospect.id,
      displayName,
      emailBranding: {
        teamName: prospect.team.name,
        leagueName,
      },
      metadata: {
        recipientType: "prospect",
        prospectId: prospect.id,
        prospectStatus: prospect.status,
      },
    };
  }

  const { recipient, snapshot } = await upsertTeamNotificationRecipient(teamId);

  return {
    recipient,
    audience: NotificationAudience.TEAM,
    sourceType: "TEAM",
    sourceId: teamId,
    displayName: snapshot.primaryContact.name || snapshot.teamName,
    emailBranding: {
      teamName: snapshot.teamName,
      leagueName: snapshot.leagueName,
    },
    metadata: {
      recipientType: "team",
    },
  };
}

export async function sendTeamCommunicationMessageAction(formData: FormData) {
  const { user } = await requireAdmin();

  const teamId = getTrimmedValue(formData.get("teamId"));
  const from = getSafeRedirectPath(
    formData.get("from"),
    `/admin/teams/${teamId}/communications`,
  );
  const channelInput = getTrimmedValue(formData.get("channel")).toUpperCase();
  const subject = getTrimmedValue(formData.get("subject"));
  const body = getTrimmedValue(formData.get("body"));
  const templateId = getTrimmedValue(formData.get("templateId")) || null;
  const templateKey = getTrimmedValue(formData.get("templateKey")) || null;
  const ctaLabel = getTrimmedValue(formData.get("ctaLabel")) || null;
  const ctaUrl = getTrimmedValue(formData.get("ctaUrl")) || null;
  const recipientType = getTrimmedValue(formData.get("recipientType")) || "team";
  const recipientId = getTrimmedValue(formData.get("recipientId")) || null;

  if (!teamId) {
    redirect("/admin/teams?error=missing_id");
  }

  if (!body) {
    redirect(`${from}?error=Message%20body%20is%20required.`);
  }

  const channel =
    channelInput === "SMS" ? NotificationChannel.SMS : NotificationChannel.EMAIL;

  if (channel === NotificationChannel.EMAIL && !subject) {
    redirect(`${from}?error=Email%20subject%20is%20required.`);
  }

  const recipientContext = await getTeamCommunicationRecipientContext({
    teamId,
    recipientType,
    recipientId,
  });

  if (channel === NotificationChannel.EMAIL && !recipientContext.recipient.email?.trim()) {
    redirect(`${from}?error=Selected%20recipient%20does%20not%20have%20an%20email%20address.`);
  }

  if (channel === NotificationChannel.SMS && !recipientContext.recipient.phone?.trim()) {
    redirect(`${from}?error=Selected%20recipient%20does%20not%20have%20a%20mobile%20number.`);
  }

  const dispatch = await queueDirectNotification({
    recipientId: recipientContext.recipient.id,
    channel,
    audience: recipientContext.audience,
    subject: channel === NotificationChannel.EMAIL ? subject : null,
    body,
    isTransactional: recipientContext.audience === NotificationAudience.TEAM,
    sourceType: recipientContext.sourceType,
    sourceId: recipientContext.sourceId,
    emailBranding:
      channel === NotificationChannel.EMAIL
        ? recipientContext.emailBranding
        : undefined,
    emailCta:
      channel === NotificationChannel.EMAIL && ctaLabel && ctaUrl
        ? {
            label: ctaLabel,
            url: ctaUrl,
          }
        : undefined,
    metadata: {
      origin: "team_communications_hub",
      originLabel:
        recipientContext.audience === NotificationAudience.PLAYER
          ? "Sent from communications hub to player"
          : "Sent from communications hub",
      teamId,
      templateId,
      templateKey,
      ctaLabel,
      ctaUrl,
      ...recipientContext.metadata,
    },
    createdByUserId: user?.id ?? null,
  });

  await logNotificationDispatchToThread({
    dispatch,
    recipient: recipientContext.recipient,
  });

  if (recipientContext.sourceType === "TEAM_PLAYER_PROSPECT") {
    await prisma.teamPlayerProspect.update({
      where: { id: recipientContext.sourceId },
      data: {
        lastContactedAt: new Date(),
      },
    });
  }

  redirect(`${from}?saved=queued&channel=${channel.toLowerCase()}`);
}

export async function sendProspectCommunicationMessageAction(formData: FormData) {
  const { user } = await requireAdmin();

  const teamId = getTrimmedValue(formData.get("teamId"));
  const prospectId = getTrimmedValue(formData.get("prospectId"));
  const from = getSafeRedirectPath(
    formData.get("from"),
    `/admin/teams/${teamId}/prospects/${prospectId}/communications`,
  );
  const channelInput = getTrimmedValue(formData.get("channel")).toUpperCase();
  const subject = getTrimmedValue(formData.get("subject"));
  const body = getTrimmedValue(formData.get("body"));
  const templateId = getTrimmedValue(formData.get("templateId")) || null;
  const templateKey = getTrimmedValue(formData.get("templateKey")) || null;
  const ctaLabel = getTrimmedValue(formData.get("ctaLabel")) || null;
  const ctaUrl = getTrimmedValue(formData.get("ctaUrl")) || null;

  if (!teamId || !prospectId) {
    redirect("/admin/teams?error=missing_id");
  }

  if (!body) {
    redirect(`${from}?error=Message%20body%20is%20required.`);
  }

  const prospect = await prisma.teamPlayerProspect.findFirst({
    where: {
      id: prospectId,
      teamId,
    },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      email: true,
      phone: true,
      status: true,
      team: {
        select: {
          name: true,
          league: {
            select: {
              name: true,
              season: true,
            },
          },
        },
      },
    },
  });

  if (!prospect) {
    redirect(`/admin/teams/${teamId}/prospects?error=Prospect%20not%20found.`);
  }

  const channel =
    channelInput === "SMS" ? NotificationChannel.SMS : NotificationChannel.EMAIL;

  if (channel === NotificationChannel.EMAIL && !subject) {
    redirect(`${from}?error=Email%20subject%20is%20required.`);
  }

  const displayName = [prospect.firstName, prospect.lastName]
    .filter(Boolean)
    .join(" ")
    .trim();

  const recipient = await upsertNotificationRecipient({
    sourceType: NotificationRecipientSourceType.GENERAL,
    sourceId: `team-prospect:${prospect.id}`,
    audience: NotificationAudience.PLAYER,
    displayName: displayName || prospect.firstName,
    email: prospect.email?.trim() || null,
    phone: getPhoneDisplayValue(prospect.phone),
    marketingEmailOptIn: true,
    marketingSmsOptIn: true,
    transactionalEmailOptIn: true,
    transactionalSmsOptIn: true,
    metadata: {
      teamId,
      prospectId: prospect.id,
      entityType: "TEAM_PROSPECT",
    },
  });

  if (channel === NotificationChannel.EMAIL && !recipient.email?.trim()) {
    redirect(`${from}?error=This%20prospect%20does%20not%20have%20an%20email%20address.`);
  }

  if (channel === NotificationChannel.SMS && !recipient.phone?.trim()) {
    redirect(`${from}?error=This%20prospect%20does%20not%20have%20a%20mobile%20number.`);
  }

  const dispatch = await queueDirectNotification({
    recipientId: recipient.id,
    channel,
    audience: NotificationAudience.PLAYER,
    subject: channel === NotificationChannel.EMAIL ? subject : null,
    body,
    isTransactional: false,
    sourceType: "TEAM_PLAYER_PROSPECT",
    sourceId: prospect.id,
    emailBranding:
      channel === NotificationChannel.EMAIL
        ? {
            teamName: prospect.team.name,
            leagueName: prospect.team.league
              ? `${prospect.team.league.name}${prospect.team.league.season ? ` — ${prospect.team.league.season}` : ""}`
              : null,
          }
        : undefined,
    emailCta:
      channel === NotificationChannel.EMAIL && ctaLabel && ctaUrl
        ? {
            label: ctaLabel,
            url: ctaUrl,
          }
        : undefined,
    metadata: {
      origin: "prospect_communications_hub",
      originLabel: "Sent from communications hub",
      teamId,
      prospectId: prospect.id,
      templateId,
      templateKey,
      ctaLabel,
      ctaUrl,
    },
    createdByUserId: user?.id ?? null,
  });

  await logNotificationDispatchToThread({
    dispatch,
    recipient,
  });

  await prisma.teamPlayerProspect.update({
    where: { id: prospect.id },
    data: {
      ...(prospect.status === "NEW" ? { status: "CONTACTED" } : {}),
      lastContactedAt: new Date(),
    },
  });

  redirect(`${from}?saved=queued&channel=${channel.toLowerCase()}`);
}

export async function sendLeagueCommunicationMessageAction(formData: FormData) {
  const { user } = await requireAdmin();

  const leagueId = getTrimmedValue(formData.get("leagueId"));
  const from = getSafeRedirectPath(
    formData.get("from"),
    `/admin/leagues/${leagueId}/communications`,
  );
  const channelInput = getTrimmedValue(formData.get("channel")).toUpperCase();
  const subject = getTrimmedValue(formData.get("subject"));
  const body = getTrimmedValue(formData.get("body"));
  const templateId = getTrimmedValue(formData.get("templateId")) || null;
  const templateKey = getTrimmedValue(formData.get("templateKey")) || null;
  const ctaLabel = getTrimmedValue(formData.get("ctaLabel")) || null;
  const ctaUrl = getTrimmedValue(formData.get("ctaUrl")) || null;
  const selectedTeamIds = formData
    .getAll("teamIds")
    .map((value) => String(value).trim())
    .filter(Boolean);

  if (!leagueId) {
    redirect("/admin/leagues?error=missing_id");
  }

  if (!body) {
    redirect(`${from}?error=Message%20body%20is%20required.`);
  }

  const channel =
    channelInput === "SMS" ? NotificationChannel.SMS : NotificationChannel.EMAIL;

  if (channel === NotificationChannel.EMAIL && !subject) {
    redirect(`${from}?error=Email%20subject%20is%20required.`);
  }

  const league = await prisma.league.findUnique({
    where: { id: leagueId },
    select: { id: true },
  });

  if (!league) {
    redirect("/admin/leagues?error=missing_id");
  }

  const teams = await prisma.team.findMany({
    where: {
      leagueId,
      ...(selectedTeamIds.length > 0
        ? {
            id: {
              in: selectedTeamIds,
            },
          }
        : {}),
    },
    select: { id: true },
    orderBy: [{ name: "asc" }],
  });

  if (teams.length === 0) {
    redirect(`${from}?error=No%20teams%20selected%20for%20this%20league%20message.`);
  }

  let deliveredCount = 0;

  for (const team of teams) {
    const result = await sendTeamBroadcastMessage({
      teamId: team.id,
      channel,
      subject: channel === NotificationChannel.EMAIL ? subject : null,
      body,
      templateId,
      templateKey,
      ctaLabel,
      ctaUrl,
      origin: "league_communications_hub",
      originLabel: "Sent from league communications hub",
      metadata: {
        leagueId,
        broadcastType: "league",
      },
      createdByUserId: user?.id ?? null,
    });

    if (!result.skipped) {
      deliveredCount += 1;
    }
  }

  redirect(`${from}?saved=queued&channel=${channel.toLowerCase()}&count=${deliveredCount}`);
}
