// ========================================
// File: src/app/(admin)/admin/communications/team-bulk-actions.ts
// ========================================

"use server";

import { redirect } from "next/navigation";
import {
  NotificationAudience,
  NotificationChannel,
  NotificationRecipientSourceType,
} from "@prisma/client";

import { logNotificationDispatchToThread } from "@/lib/communications/log-dispatch";
import { getPhoneDisplayValue } from "@/lib/notifications/phone";
import { upsertNotificationRecipient } from "@/lib/notifications/recipients";
import { queueDirectNotification } from "@/lib/notifications/service";
import { upsertTeamNotificationRecipient } from "@/lib/notifications/team-contacts";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/requireAdmin";
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

function getFirstName(value?: string | null) {
  const trimmed = value?.trim();
  if (!trimmed) return "";
  return trimmed.split(/\s+/)[0] ?? "";
}

function parseRecipientValue(value: string) {
  const [type, id] = value.split(":");

  if (type === "teamMember" || type === "prospect") {
    return { type, id: id || "" } as const;
  }

  return { type: "team", id: "" } as const;
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
}): Promise<CommunicationRecipientContext | null> {
  const { teamId, recipientType, recipientId } = input;

  if (recipientType === "teamMember" && recipientId) {
    const member = await prisma.teamMember.findFirst({
      where: { id: recipientId, teamId },
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

    if (!member) return null;

    const profiles = await getTeamMemberProfilesByTeamMemberIds([member.id]);
    const profile = profiles.get(member.id) ?? null;
    const sourceProspectId = profile?.sourceProspectId?.trim() || null;
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
        sourceProspectId,
        entityType: "TEAM_MEMBER",
      },
    });

    return {
      recipient,
      audience: NotificationAudience.PLAYER,
      sourceType: sourceProspectId ? "TEAM_PLAYER_PROSPECT" : "TEAM_MEMBER",
      sourceId: sourceProspectId ?? member.id,
      displayName,
      emailBranding: {
        teamName: member.team.name,
        leagueName,
      },
      metadata: {
        recipientType: "teamMember",
        teamMemberId: member.id,
        userId: member.user.id,
        sourceProspectId,
      },
    };
  }

  if (recipientType === "prospect" && recipientId) {
    const prospect = await prisma.teamPlayerProspect.findFirst({
      where: { id: recipientId, teamId },
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

    if (!prospect) return null;

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
    metadata: { recipientType: "team" },
  };
}

export async function sendTeamCommunicationBulkMessageAction(formData: FormData) {
  const { user } = await requireAdmin();

  const teamId = getTrimmedValue(formData.get("teamId"));
  const from = getSafeRedirectPath(formData.get("from"), `/admin/teams/${teamId}/communications`);
  const channelInput = getTrimmedValue(formData.get("channel")).toUpperCase();
  const subject = getTrimmedValue(formData.get("subject"));
  const body = getTrimmedValue(formData.get("body"));
  const templateId = getTrimmedValue(formData.get("templateId")) || null;
  const templateKey = getTrimmedValue(formData.get("templateKey")) || null;
  const ctaLabel = getTrimmedValue(formData.get("ctaLabel")) || null;
  const ctaUrl = getTrimmedValue(formData.get("ctaUrl")) || null;
  const claimCode = getTrimmedValue(formData.get("claimCode"));
  const claimLink = getTrimmedValue(formData.get("claimLink"));
  const captainDashboardUrl = getTrimmedValue(formData.get("captainDashboardUrl")) || claimLink;

  const selectedRecipientValues = formData
    .getAll("recipientValues")
    .map((value) => String(value).trim())
    .filter(Boolean);

  const fallbackRecipientType = getTrimmedValue(formData.get("recipientType")) || "team";
  const fallbackRecipientId = getTrimmedValue(formData.get("recipientId")) || "";
  const recipientValues = selectedRecipientValues.length
    ? selectedRecipientValues
    : [`${fallbackRecipientType}:${fallbackRecipientId}`];

  if (!teamId) {
    redirect("/admin/teams?error=missing_id");
  }

  if (!body) {
    redirect(`${from}?error=Message%20body%20is%20required.`);
  }

  const channel = channelInput === "SMS" ? NotificationChannel.SMS : NotificationChannel.EMAIL;

  if (channel === NotificationChannel.EMAIL && !subject) {
    redirect(`${from}?error=Email%20subject%20is%20required.`);
  }

  let queuedCount = 0;
  let skippedMissingContactCount = 0;

  for (const recipientValue of Array.from(new Set(recipientValues))) {
    const parsed = parseRecipientValue(recipientValue);
    const recipientContext = await getTeamCommunicationRecipientContext({
      teamId,
      recipientType: parsed.type,
      recipientId: parsed.id || null,
    });

    if (!recipientContext) continue;

    if (channel === NotificationChannel.EMAIL && !recipientContext.recipient.email?.trim()) {
      skippedMissingContactCount += 1;
      continue;
    }

    if (channel === NotificationChannel.SMS && !recipientContext.recipient.phone?.trim()) {
      skippedMissingContactCount += 1;
      continue;
    }

    const variables = {
      firstName: getFirstName(recipientContext.displayName),
      fullName: recipientContext.displayName,
      teamName: recipientContext.emailBranding.teamName,
      leagueName: recipientContext.emailBranding.leagueName ?? "",
      claimCode,
      claimLink,
      captainDashboardUrl,
    };

    const dispatch = await queueDirectNotification({
      recipientId: recipientContext.recipient.id,
      channel,
      audience: recipientContext.audience,
      subject: channel === NotificationChannel.EMAIL ? subject : null,
      body,
      variables,
      isTransactional: recipientContext.audience === NotificationAudience.TEAM,
      sourceType: recipientContext.sourceType,
      sourceId: recipientContext.sourceId,
      emailBranding: channel === NotificationChannel.EMAIL ? recipientContext.emailBranding : undefined,
      emailCta:
        channel === NotificationChannel.EMAIL && ctaLabel && ctaUrl
          ? { label: ctaLabel, url: ctaUrl }
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
        bulkRecipientCount: recipientValues.length,
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
        data: { lastContactedAt: new Date() },
      });
    }

    queuedCount += 1;
  }

  if (queuedCount === 0) {
    const reason = skippedMissingContactCount > 0
      ? channel === NotificationChannel.SMS
        ? "Selected%20recipients%20do%20not%20have%20mobile%20numbers."
        : "Selected%20recipients%20do%20not%20have%20email%20addresses."
      : "No%20valid%20recipients%20selected.";

    redirect(`${from}?error=${reason}`);
  }

  redirect(
    `${from}?saved=queued&channel=${channel.toLowerCase()}&count=${queuedCount}${
      skippedMissingContactCount ? `&skipped=${skippedMissingContactCount}` : ""
    }`,
  );
}
