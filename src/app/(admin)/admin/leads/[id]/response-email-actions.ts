// ========================================
// File: src/app/(admin)/admin/leads/[id]/response-email-actions.ts
// ========================================

"use server";

import { revalidatePath } from "next/cache";
import {
  LeadStatus,
  NotificationAudience,
  NotificationChannel,
  NotificationRecipientSourceType,
  NotificationTemplateKind,
  Prisma,
} from "@prisma/client";

import { sendLeadEmailAction } from "@/app/(admin)/admin/leads/[id]/actions";
import { logNotificationDispatchToThread } from "@/lib/communications/log-dispatch";
import {
  ensureTeamPlaceConfirmationRecord,
  TEAM_PLACE_CONFIRMATION_CTA_LABEL,
} from "@/lib/leads/teamPlaceConfirmation";
import { buildLeadResponseUrls } from "@/lib/leads/responseLinks";
import { queueNotificationFromTemplate } from "@/lib/notifications/service";
import { upsertNotificationRecipient } from "@/lib/notifications/recipients";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/requireAdmin";

const YES_RESPONSE_TOKEN = "{{yesResponseUrl}}";
const NO_RESPONSE_TOKEN = "{{noResponseUrl}}";
const TEAM_PLACE_CONFIRMATION_SYSTEM_TEMPLATE_KEY = "team-place-confirmation-email";

const TEAM_PLACE_CONFIRMATION_BODY = [
  "Hi {{firstName}},",
  "",
  "Thanks for registering interest in joining SIXFL.",
  "",
  "We’re now confirming teams for {{leagueName}}.",
  "",
  "{{leagueStartLine}}",
  "",
  "Places are filling up quickly, so please confirm whether you would like us to reserve your team’s place.",
  "",
  "League details:",
  "",
  "{{leagueDetailsBlock}}",
  "",
  "Please confirm your place using the button below.",
  "",
  "Once you’ve reserved your place, we’ll ask you to confirm your team name. If you haven’t decided on one yet, you can add it later.",
  "",
  "{{cta}}",
  "",
  "Reserving a place does not create the team automatically. SIXFL will review the details and set the team up manually when everything is ready.",
  "",
  "If you’re no longer looking to join, no problem — reply NO and we’ll release the space to another team.",
  "",
  "We’d love to have you involved.",
].join("\n");

type LeagueConfirmationEmailDetails = {
  proposedStartDate: Date | null;
  minutesPerGame: number | null;
  costPerTeamPerMatchPence: number | null;
  targetTeamCount: number | null;
};

function replaceLeadResponseTokens(value: string, leadId: string) {
  const urls = buildLeadResponseUrls(leadId);

  return value
    .replaceAll(YES_RESPONSE_TOKEN, urls.yesResponseUrl)
    .replaceAll(NO_RESPONSE_TOKEN, urls.noResponseUrl)
    .replace(
      /(YES,\s*I still want to play:)\s*(?:\n|$)/i,
      `$1 ${urls.yesResponseUrl}\n`,
    )
    .replace(
      /(NO,\s*remove me from the squad list:)\s*(?:\n|$)/i,
      `$1 ${urls.noResponseUrl}\n`,
    );
}

function getFirstName(value: string | null | undefined) {
  return value?.trim().split(/\s+/)[0] || "there";
}

function formatLongDate(value: Date) {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/London",
    weekday: "long",
    day: "numeric",
    month: "long",
  }).format(value);
}

function getUkDateKey(value: Date) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/London",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(value);

  const year = parts.find((part) => part.type === "year")?.value ?? "0000";
  const month = parts.find((part) => part.type === "month")?.value ?? "00";
  const day = parts.find((part) => part.type === "day")?.value ?? "00";

  return `${year}-${month}-${day}`;
}

function getStartDateTiming(value: Date) {
  const startDateKey = getUkDateKey(value);
  const todayKey = getUkDateKey(new Date());

  if (startDateKey === todayKey) return "today";
  return startDateKey < todayKey ? "past" : "future";
}

