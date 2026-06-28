// ========================================
// File: src/app/(admin)/admin/leads/[id]/actions.ts
// ========================================

"use server";

// ========================================
// Imports
// ========================================

import { revalidatePath } from "next/cache";
import { Resend } from "resend";
import {
  LeadStatus,
  NotificationAudience,
  NotificationChannel,
  Prisma,
  TeamRole,
} from "@prisma/client";
import { logNotificationDispatchToThread } from "@/lib/communications/log-dispatch";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/requireAdmin";
import {
  appendSIXFLTextSignature,
  buildSIXFLEmailHtml,
} from "@/lib/email/buildEmail";
import {
  buildBaseEmailTemplateContext,
  mergeEmailTemplateContext,
  resolveTemplateText,
} from "@/lib/email/template-context";
import {
  ensureTeamPlaceConfirmationRecord,
  TEAM_PLACE_CONFIRMATION_CTA_KEY,
} from "@/lib/leads/teamPlaceConfirmation";
import { processNotificationQueue } from "@/lib/notifications/processor";
import { queueDirectNotification } from "@/lib/notifications/service";
import { normalizeUkMobileNumber } from "@/lib/phone/normalize";

// ========================================
// Constants
// ========================================

const resend = new Resend(process.env.RESEND_API_KEY);
const CTA_PLACEHOLDER_TOKEN = "__SIXFL_CTA__";

type LeagueConfirmationEmailDetails = {
  proposedStartDate: Date | null;
  minutesPerGame: number | null;
  costPerTeamPerMatchPence: number | null;
  targetTeamCount: number | null;
};

// ========================================
// Helpers
// ========================================

function slugifyTeamName(value: string) {
  return value
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-");
}

async function generateUniqueClaimCode(teamName: string) {
  const base = slugifyTeamName(teamName) || "team";

  for (let i = 0; i < 10; i += 1) {
    const suffix = Math.random().toString(36).slice(2, 8);
    const claimCode = `${base}-${suffix}`;

    const existing = await prisma.team.findUnique({
      where: { claimCode },
      select: { id: true },
    });

    if (!existing) {
      return claimCode;
    }
  }

  throw new Error("Unable to generate a unique team claim code.");
}

