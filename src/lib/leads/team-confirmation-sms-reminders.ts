import {
  NotificationAudience,
  NotificationDispatchStatus,
  NotificationRecipientSourceType,
  Prisma,
} from "@prisma/client";

import { logNotificationDispatchToThread } from "@/lib/communications/log-dispatch";
import { getTeamPlaceConfirmationUrl } from "@/lib/leads/teamPlaceConfirmation";
import { upsertNotificationRecipient } from "@/lib/notifications/recipients";
import { queueNotificationFromTemplate } from "@/lib/notifications/service";
import { prisma } from "@/lib/prisma";

export const TEAM_LEAD_CONFIRMATION_SMS_FIRST_TEMPLATE_KEY =
  "team-lead-confirmation-sms-nudge";
export const TEAM_LEAD_CONFIRMATION_SMS_FINAL_TEMPLATE_KEY =
  "team-lead-confirmation-sms-final-nudge";
export const TEAM_LEAD_CONFIRMATION_SMS_FIRST_SOURCE_TYPE =
  "LEAD_TEAM_CONFIRMATION_SMS_NUDGE_1";
export const TEAM_LEAD_CONFIRMATION_SMS_FINAL_SOURCE_TYPE =
  "LEAD_TEAM_CONFIRMATION_SMS_NUDGE_FINAL";

const LEAD_REASSURANCE_EMAIL_SOURCE_TYPE = "LEAD_REASSURANCE_EMAIL";
const LEAD_LIVE_REASSURANCE_EMAIL_SOURCE_TYPE =
  "LEAD_LIVE_LEAGUE_REASSURANCE_EMAIL";
const LEAD_TEAM_CONFIRMATION_EMAIL_SOURCE_TYPE = "LEAD_TEAM_CONFIRMATION";
const LEAD_TEAM_CONFIRMATION_CHASE_EMAIL_SOURCE_TYPE =
  "LEAD_TEAM_CONFIRMATION_CHASE";

const FIRST_SMS_DELAY_MS = 48 * 60 * 60 * 1000;
const FINAL_SMS_DELAY_MS = 5 * 24 * 60 * 60 * 1000;

export type TeamLeadConfirmationSmsReminderSummary = {
  scanned: number;
  firstSmsQueued: number;
  finalSmsQueued: number;
  skippedNoPhone: number;
  skippedNoLeague: number;
  skippedNoSentEmail: number;
  skippedReplied: number;
  skippedByPreference: number;
  skippedNotDue: number;
  errors: string[];
};

type AwaitingTeamLeadDecisionRow = {
  leadId: string;
  contactName: string;
  teamName: string | null;
  email: string | null;
  phone: string | null;
  marketingConsent: boolean;
  originalLeagueId: string | null;
  effectiveLeagueId: string | null;
  leagueName: string | null;
  leagueSeason: string | null;
  confirmationSentAt: Date | null;
  latestRelevantEmailSentAt: Date | null;
  latestInboundAt: Date | null;
  firstSmsCreatedAt: Date | null;
  firstSmsSentAt: Date | null;
  finalSmsCreatedAt: Date | null;
};

function getFirstName(value: string | null | undefined) {
  return value?.trim().split(/\s+/)[0] || "there";
}

function formatLeagueName(name: string, season: string | null) {
  const cleanName = name.trim();
  const cleanSeason = season?.trim() || "";

  if (!cleanSeason) return cleanName;
  if (cleanName.toLowerCase().includes(cleanSeason.toLowerCase())) return cleanName;
  return `${cleanName} · ${cleanSeason}`;
}

function isDue(reference: Date | null, delayMs: number, now: Date) {
  return Boolean(reference && now.getTime() >= reference.getTime() + delayMs);
}

function hasRepliedSinceLatestEmail(lead: AwaitingTeamLeadDecisionRow) {
  return Boolean(
    lead.latestInboundAt &&
      lead.latestRelevantEmailSentAt &&
      lead.latestInboundAt.getTime() >= lead.latestRelevantEmailSentAt.getTime(),
  );
}

