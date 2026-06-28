// ========================================
// File: src/app/(admin)/admin/leads/team-confirmation-bulk-action.ts
// ========================================

"use server";

import {
  InterestType,
  LeadStatus,
  NotificationAudience,
  NotificationChannel,
  NotificationRecipientSourceType,
  PreferredNight,
  Prisma,
} from "@prisma/client";

import { logNotificationDispatchToThread } from "@/lib/communications/log-dispatch";
import {
  buildBaseEmailTemplateContext,
  mergeEmailTemplateContext,
  resolveTemplateText,
} from "@/lib/email/template-context";
import {
  ensureTeamPlaceConfirmationRecord,
  TEAM_PLACE_CONFIRMATION_CTA_LABEL,
} from "@/lib/leads/teamPlaceConfirmation";
import { queueDirectNotification } from "@/lib/notifications/service";
import { upsertNotificationRecipient } from "@/lib/notifications/recipients";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/requireAdmin";

type BulkEmailActionState = {
  ok?: boolean;
  error?: string;
  sentCount?: number;
  failedCount?: number;
};

type LeagueConfirmationEmailDetails = {
  leagueId: string;
  proposedStartDate: Date | null;
  minutesPerGame: number | null;
  costPerTeamPerMatchPence: number | null;
  targetTeamCount: number | null;
};

function isLeadStatus(value: string): value is LeadStatus {
  return (
    value === "NEW" ||
    value === "CONTACTED" ||
    value === "QUALIFIED" ||
    value === "CLOSED"
  );
}

function isInterestType(value: string): value is InterestType {
  return value === "TEAM" || value === "PLAYER" || value === "REFEREE";
}

function isPreferredNight(value: string): value is PreferredNight {
  return (
    value === "MONDAY" ||
    value === "TUESDAY" ||
    value === "WEDNESDAY" ||
    value === "THURSDAY" ||
    value === "FRIDAY" ||
    value === "SATURDAY" ||
    value === "SUNDAY" ||
    value === "ANY"
  );
}

function getIncludedLeadIds(formData: FormData) {
  return formData
    .getAll("includedLeadIds")
    .map((value) => String(value).trim())
    .filter(Boolean);
}

function getLeadFilterWhere(formData: FormData) {
  const selectedTypeRaw = String(formData.get("selectedType") ?? "")
    .trim()
    .toUpperCase();
  const selectedStatusRaw = String(formData.get("selectedStatus") ?? "")
    .trim()
    .toUpperCase();
  const selectedArea = String(formData.get("selectedArea") ?? "").trim();
  const selectedNightRaw = String(formData.get("selectedNight") ?? "")
    .trim()
    .toUpperCase();
  const includedLeadIds = getIncludedLeadIds(formData);

  return {
    ...(selectedTypeRaw && isInterestType(selectedTypeRaw)
      ? { interestType: selectedTypeRaw }
      : { interestType: InterestType.TEAM }),
    ...(selectedStatusRaw && isLeadStatus(selectedStatusRaw)
      ? { status: selectedStatusRaw }
      : {}),
    ...(selectedArea ? { area: selectedArea } : {}),
    ...(selectedNightRaw && isPreferredNight(selectedNightRaw)
      ? {
          preferredNights: {
            some: {
              night: selectedNightRaw,
            },
          },
        }
      : {}),
    email: {
      not: null,
    },
    leagueId: {
      not: null,
    },
    ...(includedLeadIds.length > 0
      ? {
          id: {
            in: includedLeadIds,
          },
        }
      : {}),
  } satisfies Prisma.InterestLeadWhereInput;
}

