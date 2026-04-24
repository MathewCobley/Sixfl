// ========================================
// File: src/app/captain/team/[teamid]/squad/send-activation/route.ts
// ========================================

import { NextResponse, type NextRequest } from "next/server";
import { revalidatePath } from "next/cache";
import {
  NotificationAudience,
  NotificationRecipientSourceType,
} from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { requireCaptain } from "@/lib/requireCaptain";
import { normalizePhoneNumber } from "@/lib/messaging/phone";
import { linkQueuedEmailDispatchToThread } from "@/lib/messaging/service";
import { queueNotificationFromTemplate } from "@/lib/notifications/service";

const SQUAD_ACTIVATION_TEMPLATE_KEY = "squad-activation-email";

function getSiteUrl() {
  const fallback = "https://www.sixfl.co.uk";
  const value =
    process.env.NEXT_PUBLIC_SITE_URL?.trim() ||
    process.env.SITE_URL?.trim() ||
    process.env.NEXT_PUBLIC_APP_URL?.trim() ||
    process.env.APP_URL?.trim() ||
    process.env.NEXTAUTH_URL?.trim() ||
    fallback;

  return value.replace(/\/+$/, "");
}

function getSquadRedirectUrl(request: NextRequest, teamid: string, query: string) {
  return new URL(`/captain/team/${teamid}/squad${query}`, request.url);
}

function getDisplayName(input: { firstName: string; lastName: string | null }) {
  return [input.firstName, input.lastName].filter(Boolean).join(" ").trim();
}

function getProspectRecipientSourceId(prospectId: string) {
  return `team-prospect:${prospectId}`;
}

function getJoinUrl(team: { joinSlug: string | null }) {
  return team.joinSlug
    ? `${getSiteUrl()}/teams/join/${team.joinSlug}`
    : `${getSiteUrl()}/register-interest`;
}

function formatPreferredNight(value: string | null | undefined) {
  if (!value || value === "ANY") return null;
  return value.charAt(0).toUpperCase() + value.slice(1).toLowerCase();
}

function getTeamContextLine(team: {
  name: string;
  league: { dayOfWeek: string | null; venueName: string | null } | null;
}) {
  const night = formatPreferredNight(team.league?.dayOfWeek);
  const venueName = team.league?.venueName?.trim();

  if (night && venueName) {
    return `You’ve been added to the ${team.name} squad that plays on a ${night} night at ${venueName}.`;
  }

  if (night) return `You’ve been added to the ${team.name} squad that plays on a ${night} night.`;
  if (venueName) return `You’ve been added to the ${team.name} squad at ${venueName}.`;

  return `You’ve been added to the ${team.name} squad on SIXFL.`;
}