async function getAwaitingTeamLeadDecisions() {
  return prisma.$queryRaw<AwaitingTeamLeadDecisionRow[]>(Prisma.sql`
    SELECT
      lead."id" AS "leadId",
      lead."contactName",
      lead."teamName",
      lead."email",
      lead."phone",
      lead."marketingConsent",
      lead."leagueId" AS "originalLeagueId",
      COALESCE(current_league."id", league."id") AS "effectiveLeagueId",
      COALESCE(current_league."name", league."name") AS "leagueName",
      COALESCE(current_league."season", league."season") AS "leagueSeason",
      confirmation."sentAt" AS "confirmationSentAt",
      (
        SELECT MAX(dispatch."sentAt")
        FROM "NotificationDispatch" dispatch
        WHERE dispatch."sourceId" = lead."id"
          AND dispatch."channel"::text = 'EMAIL'
          AND dispatch."status"::text = 'SENT'
          AND dispatch."sourceType" IN (
            ${LEAD_REASSURANCE_EMAIL_SOURCE_TYPE},
            ${LEAD_LIVE_REASSURANCE_EMAIL_SOURCE_TYPE},
            ${LEAD_TEAM_CONFIRMATION_EMAIL_SOURCE_TYPE},
            ${LEAD_TEAM_CONFIRMATION_CHASE_EMAIL_SOURCE_TYPE}
          )
          AND dispatch."createdAt" >=
            COALESCE(confirmation."sentAt", confirmation."createdAt") - INTERVAL '5 minutes'
      ) AS "latestRelevantEmailSentAt",
      (
        SELECT MAX(thread."latestInboundAt")
        FROM "MessageThread" thread
        WHERE thread."latestInboundAt" IS NOT NULL
          AND (
            thread."sourceId" = lead."id"
            OR thread."recipientId" IN (
              SELECT recipient."id"
              FROM "NotificationRecipient" recipient
              WHERE recipient."sourceType"::text = 'LEAD'
                AND recipient."sourceId" = lead."id"
            )
          )
      ) AS "latestInboundAt",
      (
        SELECT MAX(dispatch."createdAt")
        FROM "NotificationDispatch" dispatch
        WHERE dispatch."sourceType" = ${TEAM_LEAD_CONFIRMATION_SMS_FIRST_SOURCE_TYPE}
          AND dispatch."sourceId" = lead."id"
          AND dispatch."channel"::text = 'SMS'
          AND dispatch."status"::text <> 'CANCELLED'
      ) AS "firstSmsCreatedAt",
      (
        SELECT MAX(dispatch."sentAt")
        FROM "NotificationDispatch" dispatch
        WHERE dispatch."sourceType" = ${TEAM_LEAD_CONFIRMATION_SMS_FIRST_SOURCE_TYPE}
          AND dispatch."sourceId" = lead."id"
          AND dispatch."channel"::text = 'SMS'
          AND dispatch."status"::text = 'SENT'
      ) AS "firstSmsSentAt",
      (
        SELECT MAX(dispatch."createdAt")
        FROM "NotificationDispatch" dispatch
        WHERE dispatch."sourceType" = ${TEAM_LEAD_CONFIRMATION_SMS_FINAL_SOURCE_TYPE}
          AND dispatch."sourceId" = lead."id"
          AND dispatch."channel"::text = 'SMS'
          AND dispatch."status"::text <> 'CANCELLED'
      ) AS "finalSmsCreatedAt"
    FROM "LeadTeamConfirmation" confirmation
    JOIN "InterestLead" lead ON lead."id" = confirmation."leadId"
    LEFT JOIN "League" league ON league."id" = lead."leagueId"
    LEFT JOIN "LeagueCompetition" competition
      ON competition."id" = league."competitionId"
    LEFT JOIN "League" current_league
      ON current_league."id" = competition."currentLeagueId"
    WHERE confirmation."status"::text = 'PENDING'
      AND lead."interestType"::text = 'TEAM'
      AND lead."status"::text IN ('NEW', 'CONTACTED')
      AND lead."convertedTeamId" IS NULL
    ORDER BY confirmation."sentAt" ASC NULLS LAST
    LIMIT 500
  `);
}

