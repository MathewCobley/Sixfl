// ========================================
// File: src/app/(admin)/admin/leads/actions.ts
// ========================================

"use server";

// ========================================
// Imports
// ========================================

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import {
  InterestType,
  LeadStatus,
  LeagueType,
  NotificationAudience,
  NotificationChannel,
  PreferredNight,
} from "@prisma/client";
import { Resend } from "resend";

import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/requireAdmin";
import {
  appendSIXFLTextSignature,
  buildSIXFLEmailHtml,
  type SIXFLEmailCta,
} from "@/lib/email/buildEmail";
import {
  buildBaseEmailTemplateContext,
  mergeEmailTemplateContext,
  resolveTemplateText,
} from "@/lib/email/template-context";
import { queueDirectNotification } from "@/lib/notifications/service";
import { normalizeUkMobileNumber } from "@/lib/phone/normalize";

// ========================================
// Types
// ========================================

type BulkEmailActionState = {
  ok?: boolean;
  error?: string;
  sentCount?: number;
  failedCount?: number;
};

type BulkSmsActionState = {
  ok?: boolean;
  error?: string;
  sentCount?: number;
  failedCount?: number;
};

export type ManualLeadFormState = {
  ok?: boolean;
  message?: string;
  errors?: Partial<
    Record<
      | "interestType"
      | "status"
      | "contactName"
      | "email"
      | "phone"
      | "leagueType"
      | "preferredNights",
      string
    >
  >;
};

// ========================================
// Constants
// ========================================

const resend = new Resend(process.env.RESEND_API_KEY);

const DEFAULT_BULK_EMAIL_CTA: SIXFLEmailCta = {
  url: "https://www.sixfl.co.uk/register-interest",
  label: "Register your interest",
};

// ========================================
// Helpers
// ========================================

function getPersonalisationValues(contactName?: string | null) {
  const fullName = contactName?.trim() || "";
  const firstName = fullName.split(/\s+/)[0] || "there";

  return {
    fullName,
    firstName,
  };
}

function buildLeadCampaignContext(input: {
  contactName?: string | null;
  area?: string | null;
  teamName?: string | null;
  signupUrl?: string | null;
}) {
  const { fullName, firstName } = getPersonalisationValues(input.contactName);

  return mergeEmailTemplateContext(
    buildBaseEmailTemplateContext({
      firstName,
      fullName,
      area: input.area,
      signupUrl: input.signupUrl,
      teamName: input.teamName,
    }),
  );
}

function personaliseTemplateText(text: string, contactName?: string | null) {
  const { fullName, firstName } = getPersonalisationValues(contactName);

  return text
    .replace(/{{firstName}}/gi, firstName)
    .replace(/{{name}}/gi, fullName || firstName)
    .replace(/Hi there/gi, `Hi ${firstName}`);
}

function resolveLeadCampaignText(input: {
  text: string;
  contactName?: string | null;
  area?: string | null;
  teamName?: string | null;
  signupUrl?: string | null;
  link?: string | null;
}) {
  const context = buildLeadCampaignContext({
    contactName: input.contactName,
    area: input.area,
    teamName: input.teamName,
    signupUrl: input.signupUrl,
  });

  return resolveTemplateText(input.text, context).replace(
    /{{link}}/gi,
    input.link?.trim() || "",
  );
}

function resolveBulkSmsLink(input: {
  ctaUrlKey?: string | null;
  baseUrl: string;
  targetManagedTeam?: {
    joinSlug: string | null;
  } | null;
}) {
  const ctaUrlKey = input.ctaUrlKey?.trim() || "";

  if (ctaUrlKey === "signupUrl") {
    return `${input.baseUrl}/register-interest`;
  }

  if (ctaUrlKey === "teamJoinUrl" && input.targetManagedTeam?.joinSlug) {
    return `${input.baseUrl}/teams/join/${input.targetManagedTeam.joinSlug}`;
  }

  return "";
}

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

function isLeagueType(value: string): value is LeagueType {
  return value === "MENS" || value === "WOMENS" || value === "YOUTH";
}

function getTrimmedValue(formData: FormData, name: string) {
  return String(formData.get(name) ?? "").trim();
}

function getBaseUrl() {
  return (process.env.NEXTAUTH_URL ?? "https://www.sixfl.co.uk").replace(
    /\/+$/,
    "",
  );
}

function isValidEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

