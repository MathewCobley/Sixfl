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
import { upsertTeamNotificationRecipient } from "@/lib/notifications/team-contacts";
import { upsertNotificationRecipient } from "@/lib/notifications/recipients";
import { getPhoneDisplayValue } from "@/lib/notifications/phone";
import { queueDirectNotification } from "@/lib/notifications/service";
import { logNotificationDispatchToThread } from "@/lib/communications/log-dispatch";

function getTrimmedValue(value: FormDataEntryValue | null) {
  return String(value ?? "").trim();
}

function getSafeRedirectPath(value: FormDataEntryValue | null, fallback: string) {
  const text = String(value ?? "").trim();
  return text || fallback;
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

  const { recipient } = await upsertTeamNotificationRecipient(teamId);

  if (channel === NotificationChannel.EMAIL && !recipient.email?.trim()) {
    redirect(`${from}?error=This%20team%20does%20not%20have%20an%20email%20address.`);
  }

  if (channel === NotificationChannel.SMS && !recipient.phone?.trim()) {
    redirect(`${from}?error=This%20team%20does%20not%20have%20a%20mobile%20number.`);
  }

  const dispatch = await queueDirectNotification({
    recipientId: recipient.id,
    channel,
    audience: NotificationAudience.TEAM,
    subject: channel === NotificationChannel.EMAIL ? subject : null,
    body,
    isTransactional: true,
    sourceType: "TEAM",
    sourceId: teamId,
    metadata: {
      origin: "team_communications_hub",
      originLabel: "Sent from communications hub",
      teamId,
    },
    createdByUserId: user?.id ?? null,
  });

  await logNotificationDispatchToThread({
    dispatch,
    recipient,
  });

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
    metadata: {
      origin: "prospect_communications_hub",
      originLabel: "Sent from communications hub",
      teamId,
      prospectId: prospect.id,
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
      status: prospect.email || prospect.phone ? "CONTACTED" : undefined,
      lastContactedAt: new Date(),
    },
  });

  redirect(`${from}?saved=queued&channel=${channel.toLowerCase()}`);
}
