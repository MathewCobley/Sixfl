// ========================================
// File: src/app/(admin)/admin/leads/[id]/send-team-confirmation/route.ts
// ========================================

import { NextResponse } from "next/server";
import {
  LeadStatus,
  NotificationAudience,
  NotificationChannel,
  NotificationRecipientSourceType,
} from "@prisma/client";

import { logNotificationDispatchToThread } from "@/lib/communications/log-dispatch";
import {
  ensureTeamPlaceConfirmationRecord,
  TEAM_PLACE_CONFIRMATION_CTA_LABEL,
} from "@/lib/leads/teamPlaceConfirmation";
import { queueDirectNotification } from "@/lib/notifications/service";
import { upsertNotificationRecipient } from "@/lib/notifications/recipients";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/requireAdmin";

export const dynamic = "force-dynamic";

function getFirstName(value: string | null | undefined) {
  return value?.trim().split(/\s+/)[0] || "there";
}

function getTeamName(input: { teamName: string | null; contactName: string }) {
  return input.teamName?.trim() || `${input.contactName}'s team`;
}

function getEmailBody(input: {
  firstName: string;
  teamName: string;
}) {
  return [
    `Hi ${input.firstName},`,
    "",
    "Thanks for registering interest in joining SIXFL.",
    "",
    "We’re now confirming teams for the new league starting on Tuesday 8 July.",
    "",
    "Places are filling up quickly, so please confirm whether you would like us to reserve your team’s place.",
    "",
    "League details:",
    "",
    "Start date: Tuesday 8 July",
    "Match length: 40 minutes",
    "Cost: £40 per team per match",
    "Format: Weekly 6-a-side fixtures",
    "",
    "Please confirm your place using the button below.",
    "",
    "Once confirmed, we’ll include your team in fixture planning and send the next steps.",
    "",
    "If you’re no longer looking to join, no problem — reply NO and we’ll release the space to another team.",
    "",
    "We’d love to have you involved.",
  ].join("\n");
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { user } = await requireAdmin();
  const { id } = await params;
  const requestUrl = new URL(request.url);

  const lead = await prisma.interestLead.findUnique({
    where: { id },
    select: {
      id: true,
      interestType: true,
      status: true,
      contactName: true,
      teamName: true,
      email: true,
    },
  });

  if (!lead) {
    return NextResponse.redirect(new URL("/admin/leads?error=Lead%20not%20found", requestUrl.origin));
  }

  if (lead.interestType !== "TEAM") {
    return NextResponse.redirect(new URL(`/admin/leads/${lead.id}?error=Only%20team%20leads%20can%20receive%20this%20confirmation`, requestUrl.origin));
  }

  const email = lead.email?.trim().toLowerCase();

  if (!email) {
    return NextResponse.redirect(new URL(`/admin/leads/${lead.id}?error=This%20lead%20needs%20an%20email%20address`, requestUrl.origin));
  }

  const confirmation = await ensureTeamPlaceConfirmationRecord(lead.id);
  const teamName = getTeamName(lead);
  const recipient = await upsertNotificationRecipient({
    sourceType: NotificationRecipientSourceType.LEAD,
    sourceId: lead.id,
    audience: NotificationAudience.LEAD,
    displayName: lead.contactName || teamName,
    email,
    transactionalEmailOptIn: true,
    marketingEmailOptIn: true,
    metadata: {
      leadId: lead.id,
      teamName,
      entityType: "TEAM_LEAD_CONFIRMATION",
    },
  });

  const dispatch = await queueDirectNotification({
    recipientId: recipient.id,
    channel: NotificationChannel.EMAIL,
    audience: NotificationAudience.LEAD,
    subject: "Confirm your SIXFL league place — starts 8 July",
    body: getEmailBody({ firstName: getFirstName(lead.contactName), teamName }),
    isTransactional: true,
    sourceType: "LEAD_TEAM_CONFIRMATION",
    sourceId: lead.id,
    emailCta: {
      label: TEAM_PLACE_CONFIRMATION_CTA_LABEL,
      url: confirmation.url,
    },
    metadata: {
      origin: "single_team_place_confirmation",
      originLabel: "Team place confirmation email",
      leadId: lead.id,
      teamName,
      ctaUrl: confirmation.url,
    },
    createdByUserId: user?.id ?? null,
  });

  await logNotificationDispatchToThread({ dispatch, recipient });

  if (lead.status === LeadStatus.NEW) {
    await prisma.interestLead.update({
      where: { id: lead.id },
      data: {
        status: LeadStatus.CONTACTED,
        contactedAt: new Date(),
      },
    });
  }

  return NextResponse.redirect(new URL(`/admin/leads/${lead.id}?teamConfirmationSent=1`, requestUrl.origin));
}