async function ensureLeadSmsNotificationRecipient(input: {
  leadId: string;
  contactName?: string | null;
  phone: string;
}) {
  const normalizedPhone = normalizeUkMobileNumber(input.phone);

  if (!normalizedPhone) {
    throw new Error("Lead does not have a valid UK mobile number for SMS.");
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

// ========================================
// Actions
// ========================================

export async function updateLeadStatus(formData: FormData) {
  await requireAdmin();

  const id = String(formData.get("id") ?? "").trim();
  const statusRaw = String(formData.get("status") ?? "").trim().toUpperCase();
  const returnTo = String(formData.get("returnTo") ?? "/admin/leads").trim();

  if (!id || !isLeadStatus(statusRaw)) {
    redirect(returnTo || "/admin/leads");
  }

  await prisma.interestLead.update({
    where: { id },
    data: {
      status: statusRaw,
      ...(statusRaw === "CONTACTED" ? { contactedAt: new Date() } : {}),
      ...(statusRaw === "CLOSED" ? { closedAt: new Date() } : {}),
    },
  });

  redirect(returnTo || "/admin/leads");
}

export async function createManualLeadAction(
  _prevState: ManualLeadFormState,
  formData: FormData,
): Promise<ManualLeadFormState> {
  await requireAdmin();

  const interestTypeRaw = getTrimmedValue(formData, "interestType").toUpperCase();
  const statusRaw = getTrimmedValue(formData, "status").toUpperCase();
  const contactName = getTrimmedValue(formData, "contactName");
  const email = getTrimmedValue(formData, "email").toLowerCase();
  const phone = getTrimmedValue(formData, "phone");
  const teamName = getTrimmedValue(formData, "teamName");
  const area = getTrimmedValue(formData, "area");
  const leagueTypeRaw = getTrimmedValue(formData, "leagueType").toUpperCase();
  const source = getTrimmedValue(formData, "source") || "Manual admin entry";
  const message = getTrimmedValue(formData, "message");
  const wantsFreeKit = formData.get("wantsFreeKit") === "on";
  const marketingConsent = formData.get("marketingConsent") === "on";

  const preferredNightsRaw = formData
    .getAll("preferredNights")
    .map((value) => String(value).trim().toUpperCase())
    .filter(Boolean);

  const errors: NonNullable<ManualLeadFormState["errors"]> = {};

  if (!isInterestType(interestTypeRaw)) {
    errors.interestType = "Please choose a valid lead type.";
  }

  if (!isLeadStatus(statusRaw)) {
    errors.status = "Please choose a valid status.";
  }

  if (contactName.length < 2) {
    errors.contactName = "Please enter the contact name.";
  }

  if (email && !isValidEmail(email)) {
    errors.email = "Please enter a valid email address.";
  }

  if (!email && !phone) {
    errors.email = "Please enter at least an email address or phone number.";
    errors.phone = "Please enter at least a phone number or email address.";
  }

  if (leagueTypeRaw && !isLeagueType(leagueTypeRaw)) {
    errors.leagueType = "Please choose a valid league type.";
  }

  const invalidNight = preferredNightsRaw.find((value) => !isPreferredNight(value));
  if (invalidNight) {
    errors.preferredNights = "One or more selected nights were invalid.";
  }

  if (Object.keys(errors).length > 0) {
    return {
      ok: false,
      message: "Please fix the highlighted fields.",
      errors,
    };
  }

  const preferredNights = Array.from(
    new Set(
      preferredNightsRaw.filter((value): value is PreferredNight =>
        isPreferredNight(value),
      ),
    ),
  );

  const finalPreferredNights = preferredNights.includes("ANY")
    ? ["ANY" as PreferredNight]
    : preferredNights;

  const status = statusRaw as LeadStatus;
  const phoneNormalized = normalizeUkMobileNumber(phone);

  await prisma.interestLead.create({
    data: {
      interestType: interestTypeRaw as InterestType,
      status,
      contactName,
      email: email || null,
      phone: phone || null,
      phoneNormalized,
      teamName: teamName || null,
      area: area || null,
      leagueType:
        leagueTypeRaw && isLeagueType(leagueTypeRaw) ? leagueTypeRaw : null,
      message: message || null,
      source,
      wantsFreeKit,
      marketingConsent,
      ...(status !== "NEW" ? { contactedAt: new Date() } : {}),
      ...(status === "CLOSED" ? { closedAt: new Date() } : {}),
      ...(finalPreferredNights.length > 0
        ? {
            preferredNights: {
              create: finalPreferredNights.map((night) => ({
                night,
              })),
            },
          }
        : {}),
    },
  });

  revalidatePath("/admin/leads");
  revalidatePath("/admin");

  redirect("/admin/leads?created=1");
}

export async function sendBulkLeadEmailAction(
  _prevState: BulkEmailActionState,
  formData: FormData,
): Promise<BulkEmailActionState> {
  await requireAdmin();

  const subject = String(formData.get("subject") ?? "").trim();
  const body = String(formData.get("body") ?? "").trim();
  const ctaLabel = String(formData.get("ctaLabel") ?? "").trim();
  const ctaUrlKey = String(formData.get("ctaUrlKey") ?? "").trim();
  const targetTeamId = String(formData.get("targetTeamId") ?? "").trim();

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

  const includedLeadIds = formData
    .getAll("includedLeadIds")
    .map((value) => String(value).trim())
    .filter(Boolean);

  if (!subject) {
    return {
      ok: false,
      error: "Please enter a subject.",
    };
  }

  if (!body) {
    return {
      ok: false,
      error: "Please enter a message.",
    };
  }

  if (!process.env.RESEND_API_KEY) {
    return {
      ok: false,
      error: "RESEND_API_KEY is missing from your environment variables.",
    };
  }

  if (!process.env.EMAIL_FROM) {
    return {
      ok: false,
      error: "EMAIL_FROM is missing from your environment variables.",
    };
  }

  const baseUrl = getBaseUrl();

  const targetManagedTeam =
    ctaUrlKey === "teamJoinUrl" && targetTeamId
      ? await prisma.team.findFirst({
          where: {
            id: targetTeamId,
            teamMode: "MANAGED",
            isRecruiting: true,
            joinSlug: {
              not: null,
            },
          },
          select: {
            id: true,
            name: true,
            joinSlug: true,
          },
        })
      : null;

  if (ctaUrlKey === "teamJoinUrl" && !targetManagedTeam) {
    return {
      ok: false,
      error: "Please select which managed team this email should link to.",
    };
  }

  const resolvedCta: SIXFLEmailCta | undefined =
    ctaUrlKey === "teamJoinUrl"
      ? targetManagedTeam?.joinSlug
        ? {
            label: ctaLabel || "Register to join",
            url: `${baseUrl}/teams/join/${targetManagedTeam.joinSlug}`,
          }
        : undefined
      : ctaUrlKey === "signupUrl"
        ? {
            label: ctaLabel || DEFAULT_BULK_EMAIL_CTA.label,
            url: `${baseUrl}/register-interest`,
          }
        : ctaLabel
          ? DEFAULT_BULK_EMAIL_CTA
          : undefined;

  const where = {
    ...(selectedTypeRaw && isInterestType(selectedTypeRaw)
      ? { interestType: selectedTypeRaw as InterestType }
      : {}),
    ...(selectedStatusRaw && isLeadStatus(selectedStatusRaw)
      ? { status: selectedStatusRaw as LeadStatus }
      : {}),
    ...(selectedArea ? { area: selectedArea } : {}),
    ...(selectedNightRaw && isPreferredNight(selectedNightRaw)
      ? {
          preferredNights: {
            some: {
              night: selectedNightRaw as PreferredNight,
            },
          },
        }
      : {}),
    AND: [
      {
        email: {
          not: null,
        },
      },
      {
        email: {
          not: "",
        },
      },
    ],
    ...(includedLeadIds.length > 0
      ? {
          id: {
            in: includedLeadIds,
          },
        }
      : {}),
  };

  const leads = await prisma.interestLead.findMany({
    where,
    select: {
      id: true,
      email: true,
      status: true,
      contactName: true,
    },
  });

  const validLeads = leads.filter((lead) => lead.email?.trim());

  if (validLeads.length === 0) {
    return {
      ok: false,
      error: "No matching recipients were found for this bulk email.",
    };
  }

  let sentCount = 0;
  let failedCount = 0;

  for (const lead of validLeads) {
    try {
      const email = lead.email?.trim();

      if (!email) {
        failedCount += 1;
        continue;
      }

      const personalisedSubject = personaliseTemplateText(
        subject,
        lead.contactName,
      );
      const personalisedBody = personaliseTemplateText(body, lead.contactName);

      const signedTextBody = appendSIXFLTextSignature(personalisedBody);
      const signedHtmlBody = buildSIXFLEmailHtml({
        body: signedTextBody,
        cta: resolvedCta,
      });

      await resend.emails.send({
        from: process.env.EMAIL_FROM,
        to: email,
        subject: personalisedSubject,
        text: signedTextBody,
        html: signedHtmlBody,
      });

      await prisma.interestLeadEmail.create({
        data: {
          interestLeadId: lead.id,
          subject: personalisedSubject,
          body: signedTextBody,
          sentTo: email,
        },
      });

      if (lead.status === "NEW") {
        await prisma.interestLead.update({
          where: { id: lead.id },
          data: {
            status: "CONTACTED",
            contactedAt: new Date(),
          },
        });
      }

      sentCount += 1;
    } catch (error) {
      console.error("sendBulkLeadEmailAction item error", lead.id, error);
      failedCount += 1;
    }
  }

  revalidatePath("/admin/leads");

  return {
    ok: true,
    sentCount,
    failedCount,
  };
}

export async function sendBulkLeadSmsAction(
  _prevState: BulkSmsActionState,
  formData: FormData,
): Promise<BulkSmsActionState> {
  const { user } = await requireAdmin();

  const body = String(formData.get("body") ?? "").trim();
  const templateCtaUrlKey = String(formData.get("templateCtaUrlKey") ?? "").trim();
  const targetTeamId = String(formData.get("targetTeamId") ?? "").trim();

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

  const includedLeadIds = formData
    .getAll("includedLeadIds")
    .map((value) => String(value).trim())
    .filter(Boolean);

  if (!body) {
    return {
      ok: false,
      error: "Please enter an SMS message.",
    };
  }

  const baseUrl = getBaseUrl();

  const targetManagedTeam =
    templateCtaUrlKey === "teamJoinUrl" && targetTeamId
      ? await prisma.team.findFirst({
          where: {
            id: targetTeamId,
            teamMode: "MANAGED",
            isRecruiting: true,
            joinSlug: {
              not: null,
            },
          },
          select: {
            id: true,
            name: true,
            joinSlug: true,
          },
        })
      : null;

  if (templateCtaUrlKey === "teamJoinUrl" && !targetManagedTeam) {
    return {
      ok: false,
      error: "Please select which managed team this SMS should link to.",
    };
  }

  const resolvedLink = resolveBulkSmsLink({
    ctaUrlKey: templateCtaUrlKey,
    baseUrl,
    targetManagedTeam,
  });

  const where = {
    ...(selectedTypeRaw && isInterestType(selectedTypeRaw)
      ? { interestType: selectedTypeRaw as InterestType }
      : {}),
    ...(selectedStatusRaw && isLeadStatus(selectedStatusRaw)
      ? { status: selectedStatusRaw as LeadStatus }
      : {}),
    ...(selectedArea ? { area: selectedArea } : {}),
    ...(selectedNightRaw && isPreferredNight(selectedNightRaw)
      ? {
          preferredNights: {
            some: {
              night: selectedNightRaw as PreferredNight,
            },
          },
        }
      : {}),
    AND: [
      {
        phone: {
          not: null,
        },
      },
      {
        phone: {
          not: "",
        },
      },
    ],
    ...(includedLeadIds.length > 0
      ? {
          id: {
            in: includedLeadIds,
          },
        }
      : {}),
  };

  const leads = await prisma.interestLead.findMany({
    where,
    select: {
      id: true,
      phone: true,
      status: true,
      contactName: true,
      area: true,
      teamName: true,
    },
  });

  const validLeads = leads.filter((lead) => lead.phone?.trim());

  if (validLeads.length === 0) {
    return {
      ok: false,
      error: "No matching SMS recipients were found for this message.",
    };
  }

  let sentCount = 0;
  let failedCount = 0;

  for (const lead of validLeads) {
    try {
      const phone = lead.phone?.trim();

      if (!phone) {
        failedCount += 1;
        continue;
      }

      const personalisedBody = resolveLeadCampaignText({
        text: body,
        contactName: lead.contactName,
        area: lead.area ?? null,
        teamName: lead.teamName ?? null,
        signupUrl: `${baseUrl}/register-interest`,
        link: resolvedLink,
      });

      const recipient = await ensureLeadSmsNotificationRecipient({
        leadId: lead.id,
        contactName: lead.contactName,
        phone,
      });

      await queueDirectNotification({
        recipientId: recipient.id,
        channel: NotificationChannel.SMS,
        audience: NotificationAudience.LEAD,
        body: personalisedBody,
        isTransactional: false,
        sourceType: "LEAD",
        sourceId: lead.id,
        metadata: {
          origin: "lead_bulk_sms",
          originLabel: "Sent from leads page",
          leadId: lead.id,
          contactName: lead.contactName?.trim() || null,
          templateCtaUrlKey,
          targetTeamId: targetManagedTeam?.id ?? null,
        },
        createdByUserId: user?.id ?? null,
      });

      if (lead.status === "NEW") {
        await prisma.interestLead.update({
          where: { id: lead.id },
          data: {
            status: "CONTACTED",
            contactedAt: new Date(),
          },
        });
      }

      sentCount += 1;
    } catch (error) {
      console.error("sendBulkLeadSmsAction item error", lead.id, error);
      failedCount += 1;
    }
  }

  revalidatePath("/admin/leads");

  return {
    ok: true,
    sentCount,
    failedCount,
  };
}