async function ensureProspectNotificationRecipient(input: {
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
  const displayName = getDisplayName(input.prospect);
  const email = input.prospect.email?.trim().toLowerCase() || null;
  const phone = input.prospect.phone?.trim() || null;
  const phoneNormalized = normalizePhoneNumber(phone);

  const recipient = await prisma.notificationRecipient.upsert({
    where: {
      sourceType_sourceId: {
        sourceType: NotificationRecipientSourceType.GENERAL,
        sourceId: getProspectRecipientSourceId(input.prospect.id),
      },
    },
    update: {
      audience: NotificationAudience.PLAYER,
      displayName: displayName || null,
      email,
      emailNormalized: email,
      phone,
      phoneNormalized,
      transactionalEmailOptIn: true,
      transactionalSmsOptIn: true,
      metadata: {
        teamId: input.teamId,
        teamName: input.teamName,
        prospectId: input.prospect.id,
        contactName: displayName || null,
      },
      lastSyncedAt: new Date(),
    },
    create: {
      sourceType: NotificationRecipientSourceType.GENERAL,
      sourceId: getProspectRecipientSourceId(input.prospect.id),
      audience: NotificationAudience.PLAYER,
      displayName: displayName || null,
      email,
      emailNormalized: email,
      phone,
      phoneNormalized,
      transactionalEmailOptIn: true,
      transactionalSmsOptIn: true,
      metadata: {
        teamId: input.teamId,
        teamName: input.teamName,
        prospectId: input.prospect.id,
        contactName: displayName || null,
      },
      lastSyncedAt: new Date(),
    },
  });

  await prisma.notificationPreference.upsert({
    where: { recipientId: recipient.id },
    update: { emailEnabled: true, smsEnabled: true, urgentSmsEnabled: true },
    create: { recipientId: recipient.id, emailEnabled: true, smsEnabled: true, urgentSmsEnabled: true },
  });

  return recipient;
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ teamid: string }> },
) {
  const { teamid } = await context.params;
  const formData = await request.formData();
  const prospectId = String(formData.get("prospectId") ?? "").trim();
  const { user } = await requireCaptain(teamid);

  if (!teamid || !prospectId) {
    return NextResponse.redirect(getSquadRedirectUrl(request, teamid, "?error=Missing%20prospect%20details."));
  }

  const team = await prisma.team.findUnique({
    where: { id: teamid },
    select: {
      id: true,
      name: true,
      logoUrl: true,
      joinSlug: true,
      league: { select: { name: true, dayOfWeek: true, venueName: true } },
      prospects: {
        where: { id: prospectId, status: "ACTIVE_SQUAD" },
        select: { id: true, firstName: true, lastName: true, email: true, phone: true },
      },
    },
  });

  const prospect = team?.prospects[0] ?? null;

  if (!team || !prospect) {
    return NextResponse.redirect(getSquadRedirectUrl(request, teamid, "?error=Pending%20squad%20player%20not%20found."));
  }

  const email = prospect.email?.trim().toLowerCase();

  if (!email) {
    return NextResponse.redirect(getSquadRedirectUrl(request, teamid, "?error=This%20player%20does%20not%20have%20an%20email%20address."));
  }

  const contactName = getDisplayName(prospect);
  const firstName = prospect.firstName.trim() || "there";
  const joinUrl = getJoinUrl(team);

  const recipient = await ensureProspectNotificationRecipient({
    teamId: teamid,
    teamName: team.name,
    prospect,
  });

  const variables = {
    firstName,
    fullName: contactName || firstName,
    teamName: team.name,
    leagueName: team.league?.name ?? "",
    venueName: team.league?.venueName ?? "",
    preferredNight: formatPreferredNight(team.league?.dayOfWeek) ?? "",
    teamContextLine: getTeamContextLine(team),
    teamJoinUrl: joinUrl,
  };

  const dispatch = await queueNotificationFromTemplate({
    templateKey: SQUAD_ACTIVATION_TEMPLATE_KEY,
    recipientId: recipient.id,
    variables,
    sourceType: "TEAM_PLAYER_PROSPECT",
    sourceId: prospect.id,
    emailBranding: {
      teamName: team.name,
      teamLogoUrl: team.logoUrl,
      leagueName: team.league?.name ?? null,
    },
    metadata: {
      origin: "captain_squad_activation_email",
      originLabel: "Activation email sent from captain squad page",
      teamId: teamid,
      prospectId: prospect.id,
      contactName,
      templateKey: SQUAD_ACTIVATION_TEMPLATE_KEY,
    },
    createdByUserId: user?.id ?? null,
  });

  await linkQueuedEmailDispatchToThread({
    notificationDispatchId: dispatch.id,
    recipientId: recipient.id,
    teamId: teamid,
    sourceType: "TEAM_PLAYER_PROSPECT",
    sourceId: prospect.id,
    contactName,
    toEmail: email,
    subject: dispatch.subject ?? `SIXFL squad activation`,
    bodyText: dispatch.bodyText,
    bodyHtml: dispatch.bodyHtml,
    createdByUserId: user?.id ?? null,
  });

  await prisma.teamPlayerProspect.update({
    where: { id: prospect.id },
    data: { lastContactedAt: new Date() },
  });

  revalidatePath(`/captain/team/${teamid}`);
  revalidatePath(`/captain/team/${teamid}/squad`);
  revalidatePath(`/captain/team/${teamid}/prospects`);

  return NextResponse.redirect(getSquadRedirectUrl(request, teamid, "?saved=activation-email-sent"));
}
