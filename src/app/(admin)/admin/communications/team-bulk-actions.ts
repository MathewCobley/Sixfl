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
import { sendTeamBroadcastMessage } from "@/lib/communications/send-team-broadcast";
import { getPhoneDisplayValue } from "@/lib/notifications/phone";
import { processNotificationQueue } from "@/lib/notifications/processor";
import { upsertNotificationRecipient } from "@/lib/notifications/recipients";
import { queueDirectNotification } from "@/lib/notifications/service";
import { upsertTeamNotificationRecipient } from "@/lib/notifications/team-contacts";
import { createPlayerInterestResponseToken } from "@/lib/player-interest/response-token";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/requireAdmin";
import { getTeamMemberProfilesByTeamMemberIds } from "@/lib/teamMemberProfiles";

const POLL_OPTIONS_PLACEHOLDER = "{{pollOptions}}";
const POLL_LINK_PLACEHOLDER = "{{pollLink}}";

function text(value: FormDataEntryValue | null) {
  return String(value ?? "").trim();
}

function safeRedirect(value: FormDataEntryValue | null, fallback: string) {
  return text(value) || fallback;
}

function appendRedirectParams(path: string, params: Record<string, string | number | null | undefined>) {
  const entries = Object.entries(params).filter((entry): entry is [string, string | number] => {
    const value = entry[1];
    return value !== null && value !== undefined && String(value).trim() !== "";
  });

  if (entries.length === 0) return path;

  const separator = path.includes("?") ? "&" : "?";
  return `${path}${separator}${entries
    .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`)
    .join("&")}`;
}

function fullName(input: { firstName: string; lastName: string | null }) {
  return [input.firstName, input.lastName].filter(Boolean).join(" ").trim();
}

function firstName(value?: string | null) {
  const trimmed = value?.trim();
  return trimmed ? (trimmed.split(/\s+/)[0] ?? "") : "";
}

function siteUrl() {
  return (
    process.env.NEXT_PUBLIC_SITE_URL?.trim() ||
    process.env.SITE_URL?.trim() ||
    process.env.NEXT_PUBLIC_APP_URL?.trim() ||
    process.env.APP_URL?.trim() ||
    process.env.NEXTAUTH_URL?.trim() ||
    "https://www.sixfl.co.uk"
  ).replace(/\/+$/, "");
}

function parseRecipientValue(value: string) {
  const [type, id] = value.split(":");
  if (type === "teamMember" || type === "prospect") return { type, id: id || "" } as const;
  return { type: "team", id: "" } as const;
}

function messageNeedsPoll(body: string) {
  return body.includes(POLL_OPTIONS_PLACEHOLDER) || body.includes(POLL_LINK_PLACEHOLDER);
}

function responseUrls(input: { teamId: string; type: "team" | "teamMember" | "prospect"; id: string }) {
  if (input.type !== "teamMember" && input.type !== "prospect") {
    return { yesResponseUrl: "", noResponseUrl: "" };
  }

  const token = createPlayerInterestResponseToken({
    teamId: input.teamId,
    recipientType: input.type,
    recipientId: input.id,
    expiresInDays: 45,
  });

  const encoded = encodeURIComponent(token);
  const base = siteUrl();

  return {
    yesResponseUrl: `${base}/player-response/yes?token=${encoded}`,
    noResponseUrl: `${base}/player-response/no?token=${encoded}`,
  };
}

type CommunicationRecipientContext = {
  recipient: Awaited<ReturnType<typeof upsertNotificationRecipient>>;
  audience: NotificationAudience;
  sourceType: string;
  sourceId: string;
  displayName: string;
  emailBranding: { teamName: string; teamLogoUrl: string | null; leagueName: string | null };
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
        user: { select: { id: true, name: true, email: true } },
        team: {
          select: {
            name: true,
            logoUrl: true,
            league: { select: { name: true, season: true } },
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
      emailBranding: { teamName: member.team.name, teamLogoUrl: member.team.logoUrl, leagueName },
      metadata: { recipientType: "teamMember", teamMemberId: member.id, userId: member.user.id, sourceProspectId },
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
            name: true,
            logoUrl: true,
            league: { select: { name: true, season: true } },
          },
        },
      },
    });

    if (!prospect?.team) return null;

    const displayName = fullName(prospect) || prospect.firstName;
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
      metadata: { teamId, prospectId: prospect.id, entityType: "TEAM_PROSPECT" },
    });

    return {
      recipient,
      audience: NotificationAudience.PLAYER,
      sourceType: "TEAM_PLAYER_PROSPECT",
      sourceId: prospect.id,
      displayName,
      emailBranding: { teamName: prospect.team.name, teamLogoUrl: prospect.team.logoUrl, leagueName },
      metadata: { recipientType: "prospect", prospectId: prospect.id, prospectStatus: prospect.status },
    };
  }

  const { recipient, snapshot } = await upsertTeamNotificationRecipient(teamId);
  const teamBranding = await prisma.team.findUnique({ where: { id: teamId }, select: { logoUrl: true } });

  return {
    recipient,
    audience: NotificationAudience.TEAM,
    sourceType: "TEAM",
    sourceId: teamId,
    displayName: snapshot.primaryContact.name || snapshot.teamName,
    emailBranding: { teamName: snapshot.teamName, teamLogoUrl: teamBranding?.logoUrl ?? null, leagueName: snapshot.leagueName },
    metadata: { recipientType: "team" },
  };
}

async function processJustQueuedMessages(queuedCount: number) {
  if (queuedCount <= 0) return;

  try {
    await processNotificationQueue(Math.max(queuedCount + 10, 25));
  } catch (error) {
    console.error("Failed to process newly queued admin message immediately", error);
  }
}

export async function sendTeamCommunicationBulkMessageAction(formData: FormData) {
  const { user } = await requireAdmin();

  const teamId = text(formData.get("teamId"));
  const from = safeRedirect(formData.get("from"), `/admin/teams/${teamId}/communications`);
  const channelInput = text(formData.get("channel")).toUpperCase();
  const subject = text(formData.get("subject"));
  const body = text(formData.get("body"));
  const templateId = text(formData.get("templateId")) || null;
  const templateKey = text(formData.get("templateKey")) || null;
  const ctaLabel = text(formData.get("ctaLabel")) || null;
  const ctaUrl = text(formData.get("ctaUrl")) || null;
  const selectedPollId = text(formData.get("pollId")) || null;
  const claimCode = text(formData.get("claimCode"));
  const claimLink = text(formData.get("claimLink"));
  const captainDashboardUrl = text(formData.get("captainDashboardUrl")) || claimLink;
  const isMarketingMessage = text(formData.get("isMarketing")) === "1";

  const selectedRecipientValues = formData
    .getAll("recipientValues")
    .map((value) => String(value).trim())
    .filter(Boolean);

  const fallbackRecipientType = text(formData.get("recipientType")) || "team";
  const fallbackRecipientId = text(formData.get("recipientId")) || "";
  const recipientValues = selectedRecipientValues.length
    ? selectedRecipientValues
    : [`${fallbackRecipientType}:${fallbackRecipientId}`];

  if (!teamId) redirect("/admin/teams?error=missing_id");
  if (!body) redirect(appendRedirectParams(from, { error: "Message body is required." }));

  const channel = channelInput === "SMS" ? NotificationChannel.SMS : NotificationChannel.EMAIL;
  if (channel === NotificationChannel.EMAIL && !subject) {
    redirect(appendRedirectParams(from, { error: "Email subject is required." }));
  }

  const hasPollPlaceholder = messageNeedsPoll(body);
  const usesPoll = Boolean(selectedPollId || hasPollPlaceholder);
  const parsedRecipients = Array.from(new Set(recipientValues)).map((value) => ({ value, parsed: parseRecipientValue(value) }));

  if (usesPoll && parsedRecipients.some((item) => item.parsed.type !== "team")) {
    redirect(appendRedirectParams(from, { error: "Poll templates can only be sent to the team contact. Untick squad/prospect recipients before sending a poll." }));
  }

  let queuedCount = 0;
  let skippedMissingContactCount = 0;

  for (const { parsed } of parsedRecipients) {
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

    const urls = responseUrls({ teamId, type: parsed.type, id: parsed.id });
    const variables = {
      firstName: firstName(recipientContext.displayName),
      fullName: recipientContext.displayName,
      teamName: recipientContext.emailBranding.teamName,
      leagueName: recipientContext.emailBranding.leagueName ?? "",
      claimCode,
      claimLink,
      captainDashboardUrl,
      yesResponseUrl: urls.yesResponseUrl,
      noResponseUrl: urls.noResponseUrl,
    };
    const isTransactional = !isMarketingMessage;

    if (parsed.type === "team" && usesPoll) {
      const result = await sendTeamBroadcastMessage({
        teamId,
        channel,
        subject: channel === NotificationChannel.EMAIL ? subject : null,
        body,
        templateId,
        templateKey,
        ctaLabel,
        ctaUrl,
        pollId: selectedPollId,
        origin: "team_communications_hub",
        originLabel: isTransactional
          ? "Sent from communications hub as service message"
          : "Sent from communications hub as marketing message",
        metadata: {
          isMarketingMessage,
          isTransactional,
          yesResponseUrl: urls.yesResponseUrl,
          noResponseUrl: urls.noResponseUrl,
          bulkRecipientCount: recipientValues.length,
          ...recipientContext.metadata,
        },
        variables,
        createdByUserId: user?.id ?? null,
      });

      if (result.skipped) skippedMissingContactCount += 1;
      else queuedCount += 1;
      continue;
    }

    const dispatch = await queueDirectNotification({
      recipientId: recipientContext.recipient.id,
      channel,
      audience: recipientContext.audience,
      subject: channel === NotificationChannel.EMAIL ? subject : null,
      body,
      variables,
      isTransactional,
      sourceType: recipientContext.sourceType,
      sourceId: recipientContext.sourceId,
      emailBranding: channel === NotificationChannel.EMAIL ? recipientContext.emailBranding : undefined,
      emailCta: channel === NotificationChannel.EMAIL && ctaLabel && ctaUrl ? { label: ctaLabel, url: ctaUrl } : undefined,
      metadata: {
        origin: "team_communications_hub",
        originLabel: isTransactional
          ? "Sent from communications hub as service message"
          : "Sent from communications hub as marketing message",
        teamId,
        templateId,
        templateKey,
        ctaLabel,
        ctaUrl,
        isMarketingMessage,
        isTransactional,
        yesResponseUrl: urls.yesResponseUrl,
        noResponseUrl: urls.noResponseUrl,
        bulkRecipientCount: recipientValues.length,
        ...recipientContext.metadata,
      },
      createdByUserId: user?.id ?? null,
    });

    await logNotificationDispatchToThread({ dispatch, recipient: recipientContext.recipient });

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
        ? "Selected recipients do not have mobile numbers."
        : "Selected recipients do not have email addresses."
      : "No valid recipients selected.";

    redirect(appendRedirectParams(from, { error: reason }));
  }

  await processJustQueuedMessages(queuedCount);

  redirect(
    appendRedirectParams(from, {
      saved: "queued",
      channel: channel.toLowerCase(),
      count: queuedCount,
      skipped: skippedMissingContactCount || null,
    }),
  );
}
