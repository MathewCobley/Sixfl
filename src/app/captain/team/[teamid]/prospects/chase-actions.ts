// ========================================
// File: src/app/captain/team/[teamid]/prospects/chase-actions.ts
// ========================================

"use server";

import { NotificationAudience, NotificationChannel } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { linkDispatchToThread, linkQueuedEmailDispatchToThread } from "@/lib/messaging/service";
import { normalizePhoneNumber } from "@/lib/messaging/phone";
import { queueDirectNotification } from "@/lib/notifications/service";
import { prisma } from "@/lib/prisma";
import { requireCaptain } from "@/lib/requireCaptain";
import { createPlayerInterestResponseToken } from "@/lib/player-interest/response-token";

function getString(formData: FormData, key: string) {
  return String(formData.get(key) ?? "").trim();
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

function prospectName(prospect: { firstName: string; lastName: string | null }) {
  return [prospect.firstName, prospect.lastName].filter(Boolean).join(" ").trim() || prospect.firstName;
}

function responseUrl(input: {
  teamId: string;
  prospectId: string;
  answer: "yes" | "no";
}) {
  const token = createPlayerInterestResponseToken({
    teamId: input.teamId,
    recipientType: "prospect",
    recipientId: input.prospectId,
    expiresInDays: 21,
  });

  return `${getSiteUrl()}/player-response/${input.answer}?token=${encodeURIComponent(token)}`;
}

async function ensureProspectRecipient(input: {
  teamId: string;
  teamName: string;
  prospect: {
    id: string;
    firstName: string;
    lastName: string | null;
    email: string | null;
    phone: string | null;
  };
}) {
  const displayName = prospectName(input.prospect);
  const email = input.prospect.email?.trim().toLowerCase() || null;
  const phone = input.prospect.phone?.trim() || null;
  const phoneNormalized = normalizePhoneNumber(phone);

  const recipient = await prisma.notificationRecipient.upsert({
    where: {
      sourceType_sourceId: {
        sourceType: "GENERAL",
        sourceId: `team-prospect:${input.prospect.id}`,
      },
    },
    update: {
      audience: NotificationAudience.PLAYER,
      displayName,
      email,
      emailNormalized: email,
      phone,
      phoneNormalized,
      transactionalEmailOptIn: true,
      marketingEmailOptIn: true,
      transactionalSmsOptIn: true,
      marketingSmsOptIn: true,
      metadata: {
        teamId: input.teamId,
        teamName: input.teamName,
        prospectId: input.prospect.id,
        contactName: displayName,
      },
      lastSyncedAt: new Date(),
    },
    create: {
      sourceType: "GENERAL",
      sourceId: `team-prospect:${input.prospect.id}`,
      audience: NotificationAudience.PLAYER,
      displayName,
      email,
      emailNormalized: email,
      phone,
      phoneNormalized,
      transactionalEmailOptIn: true,
      marketingEmailOptIn: true,
      transactionalSmsOptIn: true,
      marketingSmsOptIn: true,
      metadata: {
        teamId: input.teamId,
        teamName: input.teamName,
        prospectId: input.prospect.id,
        contactName: displayName,
      },
      lastSyncedAt: new Date(),
    },
  });

  await prisma.notificationPreference.upsert({
    where: { recipientId: recipient.id },
    update: {
      emailEnabled: true,
      smsEnabled: true,
      urgentSmsEnabled: true,
      marketingEmailEnabled: true,
      marketingSmsEnabled: true,
    },
    create: {
      recipientId: recipient.id,
      emailEnabled: true,
      smsEnabled: true,
      urgentSmsEnabled: true,
      marketingEmailEnabled: true,
      marketingSmsEnabled: true,
    },
  });

  return recipient;
}

function appendNote(existingNotes: string | null, line: string) {
  const existing = existingNotes?.trim();
  if (!existing) return line;
  if (existing.includes(line)) return existing;
  return `${existing}\n${line}`;
}

export async function sendProspectInterestChaseAction(formData: FormData) {
  const teamid = getString(formData, "teamid");
  const prospectId = getString(formData, "prospectId");
  const { user } = await requireCaptain(teamid);

  if (!teamid || !prospectId) redirect("/captain");

  const [team, prospect] = await Promise.all([
    prisma.team.findUnique({
      where: { id: teamid },
      select: { id: true, name: true },
    }),
    prisma.teamPlayerProspect.findFirst({
      where: { id: prospectId, teamId: teamid },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        email: true,
        phone: true,
        notes: true,
        status: true,
      },
    }),
  ]);

  if (!team || !prospect) {
    redirect(`/captain/team/${teamid}/prospects?error=Prospect%20not%20found.`);
  }

  const hasPhone = Boolean(prospect.phone?.trim());
  const hasEmail = Boolean(prospect.email?.trim());

  if (!hasPhone && !hasEmail) {
    redirect(`/captain/team/${teamid}/prospects?error=Add%20a%20phone%20or%20email%20before%20chasing%20this%20prospect.`);
  }

  const name = prospectName(prospect);
  const firstName = prospect.firstName?.trim() || "there";
  const yesUrl = responseUrl({ teamId: teamid, prospectId: prospect.id, answer: "yes" });
  const noUrl = responseUrl({ teamId: teamid, prospectId: prospect.id, answer: "no" });
  const recipient = await ensureProspectRecipient({ teamId: teamid, teamName: team.name, prospect });
  const now = new Date();
  const channel = hasPhone ? NotificationChannel.SMS : NotificationChannel.EMAIL;

  if (channel === NotificationChannel.SMS) {
    const body = `Hi ${firstName}, are you still interested in playing for ${team.name}? YES: ${yesUrl} NO: ${noUrl}`;
    const dispatch = await queueDirectNotification({
      recipientId: recipient.id,
      channel: NotificationChannel.SMS,
      audience: NotificationAudience.PLAYER,
      body,
      isTransactional: false,
      sourceType: "TEAM_PLAYER_PROSPECT",
      sourceId: prospect.id,
      metadata: {
        origin: "captain_prospect_yes_no_chase",
        originLabel: "YES/NO prospect chase from captain hub",
        teamId: teamid,
        prospectId: prospect.id,
        contactName: name,
      },
      createdByUserId: user?.id ?? null,
    });

    await linkDispatchToThread({
      dispatchId: dispatch.id,
      recipientId: recipient.id,
      teamId: teamid,
      sourceType: "TEAM_PLAYER_PROSPECT",
      sourceId: prospect.id,
      contactName: name,
      phone: prospect.phone,
      body: dispatch.bodyText,
      providerStatus: "queued",
      createdByUserId: user?.id ?? null,
      sentAt: null,
    });
  } else {
    const subject = `Still interested in playing for ${team.name}?`;
    const body = `Hi ${firstName},\n\nJust checking whether you are still interested in playing for ${team.name}.\n\nTap one option so we know what to do next:\n\nYES, I still want to play:\n${yesUrl}\n\nNO, not anymore:\n${noUrl}\n\nThanks,\n${team.name}`;
    const dispatch = await queueDirectNotification({
      recipientId: recipient.id,
      channel: NotificationChannel.EMAIL,
      audience: NotificationAudience.PLAYER,
      subject,
      body,
      isTransactional: false,
      sourceType: "TEAM_PLAYER_PROSPECT",
      sourceId: prospect.id,
      metadata: {
        origin: "captain_prospect_yes_no_chase",
        originLabel: "YES/NO prospect chase from captain hub",
        teamId: teamid,
        prospectId: prospect.id,
        contactName: name,
      },
      createdByUserId: user?.id ?? null,
    });

    await linkQueuedEmailDispatchToThread({
      notificationDispatchId: dispatch.id,
      recipientId: recipient.id,
      teamId: teamid,
      sourceType: "TEAM_PLAYER_PROSPECT",
      sourceId: prospect.id,
      contactName: name,
      toEmail: prospect.email,
      subject: dispatch.subject ?? subject,
      bodyText: dispatch.bodyText,
      bodyHtml: dispatch.bodyHtml,
      createdByUserId: user?.id ?? null,
    });
  }

  const stamp = new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(now);

  await prisma.teamPlayerProspect.update({
    where: { id: prospect.id },
    data: {
      lastContactedAt: now,
      status: prospect.status === "NEW" ? "CONTACTED" : prospect.status,
      notes: appendNote(
        prospect.notes,
        `YES/NO nudge sent by ${user?.email ?? "SIXFL"} via ${channel} on ${stamp}.`,
      ),
    },
  });

  revalidatePath(`/captain/team/${teamid}/prospects`);
  redirect(`/captain/team/${teamid}/prospects?saved=interest-chase-sent`);
}