function buildTeamNameFromLead(lead: {
  teamName: string | null;
  contactName: string;
}) {
  const explicitTeamName = lead.teamName?.trim();

  if (explicitTeamName) {
    return explicitTeamName;
  }

  const contactName = lead.contactName.trim();

  if (contactName) {
    return `${contactName}'s Team`;
  }

  return "New Team";
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

function buildLeadEmailContext(input: {
  contactName?: string | null;
  area?: string | null;
  signupUrl?: string | null;
  teamName?: string | null;
  leagueName?: string | null;
  venueName?: string | null;
  kickoffInfo?: string | null;
  leagueFormat?: string | null;
  leagueConfirmationDetails?: LeagueConfirmationEmailDetails | null;
}) {
  const fullName = input.contactName?.trim() || "";
  const firstName = fullName.split(/\s+/)[0] || "there";
  const leagueName = input.leagueName?.trim() || "your SIXFL league";
  const venueName = input.venueName?.trim() || "TBC";
  const details = input.leagueConfirmationDetails ?? null;

  return mergeEmailTemplateContext(
    buildBaseEmailTemplateContext({
      firstName,
      fullName,
      area: input.area,
      signupUrl: input.signupUrl,
      teamName: input.teamName,
    }),
    {
      leagueName,
      venueName,
      kickoffInfo: input.kickoffInfo?.trim() || "",
      format: input.leagueFormat?.trim() || "Weekly 6-a-side fixtures",
      proposedStartDate: details?.proposedStartDate ? formatLongDate(details.proposedStartDate) : "",
      leagueStartLine: buildLeagueStartLine(details?.proposedStartDate ?? null),
      minutesPerGame: details?.minutesPerGame ? String(details.minutesPerGame) : "TBC",
      costPerTeamPerMatch: formatCurrencyPence(details?.costPerTeamPerMatchPence ?? null),
      targetTeamCount: details?.targetTeamCount ? String(details.targetTeamCount) : "",
      targetTeamCountLine: details?.targetTeamCount ? `Number of teams: ${details.targetTeamCount}` : "",
      leagueDetailsBlock: buildLeagueDetailsBlock({
        leagueName,
        venueName,
        kickoffInfo: input.kickoffInfo,
        format: input.leagueFormat,
        details,
      }),
    },
  );
}

async function resolveTeamJoinUrl(targetTeamId: string) {
  const trimmedTeamId = targetTeamId.trim();

  if (!trimmedTeamId) {
    return "";
  }

  const team = await prisma.team.findFirst({
    where: {
      id: trimmedTeamId,
      teamMode: "MANAGED",
      isRecruiting: true,
      joinSlug: {
        not: null,
      },
    },
    select: {
      joinSlug: true,
    },
  });

  if (!team?.joinSlug) {
    return "";
  }

  const baseUrl = (process.env.NEXTAUTH_URL ?? "https://www.sixfl.co.uk").replace(
    /\/+$/,
    "",
  );

  return `${baseUrl}/teams/join/${team.joinSlug}`;
}

async function resolveLeadEmailCta(input: {
  ctaLabel?: string | null;
  ctaUrlKey?: string | null;
  signupUrl?: string | null;
  targetTeamId?: string | null;
  teamConfirmationUrl?: string | null;
}) {
  const label = input.ctaLabel?.trim() || "";
  const urlKey = input.ctaUrlKey?.trim() || "";

  if (!label || !urlKey) {
    return undefined;
  }

  if (urlKey === "signupUrl") {
    const url = input.signupUrl?.trim() || "";

    if (!url) {
      return undefined;
    }

    return {
      label,
      url,
    };
  }

  if (urlKey === "teamJoinUrl") {
    const url = await resolveTeamJoinUrl(input.targetTeamId?.trim() || "");

    if (!url) {
      return undefined;
    }

    return {
      label,
      url,
    };
  }

  if (urlKey === TEAM_PLACE_CONFIRMATION_CTA_KEY) {
    const url = input.teamConfirmationUrl?.trim() || "";

    if (!url) {
      return undefined;
    }

    return {
      label,
      url,
    };
  }

  return undefined;
}

async function resolveLeadSmsLink(input: {
  ctaUrlKey?: string | null;
  signupUrl?: string | null;
  targetTeamId?: string | null;
}) {
  const urlKey = input.ctaUrlKey?.trim() || "";

  if (urlKey === "signupUrl") {
    return input.signupUrl?.trim() || "";
  }

  if (urlKey === "teamJoinUrl") {
    const targetTeamId = input.targetTeamId?.trim() || "";

    if (!targetTeamId) {
      throw new Error("Please select which managed team this SMS should link to.");
    }

    const url = await resolveTeamJoinUrl(targetTeamId);

    if (!url) {
      throw new Error("The selected managed team does not have an active join link.");
    }

    return url;
  }

  return "";
}

async function ensureLeadSmsNotificationRecipient(input: {
  leadId: string;
  contactName?: string | null;
  phone: string;
}) {
  const normalizedPhone = normalizeUkMobileNumber(input.phone);

  if (!normalizedPhone) {
    throw new Error("This lead does not have a valid UK mobile number for SMS.");
  }

  const recipient = await prisma.notificationRecipient.upsert({
    where: {
      sourceType_sourceId: {
        sourceType: "LEAD",
        sourceId: input.leadId,
      },
    },
    update: {
      audience: NotificationAudience.LEAD,
      displayName: input.contactName?.trim() || null,
      phone: normalizedPhone,
      phoneNormalized: normalizedPhone,
      transactionalSmsOptIn: true,
      marketingSmsOptIn: true,
    },
    create: {
      sourceType: "LEAD",
      sourceId: input.leadId,
      audience: NotificationAudience.LEAD,
      displayName: input.contactName?.trim() || null,
      phone: normalizedPhone,
      phoneNormalized: normalizedPhone,
      transactionalSmsOptIn: true,
      marketingSmsOptIn: true,
    },
  });

  await prisma.notificationPreference.upsert({
    where: {
      recipientId: recipient.id,
    },
    update: {
      smsEnabled: true,
      urgentSmsEnabled: true,
      marketingSmsEnabled: true,
    },
    create: {
      recipientId: recipient.id,
      smsEnabled: true,
      urgentSmsEnabled: true,
      marketingSmsEnabled: true,
      emailEnabled: true,
      marketingEmailEnabled: false,
    },
  });

  return recipient;
}

async function processLeadSmsImmediately() {
  try {
    await processNotificationQueue(10);
  } catch (error) {
    console.error("Failed to process lead SMS immediately", error);
  }
}

// ========================================
// Actions
// ========================================

export async function sendLeadEmailAction(formData: FormData) {
  await requireAdmin();

  const leadId = String(formData.get("leadId") ?? "").trim();
  const templateId = String(formData.get("templateId") ?? "").trim();
  const subjectInput = String(formData.get("subject") ?? "").trim();
  const bodyInput = String(formData.get("body") ?? "").trim();

  const signupUrl = String(formData.get("signupUrl") ?? "").trim();
  const ctaLabelInput = String(formData.get("ctaLabel") ?? "").trim();
  const ctaUrlKeyInput = String(formData.get("ctaUrlKey") ?? "").trim();
  const targetTeamId = String(formData.get("targetTeamId") ?? "").trim();

  if (!leadId) {
    return { ok: false, error: "Missing lead id." };
  }

  if (!subjectInput) {
    return { ok: false, error: "Please enter a subject." };
  }

  if (!bodyInput) {
    return { ok: false, error: "Please enter an email message." };
  }

  if (!process.env.RESEND_API_KEY) {
    return {
      ok: false,
      error: "RESEND_API_KEY is missing from your environment variables.",
    };
  }

  const fromEmail = process.env.EMAIL_FROM;

  if (!fromEmail) {
    return {
      ok: false,
      error: "EMAIL_FROM is missing from your environment variables.",
    };
  }

  const lead = await prisma.interestLead.findUnique({
    where: { id: leadId },
    include: {
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
    return { ok: false, error: "Lead not found." };
  }

  const leadEmail = lead.email?.trim() || "";

  if (!leadEmail) {
    return {
      ok: false,
      error: "This lead does not have an email address.",
    };
  }

  const selectedTemplate = templateId
    ? await prisma.emailTemplate.findUnique({
        where: { id: templateId },
        select: {
          ctaLabel: true,
          ctaUrlKey: true,
        },
      })
    : null;

  const ctaLabel = ctaLabelInput || selectedTemplate?.ctaLabel?.trim() || "";
  const ctaUrlKey = ctaUrlKeyInput || selectedTemplate?.ctaUrlKey?.trim() || "";
  let teamConfirmationUrl = "";

  if (ctaUrlKey === TEAM_PLACE_CONFIRMATION_CTA_KEY) {
    if (lead.interestType !== "TEAM") {
      return {
        ok: false,
        error: "Team confirmation links can only be sent to team leads.",
      };
    }

    const confirmation = await ensureTeamPlaceConfirmationRecord(lead.id);
    teamConfirmationUrl = confirmation.url;
  }

  const leagueConfirmationDetails = await getLeagueConfirmationEmailDetails(
    lead.leagueId ?? null,
  );

  const leagueLabel = lead.league
    ? `${lead.league.name}${lead.league.season ? ` · ${lead.league.season}` : ""}`
    : null;

  const context = buildLeadEmailContext({
    contactName: lead.contactName,
    area: lead.area ?? null,
    signupUrl,
    teamName: lead.teamName ?? null,
    leagueName: leagueLabel,
    venueName: lead.league?.venueName ?? null,
    kickoffInfo: lead.league?.kickoffInfo ?? null,
    leagueFormat: lead.league?.format ?? null,
    leagueConfirmationDetails,
  });

  const resolvedSubject = resolveTemplateText(subjectInput, context);

  const resolvedBody = resolveTemplateText(
    bodyInput.replaceAll("{{cta}}", CTA_PLACEHOLDER_TOKEN),
    context,
  ).replaceAll(CTA_PLACEHOLDER_TOKEN, "{{cta}}");

  const resolvedCta = await resolveLeadEmailCta({
    ctaLabel,
    ctaUrlKey,
    signupUrl,
    targetTeamId,
    teamConfirmationUrl,
  });

  if (ctaUrlKey === "teamJoinUrl" && !resolvedCta) {
    return {
      ok: false,
      error: "The selected managed team does not have an active join link.",
    };
  }

  if (ctaUrlKey === TEAM_PLACE_CONFIRMATION_CTA_KEY && !resolvedCta) {
    return {
      ok: false,
      error: "The team confirmation button could not be built. Please try again.",
    };
  }

  if (resolvedBody.includes("{{cta}}") && !resolvedCta) {
    return {
      ok: false,
      error:
        "This email includes a CTA placeholder, but no working CTA could be built. Please reselect the template and check the CTA settings.",
    };
  }

  const signedTextBody = appendSIXFLTextSignature(resolvedBody);

  const signedHtmlBody = buildSIXFLEmailHtml({
    body: signedTextBody,
    cta: resolvedCta,
  });

  try {
    await resend.emails.send({
      from: fromEmail,
      to: leadEmail,
      subject: resolvedSubject,
      text: signedTextBody,
      html: signedHtmlBody,
    });

    await prisma.interestLeadEmail.create({
      data: {
        interestLeadId: lead.id,
        subject: resolvedSubject,
        body: signedTextBody,
        sentTo: leadEmail,
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

    return { ok: true };
  } catch (error) {
    console.error("sendLeadEmailAction error", error);

    return {
      ok: false,
      error:
        "The email could not be sent. Please check your Resend domain and email settings.",
    };
  }
}

export async function sendLeadSmsAction(formData: FormData) {
  const { user } = await requireAdmin();

  const leadId = String(formData.get("leadId") ?? "").trim();
  const bodyInput = String(formData.get("body") ?? "").trim();
  const signupUrl = String(formData.get("signupUrl") ?? "").trim();
  const ctaUrlKey = String(formData.get("ctaUrlKey") ?? "").trim();
  const targetTeamId = String(formData.get("targetTeamId") ?? "").trim();

  if (!leadId) {
    return { ok: false, error: "Missing lead id." };
  }

  if (!bodyInput) {
    return { ok: false, error: "Please enter an SMS message." };
  }

  const lead = await prisma.interestLead.findUnique({
    where: { id: leadId },
    select: {
      id: true,
      contactName: true,
      phone: true,
      area: true,
      teamName: true,
      status: true,
    },
  });

  if (!lead) {
    return { ok: false, error: "Lead not found." };
  }

  const leadPhone = lead.phone?.trim() || "";

  if (!leadPhone) {
    return {
      ok: false,
      error: "This lead does not have a mobile number.",
    };
  }

  const context = buildLeadEmailContext({
    contactName: lead.contactName,
    area: lead.area ?? null,
    signupUrl,
    teamName: lead.teamName ?? null,
  });

  let resolvedLink = "";

  try {
    resolvedLink = await resolveLeadSmsLink({
      ctaUrlKey,
      signupUrl,
      targetTeamId,
    });
  } catch (error) {
    return {
      ok: false,
      error:
        error instanceof Error
          ? error.message
          : "Failed to resolve the SMS link.",
    };
  }

  const resolvedBody = resolveTemplateText(bodyInput, context).replace(
    /{{link}}/gi,
    resolvedLink,
  );

  try {
    const recipient = await ensureLeadSmsNotificationRecipient({
      leadId: lead.id,
      contactName: lead.contactName,
      phone: leadPhone,
    });

    const dispatch = await queueDirectNotification({
      recipientId: recipient.id,
      channel: NotificationChannel.SMS,
      audience: NotificationAudience.LEAD,
      body: resolvedBody,
      isTransactional: true,
      sourceType: "LEAD",
      sourceId: lead.id,
      metadata: {
        origin: "lead_single_sms",
        originLabel: "Sent from lead page",
        leadId: lead.id,
        contactName: lead.contactName?.trim() || null,
        ctaUrlKey,
        targetTeamId: targetTeamId || null,
      },
      createdByUserId: user?.id ?? null,
    });

    await logNotificationDispatchToThread({
      dispatch,
      recipient,
    });

    await processLeadSmsImmediately();

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

    return {
      ok: true,
      status: dispatch.status,
      dispatchId: dispatch.id,
      queued: dispatch.status === "QUEUED",
    };
  } catch (error) {
    console.error("sendLeadSmsAction error", error);

    return {
      ok: false,
      error:
        error instanceof Error
          ? error.message
          : "The SMS could not be queued. Please check the SMS provider settings.",
    };
  }
}

export async function deleteLeadAction(formData: FormData) {
  await requireAdmin();

  const leadId = String(formData.get("leadId") ?? "").trim();

  if (!leadId) {
    return { ok: false, error: "Missing lead id." };
  }

  const lead = await prisma.interestLead.findUnique({
    where: { id: leadId },
    select: { id: true },
  });

  if (!lead) {
    return { ok: false, error: "Lead not found." };
  }

  try {
    await prisma.interestLead.delete({
      where: { id: leadId },
    });

    revalidatePath("/admin/leads");

    return { ok: true };
  } catch (error) {
    console.error("deleteLeadAction error", error);

    return {
      ok: false,
      error: "Failed to delete lead.",
    };
  }
}

export async function convertLeadToTeamAction(formData: FormData) {
  await requireAdmin();

  const leadId = String(formData.get("leadId") ?? "").trim();

  if (!leadId) {
    return { ok: false, error: "Missing lead id." };
  }

  const lead = await prisma.interestLead.findUnique({
    where: { id: leadId },
  });

  if (!lead) {
    return { ok: false, error: "Lead not found." };
  }

  if (lead.interestType !== "TEAM") {
    return {
      ok: false,
      error: "Only team leads can be converted into teams.",
    };
  }

  if (lead.convertedTeamId) {
    return { ok: true, teamId: lead.convertedTeamId };
  }

  try {
    const teamName = buildTeamNameFromLead({
      teamName: lead.teamName,
      contactName: lead.contactName,
    });

    const claimCode = await generateUniqueClaimCode(teamName);

    const createdTeam = await prisma.team.create({
      data: {
        name: teamName,
        claimCode,
        contactName: lead.contactName || null,
        contactEmail: lead.email?.trim() || null,
        contactPhone: lead.phone?.trim() || null,
      },
      select: {
        id: true,
      },
    });

    await prisma.interestLead.update({
      where: { id: lead.id },
      data: {
        status: LeadStatus.CLOSED,
        closedAt: new Date(),
        convertedAt: new Date(),
        convertedTeamId: createdTeam.id,
      },
    });

    if (lead.email?.trim()) {
      const existingUser = await prisma.user.findUnique({
        where: {
          email: lead.email.trim().toLowerCase(),
        },
        select: {
          id: true,
        },
      });

      if (existingUser) {
        await prisma.teamMember.upsert({
          where: {
            userId_teamId: {
              userId: existingUser.id,
              teamId: createdTeam.id,
            },
          },
          update: {
            role: TeamRole.CAPTAIN,
          },
          create: {
            userId: existingUser.id,
            teamId: createdTeam.id,
            role: TeamRole.CAPTAIN,
          },
        });

        await prisma.team.update({
          where: { id: createdTeam.id },
          data: {
            captainUserId: existingUser.id,
            captainLinkedAt: new Date(),
            captainLinkedSource: "lead_conversion",
            captainClaimedAt: new Date(),
            captainClaimSource: "lead_conversion",
          },
        });
      }
    }

    revalidatePath("/admin/leads");
    revalidatePath(`/admin/leads/${lead.id}`);
    revalidatePath(`/admin/teams/${createdTeam.id}`);
    revalidatePath("/admin/teams");

    return { ok: true, teamId: createdTeam.id };
  } catch (error) {
    console.error("convertLeadToTeamAction error", error);

    return {
      ok: false,
      error: "Failed to convert lead into a team.",
    };
  }
}