async function queueTeamLeadSms(input: {
  lead: AwaitingTeamLeadDecisionRow;
  stage: "first" | "final";
}) {
  const { lead } = input;

  if (!lead.effectiveLeagueId || !lead.leagueName) {
    throw new Error("The lead does not have a prospective league.");
  }

  const firstName = getFirstName(lead.contactName);
  const leagueName = formatLeagueName(lead.leagueName, lead.leagueSeason);
  const teamConfirmationUrl = getTeamPlaceConfirmationUrl(lead.leadId);
  const displayName =
    lead.contactName.trim() || lead.teamName?.trim() || lead.email?.trim() || "Team lead";

  const recipient = await upsertNotificationRecipient({
    sourceType: NotificationRecipientSourceType.LEAD,
    sourceId: lead.leadId,
    audience: NotificationAudience.LEAD,
    displayName,
    email: lead.email,
    phone: lead.phone,
    transactionalEmailOptIn: true,
    transactionalSmsOptIn: true,
    marketingEmailOptIn: lead.marketingConsent,
    marketingSmsOptIn: lead.marketingConsent,
    metadata: {
      entityType: "TEAM_LEAD",
      leadId: lead.leadId,
      leagueId: lead.effectiveLeagueId,
      originalLeadLeagueId: lead.originalLeagueId,
      leagueName,
      teamName: lead.teamName,
      automaticTeamDecisionSms: true,
    },
  });

  const isFinal = input.stage === "final";
  const dispatch = await queueNotificationFromTemplate({
    templateKey: isFinal
      ? TEAM_LEAD_CONFIRMATION_SMS_FINAL_TEMPLATE_KEY
      : TEAM_LEAD_CONFIRMATION_SMS_FIRST_TEMPLATE_KEY,
    recipientId: recipient.id,
    variables: {
      firstName,
      fullName: lead.contactName.trim(),
      contactName: lead.contactName.trim(),
      teamName: lead.teamName?.trim() || "",
      leagueName,
      teamConfirmationUrl,
    },
    sourceType: isFinal
      ? TEAM_LEAD_CONFIRMATION_SMS_FINAL_SOURCE_TYPE
      : TEAM_LEAD_CONFIRMATION_SMS_FIRST_SOURCE_TYPE,
    sourceId: lead.leadId,
    metadata: {
      type: "team_lead_confirmation_sms_reminder",
      stage: input.stage,
      automatic: true,
      leadId: lead.leadId,
      leagueId: lead.effectiveLeagueId,
      originalLeadLeagueId: lead.originalLeagueId,
      leagueName,
      teamName: lead.teamName,
      ctaUrl: teamConfirmationUrl,
      latestRelevantEmailSentAt:
        lead.latestRelevantEmailSentAt?.toISOString() ?? null,
    },
  });

  await logNotificationDispatchToThread({ dispatch, recipient });
  return dispatch;
}

export async function runTeamLeadConfirmationSmsReminderJob(): Promise<TeamLeadConfirmationSmsReminderSummary> {
  const summary: TeamLeadConfirmationSmsReminderSummary = {
    scanned: 0,
    firstSmsQueued: 0,
    finalSmsQueued: 0,
    skippedNoPhone: 0,
    skippedNoLeague: 0,
    skippedNoSentEmail: 0,
    skippedReplied: 0,
    skippedByPreference: 0,
    skippedNotDue: 0,
    errors: [],
  };

  const leads = await getAwaitingTeamLeadDecisions();
  summary.scanned = leads.length;
  const now = new Date();

  for (const lead of leads) {
    if (!lead.phone?.trim()) {
      summary.skippedNoPhone += 1;
      continue;
    }

    if (!lead.effectiveLeagueId || !lead.leagueName?.trim()) {
      summary.skippedNoLeague += 1;
      continue;
    }

    // Wait for the decision/reassurance email to be SENT, not merely queued,
    // so an SMS can never overtake a delayed or failed email.
    if (!lead.latestRelevantEmailSentAt) {
      summary.skippedNoSentEmail += 1;
      continue;
    }

    // Any inbound email or SMS received after the latest relevant email counts
    // as a reply. A later newly-sent decision email can begin the clock again.
    if (hasRepliedSinceLatestEmail(lead)) {
      summary.skippedReplied += 1;
      continue;
    }

    try {
      if (
        !lead.firstSmsCreatedAt &&
        isDue(lead.latestRelevantEmailSentAt, FIRST_SMS_DELAY_MS, now)
      ) {
        const dispatch = await queueTeamLeadSms({ lead, stage: "first" });
        if (dispatch.status === NotificationDispatchStatus.QUEUED) {
          summary.firstSmsQueued += 1;
        } else {
          summary.skippedByPreference += 1;
        }
        continue;
      }

      // The final SMS is sent no sooner than five days after the first SMS was
      // actually delivered, and never within 48 hours of a later manual email.
      if (
        lead.firstSmsSentAt &&
        !lead.finalSmsCreatedAt &&
        isDue(lead.firstSmsSentAt, FINAL_SMS_DELAY_MS, now) &&
        isDue(lead.latestRelevantEmailSentAt, FIRST_SMS_DELAY_MS, now)
      ) {
        const dispatch = await queueTeamLeadSms({ lead, stage: "final" });
        if (dispatch.status === NotificationDispatchStatus.QUEUED) {
          summary.finalSmsQueued += 1;
        } else {
          summary.skippedByPreference += 1;
        }
        continue;
      }

      summary.skippedNotDue += 1;
    } catch (error) {
      if (summary.errors.length < 20) {
        summary.errors.push(
          `${lead.leadId}:${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }
  }

  return summary;
}
