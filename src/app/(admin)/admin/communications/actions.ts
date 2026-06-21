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

function getErrorMessage(error: unknown) {
  if (error instanceof Error && error.message.trim()) {
    return error.message.trim();
  }

  return "Unknown error";
}

function hasUnresolvedTemplatePlaceholder(text: string) {
  return /\{\{[^}]+\}\}/.test(text);
}

function redirectIfUnresolvedTemplatePlaceholder(input: {
  from: string;
  subject?: string | null;
  body: string;
}) {
  if (
    hasUnresolvedTemplatePlaceholder(input.body) ||
    hasUnresolvedTemplatePlaceholder(input.subject ?? "")
  ) {
    redirect(
      `${input.from}?error=${encodeURIComponent(
        "The message still contains an unresolved template placeholder such as {{fixtures}}. Please reselect the template or edit the message before sending.",
      )}`,
    );
  }
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

    if (!prospect?.team) {
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
  const recipientType = getTrimmedValue(formData.get("recipientType")) || "team";
  const recipientId = getTrimmedValue(formData.get("recipientId")) || null;
  const channel = getTrimmedValue(formData.get("channel"));
  const subject = getTrimmedValue(formData.get("subject"));
  const body = getTrimmedValue(formData.get("body"));
  const from = getSafeRedirectPath(formData.get("from"), teamId ? `/admin/teams/${teamId}/communications` : "/admin/communications");

  if (!teamId) {
    redirect(`${from}?error=${encodeURIComponent("Team is required.")}`);
  }

  if (channel !== NotificationChannel.EMAIL && channel !== NotificationChannel.SMS) {
    redirect(`${from}?error=${encodeURIComponent("Choose email or SMS.")}`);
  }

  if (!body) {
    redirect(`${from}?error=${encodeURIComponent("Message body is required.")}`);
  }

  redirectIfUnresolvedTemplatePlaceholder({ from, subject, body });

  if (channel === NotificationChannel.EMAIL && !subject) {
    redirect(`${from}?error=${encodeURIComponent("Email subject is required.")}`);
  }

  try {
    if (recipientType === "team") {
      await sendTeamBroadcastMessage({
        teamId,
        channel,
        subject: subject || null,
        body,
        from,
        createdByUserId: user?.id ?? null,
      });
    } else {
      const context = await getTeamCommunicationRecipientContext({
        teamId,
        recipientType,
        recipientId,
      });

      const dispatch = await queueDirectNotification({
        recipientId: context.recipient.id,
        channel,
        audience: context.audience,
        subject: channel === NotificationChannel.EMAIL ? subject : null,
        body,
        isTransactional: false,
        sourceType: context.sourceType,
        sourceId: context.sourceId,
        metadata: {
          ...context.metadata,
          teamId,
          origin: "admin_team_communications",
          originLabel: "Sent from team communications",
          emailBranding: context.emailBranding,
        },
        createdByUserId: user?.id ?? null,
      });

      await logNotificationDispatchToThread({
        dispatch,
        recipient: context.recipient,
      });
    }

    redirect(`${from}?saved=${encodeURIComponent("Message queued.")}`);
  } catch (error) {
    redirect(`${from}?error=${encodeURIComponent(getErrorMessage(error))}`);
  }
}
