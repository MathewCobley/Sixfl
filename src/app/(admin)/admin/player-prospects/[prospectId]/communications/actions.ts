// ========================================
// File: src/app/(admin)/admin/player-prospects/[prospectId]/communications/actions.ts
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
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/requireAdmin";

function getTrimmedValue(value: FormDataEntryValue | null) {
  return String(value ?? "").trim();
}

function getSafeRedirectPath(value: FormDataEntryValue | null, fallback: string) {
  const text = String(value ?? "").trim();
  return text || fallback;
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

function getFullName(input: { firstName: string; lastName: string | null }) {
  return [input.firstName, input.lastName].filter(Boolean).join(" ").trim();
}

export async function sendUnassignedProspectCommunicationMessageAction(formData: FormData) {
  const { user } = await requireAdmin();

  const prospectId = getTrimmedValue(formData.get("prospectId"));
  const from = getSafeRedirectPath(
    formData.get("from"),
    prospectId
      ? `/admin/player-prospects/${prospectId}/communications`
      : "/admin/player-prospects",
  );
  const channelInput = getTrimmedValue(formData.get("channel")).toUpperCase();
  const subject = getTrimmedValue(formData.get("subject"));
  const body = getTrimmedValue(formData.get("body"));
  const templateId = getTrimmedValue(formData.get("templateId")) || null;
  const templateKey = getTrimmedValue(formData.get("templateKey")) || null;
  const ctaLabel = getTrimmedValue(formData.get("ctaLabel")) || null;
  const ctaUrl = getTrimmedValue(formData.get("ctaUrl")) || null;

  if (!prospectId) {
    redirect("/admin/player-prospects?error=missing_id");
  }

  if (!body) {
    redirect(`${from}?error=Message%20body%20is%20required.`);
  }

  const prospect = await prisma.teamPlayerProspect.findUnique({
    where: {
      id: prospectId,
    },
    select: {
      id: true,
      teamId: true,
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
    redirect(`/admin/player-prospects?error=Prospect%20not%20found.`);
  }

  const channel =
    channelInput === "SMS" ? NotificationChannel.SMS : NotificationChannel.EMAIL;

  if (channel === NotificationChannel.EMAIL && !subject) {
    redirect(`${from}?error=Email%20subject%20is%20required.`);
  }

  redirectIfUnresolvedTemplatePlaceholder({
    from,
    subject: channel === NotificationChannel.EMAIL ? subject : null,
    body,
  });

  const displayName = getFullName(prospect) || prospect.firstName || "Player prospect";
  const teamName = prospect.team?.name ?? "SIXFL player pool";
  const leagueName = prospect.team?.league
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
      teamId: prospect.teamId,
      prospectId: prospect.id,
      entityType: prospect.teamId ? "TEAM_PROSPECT" : "UNASSIGNED_PLAYER_PROSPECT",
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
            teamName,
            leagueName,
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
      origin: "player_prospect_communications_hub",
      originLabel: "Sent from player prospect communications hub",
      teamId: prospect.teamId,
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