function formatVenueName(value: string | null | undefined) {
  const venueName = value?.trim();

  if (!venueName || venueName.toUpperCase() === "TBC") {
    return "To be confirmed";
  }

  return venueName;
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
  const timing = getStartDateTiming(startDate);

  if (timing === "future") {
    return `This league is due to start on ${formattedDate}. We’re currently confirming teams for the remaining available places.`;
  }

  if (timing === "today") {
    return `This league is due to start today (${formattedDate}). We’re currently confirming teams for the remaining available places.`;
  }

  return `The proposed start date was ${formattedDate}. We’re currently confirming teams for the remaining available places.`;
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
    `Venue: ${formatVenueName(input.venueName)}`,
    input.details?.proposedStartDate
      ? `Proposed start date: ${formatLongDate(input.details.proposedStartDate)}`
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

async function ensureTeamPlaceConfirmationSystemTemplate() {
  return prisma.notificationTemplate.upsert({
    where: { key: TEAM_PLACE_CONFIRMATION_SYSTEM_TEMPLATE_KEY },
    update: {
      name: "Team place confirmation email",
      description:
        "System email asking a team lead to confirm a specific league place before fixtures are created.",
      kind: NotificationTemplateKind.TRANSACTIONAL,
      channel: NotificationChannel.EMAIL,
      audience: NotificationAudience.LEAD,
      subject: "Confirm your {{leagueName}} place",
      body: TEAM_PLACE_CONFIRMATION_BODY,
      ctaLabel: TEAM_PLACE_CONFIRMATION_CTA_LABEL,
      ctaUrlKey: "teamConfirmationUrl",
      isActive: true,
    },
    create: {
      key: TEAM_PLACE_CONFIRMATION_SYSTEM_TEMPLATE_KEY,
      name: "Team place confirmation email",
      description:
        "System email asking a team lead to confirm a specific league place before fixtures are created.",
      kind: NotificationTemplateKind.TRANSACTIONAL,
      channel: NotificationChannel.EMAIL,
      audience: NotificationAudience.LEAD,
      subject: "Confirm your {{leagueName}} place",
      body: TEAM_PLACE_CONFIRMATION_BODY,
      ctaLabel: TEAM_PLACE_CONFIRMATION_CTA_LABEL,
      ctaUrlKey: "teamConfirmationUrl",
      isActive: true,
    },
  });
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

export async function sendLeadEmailWithResponseLinksAction(formData: FormData) {
  const leadId = String(formData.get("leadId") ?? "").trim();

  if (!leadId) {
    return { ok: false, error: "Missing lead id." };
  }

  const nextFormData = new FormData();

  for (const [key, value] of formData.entries()) {
    if (key === "subject" || key === "body") {
      nextFormData.set(key, replaceLeadResponseTokens(String(value), leadId));
    } else {
      nextFormData.set(key, value);
    }
  }

  return sendLeadEmailAction(nextFormData);
}

export async function sendTeamPlaceConfirmationSystemEmailAction(formData: FormData) {
  const { user } = await requireAdmin();
  const leadId = String(formData.get("leadId") ?? "").trim();

  if (!leadId) {
    return { ok: false, error: "Missing lead id." };
  }

  await ensureTeamPlaceConfirmationSystemTemplate();

  const lead = await prisma.interestLead.findUnique({
    where: { id: leadId },
    select: {
      id: true,
      interestType: true,
      status: true,
      contactName: true,
      email: true,
      phone: true,
      area: true,
      teamName: true,
      leagueId: true,
      league: {
        select: {
          id: true,
          name: true,
          season: true,
          venueName: true,
          kickoffInfo: true,
          format: true,
          competition: {
            select: {
              currentLeague: {
                select: {
                  id: true,
                  name: true,
                  season: true,
                  venueName: true,
                  kickoffInfo: true,
                  format: true,
                },
              },
            },
          },
        },
      },
    },
  });

  if (!lead) {
    return { ok: false, error: "Lead not found." };
  }

  if (lead.interestType !== "TEAM") {
    return { ok: false, error: "Only team leads can receive the team confirmation email." };
  }

  const email = lead.email?.trim().toLowerCase();

  if (!email) {
    return { ok: false, error: "This lead does not have an email address." };
  }

  if (!lead.leagueId || !lead.league) {
    return {
      ok: false,
      error: "Set a prospective league on this lead before sending the confirmation email.",
    };
  }

  const effectiveLeague = lead.league.competition?.currentLeague ?? lead.league;
  const effectiveLeagueId = effectiveLeague.id;
  const originalLeadLeagueId = lead.leagueId;

  const confirmation = await ensureTeamPlaceConfirmationRecord(lead.id);
  const leagueDetails = await getLeagueConfirmationEmailDetails(effectiveLeagueId);
  const leagueName = `${effectiveLeague.name}${effectiveLeague.season ? ` · ${effectiveLeague.season}` : ""}`;
  const venueName = formatVenueName(effectiveLeague.venueName);
  const displayName = lead.contactName?.trim() || lead.teamName?.trim() || email;

  const recipient = await upsertNotificationRecipient({
    sourceType: NotificationRecipientSourceType.LEAD,
    sourceId: lead.id,
    audience: NotificationAudience.LEAD,
    displayName,
    email,
    phone: lead.phone,
    transactionalEmailOptIn: true,
    marketingEmailOptIn: true,
    metadata: {
      leadId: lead.id,
      leagueId: effectiveLeagueId,
      originalLeadLeagueId,
      leagueName,
      teamName: lead.teamName,
      contactName: lead.contactName,
      entityType: "TEAM_LEAD_CONFIRMATION",
    },
  });

  const variables = {
    firstName: getFirstName(lead.contactName),
    fullName: lead.contactName?.trim() || "",
    contactName: lead.contactName?.trim() || "",
    teamName: lead.teamName?.trim() || "",
    area: lead.area?.trim() || "",
    leagueName,
    venueName,
    kickoffInfo: effectiveLeague.kickoffInfo?.trim() || "",
    format: effectiveLeague.format?.trim() || "Weekly 6-a-side fixtures",
    proposedStartDate: leagueDetails?.proposedStartDate
      ? formatLongDate(leagueDetails.proposedStartDate)
      : "",
    leagueStartLine: buildLeagueStartLine(leagueDetails?.proposedStartDate ?? null),
    minutesPerGame: leagueDetails?.minutesPerGame ? String(leagueDetails.minutesPerGame) : "TBC",
    costPerTeamPerMatch: formatCurrencyPence(leagueDetails?.costPerTeamPerMatchPence ?? null),
    targetTeamCount: leagueDetails?.targetTeamCount ? String(leagueDetails.targetTeamCount) : "",
    targetTeamCountLine: leagueDetails?.targetTeamCount
      ? `Number of teams: ${leagueDetails.targetTeamCount}`
      : "",
    leagueDetailsBlock: buildLeagueDetailsBlock({
      leagueName,
      venueName,
      kickoffInfo: effectiveLeague.kickoffInfo,
      format: effectiveLeague.format,
      details: leagueDetails,
    }),
    teamConfirmationUrl: confirmation.url,
  };

  try {
    const dispatch = await queueNotificationFromTemplate({
      templateKey: TEAM_PLACE_CONFIRMATION_SYSTEM_TEMPLATE_KEY,
      recipientId: recipient.id,
      variables,
      sourceType: "LEAD_TEAM_CONFIRMATION",
      sourceId: lead.id,
      metadata: {
        origin: "lead_system_team_confirmation",
        originLabel: "Team place confirmation email",
        leadId: lead.id,
        leagueId: effectiveLeagueId,
        originalLeadLeagueId,
        leagueName,
        teamName: lead.teamName,
        ctaUrl: confirmation.url,
      },
      createdByUserId: user?.id ?? null,
    });

    await logNotificationDispatchToThread({ dispatch, recipient });

    await prisma.interestLeadEmail.create({
      data: {
        interestLeadId: lead.id,
        subject: dispatch.subject ?? `Confirm your ${leagueName} place`,
        body: dispatch.bodyText,
        sentTo: email,
      },
    });

    if (lead.status === LeadStatus.NEW) {
      await prisma.interestLead.update({
        where: { id: lead.id },
        data: {
          status: LeadStatus.CONTACTED,
          contactedAt: new Date(),
        },
      });
    }

    revalidatePath("/admin/leads");
    revalidatePath(`/admin/leads/${lead.id}`);
    revalidatePath("/admin/messaging");

    return { ok: true, dispatchId: dispatch.id, status: dispatch.status };
  } catch (error) {
    console.error("sendTeamPlaceConfirmationSystemEmailAction error", error);

    return {
      ok: false,
      error:
        error instanceof Error
          ? error.message
          : "The confirmation email could not be queued.",
    };
  }
}