function getFirstName(value: string | null | undefined) {
  return value?.trim().split(/\s+/)[0] || "there";
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
  details?: LeagueConfirmationEmailDetails | null;
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

async function getLeagueDetailsById(leagueIds: string[]) {
  if (leagueIds.length === 0) return new Map<string, LeagueConfirmationEmailDetails>();

  const rows = await prisma.$queryRaw<Array<LeagueConfirmationEmailDetails>>(Prisma.sql`
    SELECT
      "id" AS "leagueId",
      "proposedStartDate" AS "proposedStartDate",
      "minutesPerGame"::int AS "minutesPerGame",
      "costPerTeamPerMatchPence"::int AS "costPerTeamPerMatchPence",
      "targetTeamCount"::int AS "targetTeamCount"
    FROM "League"
    WHERE "id" IN (${Prisma.join(leagueIds)})
  `);

  return new Map(rows.map((row) => [row.leagueId, row]));
}

function buildTemplateContext(input: {
  contactName: string;
  area: string | null;
  teamName: string | null;
  leagueName: string;
  venueName: string | null;
  kickoffInfo: string | null;
  format: string | null;
  details: LeagueConfirmationEmailDetails | null;
}) {
  const firstName = getFirstName(input.contactName);
  const fullName = input.contactName?.trim() || firstName;

  return mergeEmailTemplateContext(
    buildBaseEmailTemplateContext({
      firstName,
      fullName,
      area: input.area,
      teamName: input.teamName,
    }),
    {
      leagueName: input.leagueName,
      venueName: input.venueName?.trim() || "TBC",
      kickoffInfo: input.kickoffInfo?.trim() || "",
      format: input.format?.trim() || "Weekly 6-a-side fixtures",
      proposedStartDate: input.details?.proposedStartDate
        ? formatLongDate(input.details.proposedStartDate)
        : "",
      leagueStartLine: buildLeagueStartLine(input.details?.proposedStartDate ?? null),
      minutesPerGame: input.details?.minutesPerGame ? String(input.details.minutesPerGame) : "TBC",
      costPerTeamPerMatch: formatCurrencyPence(input.details?.costPerTeamPerMatchPence ?? null),
      targetTeamCount: input.details?.targetTeamCount ? String(input.details.targetTeamCount) : "",
      targetTeamCountLine: input.details?.targetTeamCount
        ? `Number of teams: ${input.details.targetTeamCount}`
        : "",
      leagueDetailsBlock: buildLeagueDetailsBlock({
        leagueName: input.leagueName,
        venueName: input.venueName,
        kickoffInfo: input.kickoffInfo,
        format: input.format,
        details: input.details,
      }),
    },
  );
}

export async function sendBulkTeamPlaceConfirmationEmailAction(
  _prevState: BulkEmailActionState,
  formData: FormData,
): Promise<BulkEmailActionState> {
  const { user } = await requireAdmin();

  const subject = String(formData.get("subject") ?? "").trim();
  const body = String(formData.get("body") ?? "").trim();
  const ctaLabel =
    String(formData.get("ctaLabel") ?? "").trim() || TEAM_PLACE_CONFIRMATION_CTA_LABEL;

  if (!subject) {
    return { ok: false, error: "Please enter a subject." };
  }

  if (!body) {
    return { ok: false, error: "Please enter a message." };
  }

  const leads = await prisma.interestLead.findMany({
    where: getLeadFilterWhere(formData),
    select: {
      id: true,
      email: true,
      status: true,
      contactName: true,
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
        },
      },
    },
  });

  const eligibleLeads = leads.filter((lead) => lead.email?.trim() && lead.leagueId && lead.league);

  if (eligibleLeads.length === 0) {
    return {
      ok: false,
      error:
        "No selected team leads have both an email address and a prospective league. Set the prospective league on each lead before sending this confirmation email.",
    };
  }

  const leagueDetailsById = await getLeagueDetailsById(
    Array.from(new Set(eligibleLeads.map((lead) => lead.leagueId).filter(Boolean))) as string[],
  );

  let sentCount = 0;
  let failedCount = leads.length - eligibleLeads.length;

  for (const lead of eligibleLeads) {
    try {
      const email = lead.email?.trim().toLowerCase();

      if (!email || !lead.league || !lead.leagueId) {
        failedCount += 1;
        continue;
      }

      const confirmation = await ensureTeamPlaceConfirmationRecord(lead.id);
      const leagueName = `${lead.league.name}${lead.league.season ? ` · ${lead.league.season}` : ""}`;
      const context = buildTemplateContext({
        contactName: lead.contactName,
        area: lead.area,
        teamName: lead.teamName,
        leagueName,
        venueName: lead.league.venueName,
        kickoffInfo: lead.league.kickoffInfo,
        format: lead.league.format,
        details: leagueDetailsById.get(lead.leagueId) ?? null,
      });
      const personalisedSubject = resolveTemplateText(subject, context);
      const personalisedBody = resolveTemplateText(body, context);
      const recipient = await upsertNotificationRecipient({
        sourceType: NotificationRecipientSourceType.LEAD,
        sourceId: lead.id,
        audience: NotificationAudience.LEAD,
        displayName: lead.contactName?.trim() || lead.teamName?.trim() || null,
        email,
        transactionalEmailOptIn: true,
        marketingEmailOptIn: true,
        metadata: {
          leadId: lead.id,
          teamName: lead.teamName,
          leagueId: lead.leagueId,
          leagueName,
          entityType: "TEAM_LEAD_CONFIRMATION",
        },
      });

      const dispatch = await queueDirectNotification({
        recipientId: recipient.id,
        channel: NotificationChannel.EMAIL,
        audience: NotificationAudience.LEAD,
        subject: personalisedSubject,
        body: personalisedBody,
        isTransactional: true,
        sourceType: "LEAD_TEAM_CONFIRMATION",
        sourceId: lead.id,
        emailCta: {
          label: ctaLabel,
          url: confirmation.url,
        },
        metadata: {
          origin: "bulk_team_place_confirmation",
          originLabel: "Team place confirmation email",
          leadId: lead.id,
          teamName: lead.teamName,
          leagueId: lead.leagueId,
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

      sentCount += 1;
    } catch (error) {
      console.error("sendBulkTeamPlaceConfirmationEmailAction item error", lead.id, error);
      failedCount += 1;
    }
  }

  return {
    ok: true,
    sentCount,
    failedCount,
  };
}
