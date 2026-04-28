// ========================================
// File: src/app/captain/team/[teamid]/squad/send-activation-sms/route.ts
// ========================================

import { revalidatePath } from "next/cache";
import { NextResponse, type NextRequest } from "next/server";
import {
  NotificationAudience,
  NotificationRecipientSourceType,
} from "@prisma/client";

import { normalizePhoneNumber } from "@/lib/messaging/phone";
import { linkDispatchToThread } from "@/lib/messaging/service";
import { processNotificationQueue } from "@/lib/notifications/processor";
import { prisma } from "@/lib/prisma";
import { requireCaptain } from "@/lib/requireCaptain";
import { queueNotificationFromTemplate } from "@/lib/notifications/service";
import { createSquadActivationToken } from "@/lib/squad/activationToken";

const SQUAD_ACTIVATION_SMS_TEMPLATE_KEY = "squad-activation-sms";

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

function getPublicRequestOrigin(request: NextRequest) {
  const forwardedHost =
    request.headers.get("x-forwarded-host")?.trim() ||
    request.headers.get("host")?.trim() ||
    "";
  const forwardedProto =
    request.headers.get("x-forwarded-proto")?.trim() || "https";

  if (
    forwardedHost &&
    !forwardedHost.includes("localhost") &&
    !forwardedHost.includes("127.0.0.1")
  ) {
    return `${forwardedProto}://${forwardedHost}`.replace(/\/+$/, "");
  }

  return getSiteUrl();
}

function getSquadRedirectUrl(request: NextRequest, teamid: string, query: string) {
  return new URL(
    `/captain/team/${teamid}/squad${query}`,
    getPublicRequestOrigin(request),
  );
}

function getDisplayName(input: { firstName: string; lastName: string | null }) {
  return [input.firstName, input.lastName].filter(Boolean).join(" ").trim();
}

function getProspectRecipientSourceId(prospectId: string) {
  return `team-prospect:${prospectId}`;
}

function getSquadActivationUrl(prospectId: string) {
  const token = createSquadActivationToken(prospectId);
  return `${getSiteUrl()}/squad/activate/${encodeURIComponent(token)}`;
}

async function ensureProspectNotificationRecipient(input: {
  teamId: string;
  teamName: string;
  leagueId: string | null;
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
        leagueId: input.leagueId,
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
        leagueId: input.leagueId,
        prospectId: input.prospect.id,
        contactName: displayName || null,
      },
      lastSyncedAt: new Date(),
    },
  });

  await prisma.notificationPreference.upsert({
    where: { recipientId: recipient.id },
    update: { smsEnabled: true, urgentSmsEnabled: true },
    create: {
      recipientId: recipient.id,
      emailEnabled: true,
      smsEnabled: true,
      urgentSmsEnabled: true,
    },
  });

  return recipient;
}

async function processActivationMessageImmediately() {
  try {
    await processNotificationQueue(10);
  } catch (error) {
    console.error("Failed to process squad activation SMS immediately", error);
  }
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
    return NextResponse.redirect(getSquadRedirectUrl(request, teamid, "?error=Missing%20prospect%20details.#pending-activation"));
  }

  const team = await prisma.team.findUnique({
    where: { id: teamid },
    select: {
      id: true,
      name: true,
      league: { select: { id: true, name: true } },
      prospects: {
        where: { id: prospectId, status: "ACTIVE_SQUAD" },
        select: { id: true, firstName: true, lastName: true, email: true, phone: true },
      },
    },
  });

  const prospect = team?.prospects[0] ?? null;

  if (!team || !prospect) {
    return NextResponse.redirect(getSquadRedirectUrl(request, teamid, "?error=Pending%20squad%20player%20not%20found.#pending-activation"));
  }

  if (!prospect.phone?.trim()) {
    return NextResponse.redirect(getSquadRedirectUrl(request, teamid, "?error=This%20player%20does%20not%20have%20a%20phone%20number.#pending-activation"));
  }

  const contactName = getDisplayName(prospect);
  const firstName = prospect.firstName.trim() || "there";
  const squadActivationUrl = getSquadActivationUrl(prospect.id);

  const recipient = await ensureProspectNotificationRecipient({
    teamId: teamid,
    teamName: team.name,
    leagueId: team.league?.id ?? null,
    prospect,
  });

  const variables = {
    firstName,
    fullName: contactName || firstName,
    teamName: team.name,
    leagueName: team.league?.name ?? "",
    squadActivationUrl,
    teamJoinUrl: squadActivationUrl,
  };

  const dispatch = await queueNotificationFromTemplate({
    templateKey: SQUAD_ACTIVATION_SMS_TEMPLATE_KEY,
    recipientId: recipient.id,
    variables,
    sourceType: "TEAM_PLAYER_PROSPECT",
    sourceId: prospect.id,
    metadata: {
      origin: "captain_squad_activation_sms",
      originLabel: "Activation SMS chase sent from captain squad page",
      teamId: teamid,
      prospectId: prospect.id,
      contactName,
      templateKey: SQUAD_ACTIVATION_SMS_TEMPLATE_KEY,
    },
    createdByUserId: user?.id ?? null,
  });

  await linkDispatchToThread({
    dispatchId: dispatch.id,
    recipientId: recipient.id,
    teamId: teamid,
    leagueId: team.league?.id ?? null,
    sourceType: "TEAM_PLAYER_PROSPECT",
    sourceId: prospect.id,
    contactName,
    phone: prospect.phone,
    body: dispatch.bodyText,
    providerStatus: dispatch.status.toLowerCase(),
    createdByUserId: user?.id ?? null,
  });

  await processActivationMessageImmediately();

  await prisma.teamPlayerProspect.update({
    where: { id: prospect.id },
    data: { lastContactedAt: new Date() },
  });

  revalidatePath(`/captain/team/${teamid}`);
  revalidatePath(`/captain/team/${teamid}/squad`);
  revalidatePath(`/captain/team/${teamid}/prospects`);

  return NextResponse.redirect(
    getSquadRedirectUrl(request, teamid, "?saved=activation-sms-sent#pending-activation"),
  );
}
