// ========================================
// File: src/app/(admin)/admin/leads/[id]/send-team-confirmation/route.ts
// ========================================

import { NextResponse } from "next/server";
import {
  LeadStatus,
  NotificationAudience,
  NotificationChannel,
  NotificationRecipientSourceType,
  Prisma,
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

type LeagueConfirmationEmailDetails = {
  proposedStartDate: Date | null;
  minutesPerGame: number | null;
  costPerTeamPerMatchPence: number | null;
  targetTeamCount: number | null;
};

function getFirstName(value: string | null | undefined) {
  return value?.trim().split(/\s+/)[0] || "there";
}

function getTeamName(input: { teamName: string | null; contactName: string }) {
  return input.teamName?.trim() || `${input.contactName}'s team`;
}

function formatLongDate(value: Date) {
  return new Intl.DateTimeFormat("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
  }).format(value);
}

function isDateInPast(value: Date) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const proposed = new Date(value);
  proposed.setHours(0, 0, 0, 0);

  return proposed.getTime() < today.getTime();
}

function formatCurrencyPence(value: number | null) {
  if (value === null) return "TBC";

  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: "GBP",
    maximumFractionDigits: value % 100 === 0 ? 0 : 2,
  }).format(value / 100);
}

function buildLeagueStartLine(startDate: Date | null) {
  if (!startDate) {
    return "We’re confirming places now and will finalise the start date once the remaining teams are confirmed.";
  }

  const formattedDate = formatLongDate(startDate);

  if (isDateInPast(startDate)) {
    return `The original proposed start date was ${formattedDate}. We’re now confirming the remaining teams before fixtures are finalised.`;
  }

  return `Proposed start date: ${formattedDate}.`;
}

function buildLeagueDetailsBlock(input: {
  leagueName: string;
  venueName?: string | null;
  kickoffInfo?: string | null;
  format?: string | null;
  details: LeagueConfirmationEmailDetails | null;
}) {
  const rows = [
    `League: ${input.leagueName}`,
    input.venueName?.trim() ? `Venue: ${input.venueName.trim()}` : null,
    input.details?.proposedStartDate
      ? `${isDateInPast(input.details.proposedStartDate) ? "Original proposed start date" : "Proposed start date"}: ${formatLongDate(input.details.proposedStartDate)}`
      : null,
    input.kickoffInfo?.trim() ? `Kick-off: ${input.kickoffInfo.trim()}` : null,
    input.details?.minutesPerGame
      ? `Match length: ${input.details.minutesPerGame} minutes`
      : null,
    `Cost: ${formatCurrencyPence(input.details?.costPerTeamPerMatchPence ?? null)} per team per match`,
    input.details?.targetTeamCount
      ? `Number of teams: ${input.details.targetTeamCount}`
      : null,
    input.format?.trim() ? `Format: ${input.format.trim()}` : "Format: Weekly 6-a-side fixtures",
  ];

  return rows.filter(Boolean).join("\n");
}

async function getLeagueConfirmationEmailDetails(leagueId: string | null) {
  if (!leagueId) return null;

  const rows = await prisma.$queryRaw<Array<LeagueConfirmationEmailDetails>>(Prisma.sql`
    SELECT
      "proposedStartDate" AS "proposedStartDate",
      "minutesPerGame"::int AS "minutesPerGame",
      "costPerTeamPerMatchPence"::int AS "costPerTeamPerMatchPence",
      "targetTeamCount"::int AS "targetTeamCount"
    FROM "League"
    WHERE id = ${leagueId}
    LIMIT 1
  `);

  return rows[0] ?? null;
}

function getEmailBody(input: {
  firstName: string;
  leagueName: string;
  leagueStartLine: string;
  leagueDetailsBlock: string;
}) {
  return [
    `Hi ${input.firstName},`,
    "",
    "Thanks for registering interest in joining SIXFL.",
    "",
    `We’re now confirming teams for ${input.leagueName}.",
    "",
    input.leagueStartLine,
    "",
    "Places are filling up quickly, so please confirm whether you would like us to reserve your team’s place.",
    "",
    "League details:",
    "",
    input.leagueDetailsBlock,
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
      leagueId: true,
      league: {
        select: {
          name: true,
          season: true,
          venueName: true,
          kickoffInfo: true,
          format: true,
        },
      },
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
  const leagueDetails = await getLeagueConfirmationEmailDetails(lead.leagueId ?? null);
  const leagueName = lead.league
    ? `${lead.league.name}${lead.league.season ? ` · ${lead.league.season}` : ""}`
    : "your SIXFL league";
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
    subject: `Confirm your ${leagueName} place`,
    body: getEmailBody({
      firstName: getFirstName(lead.contactName),
      leagueName,
      leagueStartLine: buildLeagueStartLine(leagueDetails?.proposedStartDate ?? null),
      leagueDetailsBlock: buildLeagueDetailsBlock({
        leagueName,
        venueName: lead.league?.venueName,
        kickoffInfo: lead.league?.kickoffInfo,
        format: lead.league?.format,
        details: leagueDetails,
      }),
    }),
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
      leagueName,
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
