"use server";

import {
  LeadStatus,
  NotificationAudience,
  NotificationChannel,
  NotificationDispatchStatus,
  NotificationRecipientSourceType,
  NotificationTemplateKind,
} from "@prisma/client";
import { revalidatePath } from "next/cache";

import { logNotificationDispatchToThread } from "@/lib/communications/log-dispatch";
import {
  getTeamPlaceConfirmationStatus,
  getTeamPlaceConfirmationUrl,
} from "@/lib/leads/teamPlaceConfirmation";
import { queueNotificationFromTemplate } from "@/lib/notifications/service";
import { upsertNotificationRecipient } from "@/lib/notifications/recipients";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/requireAdmin";

const TEAM_CONFIRMATION_CHASE_TEMPLATE_KEY = "team-place-confirmation-chase-email";
const TEAM_CONFIRMATION_CHASE_SOURCE_TYPE = "LEAD_TEAM_CONFIRMATION_CHASE";
const CHASE_COOLDOWN_MS = 60 * 60 * 1000;

const TEAM_CONFIRMATION_CHASE_BODY = [
  "Hi {{firstName}},",
  "",
  "Just a quick reminder about your SIXFL {{leagueName}} enquiry.",
  "",
  "We already have your contact details. We now only need a clear yes or no on whether you want to enter a team.",
  "",
  "If the answer is yes, the short page also lets you add your team name if you have chosen one and tell us roughly how many players you have.",
  "",
  "There is no payment due now and there is no long-term contract tying your team in.",
  "",
  "{{cta}}",
  "",
  "If you are not entering a team, please choose the no option on the same page so we can update our list and stop chasing you.",
  "",
  "Thanks,",
  "SIXFL",
].join("\n");

function getFirstName(value: string | null | undefined) {
  return value?.trim().split(/\s+/)[0] || "there";
}

async function ensureChaseTemplate() {
  return prisma.notificationTemplate.upsert({
    where: { key: TEAM_CONFIRMATION_CHASE_TEMPLATE_KEY },
    update: {
      name: "Team commitment reminder",
      description:
        "Reminder asking an existing team lead for a clear yes/no decision without repeating their contact details.",
      kind: NotificationTemplateKind.TRANSACTIONAL,
      channel: NotificationChannel.EMAIL,
      audience: NotificationAudience.LEAD,
      subject: "SIXFL {{leagueName}} — are you entering a team?",
      body: TEAM_CONFIRMATION_CHASE_BODY,
      ctaLabel: "YES — I WANT TO ENTER A TEAM",
      ctaUrlKey: "teamConfirmationUrl",
      isActive: true,
    },
    create: {
      key: TEAM_CONFIRMATION_CHASE_TEMPLATE_KEY,
      name: "Team commitment reminder",
      description:
        "Reminder asking an existing team lead for a clear yes/no decision without repeating their contact details.",
      kind: NotificationTemplateKind.TRANSACTIONAL,
      channel: NotificationChannel.EMAIL,
      audience: NotificationAudience.LEAD,
      subject: "SIXFL {{leagueName}} — are you entering a team?",
      body: TEAM_CONFIRMATION_CHASE_BODY,
      ctaLabel: "YES — I WANT TO ENTER A TEAM",
      ctaUrlKey: "teamConfirmationUrl",
      isActive: true,
    },
  });
}

export async function sendTeamPlaceConfirmationChaseAction(formData: FormData) {
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
            competition: {
              select: {
                currentLeague: {
                  select: { id: true, name: true, season: true },
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
    return { ok: false, error: "Only team leads can receive this reminder." };
  }
  if (lead.convertedTeamId) {
    return { ok: false, error: "This lead has already been converted into a SIXFL team." };
  }
  if (lead.status === LeadStatus.CLOSED) {
    return { ok: false, error: "This lead is closed and should not be chased." };
  }
  if (confirmation?.status === "CONFIRMED") {
    return { ok: false, error: "This lead has already confirmed that they want to enter a team." };
  }
  if (confirmation?.status === "DECLINED") {
    return { ok: false, error: "This lead has already said they are not entering a team." };
  }
  if (!confirmation?.sentAt || confirmation.status !== "PENDING") {
    return {
      ok: false,
      error: "Send the decision link first. There is not yet a pending response to chase.",
    };
  }

  const email = lead.email?.trim().toLowerCase();
  if (!email) return { ok: false, error: "This lead does not have an email address." };
  if (!lead.leagueId || !lead.league) {
    return {
      ok: false,
      error: "Set a prospective league on this lead before sending a reminder.",
    };
  }

  const recentChase = await prisma.notificationDispatch.findFirst({
    where: {
      sourceType: TEAM_CONFIRMATION_CHASE_SOURCE_TYPE,
      sourceId: lead.id,
      createdAt: { gte: new Date(Date.now() - CHASE_COOLDOWN_MS) },
      status: {
        notIn: [
          NotificationDispatchStatus.FAILED,
          NotificationDispatchStatus.CANCELLED,
          NotificationDispatchStatus.SKIPPED,
        ],
      },
    },
    orderBy: { createdAt: "desc" },
    select: { id: true },
  });

  if (recentChase) {
    return {
      ok: false,
      error: "A reminder has already been sent for this team within the last hour.",
    };
  }

  await ensureChaseTemplate();

  const effectiveLeague = lead.league.competition?.currentLeague ?? lead.league;
  const leagueName = `${effectiveLeague.name}${effectiveLeague.season ? ` · ${effectiveLeague.season}` : ""}`;
  const displayName = lead.contactName?.trim() || lead.teamName?.trim() || email;
  const confirmationUrl = getTeamPlaceConfirmationUrl(lead.id);

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
      teamName: lead.teamName,
      contactName: lead.contactName,
      entityType: "TEAM_LEAD_COMMITMENT_REMINDER",
    },
  });

  try {
    const dispatch = await queueNotificationFromTemplate({
      templateKey: TEAM_CONFIRMATION_CHASE_TEMPLATE_KEY,
      recipientId: recipient.id,
      variables: {
        firstName: getFirstName(lead.contactName),
        fullName: lead.contactName?.trim() || "",
        contactName: lead.contactName?.trim() || "",
        teamName: lead.teamName?.trim() || "",
        leagueName,
        teamConfirmationUrl: confirmationUrl,
      },
      sourceType: TEAM_CONFIRMATION_CHASE_SOURCE_TYPE,
      sourceId: lead.id,
      metadata: {
        origin: "lead_team_commitment_reminder",
        originLabel: "Team commitment reminder",
        leadId: lead.id,
        leagueId: effectiveLeague.id,
        originalLeadLeagueId: lead.leagueId,
        leagueName,
        teamName: lead.teamName,
        ctaUrl: confirmationUrl,
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

    revalidatePath("/admin/leads");
    revalidatePath(`/admin/leads/${lead.id}`);
    revalidatePath("/admin/messaging");

    return { ok: true, dispatchId: dispatch.id, status: dispatch.status };
  } catch (error) {
    console.error("sendTeamPlaceConfirmationChaseAction error", error);
    return {
      ok: false,
      error: error instanceof Error ? error.message : "The reminder email could not be queued.",
    };
  }
}
