"use server";

import {
  LeadStatus,
  NotificationAudience,
  NotificationChannel,
  NotificationRecipientSourceType,
  NotificationTemplateKind,
  Prisma,
} from "@prisma/client";
import { revalidatePath } from "next/cache";

import { logNotificationDispatchToThread } from "@/lib/communications/log-dispatch";
import {
  ensureTeamPlaceConfirmationRecord,
  getTeamPlaceConfirmationStatus,
} from "@/lib/leads/teamPlaceConfirmation";
import { queueNotificationFromTemplate } from "@/lib/notifications/service";
import { upsertNotificationRecipient } from "@/lib/notifications/recipients";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/requireAdmin";

const TEMPLATE_KEY = "team-place-confirmation-email";
const CTA_LABEL = "YES — I WANT TO ENTER A TEAM";

const TEMPLATE_BODY = [
  "Hi {{firstName}},",
  "",
  "Thanks for your interest in joining SIXFL {{leagueName}}.",
  "",
  "We already have your contact details from your enquiry, so we won’t ask you to enter them again.",
  "",
  "We now just need to know whether you want to enter a team. On the short confirmation page you can also tell us:",
  "",
  "• your team name, if you have chosen one",
  "• roughly how many players you currently have",
  "",
  "{{leagueDetails}}",
  "",
  "There is no payment due now and there is no long-term contract tying your team in.",
  "",
  "{{cta}}",
  "",
  "If you are not entering a team, the same page also lets you tell us that clearly so we can update our list.",
  "",
  "Thanks,",
  "SIXFL",
].join("\n");

type LeagueDetailsRow = {
  proposedStartDate: Date | null;
  costPerTeamPerMatchPence: number | null;
};

function firstName(value: string | null | undefined) {
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

function formatMoney(value: number | null) {
  if (value === null) return null;
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: "GBP",
    maximumFractionDigits: value % 100 === 0 ? 0 : 2,
  }).format(value / 100);
}

async function ensureTemplate() {
  return prisma.notificationTemplate.upsert({
    where: { key: TEMPLATE_KEY },
    update: {
      name: "Team commitment email",
      description:
        "Secure email asking an existing team lead for a clear decision, team name and approximate squad size without repeating contact details.",
      kind: NotificationTemplateKind.TRANSACTIONAL,
      channel: NotificationChannel.EMAIL,
      audience: NotificationAudience.LEAD,
      subject: "SIXFL {{leagueName}} — are you entering a team?",
      body: TEMPLATE_BODY,
      ctaLabel: CTA_LABEL,
      ctaUrlKey: "teamConfirmationUrl",
      isActive: true,
    },
    create: {
      key: TEMPLATE_KEY,
      name: "Team commitment email",
      description:
        "Secure email asking an existing team lead for a clear decision, team name and approximate squad size without repeating contact details.",
      kind: NotificationTemplateKind.TRANSACTIONAL,
      channel: NotificationChannel.EMAIL,
      audience: NotificationAudience.LEAD,
      subject: "SIXFL {{leagueName}} — are you entering a team?",
      body: TEMPLATE_BODY,
      ctaLabel: CTA_LABEL,
      ctaUrlKey: "teamConfirmationUrl",
      isActive: true,
    },
  });
}

