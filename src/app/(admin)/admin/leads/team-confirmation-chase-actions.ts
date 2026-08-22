"use server";

import {
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
  "Just a quick reminder to complete the short SIXFL team form we sent you for {{leagueName}}.",
  "",
  "We’re now putting the league together and your response helps us confirm which teams are still looking to play.",
  "",
  "It only takes a minute. Please use the button below to confirm your team’s place and details.",
  "",
  "{{cta}}",
  "",
  "If you’re still interested but need a little more time, completing the form lets us know to keep your team in our planning. If you’re no longer looking to join, just reply to this email and we’ll update our list.",
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
      name: "Team place confirmation chase",
      description:
        "Friendly reminder asking a pending team lead to complete the team place confirmation form.",
      kind: NotificationTemplateKind.TRANSACTIONAL,
      channel: NotificationChannel.EMAIL,
      audience: NotificationAudience.LEAD,
      subject: "Quick reminder — complete your SIXFL team form",
      body: TEAM_CONFIRMATION_CHASE_BODY,
      ctaLabel: "Complete team form",
      ctaUrlKey: "teamConfirmationUrl",
      isActive: true,
    },
    create: {
      key: TEAM_CONFIRMATION_CHASE_TEMPLATE_KEY,
      name: "Team place confirmation chase",
      description:
        "Friendly reminder asking a pending team lead to complete the team place confirmation form.",
      kind: NotificationTemplateKind.TRANSACTIONAL,
      channel: NotificationChannel.EMAIL,
      audience: NotificationAudience.LEAD,
      subject: "Quick reminder — complete your SIXFL team form",
      body: TEAM_CONFIRMATION_CHASE_BODY,
      ctaLabel: "Complete team form",
      ctaUrlKey: "teamConfirmationUrl",
      isActive: true,
    },
  });
}

export async function sendTeamPlaceConfirmationChaseAction(formData: FormData) {
  const { user } = await requireAdmin();
  const leadId = String(formData.get("leadId") ?? "").trim();

  if (!leadId) {
    return { ok: false, error: "Missing lead id." };
  }

  const [lead, confirmation] = await Promise.all([
    prisma.interestLead.findUnique({
      where: { id: leadId },
      select: {
        id: true,
        interestType: true,
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
                  select: {
                    id: true,
                    name: true,
                    season: true,
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

  if (!lead) {
    return { ok: false, error: "Lead not found." };
  }

  if (lead.interestType !== "TEAM") {
    return { ok: false, error: "Only team leads can receive this chase email." };
  }

  if (!confirmation?.sentAt || confirmation.status !== "PENDING") {
    return {
      ok: false,
      error: "This team is not waiting on a confirmation form, so it does not need chasing.",
    };
  }

  const email = lead.email?.trim().toLowerCase();
  if (!email) {
    return { ok: false, error: "This lead does not have an email address." };
  }

  if (!lead.leagueId || !lead.league) {
    return {
      ok: false,
      error: "Set a prospective league on this lead before sending a chase.",
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
      error: "A chase has already been sent for this team within the last hour.",
    };
  }

  await ensureChaseTemplate();

  const effectiveLeague = lead.league.competition?.currentLeague ?? lead.league;
  const leagueName = `${effectiveLeague.name}${
    effectiveLeague.season ? ` · ${effectiveLeague.season}` : ""
  }`;
  const displayName =
    lead.contactName?.trim() || lead.teamName?.trim() || email;
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
      entityType: "TEAM_LEAD_CONFIRMATION_CHASE",
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
        origin: "lead_team_confirmation_chase",
        originLabel: "Team place confirmation chase",
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
        subject: dispatch.subject ?? "Quick reminder — complete your SIXFL team form",
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
      error:
        error instanceof Error
          ? error.message
          : "The chase email could not be queued.",
    };
  }
}