export async function sendTeamCommitmentEmailAction(formData: FormData) {
  const { user } = await requireAdmin();
  const leadId = String(formData.get("leadId") ?? "").trim();

  if (!leadId) return { ok: false, error: "Missing lead id." };

  const [lead, confirmation] = await Promise.all([
    prisma.interestLead.findUnique({
      where: { id: leadId },
      select: {
        id: true,
        interestType: true,
        status: true,
        convertedTeamId: true,
        contactName: true,
        teamName: true,
        email: true,
        phone: true,
        leagueId: true,
        league: {
          select: {
            id: true,
            name: true,
            season: true,
            venueName: true,
            kickoffInfo: true,
            competition: {
              select: {
                currentLeague: {
                  select: {
                    id: true,
                    name: true,
                    season: true,
                    venueName: true,
                    kickoffInfo: true,
                  },
                },
              },
            },
          },
        },
      },
    }),
    getTeamPlaceConfirmationStatus(leadId),
  ]);

  if (!lead) return { ok: false, error: "Lead not found." };
  if (lead.interestType !== "TEAM") {
    return { ok: false, error: "Only team leads can receive this email." };
  }
  if (lead.convertedTeamId) {
    return { ok: false, error: "This lead has already been converted into a SIXFL team." };
  }
  if (lead.status === LeadStatus.CLOSED) {
    return { ok: false, error: "This lead is closed. Reopen it before sending another commitment link." };
  }
  if (confirmation?.status === "CONFIRMED") {
    return { ok: false, error: "This lead has already confirmed that they want to enter a team." };
  }
  if (confirmation?.status === "DECLINED") {
    return { ok: false, error: "This lead has already said they are not entering a team." };
  }

  const email = lead.email?.trim().toLowerCase();
  if (!email) return { ok: false, error: "This lead does not have an email address." };
  if (!lead.leagueId || !lead.league) {
    return {
      ok: false,
      error: "Set a prospective league on this lead before sending the commitment email.",
    };
  }

  const effectiveLeague = lead.league.competition?.currentLeague ?? lead.league;
  const leagueName = `${effectiveLeague.name}${effectiveLeague.season ? ` · ${effectiveLeague.season}` : ""}`;
  const detailsRows = await prisma.$queryRaw<LeagueDetailsRow[]>(Prisma.sql`
    SELECT
      "proposedStartDate" AS "proposedStartDate",
      "costPerTeamPerMatchPence"::int AS "costPerTeamPerMatchPence"
    FROM "League"
    WHERE "id" = ${effectiveLeague.id}
    LIMIT 1
  `);
  const details = detailsRows[0] ?? null;
  const detailLines = [
    `League: ${leagueName}`,
    effectiveLeague.venueName?.trim() && effectiveLeague.venueName.trim().toUpperCase() !== "TBC"
      ? `Venue: ${effectiveLeague.venueName.trim()}`
      : null,
    effectiveLeague.kickoffInfo?.trim()
      ? `Kick-offs: ${effectiveLeague.kickoffInfo.trim()}`
      : null,
    details?.proposedStartDate
      ? `Planned start: ${formatLongDate(details.proposedStartDate)}`
      : null,
    formatMoney(details?.costPerTeamPerMatchPence ?? null)
      ? `Cost: ${formatMoney(details?.costPerTeamPerMatchPence ?? null)} per team per match`
      : null,
  ].filter(Boolean).join("\n");

  await ensureTemplate();
  const secureLink = await ensureTeamPlaceConfirmationRecord(lead.id);
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
      leagueId: effectiveLeague.id,
      originalLeadLeagueId: lead.leagueId,
      leagueName,
      entityType: "TEAM_LEAD_COMMITMENT",
    },
  });

  try {
    const dispatch = await queueNotificationFromTemplate({
      templateKey: TEMPLATE_KEY,
      recipientId: recipient.id,
      variables: {
        firstName: firstName(lead.contactName),
        fullName: lead.contactName?.trim() || "",
        contactName: lead.contactName?.trim() || "",
        teamName: lead.teamName?.trim() || "",
        leagueName,
        leagueDetails: detailLines,
        teamConfirmationUrl: secureLink.url,
      },
      sourceType: "LEAD_TEAM_CONFIRMATION",
      sourceId: lead.id,
      metadata: {
        origin: "lead_team_commitment",
        originLabel: "Team commitment email",
        leadId: lead.id,
        leagueId: effectiveLeague.id,
        leagueName,
        ctaUrl: secureLink.url,
      },
      createdByUserId: user?.id ?? null,
    });

    await logNotificationDispatchToThread({ dispatch, recipient });
    await prisma.interestLeadEmail.create({
      data: {
        interestLeadId: lead.id,
        subject: dispatch.subject ?? `SIXFL ${leagueName} — are you entering a team?`,
        body: dispatch.bodyText,
        sentTo: email,
      },
    });

    if (lead.status === LeadStatus.NEW) {
      await prisma.interestLead.update({
        where: { id: lead.id },
        data: { status: LeadStatus.CONTACTED, contactedAt: new Date() },
      });
    }

    revalidatePath("/admin/leads");
    revalidatePath(`/admin/leads/${lead.id}`);
    revalidatePath("/admin/messaging");

    return { ok: true, dispatchId: dispatch.id, status: dispatch.status };
  } catch (error) {
    console.error("sendTeamCommitmentEmailAction error", error);
    return {
      ok: false,
      error: error instanceof Error ? error.message : "The commitment email could not be queued.",
    };
  }
}
